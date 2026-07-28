const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth.middleware');
const Product = require('../models/Product.model');
const SystemSettings = require('../models/SystemSettings.js');
const PublishAmazonProductJob = require('../jobs/publish-amazon-product.job');
const AmazonAuthService = require('../services/amazon/amazon-auth.service');
const fs = require('fs');
const path = require('path');

// Optional redis import
let redis;
try {
  redis = require('redis');
} catch (error) {
  console.warn('Redis module not found, Redis diagnostics will be limited');
}

/**
 * Amazon Diagnostics Endpoint
 * Provides comprehensive system status for Amazon integration
 */
router.get('/diagnostics', authMiddleware, async (req, res) => {
  try {
    const [
      apiConnection,
      accessToken,
      queue,
      redisStatus,
      systemSettings,
      logs,
      lastSuccessfulPublish,
      lastFailedPublish,
      activeJobs
    ] = await Promise.all([
      checkApiConnection(),
      checkAccessToken(),
      getQueueStatus(),
      getRedisStatus(),
      getSystemSettings(),
      getRecentLogs(),
      getLastSuccessfulPublish(),
      getLastFailedPublish(),
      getActiveJobs()
    ]);

    const sellerAccount = {
      status: apiConnection.status === 'connected' ? 'active' : 'inactive',
      marketplaceId: AmazonAuthService.getMarketplaceId(),
      region: process.env.AMAZON_SP_API_REGION || 'eu',
      lastChecked: new Date().toISOString(),
      error: apiConnection.error || null
    };

    res.json({
      queueAvailable: PublishAmazonProductJob.isAvailable(),
      queueError: PublishAmazonProductJob.getRedisError(),
      apiConnection,
      accessToken,
      queue,
      redis: redisStatus,
      sellerAccount,
      systemSettings,
      logs,
      lastSuccessfulPublish,
      lastFailedPublish,
      activeJobs
    });
  } catch (error) {
    console.error('Error fetching diagnostics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching diagnostics',
      error: error.message
    });
  }
});

async function checkApiConnection() {
  try {
    console.log('🔍 [DIAGNOSTICS] Checking Amazon API connection...');
    const startTime = Date.now();
    const result = await AmazonAuthService.testConnection();
    const latency = Date.now() - startTime;
    
    console.log('✅ [DIAGNOSTICS] API connection check result:', result.success ? 'Success' : result.error);
    
    return {
      status: result.success ? 'connected' : 'error',
      lastChecked: new Date().toISOString(),
      latency,
      error: result.error || null
    };
  } catch (error) {
    console.error('❌ [DIAGNOSTICS] API connection check error:', error.message);
    return {
      status: 'error',
      lastChecked: new Date().toISOString(),
      error: error.message
    };
  }
}

async function checkAccessToken() {
  try {
    const client = await AmazonAuthService.getClient();
    if (!client) {
      return {
        status: 'missing',
        lastChecked: new Date().toISOString()
      };
    }

    return {
      status: 'connected',
      lastChecked: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'error',
      lastChecked: new Date().toISOString(),
      error: error.message
    };
  }
}

async function getQueueStatus() {
  try {
    const isAvailable = PublishAmazonProductJob.isAvailable();
    const redisError = PublishAmazonProductJob.getRedisError();
    const amazonQueue = PublishAmazonProductJob.amazonQueue;

    if (!isAvailable || !amazonQueue) {
      return {
        status: 'offline',
        error: redisError || 'Queue not initialized',
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0
      };
    }

    const [waiting, active, completed, failed] = await Promise.all([
      amazonQueue.getWaitingCount().catch(() => 0),
      amazonQueue.getActiveCount().catch(() => 0),
      amazonQueue.getCompletedCount().catch(() => 0),
      amazonQueue.getFailedCount().catch(() => 0)
    ]);

    const status = waiting > 0 || active > 0 ? 'active' : 'inactive';
    
    return {
      status,
      waiting,
      active,
      completed,
      failed
    };
  } catch (error) {
    return {
      status: 'error',
      error: error.message,
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0
    };
  }
}

async function getRedisStatus() {
  if (!redis) {
    return {
      status: 'disconnected',
      error: 'Redis module not installed'
    };
  }

  let redisClient;
  try {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: { connectTimeout: 1500 }
    });
    
    const connectPromise = redisClient.connect();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Redis connection timeout')), 1500)
    );

    await Promise.race([connectPromise, timeoutPromise]);
    
    const info = await redisClient.info('memory');
    const dbSize = await redisClient.dbSize();
    await redisClient.quit().catch(() => {});

    const usedMemory = info.match(/used_memory_human:([^\r\n]+)/)?.[1] || 'N/A';

    return {
      status: 'connected',
      memoryUsage: usedMemory,
      keyCount: dbSize
    };
  } catch (error) {
    if (redisClient) {
      try { await redisClient.disconnect(); } catch (e) {}
    }
    return {
      status: 'disconnected',
      error: error.message
    };
  }
}

async function getSystemSettings() {
  try {
    const settings = await SystemSettings.getInstance();
    return {
      priceIncreasePercentage: settings.amazon?.priceIncreasePercentage || 20
    };
  } catch (error) {
    return {
      priceIncreasePercentage: 20
    };
  }
}

async function getRecentLogs() {
  try {
    const logPath = path.join(__dirname, '../logs/amazon.log');
    
    if (!fs.existsSync(logPath)) {
      return ['No log file found'];
    }

    const stat = fs.statSync(logPath);
    const maxBytes = 128 * 1024; // Read last 128 KB max
    const startPos = Math.max(0, stat.size - maxBytes);
    const length = stat.size - startPos;

    const buffer = Buffer.alloc(length);
    const fd = fs.openSync(logPath, 'r');
    fs.readSync(fd, buffer, 0, length, startPos);
    fs.closeSync(fd);

    const logContent = buffer.toString('utf8');
    const logLines = logContent.split('\n').filter(line => line.trim());
    
    return logLines.slice(-50);
  } catch (error) {
    console.error('Error reading logs:', error);
    return ['Error reading log file'];
  }
}

async function getLastSuccessfulPublish() {
  try {
    const product = await Product.findOne({
      amazonStatus: 'published'
    }).sort({ amazonSyncedAt: -1 }).select('product_name amazonSyncedAt');

    if (!product) {
      return null;
    }

    return {
      productId: product._id,
      productName: product.product_name,
      timestamp: product.amazonSyncedAt
    };
  } catch (error) {
    return null;
  }
}

async function getLastFailedPublish() {
  try {
    const product = await Product.findOne({
      amazonStatus: 'failed',
      amazonLastError: { $exists: true, $ne: null }
    }).sort({ amazonSyncedAt: -1 }).select('product_name amazonSyncedAt amazonLastError');

    if (!product) {
      return null;
    }

    return {
      productId: product._id,
      productName: product.product_name,
      timestamp: product.amazonSyncedAt,
      error: product.amazonLastError
    };
  } catch (error) {
    return null;
  }
}

async function getActiveJobs() {
  try {
    const amazonQueue = PublishAmazonProductJob.amazonQueue;
    if (!amazonQueue || !PublishAmazonProductJob.isAvailable()) {
      return [];
    }

    const jobs = await amazonQueue.getJobs(['waiting', 'active', 'completed', 'failed'], 0, 50);
    const jobDetails = [];

    for (const job of jobs) {
      const productId = job.data.productId;
      const product = await Product.findOne({ products_id: productId }).select('product_name amazonStatus amazonSku amazonAsin');
      
      jobDetails.push({
        jobId: job.id,
        productId: productId,
        productName: product?.product_name || 'Unknown',
        status: job.name,
        state: await job.getState(),
        progress: job.progress || 0,
        attemptsMade: job.attemptsMade,
        failedReason: job.failedReason,
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
        amazonStatus: product?.amazonStatus,
        amazonSku: product?.amazonSku,
        amazonAsin: product?.amazonAsin
      });
    }

    return jobDetails;
  } catch (error) {
    console.error('Error getting active jobs:', error);
    return [];
  }
}

module.exports = router;
