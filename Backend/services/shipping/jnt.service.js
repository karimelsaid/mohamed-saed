const axios = require('axios');
const crypto = require('crypto');

class JNTService {
  constructor(config) {
    this.customerCode = config.customerCode ? config.customerCode.trim() : '';
    this.apiAccount = config.apiAccount ? config.apiAccount.trim() : '';
    this.apiPassword = config.apiPassword ? config.apiPassword.trim() : '';
    this.baseUrl = config.isTestMode ? 'https://openapi.jtlogistics.eg' : 'https://openapi.jtlogistics.eg'; // Usually same domain for both or specific test domain
  }

  generateSignature(data, privateKey) {
    return crypto.createHash('md5').update(data + privateKey).digest('base64');
  }

  async createShipment(orderData) {
    try {
      console.log(`[JNTService] Creating shipment for order ${orderData._id}`);
      
      const payload = {
        customerCode: this.customerCode,
        digest: this.generateSignature('DUMMY_DATA', this.apiPassword),
        txlogisticId: orderData._id || Date.now().toString(),
        orderType: 1,
        serviceType: 1,
        sender: {
          name: 'Store Name',
          mobile: '01000000000',
          prov: 'Cairo',
          city: 'Cairo',
          address: 'Store Address'
        },
        receiver: {
          name: orderData.customerName || 'Customer',
          mobile: orderData.phone || '01000000000',
          prov: orderData.city || 'Cairo',
          city: orderData.city || 'Cairo',
          address: orderData.address || 'Address'
        },
        itemsValue: orderData.totalAmount || 0,
        payType: 1 // 1 for cash on delivery usually
      };

      // Simulated Response for J&T Express
      // const response = await axios.post(`${this.baseUrl}/order/addOrder`, payload);
      
      console.log('[JNTService] Payload prepared:', payload);
      const trackingNumber = 'JNT-' + Date.now();
      
      return {
        success: true,
        trackingNumber: trackingNumber,
        shippingId: trackingNumber,
        labelUrl: `https://www.jtexpress.eg/trajectoryQuery?billcode=${trackingNumber}`
      };
    } catch (error) {
      console.error('J&T Express Error:', error.message);
      throw new Error('Failed to create J&T Express shipment');
    }
  }
}

module.exports = JNTService;
