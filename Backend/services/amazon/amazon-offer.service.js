const amazonAuth = require('./amazon-auth.service');
const logger = require('./amazon-logger.service');
const axios = require('axios');

class AmazonOfferService {
  /**
   * Create offer for product
   */
  async createOffer(sku, price, currency = 'EGP') {
    const startTime = Date.now();
    const client = await amazonAuth.getClient();
    const marketplaceId = amazonAuth.getMarketplaceId();

    try {
      console.log('📤 [AMAZON OFFER] CREATE_OFFER_REQUEST', {
        timestamp: new Date().toISOString(),
        sku,
        price,
        currency,
        marketplaceId
      });
      logger.logRequest('CreateOffer', { sku, price, currency });

      const payload = {
        MarketplaceId: marketplaceId,
        SellerSKU: sku,
        StandardPrice: {
          Amount: price,
          Currency: currency
        }
      };

      // Submit pricing feed using createFeed operation
      const result = await client.callAPI({
        operation: 'createFeed',
        endpoint: 'feeds',
        body: {
          marketplaceIds: [marketplaceId],
          feedType: 'POST_PRODUCT_PRICING_DATA',
          inputFeedDocumentId: await this.createPricingFeedDocument(payload)
        }
      });

      const executionTime = Date.now() - startTime;
      console.log('✅ [AMAZON OFFER] CREATE_OFFER_SUCCESS', {
        timestamp: new Date().toISOString(),
        sku,
        feedId: result.feedId,
        executionTime,
        responseBody: result
      });
      logger.logResponse('CreateOffer', result, executionTime);

      return {
        success: true,
        feedId: result.feedId,
        sku
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error('❌ [AMAZON OFFER] CREATE_OFFER_ERROR', {
        timestamp: new Date().toISOString(),
        sku,
        price,
        error: error.message,
        code: error.code,
        stack: error.stack,
        responseBody: error.response?.body || error.response || error,
        executionTime
      });
      logger.logError('CreateOffer', error, { sku, price });
      
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
   * Create pricing feed document
   */
  async createPricingFeedDocument(payload) {
    const client = await amazonAuth.getClient();
    
    const document = await client.callAPI({
      operation: 'createFeedDocument',
      endpoint: 'feeds',
      body: {
        contentType: 'text/xml; charset=UTF-8'
      }
    });

    // Upload the feed content
    const xmlContent = this.generatePricingXml(payload);
    await this.uploadFeedDocument(document.url, xmlContent);

    return document.feedDocumentId;
  }

  /**
   * Generate pricing XML
   */
  generatePricingXml(payload) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<AmazonEnvelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="amzn-envelope.xsd">
  <Header>
    <DocumentVersion>1.01</DocumentVersion>
    <MerchantIdentifier>${process.env.AMAZON_SP_API_SELLER_ID}</MerchantIdentifier>
  </Header>
  <MessageType>Price</MessageType>
  <Message>
    <MessageID>1</MessageID>
    <OperationType>Update</OperationType>
    <Price>
      <SKU>${payload.SellerSKU}</SKU>
      <StandardPrice currency="${payload.Currency}">${payload.StandardPrice.Amount}</StandardPrice>
    </Price>
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

  /**
   * Get feed status
   */
  async getFeedStatus(feedId) {
    const client = await amazonAuth.getClient();
    
    try {
      const result = await client.callAPI({
        operation: 'getFeed',
        endpoint: 'feeds',
        path: {
          feedId
        }
      });

      return {
        success: true,
        status: result.processingStatus,
        result: result
      };
    } catch (error) {
      logger.logError('GetFeedStatus', error, { feedId });
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new AmazonOfferService();
