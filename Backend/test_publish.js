const amazonAuth = require('./services/amazon/amazon-auth.service');

async function main() {
  const client = await amazonAuth.getClient();
  const marketplaceId = amazonAuth.getMarketplaceId();
  const sellerId = 'A1NLMXX19H764W';
  const sku = 'TEST-SKU-NEW-123';
  
  const payload = {
    productType: 'ELECTRONIC_BOOK_READER',
    requirements: 'LISTING',
    attributes: {
      item_name: [{ value: 'كتاب تجربة', language_tag: 'ar_AE', marketplace_id: marketplaceId }],
      brand: [{ value: 'عام', language_tag: 'ar_AE', marketplace_id: marketplaceId }],
      manufacturer: [{ value: 'generic', language_tag: 'ar_AE', marketplace_id: marketplaceId }],
      part_number: [{ value: '12345', marketplace_id: marketplaceId }],
      condition_type: [{ value: 'new_new', marketplace_id: marketplaceId }],
      number_of_items: [{ value: 1, marketplace_id: marketplaceId }],
      country_of_origin: [{ value: 'EG', marketplace_id: marketplaceId }],
      batteries_required: [{ value: false, marketplace_id: marketplaceId }],
      supplier_declared_has_product_identifier_exemption: [{ value: true, marketplace_id: marketplaceId }],
      supplier_declared_dg_hz_regulation: [{ value: 'other', marketplace_id: marketplaceId }],
      warranty_description: [{ value: '15 يوما', language_tag: 'ar_AE', marketplace_id: marketplaceId }],
      product_description: [{ value: 'كتاب تجربة', language_tag: 'ar_AE', marketplace_id: marketplaceId }],
      bullet_point: [{ value: 'كتاب تجربة', language_tag: 'ar_AE', marketplace_id: marketplaceId }],
      included_components: [{ value: 'كتاب', language_tag: 'ar_AE', marketplace_id: marketplaceId }],
      item_weight: [{ value: 450, unit: 'grams', marketplace_id: marketplaceId }],
      item_package_weight: [{ value: 450, unit: 'grams', marketplace_id: marketplaceId }],
      item_package_dimensions: [{
        length: { value: 25, unit: 'centimeters' },
        width: { value: 18, unit: 'centimeters' },
        height: { value: 3, unit: 'centimeters' },
        marketplace_id: marketplaceId
      }],
      purchasable_offer: [{
        currency: 'EGP',
        our_price: [{ schedule: [{ value_with_tax: 250 }] }],
        marketplace_id: marketplaceId
      }],
      fulfillment_availability: [{
        fulfillment_channel_code: 'DEFAULT',
        quantity: 10,
        marketplace_id: marketplaceId
      }]
    }
  };

  try {
    console.log('Submitting...');
    const result = await client.callAPI({
      operation: 'putListingsItem',
      endpoint: 'listingsItems',
      path: { sellerId, sku },
      query: { marketplaceIds: [marketplaceId], issueLocale: 'en_US' },
      body: payload
    });
    console.log('Result:', JSON.stringify(result, null, 2));
    
    console.log('Waiting 5s...');
    await new Promise(r => setTimeout(r, 5000));
    
    console.log('Fetching...');
    const getResult = await client.callAPI({
      operation: 'getListingsItem',
      endpoint: 'listingsItems',
      path: { sellerId, sku },
      query: { marketplaceIds: [marketplaceId], includedData: 'summaries,issues,offers' }
    });
    console.log('GetResult:', JSON.stringify(getResult, null, 2));

  } catch (err) {
    console.error('Error:', err.response ? JSON.stringify(err.response.body || err.response, null, 2) : err.message);
  }
}
require('dotenv').config();
main().then(() => process.exit(0));
