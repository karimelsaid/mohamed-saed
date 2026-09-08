const Product = require('../models/Product.model');
const PublishAmazonProductJob = require('../jobs/publish-amazon-product.job');

class AmazonProductController {
  /**
   * Publish product to Amazon
   */
  async publish(req, res) {
    const startTime = Date.now();
    try {
      const { id } = req.params;

      console.log('📦 [AMAZON CONTROLLER] PUBLISH_ENDPOINT_CALLED', {
        timestamp: new Date().toISOString(),
        productId: id,
        userId: req.user?.id
      });

      // Check if Redis/Queue is available
      if (!PublishAmazonProductJob.isAvailable()) {
        console.log('❌ [AMAZON CONTROLLER] QUEUE_UNAVAILABLE', {
          timestamp: new Date().toISOString(),
          productId: id,
          error: PublishAmazonProductJob.getRedisError() || 'Redis connection failed'
        });
        return res.status(503).json({
          success: false,
          message: 'Amazon queue service is currently unavailable',
          error: PublishAmazonProductJob.getRedisError() || 'Redis connection failed'
        });
      }

      const product = await Product.findOne({ $or: [ { products_id: id }, ...(require('mongoose').Types.ObjectId.isValid(id) ? [{ _id: id }] : []) ] });
      if (!product) {
        console.log('❌ [AMAZON CONTROLLER] PRODUCT_NOT_FOUND', {
          timestamp: new Date().toISOString(),
          productId: id
        });
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      console.log('✅ [AMAZON CONTROLLER] PRODUCT_LOADED', {
        timestamp: new Date().toISOString(),
        productId: id,
        productName: product.product_name,
        currentStatus: product.amazonStatus
      });

      // Check if product is already being published
      if (product.amazonStatus === 'publishing') {
        console.log('⚠️ [AMAZON CONTROLLER] ALREADY_PUBLISHING', {
          timestamp: new Date().toISOString(),
          productId: id
        });
        return res.status(400).json({
          success: false,
          message: 'Product is already being published'
        });
      }

      // Check if product is already published
      if (product.amazonStatus === 'published') {
        console.log('⚠️ [AMAZON CONTROLLER] ALREADY_PUBLISHED', {
          timestamp: new Date().toISOString(),
          productId: id
        });
        return res.status(400).json({
          success: false,
          message: 'Product is already published to Amazon'
        });
      }

      // Check if product is physical
      if (product.productType !== 'physical') {
        console.log('⚠️ [AMAZON CONTROLLER] NOT_PHYSICAL', {
          timestamp: new Date().toISOString(),
          productId: id,
          productType: product.productType
        });
        return res.status(400).json({
          success: false,
          message: 'Only physical products can be published to Amazon'
        });
      }

      // Check for existing active job to prevent duplicates
      const existingJob = await PublishAmazonProductJob.getActiveJob(id, 'publish');
      if (existingJob) {
        console.log('⚠️ [AMAZON CONTROLLER] ACTIVE_JOB_EXISTS', {
          timestamp: new Date().toISOString(),
          productId: id,
          existingJobId: existingJob.id
        });
        return res.status(400).json({
          success: false,
          message: 'Product already has an active publishing job',
          jobId: existingJob.id
        });
      }

      // Add to queue
      console.log('📤 [AMAZON CONTROLLER] ADDING_TO_QUEUE', {
        timestamp: new Date().toISOString(),
        productId: id
      });
      const job = await PublishAmazonProductJob.add(id);

      console.log('✅ [AMAZON CONTROLLER] JOB_ADDED_TO_QUEUE', {
        timestamp: new Date().toISOString(),
        productId: id,
        jobId: job.id,
        executionTime: Date.now() - startTime
      });

      // Update product status with job ID for deduplication
      await Product.findOneAndUpdate({ $or: [ { products_id: id }, ...(require('mongoose').Types.ObjectId.isValid(id) ? [{ _id: id }] : []) ] }, {
        amazonStatus: 'queued',
        amazonSyncInProgress: true,
        amazonRetryCount: 0,
        amazonLastError: null,
        amazonJobId: job.id
      });

      res.json({
        success: true,
        message: 'Product added to publishing queue',
        jobId: job.id,
        productId: id
      });
    } catch (error) {
      console.error('Error publishing product to Amazon:', error);
      res.status(500).json({
        success: false,
        message: 'Error publishing product to Amazon',
        error: error.message
      });
    }
  }

  /**
   * Get product Amazon publishing status
   */
  async status(req, res) {
    try {
      const { id } = req.params;

      const product = await Product.findOne({ $or: [ { products_id: id }, ...(require('mongoose').Types.ObjectId.isValid(id) ? [{ _id: id }] : []) ] }).select(
        'amazonStatus amazonSku amazonAsin amazonSubmissionId amazonSyncedAt amazonLastError amazonRetryCount amazonSyncInProgress amazonJobId'
      );

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      // Get job progress if job ID exists
      let jobProgress = null;
      let jobState = null;
      if (product.amazonJobId && PublishAmazonProductJob.isAvailable()) {
        try {
          const jobStatus = await PublishAmazonProductJob.getStatus(product.amazonJobId);
          if (jobStatus) {
            jobProgress = jobStatus.progress;
            jobState = jobStatus.state;
          }
        } catch (error) {
          console.error('Error fetching job status:', error);
        }
      }

      // Generate Amazon URL if ASIN exists
      let amazonUrl = null;
      if (product.amazonAsin) {
        amazonUrl = `https://www.amazon.eg/dp/${product.amazonAsin}`;
      }

      console.log('📊 [AMAZON CONTROLLER] STATUS_REQUEST', {
        timestamp: new Date().toISOString(),
        productId: id,
        currentStatus: product.amazonStatus,
        jobState,
        jobProgress
      });

      res.json({
        success: true,
        data: {
          status: product.amazonStatus,
          sku: product.amazonSku,
          asin: product.amazonAsin,
          submissionId: product.amazonSubmissionId,
          syncedAt: product.amazonSyncedAt,
          lastError: product.amazonLastError,
          retryCount: product.amazonRetryCount,
          inProgress: product.amazonSyncInProgress,
          jobId: product.amazonJobId,
          jobState,
          jobProgress,
          amazonUrl
        }
      });
    } catch (error) {
      console.error('Error getting product Amazon status:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting product Amazon status',
        error: error.message
      });
    }
  }

  /**
   * Retry failed product publishing
   */
  async retry(req, res) {
    try {
      const { id } = req.params;

      const product = await Product.findOne({ $or: [ { products_id: id }, ...(require('mongoose').Types.ObjectId.isValid(id) ? [{ _id: id }] : []) ] });
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      // Check if product can be retried
      if (product.amazonStatus === 'publishing') {
        return res.status(400).json({
          success: false,
          message: 'Product is currently being published'
        });
      }

      if (product.amazonStatus === 'published') {
        return res.status(400).json({
          success: false,
          message: 'Product is already published'
        });
      }

      if (product.amazonRetryCount >= 3) {
        return res.status(400).json({
          success: false,
          message: 'Maximum retry attempts reached'
        });
      }

      // Retry publishing
      const job = await PublishAmazonProductJob.retry(id);

      res.json({
        success: true,
        message: 'Product publishing retry initiated',
        jobId: job.id,
        productId: id
      });
    } catch (error) {
      console.error('Error retrying product publishing:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrying product publishing',
        error: error.message
      });
    }
  }

  /**
   * Sync existing Amazon listing
   */
  async sync(req, res) {
    try {
      const { id } = req.params;

      // Check if Redis/Queue is available
      if (!PublishAmazonProductJob.isAvailable()) {
        return res.status(503).json({
          success: false,
          message: 'Amazon queue service is currently unavailable',
          error: PublishAmazonProductJob.getRedisError() || 'Redis connection failed'
        });
      }

      const product = await Product.findOne({ $or: [ { products_id: id }, ...(require('mongoose').Types.ObjectId.isValid(id) ? [{ _id: id }] : []) ] });
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      // Check if product has ASIN
      if (!product.amazonAsin) {
        return res.status(400).json({
          success: false,
          message: 'Product does not have Amazon ASIN'
        });
      }

      // Check if product is already being synced
      if (product.amazonStatus === 'publishing') {
        return res.status(400).json({
          success: false,
          message: 'Product is currently being synced'
        });
      }

      // Check for existing active job to prevent duplicates
      const existingJob = await PublishAmazonProductJob.getActiveJob(id, 'sync');
      if (existingJob) {
        return res.status(400).json({
          success: false,
          message: 'Product already has an active sync job',
          jobId: existingJob.id
        });
      }

      // Sync to Amazon
      const job = await PublishAmazonProductJob.sync(id);

      // Update product status with job ID for deduplication
      await Product.findOneAndUpdate({ $or: [ { products_id: id }, ...(require('mongoose').Types.ObjectId.isValid(id) ? [{ _id: id }] : []) ] }, {
        amazonStatus: 'publishing',
        amazonSyncInProgress: true,
        amazonJobId: job.id
      });

      res.json({
        success: true,
        message: 'Product Amazon sync initiated',
        jobId: job.id,
        productId: id
      });
    } catch (error) {
      console.error('Error syncing product to Amazon:', error);
      res.status(500).json({
        success: false,
        message: 'Error syncing product to Amazon',
        error: error.message
      });
    }
  }

  /**
   * Get all products with Amazon status
   */
  async list(req, res) {
    try {
      const { status } = req.query;

      const filter = {};
      if (status && status !== 'all') {
        filter.amazonStatus = status;
      }

      const products = await Product.find(filter)
        .select('_id product_name product_price product_quantity status publisher image_path product_image amazonStatus amazonSku amazonAsin amazonSyncedAt amazonLastError amazonRetryCount')
        .sort({ _id: -1 }) // Sort by latest products by default
        .limit(1000);

      res.json({
        success: true,
        count: products.length,
        data: products
      });
    } catch (error) {
      console.error('Error listing Amazon products:', error);
      res.status(500).json({
        success: false,
        message: 'Error listing Amazon products',
        error: error.message
      });
    }
  }

  /**
   * Get job progress
   */
  async jobProgress(req, res) {
    try {
      const { jobId } = req.params;

      const jobStatus = await PublishAmazonProductJob.getStatus(jobId);

      if (!jobStatus) {
        return res.status(404).json({
          success: false,
          message: 'Job not found'
        });
      }

      res.json({
        success: true,
        data: jobStatus
      });
    } catch (error) {
      console.error('Error getting job progress:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting job progress',
        error: error.message
      });
    }
  }

  /**
   * Proxy image to convert WebP or other formats to JPEG for Amazon
   * Amazon Listings Items API requires JPEG, GIF, or PNG and often rejects WebP.
   */
  async imageProxy(req, res) {
    try {
      const imageUrl = req.query.url;
      if (!imageUrl) {
        return res.status(400).send('Missing url parameter');
      }
      
      const axios = require('axios');
      const sharp = require('sharp');
      
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 10000
      });
      
      // Convert to JPEG using sharp
      const jpegBuffer = await sharp(response.data)
        .jpeg({ quality: 90 })
        .toBuffer();
        
      res.set('Content-Type', 'image/jpeg');
      res.set('Cache-Control', 'public, max-age=86400');
      res.send(jpegBuffer);
    } catch (error) {
      console.error('❌ [AMAZON IMAGE PROXY] Error:', error.message);
      res.status(500).send('Error proxying image');
    }
  }
}

module.exports = new AmazonProductController();
