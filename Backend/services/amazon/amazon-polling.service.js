const amazonListing = require('./amazon-listing.service');
const logger = require('./amazon-logger.service');

class AmazonPollingService {
  /**
   * Poll until ASIN exists and listing summary is available
   */
  async waitForAsin(sku, maxWaitMinutes = 15, intervalSeconds = 10) {
    const maxAttempts = Math.ceil((maxWaitMinutes * 60) / intervalSeconds);
    let attempts = 0;

    logger.logRequest('WaitForAsin', { sku, maxAttempts, intervalSeconds });

    while (attempts < maxAttempts) {
      attempts++;
      
      const listingResult = await amazonListing.getListing(sku);

      if (listingResult.success) {
        const summaries = listingResult.data?.summaries || [];
        const summaryWithAsin = summaries.find(s => !!s.asin);
        
        if (summaryWithAsin?.asin) {
          logger.logSuccess('WaitForAsin', { sku, attempts, asin: summaryWithAsin.asin });
          return {
            success: true,
            attempts,
            asin: summaryWithAsin.asin
          };
        }

        // If listing response explicitly has ERROR issues, fail early
        const issues = listingResult.data?.issues || [];
        const hasErrors = issues.some(i => i.severity === 'ERROR');
        if (hasErrors) {
          const errorMsg = issues.filter(i => i.severity === 'ERROR').map(i => `${i.attributeName || ''}: ${i.message}`).join('; ');
          logger.logError('WaitForAsin Validation Error', new Error(errorMsg), { sku });
          return {
            success: false,
            error: errorMsg || 'Listing validation failed on Amazon',
            attempts
          };
        }
      }
      
      logger.logRetry('WaitForAsin', attempts, maxAttempts, intervalSeconds * 1000);
      await this.sleep(intervalSeconds * 1000);
    }

    logger.logError('WaitForAsin', new Error('Timeout waiting for ASIN'), { sku, attempts });
    
    return {
      success: false,
      error: 'Timeout waiting for ASIN from Amazon',
      attempts
    };
  }

  /**
   * Poll until product is BUYABLE
   */
  async waitForBuyable(sku, maxWaitMinutes = 1, intervalSeconds = 15) {
    const maxAttempts = Math.ceil((maxWaitMinutes * 60) / intervalSeconds);
    let attempts = 0;
    let lastSeenAsin = null;

    logger.logRequest('WaitForBuyable', { sku, maxAttempts, intervalSeconds });

    while (attempts < maxAttempts) {
      attempts++;
      
      const statusResult = await this.getProductStatus(sku);
      const status = statusResult.status;
      const asin = statusResult.asin;
      if (asin) lastSeenAsin = asin;
      
      if (status === 'BUYABLE' || status === 'ACCEPTED') {
        logger.logSuccess('WaitForBuyable', { sku, attempts, asin: lastSeenAsin });
        return {
          success: true,
          attempts,
          status,
          asin: lastSeenAsin
        };
      }

      if (status === 'SUPPRESSED' || status === 'PERMANENT_ERROR' || status === 'INVALID') {
        logger.logError('WaitForBuyable', new Error(`Product status: ${status}`), { sku, attempts });
        return {
          success: false,
          error: `Product status: ${status}`,
          attempts,
          status,
          asin: lastSeenAsin
        };
      }

      logger.logRetry('WaitForBuyable', attempts, maxAttempts, intervalSeconds * 1000);
      await this.sleep(intervalSeconds * 1000);
    }

    logger.logError('WaitForBuyable', new Error('Timeout waiting for BUYABLE'), { sku, attempts });
    
    return {
      success: false,
      error: 'Timeout waiting for BUYABLE',
      attempts,
      asin: lastSeenAsin
    };
  }

  /**
   * Get product status
   */
  async getProductStatus(sku) {
    const result = await amazonListing.getListing(sku);
    
    if (!result.success) {
      return { status: 'NOT_FOUND', asin: null };
    }

    // Try to get status from new Listings Items API summaries
    if (result.data?.summaries && result.data.summaries.length > 0) {
      const summary = result.data.summaries[0];
      if (summary.status && summary.status.length > 0) {
        // Return the first status (e.g., BUYABLE, DISCOVERABLE, etc.)
        return { status: summary.status[0], asin: summary.asin };
      }
      if (summary.asin) {
        return { status: 'PENDING', asin: summary.asin };
      }
    }

    // Fallback for older schemas just in case
    const status = result.data?.status ||
                   result.data?.SalesRankings?.[0]?.status ||
                   result.data?.AttributeSets?.[0]?.status ||
                   'UNKNOWN';

    return { status, asin: null };
  }

  /**
   * Sleep for specified milliseconds
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new AmazonPollingService();
