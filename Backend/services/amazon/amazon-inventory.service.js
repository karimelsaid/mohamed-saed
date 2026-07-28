const amazonAuth = require('./amazon-auth.service');
const logger = require('./amazon-logger.service');
const axios = require('axios');

class AmazonInventoryService {
  /**
   * Update inventory for product
   */
  async updateInventory(sku, quantity, fulfillmentChannel = 'DEFAULT') {
    const startTime = Date.now();
    const client = await amazonAuth.getClient();
    const marketplaceId = amazonAuth.getMarketplaceId();

    try {
      console.log('📤 [AMAZON INVENTORY] UPDATE_INVENTORY_REQUEST', {
        timestamp: new Date().toISOString(),
        sku,
        quantity,
        fulfillmentChannel,
        marketplaceId
      });
      logger.logRequest('UpdateInventory', { sku, quantity, fulfillmentChannel });

      const payload = {
        MarketplaceId: marketplaceId,
        SellerSKU: sku,
        Quantity: quantity,
        FulfillmentCenterID: fulfillmentChannel
      };

      // Submit inventory feed using createFeed operation
      const result = await client.callAPI({
        operation: 'createFeed',
        endpoint: 'feeds',
        body: {
          marketplaceIds: [marketplaceId],
          feedType: 'POST_INVENTORY_AVAILABILITY_DATA',
          inputFeedDocumentId: await this.createInventoryFeedDocument(payload)
        }
      });

      const executionTime = Date.now() - startTime;
      console.log('✅ [AMAZON INVENTORY] UPDATE_INVENTORY_SUCCESS', {
        timestamp: new Date().toISOString(),
        sku,
        feedId: result.feedId,
        executionTime,
        responseBody: result
      });
      logger.logResponse('UpdateInventory', result, executionTime);

      return {
        success: true,
        feedId: result.feedId,
        sku
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      console.error('❌ [AMAZON INVENTORY] UPDATE_INVENTORY_ERROR', {
        timestamp: new Date().toISOString(),
        sku,
        quantity,
        error: error.message,
        code: error.code,
        stack: error.stack,
        responseBody: error.response?.body || error.response || error,
        executionTime
      });
      logger.logError('UpdateInventory', error, { sku, quantity });
      
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
   * Create inventory feed document
   */
  async createInventoryFeedDocument(payload) {
    const client = await amazonAuth.getClient();
    
    const document = await client.callAPI({
      operation: 'createFeedDocument',
      endpoint: 'feeds',
      body: {
        contentType: 'text/xml; charset=UTF-8'
      }
    });

    // Upload the feed content
    const xmlContent = this.generateInventoryXml(payload);
    await this.uploadFeedDocument(document.url, xmlContent);

    return document.feedDocumentId;
  }

  /**
   * Generate inventory XML
   */
  generateInventoryXml(payload) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<AmazonEnvelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="amzn-envelope.xsd">
  <Header>
    <DocumentVersion>1.01</DocumentVersion>
    <MerchantIdentifier>${process.env.AMAZON_SP_API_SELLER_ID}</MerchantIdentifier>
  </Header>
  <MessageType>Inventory</MessageType>
  <Message>
    <MessageID>1</MessageID>
    <OperationType>Update</OperationType>
    <Inventory>
      <SKU>${payload.SellerSKU}</SKU>
      <Quantity>${payload.Quantity}</Quantity>
      <FulfillmentCenterID>${payload.FulfillmentCenterID}</FulfillmentCenterID>
    </Inventory>
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
   * Get inventory summary
   */
  async getInventorySummary(sku) {
    const client = await amazonAuth.getClient();
    const marketplaceId = amazonAuth.getMarketplaceId();

    try {
      const result = await client.callAPI({
        operation: 'getInventorySummaries',
        endpoint: 'fbaInventory',
        query: {
          marketplaceIds: [marketplaceId],
          details: true,
          granularityType: 'Marketplace',
          granularityId: marketplaceId,
          sellerSkus: [sku]
        }
      });

      return {
        success: true,
        data: result
      };
    } catch (error) {
      logger.logError('GetInventorySummary', error, { sku });
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new AmazonInventoryService();
