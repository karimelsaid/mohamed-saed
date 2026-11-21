const Product = require('../models/Product.model');
const PublishAmazonProductJob = require('../jobs/publish-amazon-product.job');

class AmazonProductCatalogController {
  /**
   * Get Amazon products for catalog view with status filtering & statistics
   */
  async getCatalog(req, res) {
    try {
      const { status } = req.query;
      let filter = {};

      if (status === 'published') {
        filter = { amazonStatus: 'published' };
      } else if (status === 'deleted' || status === 'inactive') {
        filter = { amazonStatus: 'deleted' };
      } else if (status === 'failed') {
        filter = { amazonStatus: { $in: ['failed', 'incomplete', 'suppressed'] } };
      } else if (status === 'pending') {
        filter = { amazonStatus: { $in: ['pending', 'pending_asin', 'publishing', 'queued', 'retry'] } };
      } else {
        // 'all' or default: show all products tracked in Amazon integration
        filter = {
          amazonStatus: {
            $in: ['published', 'deleted', 'failed', 'incomplete', 'suppressed', 'pending', 'pending_asin', 'publishing', 'queued', 'retry']
          }
        };
      }

      // Calculate statistics across all Amazon statuses
      const [publishedCount, deletedCount, failedCount, pendingCount] = await Promise.all([
        Product.countDocuments({ amazonStatus: 'published' }),
        Product.countDocuments({ amazonStatus: 'deleted' }),
        Product.countDocuments({ amazonStatus: { $in: ['failed', 'incomplete', 'suppressed'] } }),
        Product.countDocuments({ amazonStatus: { $in: ['pending', 'pending_asin', 'publishing', 'queued', 'retry'] } })
      ]);

      const products = await Product.find(filter)
        .select(
          '_id products_id product_name product_price amazonPrice product_quantity product_image image_path amazonStatus amazonSku amazonAsin amazonSyncedAt amazonLastError barcode'
        )
        .sort({ amazonSyncedAt: -1, _id: -1 })
        .limit(5000);

      res.json({
        success: true,
        count: products.length,
        stats: {
          total: publishedCount + deletedCount + failedCount + pendingCount,
          published: publishedCount,
          deleted: deletedCount,
          failed: failedCount,
          pending: pendingCount
        },
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

      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Product not found'
        });
      }

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
   * Bulk update Amazon price for selected products
   * Supports: fixed amount increase/decrease, percentage increase/decrease
   */
  async bulkUpdatePrice(req, res) {
    try {
      const { productIds, adjustmentType, adjustmentValue } = req.body;
      // adjustmentType: 'fixed_increase' | 'fixed_decrease' | 'percent_increase' | 'percent_decrease'
      // adjustmentValue: number (positive)

      if (!Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'يجب تحديد منتج واحد على الأقل'
        });
      }

      if (!adjustmentType || adjustmentValue === undefined || adjustmentValue <= 0) {
        return res.status(400).json({
          success: false,
          message: 'يجب تحديد نوع التعديل والقيمة'
        });
      }

      const products = await Product.find({
        _id: { $in: productIds },
        amazonStatus: 'published'
      });

      if (products.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'لم يتم العثور على منتجات منشورة بالمعرفات المحددة'
        });
      }

      const updates = [];
      const results = [];

      for (const product of products) {
        const currentPrice = product.amazonPrice || product.product_price || 0;
        let newPrice;

        switch (adjustmentType) {
          case 'fixed_increase':
            newPrice = currentPrice + adjustmentValue;
            break;
          case 'fixed_decrease':
            newPrice = currentPrice - adjustmentValue;
            break;
          case 'percent_increase':
            newPrice = currentPrice * (1 + adjustmentValue / 100);
            break;
          case 'percent_decrease':
            newPrice = currentPrice * (1 - adjustmentValue / 100);
            break;
          default:
            continue;
        }

        // Ensure price is not negative and round to 2 decimal places
        newPrice = Math.max(0.01, Math.round(newPrice * 100) / 100);

        updates.push(
          Product.findByIdAndUpdate(product._id, { amazonPrice: newPrice }, { new: true })
        );

        results.push({
          _id: product._id,
          product_name: product.product_name,
          oldPrice: currentPrice,
          newPrice: newPrice
        });
      }

      await Promise.all(updates);

      console.log('✅ [AMAZON CATALOG] BULK_PRICE_UPDATE', {
        timestamp: new Date().toISOString(),
        count: results.length,
        adjustmentType,
        adjustmentValue
      });

      res.json({
        success: true,
        message: `تم تحديث أسعار ${results.length} منتج بنجاح`,
        count: results.length,
        data: results
      });
    } catch (error) {
      console.error('Error bulk updating prices:', error);
      res.status(500).json({
        success: false,
        message: 'حدث خطأ أثناء تحديث الأسعار',
        error: error.message
      });
    }
  }

  /**
   * Republish / reactivate product to Amazon (with automatic queue & direct fallback)
   */
  async republishProduct(req, res) {
    try {
      const { id } = req.params;

      // Find product by _id
      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'المنتج غير موجود'
        });
      }

      const productId = product.products_id || product._id.toString();

      // Check if product is already being published
      if (product.amazonStatus === 'publishing') {
        return res.status(400).json({
          success: false,
          message: 'المنتج قيد النشر والمزامنة حالياً'
        });
      }

      // If Redis Queue is available, use background queue
      if (PublishAmazonProductJob.isAvailable()) {
        const existingJob = await PublishAmazonProductJob.getActiveJob(productId, 'publish');
        if (existingJob) {
          return res.status(400).json({
            success: false,
            message: 'توجد مهمة نشر نشطة بالفعل لهذا المنتج',
            jobId: existingJob.id
          });
        }

        await Product.findByIdAndUpdate(id, {
          amazonStatus: 'queued',
          amazonSyncInProgress: true,
          amazonRetryCount: 0,
          amazonLastError: null
        });

        const job = await PublishAmazonProductJob.add(productId);

        return res.json({
          success: true,
          message: 'تمت جدولة إعادة التفعيل والنشر على أمازون بنجاح',
          jobId: job.id,
          productId: id
        });
      } else {
        // Direct publish attempt if queue is offline
        const AmazonWorkflowService = require('../services/amazon/amazon-workflow.service');
        await Product.findByIdAndUpdate(id, {
          amazonStatus: 'publishing',
          amazonSyncInProgress: true,
          amazonLastError: null
        });

        try {
          const directResult = await AmazonWorkflowService.publishProduct(productId);
          return res.json({
            success: true,
            message: 'تم تفعيل ونشر المنتج على أمازون مباشرة بنجاح!',
            data: directResult
          });
        } catch (pubErr) {
          await Product.findByIdAndUpdate(id, {
            amazonStatus: 'failed',
            amazonLastError: pubErr.message,
            amazonSyncInProgress: false
          });
          return res.status(500).json({
            success: false,
            message: 'فشل التفعيل المباشر على أمازون: ' + pubErr.message
          });
        }
      }
    } catch (error) {
      console.error('Error republishing product:', error);
      res.status(500).json({
        success: false,
        message: 'حدث خطأ أثناء إعادة تفعيل المنتج',
        error: error.message
      });
    }
  }

  /**
   * Repair product data and reactivate/publish to Amazon
   */
  async repairAndReactivate(req, res) {
    try {
      const { id } = req.params;
      const { product_name, amazonPrice, product_quantity, barcode, amazonAsin } = req.body;

      const product = await Product.findById(id);
      if (!product) {
        return res.status(404).json({ success: false, message: 'المنتج غير موجود' });
      }

      const updateData = {
        amazonLastError: null,
        amazonSyncInProgress: true,
        amazonRetryCount: 0
      };

      if (product_name) updateData.product_name = product_name;
      if (amazonPrice) updateData.amazonPrice = amazonPrice;
      if (product_quantity !== undefined) updateData.product_quantity = product_quantity;
      if (barcode) updateData.barcode = barcode;
      if (amazonAsin) updateData.amazonAsin = amazonAsin;

      const productId = product.products_id || product._id.toString();

      if (PublishAmazonProductJob.isAvailable()) {
        updateData.amazonStatus = 'queued';
        await Product.findByIdAndUpdate(id, updateData);
        const job = await PublishAmazonProductJob.add(productId, 'publish');
        return res.json({
          success: true,
          message: 'تم حفظ التعديلات وبدء إعادة التفعيل والنشر على أمازون',
          jobId: job.id
        });
      } else {
        const AmazonWorkflowService = require('../services/amazon/amazon-workflow.service');
        updateData.amazonStatus = 'publishing';
        await Product.findByIdAndUpdate(id, updateData);

        try {
          const directResult = await AmazonWorkflowService.publishProduct(productId);
          return res.json({
            success: true,
            message: 'تم حفظ بيانات الإصلاح ونشر المنتج على أمازون بنجاح!',
            data: directResult
          });
        } catch (pubErr) {
          await Product.findByIdAndUpdate(id, {
            amazonStatus: 'failed',
            amazonLastError: pubErr.message,
            amazonSyncInProgress: false
          });
          return res.status(500).json({
            success: false,
            message: 'فشل النشر على أمازون: ' + pubErr.message
          });
        }
      }
    } catch (error) {
      console.error('Error repairing product:', error);
      res.status(500).json({
        success: false,
        message: 'حدث خطأ أثناء إصلاح وتفعيل المنتج',
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

  /**
   * Sync and remove deleted/inactive listings using Amazon Merchant Listings Report
   * This is ultra-fast (~10s), matches 100% with Seller Central, and also cleans inactive listings from Amazon.
   */
  async syncDeletedListings(req, res) {
    try {
      const zlib = require('zlib');
      const amazonAuth = require('../services/amazon/amazon-auth.service');
      const amazonListingService = require('../services/amazon/amazon-listing.service');
      const client = await amazonAuth.getClient();
      const marketplaceId = await amazonAuth.getMarketplaceId();

      console.log('🔄 [AMAZON CATALOG] Requesting Merchant Listings Report from Amazon...');

      const createReportRes = await client.callAPI({
        operation: 'createReport',
        endpoint: 'reports',
        body: {
          reportType: 'GET_MERCHANT_LISTINGS_ALL_DATA',
          marketplaceIds: [marketplaceId]
        }
      });

      const reportId = createReportRes.reportId;
      let reportDocId = null;

      // Poll until report is ready (typically 3-10 seconds)
      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const reportStatus = await client.callAPI({
          operation: 'getReport',
          endpoint: 'reports',
          path: { reportId }
        });

        if (reportStatus.processingStatus === 'DONE') {
          reportDocId = reportStatus.reportDocumentId;
          break;
        } else if (reportStatus.processingStatus === 'FATAL' || reportStatus.processingStatus === 'CANCELLED') {
          throw new Error(`Amazon report failed with status: ${reportStatus.processingStatus}`);
        }
      }

      if (!reportDocId) {
        throw new Error('Timed out waiting for Amazon report generation');
      }

      // Download report document
      const doc = await client.callAPI({
        operation: 'getReportDocument',
        endpoint: 'reports',
        path: { reportDocumentId: reportDocId }
      });

      const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
      const fileRes = await fetch(doc.url);
      let text = '';
      if (doc.compressionAlgorithm === 'GZIP') {
        const buffer = await fileRes.buffer();
        text = zlib.gunzipSync(buffer).toString('utf-8');
      } else {
        text = await fileRes.text();
      }

      const lines = text.split('\n').filter(l => l.trim().length > 0);
      const headerLine = lines[0].replace(/^\uFEFF/, '');
      const headers = headerLine.split('\t').map(h => h.trim());

      const skuIdx = headers.indexOf('seller-sku');
      const asinIdx = headers.indexOf('asin1');
      const statusIdx = headers.indexOf('status');

      const amazonActiveSkus = new Set();
      const amazonActiveAsins = new Set();
      const inactiveOnAmazon = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split('\t');
        const sku = cols[skuIdx]?.trim();
        const asin = cols[asinIdx]?.trim();
        const status = cols[statusIdx]?.trim();

        if (status && status.toLowerCase() === 'active') {
          if (sku) amazonActiveSkus.add(sku);
          if (asin) amazonActiveAsins.add(asin);
        } else if (status) {
          inactiveOnAmazon.push({ sku, asin, status });
        }
      }

      // Delete inactive listings from Amazon itself if any exist
      let deletedFromAmazonCount = 0;
      for (const item of inactiveOnAmazon) {
        if (item.sku) {
          try {
            await amazonListingService.deleteListing(item.sku);
            deletedFromAmazonCount++;
          } catch (delErr) {
            console.error(`Failed to delete inactive SKU ${item.sku} from Amazon:`, delErr.message);
          }
        }
      }

      // Match against published products in Kenouz DB
      const published = await Product.find({ amazonStatus: 'published' })
        .select('_id product_name amazonSku amazonAsin');

      const deletedItems = [];

      for (const product of published) {
        const isActiveOnAmazon =
          (product.amazonSku && amazonActiveSkus.has(product.amazonSku)) ||
          (product.amazonAsin && amazonActiveAsins.has(product.amazonAsin));

        if (!isActiveOnAmazon) {
          await Product.findByIdAndUpdate(product._id, {
            amazonStatus: 'deleted',
            amazonLastError: 'تم حذفه من أمازون (غير مفعل أو محذوف في Seller Central)',
            amazonSyncInProgress: false
          });
          deletedItems.push({
            _id: product._id,
            name: product.product_name,
            sku: product.amazonSku,
            asin: product.amazonAsin
          });
        }
      }

      console.log(`✅ [AMAZON CATALOG] SYNC COMPLETED: Checked ${published.length}, removed ${deletedItems.length} from local DB, deleted ${deletedFromAmazonCount} inactive from Amazon`);

      res.json({
        success: true,
        message: `تمت المطابقة بنجاح: تم فحص ${published.length} منتج وإزالة ${deletedItems.length} منتج محذوف/غير مفعل وحذف ${deletedFromAmazonCount} من أمازون`,
        checkedCount: published.length,
        deletedCount: deletedItems.length,
        deletedFromAmazonCount,
        deletedItems
      });
    } catch (error) {
      console.error('Error syncing deleted listings:', error);
      res.status(500).json({
        success: false,
        message: 'حدث خطأ أثناء فحص ومزامنة المنتجات المحذوفة',
        error: error.message
      });
    }
  }

  /**
   * Remove a single product from Amazon published catalog
   */
  async removeFromCatalog(req, res) {
    try {
      const { id } = req.params;
      const product = await Product.findByIdAndUpdate(id, {
        amazonStatus: 'deleted',
        amazonLastError: 'تمت إزالته من مخزون أمازون بواسطة الإدارة',
        amazonSyncInProgress: false
      }, { new: true });

      if (!product) {
        return res.status(404).json({ success: false, message: 'المنتج غير موجود' });
      }

      res.json({
        success: true,
        message: 'تمت إزالة المنتج من كتالوج أمازون بنجاح',
        data: product
      });
    } catch (error) {
      console.error('Error removing from catalog:', error);
      res.status(500).json({
        success: false,
        message: 'حدث خطأ أثناء إزالة المنتج من الكتالوج',
        error: error.message
      });
    }
  }
}

module.exports = new AmazonProductCatalogController();
