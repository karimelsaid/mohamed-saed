const axios = require('axios');

class MylerzService {
  constructor(config) {
    this.username = config.username ? config.username.trim() : '';
    this.password = config.password ? config.password.trim() : '';
    this.baseUrl = config.isTestMode ? 'https://integrationapi.mylerz.net' : 'https://api.mylerz.com';
  }

  async authenticate() {
    try {
      const response = await axios.post(`${this.baseUrl}/token`, `grant_type=password&username=${this.username}&password=${this.password}`, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      return response.data.access_token;
    } catch (error) {
      console.error('[MylerzService] Authentication failed', error.response?.data || error.message);
      throw new Error('Mylerz authentication failed');
    }
  }

  async createShipment(orderData) {
    try {
      const token = await this.authenticate();
      
      const payload = [{
        PickupDueDate: new Date().toISOString(),
        Package_Serial: orderData._id || Date.now().toString(),
        Reference: orderData._id || 'Test',
        Description: orderData.products ? orderData.products.map(p => p.product_name).join(', ') : 'Books',
        Total_Weight: 1,
        Service_Category: 'Delivery',
        Payment_Type: 'COD',
        COD_Value: orderData.totalAmount || 0,
        Customer_Name: orderData.customerName || 'Customer',
        Mobile_No: orderData.phone || '01000000000',
        Building_No: '1',
        Street: orderData.address || 'Street',
        Neighborhood: 'Neighborhood',
        City: orderData.city || 'Cairo',
        Zone: orderData.zone || 'Cairo'
      }];

      const response = await axios.post(`${this.baseUrl}/api/Packages/AddPackage`, payload, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const trackingNumber = response.data?.Value?.[0]?.Barcode || 'MYLERZ-' + Date.now();
      
      return {
        success: true,
        trackingNumber: trackingNumber,
        shippingId: response.data?.Value?.[0]?.AWB || trackingNumber,
        labelUrl: `https://my.mylerz.com/AWB/${trackingNumber}`
      };
    } catch (error) {
      console.error('Mylerz Error:', error.response?.data || error.message);
      throw new Error('Failed to create Mylerz shipment');
    }
  }
}

module.exports = MylerzService;
