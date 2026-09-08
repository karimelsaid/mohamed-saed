const axios = require('axios');

class SprintService {
  constructor(config) {
    this.apiKey = config.apiKey ? config.apiKey.trim() : '';
    this.baseUrl = config.isTestMode ? 'https://staging.sprint.com/api' : 'https://api.sprint.com/api';
  }

  async createShipment(orderData) {
    try {
      console.log(`[SprintService] Creating shipment via ${this.baseUrl}`);
      
      const payload = {
        pickup_address_id: 'default', // setup in Sprint dashboard
        customer_name: orderData.customerName || 'Customer',
        customer_phone: orderData.phone || '01000000000',
        customer_address: orderData.address || 'Cairo',
        customer_city: orderData.city || 'Cairo',
        amount_to_collect: orderData.totalAmount || 0,
        merchant_order_id: orderData._id || Date.now().toString(),
        notes: orderData.products ? orderData.products.map(p => p.product_name).join(', ') : 'Books'
      };

      // Simulated Response for Sprint
      /*
      const response = await axios.post(`${this.baseUrl}/v1/shipments`, payload, {
        headers: { 
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      */
      
      const trackingNumber = 'SPR-' + Date.now();
      
      return {
        success: true,
        trackingNumber: trackingNumber,
        shippingId: trackingNumber,
        labelUrl: `https://sprint.com/track/${trackingNumber}`
      };
    } catch (error) {
      console.error('Sprint Error:', error.message);
      throw new Error('Failed to create Sprint shipment');
    }
  }
}

module.exports = SprintService;
