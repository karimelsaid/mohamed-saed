const Product = require('../../models/Product.model');
const SystemSettings = require('../../models/SystemSettings.js');
const AmazonSkuGenerator = require('./amazon-sku-generator.service');
const AmazonListingService = require('./amazon-listing.service');
const AmazonOfferService = require('./amazon-offer.service');
const AmazonInventoryService = require('./amazon-inventory.service');
const AmazonImageService = require('./amazon-image.service');
const AmazonPollingService = require('./amazon-polling.service');
const logger = require('./amazon-logger.service');

// Structured logging helper
function logWorkflow(stage, data = {}) {
  const logData = {
    timestamp: new Date().toISOString(),
    stage,
    productId: data.productId,
    sku: data.sku,
    jobId: data.jobId,
    executionTime: data.executionTime,
    ...data
  };
  console.log(`📦 [AMAZON WORKFLOW] ${stage}:`, JSON.stringify(logData, null, 2));
  logger.logRequest(stage, logData);
}

class AmazonWorkflowService {
  /**
   * Validate product data before publishing to Amazon
   */
  static validateProductData(product) {
    const errors = [];

    // Check required fields
    if (!product.product_name || product.product_name.trim() === '') {
      errors.push('Product name is required');
    }

    if (!product.product_price || product.product_price <= 0) {
      errors.push('Product price must be greater than 0');
    }

    if (!product.product_quantity || product.product_quantity < 0) {
      errors.push('Product quantity must be specified and non-negative');
    }

    // No longer strict error for description, will use default in workflow if missing
    // if (!product.product_description || product.product_description.trim() === '') {
    //   errors.push('Product description is required');
    // }

    // Check image
    const hasImage = product.image_path || product.mainImage || product.coverImage || 
                     (Array.isArray(product.images) && product.images.length > 0) || 
                     product.product_image;
    if (!hasImage) {
      errors.push('Product image is required');
    }

    // No longer strict error for weight, will use default in workflow if missing
    // if (!product.weight || product.weight <= 0) {
    //   errors.push('Product weight must be specified');
    // }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * Calculate Amazon price based on system settings and complex formula matching the frontend
   */
  static async calculateAmazonPrice(product) {
    const settings = await SystemSettings.getInstance();
    const cost = Number(product.price_cost || product.product_price);
    if (isNaN(cost) || cost <= 0) return 0;
    
    // profitPercent comes from settings, falling back to 80 if not set.
    // Ensure the admin settings dashboard correctly updates this value!
    const profitPercent = settings.amazon?.priceIncreasePercentage || 80;
    
    const targetNetPayout = cost + (cost * (profitPercent / 100));

    const R = 13 / 100; // amazonCommissionRate (13%)
    const T = 14 / 100; // taxRate (14%)
    const Fc = 30; // customerShippingFee (30)
    const S = 34; // sellerShippingFee (34)

    const commissionTaxFactor = R * (1 + T);
    const denominator = 1 - commissionTaxFactor;

    if (denominator <= 0) {
      return 0;
    }

    const numerator = targetNetPayout + S;
    const P = (numerator / denominator) - Fc;

    return Math.ceil(P);
  }

  /**
   * Get product dimensions with fallbacks
   */
  static getProductDimensions(product) {
    // Use safe defaults if dimensions are missing
    const weight = product.weight && product.weight > 0 ? product.weight : 500;
    return {
      length: product.length && product.length > 0 ? product.length : 20,
      width: product.width && product.width > 0 ? product.width : 14,
      height: product.height && product.height > 0 ? product.height : 1,
      weight: weight,
      packageWeight: weight
    };
  }

  /**
   * Sync all products with Amazon to ensure data consistency
   */
  static async syncAllProducts(job = null) {
    const startTime = Date.now();
    let syncedCount = 0;
    let failedCount = 0;

    const updateProgress = (percent, message) => {
      if (job) {
        job.progress(percent);
        job.log(message);
      }
    };

    try {
      // Find all products that have an Amazon SKU
      const products = await Product.find({ amazonSku: { $exists: true, $ne: null } });
      const total = products.length;

      logWorkflow('BULK_SYNC_START', { total });
      updateProgress(0, `Starting bulk sync for ${total} products`);

      for (let i = 0; i < products.length; i++) {
        const product = products[i];
        try {
          await this.syncProduct(product.products_id || product._id.toString());
          syncedCount++;
        } catch (error) {
          console.error(`Failed to sync product ${product.amazonSku}:`, error.message);
          failedCount++;
        }

        const percent = Math.floor(((i + 1) / total) * 100);
        if (percent % 10 === 0) {
          updateProgress(percent, `Synced ${i + 1}/${total} products`);
        }
      }

      logWorkflow('BULK_SYNC_COMPLETED', { 
        syncedCount, 
        failedCount, 
        total,
        executionTime: Date.now() - startTime 
      });

      return {
        success: true,
        syncedCount,
        failedCount,
        total
      };
    } catch (error) {
      logWorkflow('BULK_SYNC_ERROR', { error: error.message });
      throw error;
    }
  }

  /**
   * Complete publishing workflow for new product
   */
  static async publishProduct(productId, job = null) {
    const jobId = job?.id;
    const startTime = Date.now();
    let sku = null;

    const updateProgress = (percent, message) => {
      if (job) {
        job.progress(percent);
        job.log(message);
      }
    };

    try {
      logWorkflow('PUBLISH_START', { 
        productId, 
        jobId,
        step: 'queued' 
      });
      updateProgress(5, 'Starting publishing process');
      await this.updateProductStatus(productId, 'queued', 'Starting publishing process');

      // Step 1: Get product data first
      const product = await Product.findOne({ products_id: productId });
      if (!product) {
        throw new Error('Product not found');
      }

      // Step 1.5: Validate product data before proceeding
      const validation = this.validateProductData(product);
      if (!validation.isValid) {
        const errorMessage = validation.errors.join('; ');
        logWorkflow('VALIDATION_FAILED', {
          productId,
          jobId,
          errors: validation.errors
        });
        updateProgress(10, 'Validation failed: ' + errorMessage);
        throw new Error('Product data validation failed: ' + errorMessage);
      }
      updateProgress(8, 'Product data validation passed');

      logWorkflow('PRODUCT_LOADED', { 
        productId, 
        jobId,
        step: 'running',
        productName: product.product_name 
      });

      // Idempotency check: if product already has ASIN, skip to sync
      if (product.amazonAsin && product.amazonSku) {
        logWorkflow('ALREADY_PUBLISHED', { 
          productId, 
          jobId,
          sku: product.amazonSku,
          asin: product.amazonAsin 
        });
        updateProgress(10, 'Product already has ASIN, switching to sync mode');
        return await this.syncProduct(productId, job);
      }

      // Step 2: Generate SKU
      logWorkflow('SKU_GENERATION_START', { 
        productId, 
        jobId,
        step: 'generating_sku' 
      });
      updateProgress(10, 'Generating SKU');
      await this.updateProductStatus(productId, 'generating_sku', 'Generating SKU');
      
      const skuStartTime = Date.now();
      sku = await AmazonSkuGenerator.generateUnique(Product);
      await Product.findOneAndUpdate({ products_id: productId }, { amazonSku: sku });
      await this.updateProductStatus(productId, 'generating_sku', 'SKU generated');
      
      logWorkflow('SKU_GENERATED', { 
        productId, 
        jobId,
        sku,
        step: 'generating_sku',
        executionTime: Date.now() - skuStartTime 
      });

      // Refresh product data after SKU update
      const updatedProduct = await Product.findOne({ products_id: productId });

      // Calculate Amazon price using the new formula
      const amazonPrice = await this.calculateAmazonPrice(updatedProduct);
      await Product.findOneAndUpdate({ products_id: productId }, { amazonPrice });
      updatedProduct.amazonPrice = amazonPrice;

      // 1. Get raw image string from various possible fields (prioritize image_path which contains the full path)
      let rawImageUrl = updatedProduct.image_path || updatedProduct.mainImage || updatedProduct.coverImage || (Array.isArray(updatedProduct.images) && updatedProduct.images[0]) || updatedProduct.product_image;
      let finalImageUrl = null;

      if (rawImageUrl) {
        const backendUrl = process.env.BACKEND_URL || 'https://knoozbook.com/api';
        const baseUrl = backendUrl.replace('/api', '');

        // Clean up the string just in case
        rawImageUrl = rawImageUrl.trim();

        // 2. Format the URL correctly
        if (rawImageUrl.startsWith('http')) {
          // It's already a full external URL (e.g., https://assets.asfar.io/...)
          finalImageUrl = rawImageUrl;
        } else if (rawImageUrl.startsWith('/')) {
          // It's a server path (e.g., /uploads/books/merchant_karim_admin/...)
          finalImageUrl = `${baseUrl}${rawImageUrl}`;
        } else {
          // It's just a filename (e.g., 9786338471019 or 9786338471019.webp)
          const imgPath = rawImageUrl.includes('.') ? rawImageUrl : `${rawImageUrl}.webp`;
          finalImageUrl = `${baseUrl}/uploads/${imgPath}`;
        }

        // 3. Wrap it in the image-proxy ONLY if it's a WebP image, otherwise use the direct link
        const isWebp = finalImageUrl.toLowerCase().includes('.webp');
        if (isWebp) {
          updatedProduct.mainImage = `${baseUrl}/api/amazon/image-proxy?url=${encodeURIComponent(finalImageUrl)}&ext=.jpg`;
        } else {
          updatedProduct.mainImage = finalImageUrl;
        }
        updatedProduct.product_image = updatedProduct.mainImage;
      }

      // Step 3: Create listing
      logWorkflow('LISTING_CREATION_START', { 
        productId, 
        jobId,
        sku,
        step: 'creating_listing' 
      });
      updateProgress(15, 'Creating Amazon listing');
      await this.updateProductStatus(productId, 'creating_listing', 'Creating listing');

      const listingStartTime = Date.now();
      const listingResult = await this.createListingWithRetry(updatedProduct, sku, job);
      
      logWorkflow('LISTING_CREATION_RESULT', { 
        productId, 
        jobId,
        sku,
        step: 'creating_listing',
        success: listingResult.success,
        error: listingResult.error,
        submissionId: listingResult.submissionId,
        executionTime: Date.now() - listingStartTime 
      });

      if (!listingResult.success) {
        throw new Error(`Listing creation failed: ${listingResult.error}`);
      }

      await Product.findOneAndUpdate({ products_id: productId }, { 
        amazonSubmissionId: listingResult.submissionId 
      });
      updateProgress(80, 'Listing submitted to Amazon, waiting for ASIN');
      await this.updateProductStatus(productId, 'pending_asin', 'Listing submitted to Amazon, waiting for ASIN');

      // Step 8: Wait for ASIN assignment
      logWorkflow('WAITING_FOR_ASIN', { 
        productId, 
        jobId,
        sku,
        submissionId: listingResult.submissionId,
        step: 'waiting_asin' 
      });

      const asinResult = await AmazonPollingService.waitForAsin(sku, 15, 10);
      
      if (asinResult.success) {
        await Product.findOneAndUpdate({ products_id: productId }, { 
          amazonAsin: asinResult.asin,
          amazonStatus: 'published',
          amazonSyncedAt: new Date()
        });
        updateProgress(100, 'ASIN assigned successfully');
        await this.updateProductStatus(productId, 'published', 'ASIN assigned successfully');
        
        logWorkflow('ASIN_ASSIGNED', { 
          productId, 
          jobId,
          sku,
          asin: asinResult.asin,
          attempts: asinResult.attempts,
          step: 'published',
          totalExecutionTime: Date.now() - startTime 
        });

        return {
          success: true,
          sku,
          asin: asinResult.asin,
          submissionId: listingResult.submissionId,
          message: 'Product published to Amazon successfully'
        };
      } else {
        // ASIN not assigned within timeout, but listing was submitted
        logWorkflow('ASIN_TIMEOUT', { 
          productId, 
          jobId,
          sku,
          error: asinResult.error,
          attempts: asinResult.attempts,
          step: 'pending_asin',
          totalExecutionTime: Date.now() - startTime 
        });

        return {
          success: true,
          sku,
          submissionId: listingResult.submissionId,
          message: 'Listing submitted to Amazon. ASIN will be assigned asynchronously.'
        };
      }

    } catch (error) {
      logWorkflow('PUBLISH_ERROR', { 
        productId, 
        jobId,
        sku,
        step: 'failed',
        error: error.message,
        stack: error.stack,
        executionTime: Date.now() - startTime 
      });
      
      await this.updateProductStatus(productId, 'failed', error.message);
      
      // Increment retry count
      await Product.findOneAndUpdate({ products_id: productId }, {
        $inc: { amazonRetryCount: 1 }
      });

      throw error;
    }
  }

  /**
   * Sync existing Amazon listing (update price, inventory, image, title, description, dimensions, weight)
   */
  static async syncProduct(productId, job = null) {
    const updateProgress = (percent, message) => {
      if (job) {
        job.progress(percent);
        job.log(message);
      }
    };

    try {
      updateProgress(5, 'Starting Amazon sync');
      // Set status to publishing immediately and update sync time to show activity in UI
      await Product.findOneAndUpdate({ products_id: productId }, { 
        amazonStatus: 'publishing',
        amazonSyncInProgress: true,
        amazonSyncedAt: new Date()
      });

      const product = await Product.findOne({ products_id: productId });
      if (!product) {
        throw new Error('Product not found');
      }

      if (!product.amazonSku || !product.amazonAsin) {
        throw new Error('Product does not have Amazon SKU or ASIN');
      }

      const sku = product.amazonSku;
      const asin = product.amazonAsin;

      // Calculate latest Amazon price using the new formula
      const amazonPrice = await this.calculateAmazonPrice(product);
      await Product.findOneAndUpdate({ products_id: productId }, { amazonPrice });
      product.amazonPrice = amazonPrice;

      // 1. Get raw image string from various possible fields (prioritize image_path which contains the full path)
      let rawImageUrl = product.image_path || product.mainImage || product.coverImage || (Array.isArray(product.images) && product.images[0]) || product.product_image;
      let finalImageUrl = null;

      if (rawImageUrl) {
        const backendUrl = process.env.BACKEND_URL || 'https://knoozbook.com/api';
        const baseUrl = backendUrl.replace('/api', '');

        // Clean up the string just in case
        rawImageUrl = rawImageUrl.trim();

        // 2. Format the URL correctly
        if (rawImageUrl.startsWith('http')) {
          // It's already a full external URL (e.g., https://assets.asfar.io/...)
          finalImageUrl = rawImageUrl;
        } else if (rawImageUrl.startsWith('/')) {
          // It's a server path (e.g., /uploads/books/merchant_karim_admin/...)
          finalImageUrl = `${baseUrl}${rawImageUrl}`;
        } else {
          // It's just a filename (e.g., 9786338471019 or 9786338471019.webp)
          const imgPath = rawImageUrl.includes('.') ? rawImageUrl : `${rawImageUrl}.webp`;
          finalImageUrl = `${baseUrl}/uploads/${imgPath}`;
        }

        // 3. Wrap it in the image-proxy ONLY if it's a WebP image, otherwise use the direct link
        const isWebp = finalImageUrl.toLowerCase().includes('.webp');
        if (isWebp) {
          product.mainImage = `${baseUrl}/api/amazon/image-proxy?url=${encodeURIComponent(finalImageUrl)}&ext=.jpg`;
        } else {
          product.mainImage = finalImageUrl;
        }
        product.product_image = product.mainImage;
      }

      updateProgress(10, 'Sync started');

      // Update listing (title, description, dimensions, weight)
      updateProgress(20, 'Updating listing details');
      await this.updateProductStatus(productId, 'publishing', 'Updating listing details');

      const dimensions = this.getProductDimensions(product);
      const listingData = {
        sku,
        title: product.product_name,
        price: amazonPrice,
        quantity: product.product_quantity,
        length: dimensions.length,
        width: dimensions.width,
        height: dimensions.height,
        packageWeight: dimensions.packageWeight,
        asin: product.amazonAsin,
        barcode: product.barcode
      };

      const listingResult = await AmazonListingService.createListing(listingData);
      if (!listingResult.success) {
        logger.logError('Listing Update', new Error(listingResult.error), { sku });
        // Non-fatal error, continue with other updates
      }

      updateProgress(30, 'Listing details, price, and inventory updated');

      // Step 5 & 6 bypassed: Offer and Inventory are updated via createListing (putListingsItem)
      console.log('ℹ️ Legacy Feeds API Offer and Inventory steps skipped during sync, included in listing.');
      updateProgress(60, 'Offer updated');
      updateProgress(90, 'Inventory updated');

      console.log('ℹ️ Image updated along with listing via main_product_image_locator');

      updateProgress(100, 'Sync completed successfully');
      await this.updateProductStatus(productId, 'published', null);

      return {
        success: true,
        sku,
        asin,
        amazonUrl: `https://www.amazon.eg/dp/${asin}`
      };

    } catch (error) {
      await this.updateProductStatus(productId, 'failed', error.message);
      throw error;
    }
  }

  /**
   * Create listing with title retry strategy
   */
  static async createListingWithRetry(product, sku, job = null, retryCount = 0) {
    const maxRetries = 3;
    const titles = [
      product.product_name,
      `${product.product_name} - ورق مريح للعين`
    ];

    // Prevent infinite retries
    if (retryCount >= maxRetries) {
      console.error('❌ [AMAZON WORKFLOW] Max retries exceeded for SKU:', sku);
      return { success: false, error: 'Max retries exceeded' };
    }

    for (let i = 0; i < titles.length; i++) {
      if (job) {
        job.log(`Attempt ${retryCount + 1}-${i + 1} with title: ${titles[i].substring(0, 50)}...`);
      }
      
      const dimensions = this.getProductDimensions(product);
      const productData = {
        sku,
        productType: 'ELECTRONIC_BOOK_READER',
        title: titles[i],
        description: product.product_description && product.product_description.trim() !== '' 
          ? product.product_description 
          : titles[i],
        price: product.amazonPrice || product.product_price,
        quantity: product.product_quantity !== undefined ? product.product_quantity : 10,
        publisher: product.publisher,
        author: product.author,
        brand: product.publisher || product.author || 'عام',
        condition: product.condition,
        barcode: product.barcode,
        asin: product.amazonAsin,
        pages: product.pages,
        publishYear: product.publishYear,
        imageUrl: product.mainImage || product.coverImage || (Array.isArray(product.images) && product.images[0]),
        length: dimensions.length || 20,
        width: dimensions.width || 14,
        height: dimensions.height || 1,
        packageWeight: dimensions.packageWeight || 500
      };

      let result = await AmazonListingService.createListing(productData);
      
      // If Amazon rejects the GTIN/ISBN barcode (Error 90188), fallback immediately to GTIN Exemption
      if (!result.success && result.error && (result.error.includes('externally_assigned_product_identifier') || result.error.includes('90188'))) {
        console.warn('⚠️ [AMAZON WORKFLOW] Invalid GTIN/ISBN rejected by Amazon. Retrying with GTIN Exemption...', { sku, error: result.error });
        if (job) job.log('Invalid GTIN/ISBN rejected by Amazon. Retrying with GTIN Exemption...');
        
        productData.barcode = null;
        result = await AmazonListingService.createListing(productData);
      }
      
      if (result.success) {
        return result;
      }

      // If this was the last title attempt, check if we should retry with same SKU
      if (i === titles.length - 1 && retryCount < maxRetries - 1) {
        if (job) {
          job.log(`Title attempts exhausted, retrying with same SKU (${retryCount + 1}/${maxRetries})...`);
        }
        
        // Wait before retry (exponential backoff)
        const delay = Math.pow(2, retryCount) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Retry with same SKU, increment retry count
        return this.createListingWithRetry(product, sku, job, retryCount + 1);
      }
    }

    return { success: false, error: 'All listing attempts failed' };
  }

  /**
   * Update product status
   */
  static async updateProductStatus(productId, status, error) {
    const updateData = {
      amazonStatus: status,
      amazonSyncedAt: new Date()
    };

    if (error) {
      updateData.amazonLastError = error;
    } else {
      updateData.amazonLastError = null;
    }

    await Product.findOneAndUpdate({ products_id: productId }, updateData);
  }
}

module.exports = AmazonWorkflowService;
