const Queue = require('bull');
const Product = require('../models/Product.model');
const AmazonWorkflowService = require('../services/amazon/amazon-workflow.service');
const logger = require('../services/amazon/amazon-logger.service');

let amazonQueue = null;
let isRedisAvailable = false;
let redisError = null;

// Initialize queue with Redis connection handling
function initializeQueue() {
  try {
    // Log REDIS_URL (without credentials for security)
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    const safeRedisUrl = redisUrl.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
    console.log('🔍 [Amazon Queue] Attempting to connect to Redis...');
    console.log('🔍 [Amazon Queue] Redis URL:', safeRedisUrl);
    console.log('🔍 [Amazon Queue] REDIS_URL env var set:', !!process.env.REDIS_URL);

    amazonQueue = new Queue('amazon-publishing', {
      redis: redisUrl,
      settings: {
        lockDuration: 300000,     // 5 minutes lock
        lockRenewTime: 150000,    // Renew lock every 2.5 minutes
        stalledInterval: 300000,  // Check stalled every 5 minutes
        maxStalledCount: 5        // Allow up to 5 stalls before failing
      },
      connection: {
        maxRetriesPerRequest: 3,
        retryStrategy: (times) => {
          if (times > 3) {
            console.error('❌ [Amazon Queue] Redis connection failed after 3 retries');
            return null; // Stop retrying
          }
          console.log(`⏳ [Amazon Queue] Redis retry attempt ${times}/3`);
          return Math.min(times * 100, 3000);
        }
      }
    });

    // Test connection
    console.log('⏳ [Amazon Queue] Testing Redis connection...');
    amazonQueue.isReady().then(async () => {
      isRedisAvailable = true;
      console.log('✅ [Amazon Queue] Redis connection established successfully');
      try {
        await amazonQueue.clean(1000, 'failed');
        await amazonQueue.clean(1000, 'active');
      } catch (cleanErr) {
        // ignore clean errors
      }
      console.log('✅ [Amazon Queue] Queue initialized successfully');
    }).catch((error) => {
      isRedisAvailable = false;
      redisError = error.message;
      console.error('❌ [Amazon Queue] Redis connection failed:', error.message);
      console.error('❌ [Amazon Queue] Full error:', error);
      console.warn('⚠️  [Amazon Queue] Amazon publishing features will be disabled until Redis is available');
    });

    // Set up job processors
    console.log('⏳ [Amazon Queue] Setting up job processors...');
    amazonQueue.process('publish', 20, async (job) => {
      console.log('🔔 [Amazon Queue Worker] JOB_RECEIVED', {
        timestamp: new Date().toISOString(),
        jobId: job.id,
        action: job.name,
        productId: job.data.productId
      });
      
      try {
        const result = await PublishAmazonProductJob.process(job);
        console.log('✅ [Amazon Queue Worker] JOB_COMPLETED', {
          timestamp: new Date().toISOString(),
          jobId: job.id,
          action: job.name,
          productId: job.data.productId,
          result
        });
        return result;
      } catch (error) {
        console.error('❌ [Amazon Queue Worker] JOB_FAILED', {
          timestamp: new Date().toISOString(),
          jobId: job.id,
          action: job.name,
          productId: job.data.productId,
          error: error.message,
          stack: error.stack
        });
        throw error;
      }
    });

    amazonQueue.process('sync', 20, async (job) => {
      console.log('🔔 [Amazon Queue Worker] JOB_RECEIVED', {
        timestamp: new Date().toISOString(),
        jobId: job.id,
        action: job.name,
        productId: job.data.productId
      });
      
      try {
        const result = await PublishAmazonProductJob.process(job);
        console.log('✅ [Amazon Queue Worker] JOB_COMPLETED', {
          timestamp: new Date().toISOString(),
          jobId: job.id,
          action: job.name,
          productId: job.data.productId,
          result
        });
        return result;
      } catch (error) {
        console.error('❌ [Amazon Queue Worker] JOB_FAILED', {
          timestamp: new Date().toISOString(),
          jobId: job.id,
          action: job.name,
          productId: job.data.productId,
          error: error.message,
          stack: error.stack
        });
        throw error;
      }
    });

    amazonQueue.process('syncAll', 1, async (job) => {
      console.log('🔔 [Amazon Queue Worker] JOB_RECEIVED', {
        timestamp: new Date().toISOString(),
        jobId: job.id,
        action: job.name
      });
      
      try {
        const result = await PublishAmazonProductJob.process(job);
        console.log('✅ [Amazon Queue Worker] JOB_COMPLETED', {
          timestamp: new Date().toISOString(),
          jobId: job.id,
          action: job.name,
          result
        });
        return result;
      } catch (error) {
        console.error('❌ [Amazon Queue Worker] JOB_FAILED', {
          timestamp: new Date().toISOString(),
          jobId: job.id,
          action: job.name,
          error: error.message,
          stack: error.stack
        });
        throw error;
      }
    });

    console.log('✅ [Amazon Queue] Job processors set up successfully');

    // Handle Redis connection events
    amazonQueue.on('connection', () => {
      console.log('🔗 [Amazon Queue] Redis connection established');
    });

    amazonQueue.on('reconnecting', () => {
      console.log('🔄 [Amazon Queue] Redis reconnecting...');
    });

    amazonQueue.on('reconnected', () => {
      console.log('✅ [Amazon Queue] Redis reconnected successfully');
    });

    amazonQueue.on('disconnected', () => {
      console.warn('⚠️ [Amazon Queue] Redis disconnected');
    });

    // Handle job events
    amazonQueue.on('completed', (job, result) => {
      console.log('🎉 [Amazon Queue] JOB_EVENT_COMPLETED', {
        timestamp: new Date().toISOString(),
        jobId: job.id,
        action: job.name,
        productId: job.data.productId,
        result
      });
      logger.logSuccess('PublishAmazonProductJob', { 
        productId: job.data.productId, 
        action: job.name,
        result 
      });
    });

    amazonQueue.on('failed', (job, err) => {
      console.error('💥 [Amazon Queue] JOB_EVENT_FAILED', {
        timestamp: new Date().toISOString(),
        jobId: job?.id,
        action: job?.name,
        productId: job?.data?.productId,
        error: err.message,
        stack: err.stack
      });
      logger.logError('PublishAmazonProductJob', err, { 
        productId: job?.data?.productId,
        action: job?.name
      });
    });

    amazonQueue.on('progress', (job, progress) => {
      console.log('📊 [Amazon Queue] JOB_EVENT_PROGRESS', {
        timestamp: new Date().toISOString(),
        jobId: job.id,
        action: job.name,
        productId: job.data.productId,
        progress
      });
      logger.logRequest('PublishAmazonProductJob Progress', { 
        productId: job.data.productId, 
        action: job.name,
        progress 
      });
    });

    amazonQueue.on('waiting', (jobId) => {
      console.log('⏳ [Amazon Queue] JOB_EVENT_WAITING', {
        timestamp: new Date().toISOString(),
        jobId
      });
    });

    amazonQueue.on('active', (job) => {
      console.log('🚀 [Amazon Queue] JOB_EVENT_ACTIVE', {
        timestamp: new Date().toISOString(),
        jobId: job.id,
        action: job.name,
        productId: job.data.productId
      });
    });

    amazonQueue.on('stalled', (jobId) => {
      console.warn('⚠️ [Amazon Queue] JOB_EVENT_STALLED', {
        timestamp: new Date().toISOString(),
        jobId
      });
    });

    amazonQueue.on('error', (error) => {
      console.error('🔥 [Amazon Queue] QUEUE_ERROR', {
        timestamp: new Date().toISOString(),
        error: error.message,
        stack: error.stack
      });
    });

  } catch (error) {
    isRedisAvailable = false;
    redisError = error.message;
    console.error('❌ [Amazon Queue] Redis connection failed:', error.message);
    console.error('❌ [Amazon Queue] Full error:', error);
    console.warn('⚠️  [Amazon Queue] Amazon publishing features will be disabled until Redis is available');
    amazonQueue = null;
  }
}

// DO NOT initialize queue immediately - wait for dotenv to load
// This module will be initialized from app.js after dotenv.config()
// initializeQueue();

// Export initialization function
module.exports.initializeQueue = initializeQueue;

class PublishAmazonProductJob {
  /**
   * Check if Redis is available
   */
  static isAvailable() {
    return !!amazonQueue;
  }

  /**
   * Get Redis error if any
   */
  static getRedisError() {
    return redisError;
  }

  /**
   * Add product to publishing queue
   */
  static async add(productId, action = 'publish') {
    if (!isRedisAvailable || !amazonQueue) {
      throw new Error('Amazon queue service is unavailable. Redis is not connected.');
    }

    const job = await amazonQueue.add(action, { productId }, {
      attempts: 1, // Only 1 attempt since we have internal retry logic in workflow
      removeOnComplete: 10, // Keep last 10 completed jobs
      removeOnFail: 50, // Keep last 50 failed jobs for debugging
      timeout: 20 * 60 * 1000 // 20 minutes (to accommodate ASIN polling)
    });

    return job;
  }

  /**
   * Process the publishing job
   */
  static async process(job) {
    const { productId } = job.data;
    const action = job.name;

    try {
      if (action === 'publish') {
        return await AmazonWorkflowService.publishProduct(productId, job);
      } else if (action === 'sync') {
        return await AmazonWorkflowService.syncProduct(productId, job);
      } else if (action === 'syncAll') {
        return await AmazonWorkflowService.syncAllProducts(job);
      } else {
        throw new Error(`Unknown action: ${action}`);
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get job status
   */
  static async getStatus(jobId) {
    if (!isRedisAvailable || !amazonQueue) {
      throw new Error('Amazon queue service is unavailable. Redis is not connected.');
    }

    const job = await amazonQueue.getJob(jobId);
    if (!job) {
      return null;
    }

    const state = await job.getState();
    const progress = job.progress();

    return {
      id: job.id,
      state,
      progress,
      data: job.data,
      failedReason: job.failedReason,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn
    };
  }

  /**
   * Get active job for a product to prevent duplicates
   */
  static async getActiveJob(productId, action = 'publish') {
    if (!isRedisAvailable || !amazonQueue) {
      return null;
    }

    const jobs = await amazonQueue.getJobs(['waiting', 'active'], 0, 100);
    
    for (const job of jobs) {
      if (job.name === action && job.data.productId === productId) {
        return job;
      }
    }
    
    return null;
  }

  /**
   * Retry failed job
   */
  static async retry(productId) {
    // Support both products_id (string) and _id (MongoDB ObjectId)
    let product = await Product.findOne({ products_id: productId });
    if (!product) {
      product = await Product.findById(productId);
    }
    if (!product) {
      throw new Error('Product not found');
    }

    // Reset status using products_id for consistency
    await Product.findOneAndUpdate(
      { products_id: product.products_id || product._id.toString() },
      {
        amazonStatus: 'pending',
        amazonLastError: null,
        amazonRetryCount: 0
      }
    );

    return this.add(product.products_id || product._id.toString(), 'publish');
  }

  /**
   * Sync all products with Amazon
   */
  static async syncAll() {
    if (!isRedisAvailable || !amazonQueue) {
      throw new Error('Amazon queue service is unavailable. Redis is not connected.');
    }

    return await amazonQueue.add('syncAll', {}, {
      attempts: 1,
      removeOnComplete: true,
      timeout: 60 * 60 * 1000 // 1 hour for bulk sync
    });
  }

  /**
   * Sync existing Amazon listing
   */
  static async sync(productId) {
    // Support both products_id (string) and _id (MongoDB ObjectId)
    let product = await Product.findOne({ products_id: productId });
    if (!product) {
      product = await Product.findById(productId);
    }
    if (!product) {
      throw new Error('Product not found');
    }

    if (!product.amazonAsin) {
      throw new Error('Product does not have Amazon ASIN');
    }

    return this.add(product.products_id || product._id.toString(), 'sync');
  }
}

// Attach initialization function to the class
PublishAmazonProductJob.initializeQueue = initializeQueue;

// Export the class with all its properties
module.exports = PublishAmazonProductJob;

// Add getter for amazonQueue to return current value
Object.defineProperty(module.exports, 'amazonQueue', {
  get: () => amazonQueue
});

Object.defineProperty(module.exports, 'isRedisAvailable', {
  get: () => isRedisAvailable
});

Object.defineProperty(module.exports, 'redisError', {
  get: () => redisError
});
