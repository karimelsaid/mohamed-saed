const amazonAuth = require('./services/amazon/amazon-auth.service');
const amazonListing = require('./services/amazon/amazon-listing.service');

async function main() {
  try {
    const sku = 'J0-4IMK-AA7T';
    console.log(`Checking Amazon for SKU: ${sku}`);
    const client = await amazonAuth.getClient();
    const marketplaceId = amazonAuth.getMarketplaceId();
    const sellerId = process.env.AMAZON_SELLER_ID;

    const result = await client.callAPI({
      operation: 'getListingsItem',
      endpoint: 'listingsItems',
      path: {
        sellerId: sellerId,
        sku: sku
      },
      query: {
        marketplaceIds: [marketplaceId],
        includedData: 'summaries,issues,offers'
      }
    });

    console.log('\n--- AMAZON API RESPONSE ---');
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('Error fetching listing:', error.message);
    if (error.response) {
      console.error(JSON.stringify(error.response.body || error.response, null, 2));
    }
  }
}

main().then(() => process.exit(0));
