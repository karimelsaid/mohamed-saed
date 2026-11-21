const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  products_id: { type: String, index: true }, // Numeric ID from Excel/Frontend
  product_name: { type: String, required: true },
  product_quantity: { type: Number, required: true },
  product_category: { type: String, required: true },
  product_description: { type: String, required: true },
  product_price: { type: Number, required: true },
  price_cost: { type: Number, required: true },
  product_image: { type: String },
  product_price_before_discount: { type: Number },
  rival: { type: Boolean, default: false },
  product_discount_percent: { type: Number },
  promotionEndDate: { type: String },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'pending_update'], default: 'pending' },
  updateRequest: { type: Boolean, default: false },
  updatedData: { type: Object },
  merchantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  barcode: { type: String, index: true },
  createdAt: { type: Date, default: Date.now },
  // Physical Dimensions
  weight: { type: Number, required: true, default: 0 },
  length: { type: Number },
  width: { type: Number },
  height: { type: Number },
  // E-book related fields
  productType: { type: String, enum: ['physical', 'digital', 'bundle', 'affiliate'], default: 'physical' },
  linkedEbookId: { type: mongoose.Schema.Types.ObjectId, ref: 'Ebook' },
  epubFilePath: { type: String, default: '' },
  epubFileHash: { type: String, index: true, default: '' },
  miniEpubFilePath: { type: String, default: '' },
  digitalDelivery: { type: Boolean, default: false },
  lastStockUpdate: { type: Date },
  copyType: { type: String, enum: ['هاي كوبي', 'أصلي', ''] },
  condition: { type: String, enum: ['جديد', 'مستعمل بحالة جيدة', ''] },
  images: [{ type: String }],
  // New book-related fields
  publisher: { type: String, default: '' },
  author: { type: String, default: '' },
  pages: { type: Number, default: 0 },
  coverType: { type: String, default: '' },
  language: { type: String, default: '' },
  publishYear: { type: String, default: '' },
  image_path: { type: String, default: '' },
  categoryPrefix: { type: String, default: '' },
  // Analytics Tracking
  views: { type: Number, default: 0 },
  viewHistory: [{
    date: { type: String }, // YYYY-MM-DD
    count: { type: Number, default: 0 }
  }],
  // Amazon Integration Fields
  amazonSku: { type: String, index: true },
  amazonAsin: { type: String },
  amazonSellerId: { type: String },
  amazonAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'AmazonAccount' },
  amazonStatus: {
    type: String,
    enum: ['pending', 'pending_asin', 'incomplete', 'publishing', 'published', 'retry', 'failed', 'suppressed', 'deleted'],
    default: 'pending'
  },
  amazonLastError: { type: String },
  amazonSubmissionId: { type: String },
  amazonSyncedAt: { type: Date },
  amazonRetryCount: { type: Number, default: 0 },
  amazonPrice: { type: Number },
  amazonSyncInProgress: { type: Boolean, default: false },
  amazonJobId: { type: String } // Track active queue job for deduplication
});

productSchema.index({ merchantId: 1 });

// Post-save middleware: Send webhook to n8n for new products
productSchema.post('save', async function(doc, next) {
  // Only send webhook if:
  // 1. Product is approved (not pending/rejected)
  // 2. Amazon status is pending (not already synced)
  // 3. Product is physical (digital products don't go to Amazon)
  // 4. Status or amazonStatus was actually modified (prevent duplicate webhooks on minor edits)
  // 5. Sync is not already in progress (prevent race conditions)
  if (
    doc.status === 'approved' &&
    doc.amazonStatus === 'pending' &&
    doc.productType === 'physical' &&
    (doc.isModified('status') || doc.isModified('amazonStatus')) &&
    !doc.amazonSyncInProgress
  ) {
    try {
      const n8nWebhookUrl = process.env.N8N_PRODUCT_WEBHOOK_URL;
      if (!n8nWebhookUrl) {
        console.warn('⚠️ [Product Webhook] N8N_PRODUCT_WEBHOOK_URL not set, skipping webhook');
        return next();
      }

      // Mark sync as in progress to prevent duplicate webhooks
      await Product.findByIdAndUpdate(doc._id, { amazonSyncInProgress: true });

      const payload = {
        productId: doc._id.toString(),
        productName: doc.product_name,
        productDescription: doc.product_description,
        productPrice: doc.product_price,
        amazonPrice: doc.amazonPrice || doc.product_price,
        productQuantity: doc.product_quantity,
        productCategory: doc.product_category,
        images: doc.images || [],
        weight: doc.weight || 0,
        length: doc.length || 0,
        width: doc.width || 0,
        height: doc.height || 0,
        publisher: doc.publisher || '',
        author: doc.author || '',
        pages: doc.pages || 0,
        coverType: doc.coverType || '',
        language: doc.language || '',
        publishYear: doc.publishYear || '',
        barcode: doc.barcode || '',
        merchantId: doc.merchantId?.toString(),
        amazonSku: doc.amazonSku || doc.barcode || doc._id.toString()
      };

      const response = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-N8N-Secret': process.env.N8N_SECRET || ''
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        console.log(`✅ [Product Webhook] Sent product ${doc._id} to n8n successfully`);
      } else {
        console.error(`❌ [Product Webhook] Failed to send product ${doc._id} to n8n: ${response.status}`);
      }
    } catch (error) {
      console.error(`❌ [Product Webhook] Error sending product ${doc._id} to n8n:`, error.message);
      // Don't block the save operation even if webhook fails
    } finally {
      // Always reset sync progress flag, even if webhook fails
      try {
        await Product.findByIdAndUpdate(doc._id, { amazonSyncInProgress: false });
      } catch (resetError) {
        console.error(`❌ [Product Webhook] Failed to reset sync progress for ${doc._id}:`, resetError.message);
      }
    }
  }
  next();
});

module.exports = mongoose.model('Product', productSchema);
