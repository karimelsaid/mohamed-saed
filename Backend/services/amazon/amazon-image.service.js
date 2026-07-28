const amazonAuth = require('./amazon-auth.service');
const logger = require('./amazon-logger.service');
const axios = require('axios');

class AmazonImageService {
  /**
   * Upload main image for product
   */
  async uploadMainImage(sku, imageUrl) {
    const startTime = Date.now();
    const client = await amazonAuth.getClient();
    const marketplaceId = amazonAuth.getMarketplaceId();

    try {
      console.log('📤 [AMAZON IMAGE] UPLOAD_IMAGE_REQUEST', {
        timestamp: new Date().toISOString(),
        sku,
        imageUrl,
        marketplaceId
      });
      logger.logRequest('UploadMainImage', { sku, imageUrl });

      // Download image
      const imageBuffer = await this.downloadImage(imageUrl);
      
      console.log('✅ [AMAZON IMAGE] IMAGE_DOWNLOADED', {
        timestamp: new Date().toISOString(),
        sku,
        imageUrl,
        bufferSize: imageBuffer.length
      });

      // Upload to Amazon
      const document = await client.callAPI({
        operation: 'createFeedDocument',
        endpoint: 'feeds',
        body: {
          contentType: 'image/jpeg'
        }
      });

      console.log('✅ [AMAZON IMAGE] FEED_DOCUMENT_CREATED', {
        timestamp: new Date().toISOString(),
        sku,
        feedDocumentId: document.feedDocumentId
      });

      await this.uploadImageDocument(document.url, imageBuffer);

      console.log('✅ [AMAZON IMAGE] IMAGE_UPLOADED_TO_AMAZON', {
        timestamp: new Date().toISOString(),
        sku
      });

      // Submit image feed using createFeed operation
      const result = await client.callAPI({
        operation: 'createFeed',
        endpoint: 'feeds',
        body: {
          marketplaceIds: [marketplaceId],
          feedType: 'POST_PRODUCT_IMAGE_DATA',
          inputFeedDocumentId: await this.createImageFeedDocument(sku, document.feedDocumentId)
        }
      });

      const executionTime = Date.now() - startTime;
      console.log('✅ [AMAZON IMAGE] UPLOAD_IMAGE_SUCCESS', {
        timestamp: new Date().toISOString(),
        sku,
        feedId: result.feedId,
        executionTime,
        responseBody: result
      });
      logger.logResponse('UploadMainImage', result, executionTime);

      return {
        success: true,
        feedId: result.feedId,
        sku
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error('❌ [AMAZON IMAGE] UPLOAD_IMAGE_ERROR', {
        timestamp: new Date().toISOString(),
        sku,
        imageUrl,
        error: error.message,
        code: error.code,
        stack: error.stack,
        responseBody: error.response?.body || error.response || error,
        executionTime
      });
      logger.logError('UploadMainImage', error, { sku, imageUrl });
      
      return {
        success: false,
        error: error.message,
        errorCode: error.code,
        responseBody: error.response?.body || error.response || error,
        sku
      };
    }
  }

  /**
   * Download image from URL
   */
  async downloadImage(imageUrl) {
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000,
      maxContentLength: 10 * 1024 * 1024 // 10MB max
    });
    
    // Validate content type
    const contentType = response.headers['content-type'];
    const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    
    if (!supportedTypes.includes(contentType)) {
      throw new Error(`Unsupported image format: ${contentType}. Supported formats: JPEG, PNG, WebP`);
    }
    
    return Buffer.from(response.data);
  }

  /**
   * Upload image document to Amazon
   */
  async uploadImageDocument(url, buffer) {
    try {
      await axios.put(url, buffer, {
        headers: {
          'Content-Type': 'image/jpeg',
          'Content-Length': buffer.length
        }
      });
    } catch (error) {
      logger.logError('UploadImageDocument', error);
      throw error;
    }
  }

  /**
   * Create image feed document
   */
  async createImageFeedDocument(sku, documentId) {
    const client = await amazonAuth.getClient();
    
    const document = await client.callAPI({
      operation: 'createFeedDocument',
      endpoint: 'feeds',
      body: {
        contentType: 'text/xml; charset=UTF-8'
      }
    });

    const xmlContent = this.generateImageXml(sku, documentId);
    await this.uploadFeedDocument(document.url, xmlContent);

    return document.feedDocumentId;
  }

  /**
   * Generate image XML
   */
  generateImageXml(sku, documentId) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<AmazonEnvelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="amzn-envelope.xsd">
  <Header>
    <DocumentVersion>1.01</DocumentVersion>
    <MerchantIdentifier>${process.env.AMAZON_SP_API_SELLER_ID}</MerchantIdentifier>
  </Header>
  <MessageType>ProductImage</MessageType>
  <Message>
    <MessageID>1</MessageID>
    <OperationType>Update</OperationType>
    <ProductImage>
      <SKU>${sku}</SKU>
      <ImageType>Main</ImageType>
      <ImageLocation>${documentId}</ImageLocation>
    </ProductImage>
  </Message>
</AmazonEnvelope>`;
  }

  /**
   * Upload feed document to Amazon
   */
  async uploadFeedDocument(url, content) {
    try {
      await axios.put(url, content, {
        headers: {
          'Content-Type': 'text/xml; charset=UTF-8'
        }
      });
    } catch (error) {
      logger.logError('UploadFeedDocument', error);
      throw error;
    }
  }
}

module.exports = new AmazonImageService();
