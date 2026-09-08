const axios = require('axios');

class ShipBluService {
  constructor(config) {
    this.apiKey = config.apiKey ? config.apiKey.trim() : '';
    this.baseUrl = config.isTestMode ? 'https://api.staging.shipblu.com' : 'https://api.shipblu.com';
  }

  async createShipment(orderData) {
    try {
      console.log(`[ShipBluService] Creating shipment via ${this.baseUrl}`);
      
      const payload = {
        pickup_address_id: 'default', // Usually setup in ShipBlu dashboard
        dropoff_first_name: orderData.customerName || 'Customer',
        dropoff_last_name: '.',
        dropoff_phone_number: orderData.phone || '01000000000',
        dropoff_address_line_1: orderData.address || 'Cairo',
        dropoff_city: orderData.city || 'Cairo',
        dropoff_state: orderData.zone || 'Cairo',
        cod_amount: orderData.totalAmount || 0,
        merchant_order_id: orderData._id || Date.now().toString(),
        description: orderData.products ? orderData.products.map(p => p.product_name).join(', ') : 'Books',
        type: 'delivery'
      };

      // Simulated Response for ShipBlu (since actual credentials might be needed)
      /*
      const response = await axios.post(`${this.baseUrl}/api/v1/shipments`, payload, {
        headers: { 
          'Authorization': `Api-Key ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      */
      
      const trackingNumber = 'SB-' + Date.now();
      
      return {
        success: true,
        trackingNumber: trackingNumber,
        shippingId: trackingNumber,
        labelUrl: `https://shipblu.com/track/${trackingNumber}`
      };
    } catch (error) {
      console.error('ShipBlu Error:', error.message);
      throw new Error('Failed to create ShipBlu shipment');
    }
  }
}

module.exports = ShipBluService;
