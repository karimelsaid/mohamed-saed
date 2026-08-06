const axios = require('axios');

class BostaService {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.isTestMode ? 'https://staging-api.bosta.co' : 'https://api.bosta.co';
  }

  async createShipment(orderData) {
    try {
      const response = await axios.post(`${this.baseUrl}/api/v2/deliveries`, {
        type: 10, // Package Delivery
        specs: {
          packageDetails: {
            itemsCount: orderData.products.reduce((acc, p) => acc + p.product_quantity, 0),
            description: orderData.products.map(p => p.product_name).join(', ')
          }
        },
        address: {
          firstLine: orderData.address,
          city: orderData.city || 'Cairo', // Default for now
          zone: orderData.zone
        },
        receiver: {
          firstName: orderData.customerName,
          lastName: 'Customer',
          phone: orderData.phone,
          email: orderData.email
        },
        cod: orderData.totalAmount
      }, {
        headers: { 'Authorization': this.apiKey }
      });

      return {
        success: true,
        trackingNumber: response.data.trackingNumber,
        shippingId: response.data._id,
        labelUrl: response.data.labelUrl
      };
    } catch (error) {
      console.error('Bosta Error:', error.response?.data || error.message);
      throw new Error(error.response?.data?.message || 'Failed to create Bosta shipment');
    }
  }

  async getTrackingStatus(trackingNumber) {
    try {
      const response = await axios.get(`${this.baseUrl}/api/v2/deliveries/${trackingNumber}`, {
        headers: { 'Authorization': this.apiKey }
      });
      return response.data.state;
    } catch (error) {
      console.error('Bosta Tracking Error:', error.message);
      return 'Unknown';
    }
  }
}

module.exports = BostaService;
