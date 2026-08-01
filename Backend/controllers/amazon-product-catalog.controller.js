const Product = require('../models/Product.model');
const PublishAmazonProductJob = require('../jobs/publish-amazon-product.job');

class AmazonProductCatalogController {
  /**
   * Get all Amazon products for catalog view
   */
  async getCatalog(req, res) {
    try {
      const { status } = req.query;

      const filter = {};
      if (status === 'incomplete') {
        // Show both 'incomplete' and 'pending_asin' when filtering for incomplete
        filter.amazonStatus = { $in: ['incomplete', 'pending_asin'] };
      } else if (status && status !== 'all') {
        filter.amazonStatus = status;
      } else {
        // When 'all' is selected in Amazon Catalog, only show products that actually belong to Amazon workflow
        filter.amazonStatus = { $in: ['published', 'incomplete', 'failed', 'pending_asin', 'publishing', 'retry', 'suppressed'] };
      }

      const products = await Product.find(filter)
        .select(
          '_id products_id product_name product_price amazonPrice product_quantity product_image image_path amazonStatus amazonSku amazonAsin amazonLastError amazonRetryCount amazonSyncedAt'
        )
        .sort({ amazonSyncedAt: -1, _id: -1 })
        .limit(500);

      res.json({
        success: true,
        count: products.length,
        data: products
      });
    } catch (error) {
      console.error('Error getting Amazon catalog:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting Amazon catalog',
        error: error.message
      });
    }
  }

  /**
   * Update product data (price and quantity)
   */
  async updateProductData(req, res) {
    try {
      const { id } = req.params;
      const { amazonPrice, product_quantity } = req.body;

      // Find product by _id
      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      // Update data
      const updateData = {};
      if (amazonPrice !== undefined && amazonPrice > 0) {
        updateData.amazonPrice = amazonPrice;
      }
      if (product_quantity !== undefined && product_quantity >= 0) {
        updateData.product_quantity = product_quantity;
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No valid data to update'
        });
      }

      const updatedProduct = await Product.findByIdAndUpdate(id, updateData, { new: true });

      console.log('✅ [AMAZON CATALOG] PRODUCT_DATA_UPDATED', {
        timestamp: new Date().toISOString(),
        productId: id,
        updateData
      });

      res.json({
        success: true,
        message: 'Product data updated successfully',
        data: updatedProduct
      });
    } catch (error) {
      console.error('Error updating product data:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating product data',
        error: error.message
      });
    }
  }

  /**
   * Republish product to Amazon
   */
  async republishProduct(req, res) {
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

      // Find product by _id
      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      // Get products_id for queue
      const productId = product.products_id || product._id.toString();

      // Check if product is already being published
      if (product.amazonStatus === 'publishing') {
        return res.status(400).json({
          success: false,
          message: 'Product is already being published'
        });
      }

      // Check for existing active job to prevent duplicates
      const existingJob = await PublishAmazonProductJob.getActiveJob(productId, 'publish');
      if (existingJob) {
        return res.status(400).json({
          success: false,
          message: 'Product already has an active publishing job',
          jobId: existingJob.id
        });
      }

      // Reset status and add to queue
      await Product.findByIdAndUpdate(id, {
        amazonStatus: 'queued',
        amazonSyncInProgress: true,
        amazonRetryCount: 0,
        amazonLastError: null
      });

      const job = await PublishAmazonProductJob.add(productId);

      console.log('✅ [AMAZON CATALOG] REPUBLISH_INITIATED', {
        timestamp: new Date().toISOString(),
        productId: id,
        jobId: job.id
      });

      res.json({
        success: true,
        message: 'Product republishing initiated',
        jobId: job.id,
        productId: id
      });
    } catch (error) {
      console.error('Error republishing product:', error);
      res.status(500).json({
        success: false,
        message: 'Error republishing product',
        error: error.message
      });
    }
  }

  /**
   * Get product details for editing
   */
  async getProductDetails(req, res) {
    try {
      const { id } = req.params;

      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

      res.json({
        success: true,
        data: {
          _id: product._id,
          products_id: product.products_id,
          product_name: product.product_name,
          product_price: product.product_price,
          amazonPrice: product.amazonPrice,
          product_quantity: product.product_quantity,
          product_description: product.product_description,
          product_image: product.product_image,
          image_path: product.image_path,
          amazonStatus: product.amazonStatus,
          amazonSku: product.amazonSku,
          amazonAsin: product.amazonAsin,
          amazonLastError: product.amazonLastError,
          amazonSyncedAt: product.amazonSyncedAt
        }
      });
    } catch (error) {
      console.error('Error getting product details:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting product details',
        error: error.message
      });
    }
  }

  /**
   * Sync all Amazon products with Seller Central
   */
  async syncAll(req, res) {
    try {
      if (!PublishAmazonProductJob.isAvailable()) {
        return res.status(503).json({
          success: false,
          message: 'Amazon queue service is currently unavailable'
        });
      }

      const job = await PublishAmazonProductJob.syncAll();

      console.log('✅ [AMAZON CATALOG] BULK_SYNC_INITIATED', {
        timestamp: new Date().toISOString(),
        jobId: job.id
      });

      res.json({
        success: true,
        message: 'Bulk synchronization initiated',
        jobId: job.id
      });
    } catch (error) {
      console.error('Error initiating bulk sync:', error);
      res.status(500).json({
        success: false,
        message: 'Error initiating bulk sync',
        error: error.message
      });
    }
  }

  /**
   * Bulk update product status
   */
  async bulkUpdateStatus(req, res) {
    try {
      const { productIds, status } = req.body;

      if (!Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Product IDs array is required'
        });
      }

      if (!status) {
        return res.status(400).json({
          success: false,
          message: 'Status is required'
        });
      }

      const result = await Product.updateMany(
        { _id: { $in: productIds } },
        { amazonStatus: status }
      );

      console.log('✅ [AMAZON CATALOG] BULK_STATUS_UPDATE', {
        timestamp: new Date().toISOString(),
        count: result.modifiedCount,
        status
      });

      res.json({
        success: true,
        message: 'Products status updated',
        modifiedCount: result.modifiedCount
      });
    } catch (error) {
      console.error('Error bulk updating status:', error);
      res.status(500).json({
        success: false,
        message: 'Error bulk updating status',
        error: error.message
      });
    }
  }
}

module.exports = new AmazonProductCatalogController();
