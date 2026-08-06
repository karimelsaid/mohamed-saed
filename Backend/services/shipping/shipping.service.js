const ShippingSetting = require('../../models/ShippingSetting.model');
const BostaService = require('./bosta.service');
const AramexService = require('./aramex.service');
const Order = require('../../models/Order.model');

class ShippingService {
  async getActiveCarrierService() {
    const settings = await ShippingSetting.findOne();
    if (!settings || settings.activeCarrier === 'none') {
      throw new Error('No active shipping carrier configured');
    }

    if (settings.activeCarrier === 'bosta') {
      return new BostaService(settings.bosta);
    } else if (settings.activeCarrier === 'aramex') {
      return new AramexService(settings.aramex);
    }
    
    throw new Error('Unsupported carrier');
  }

  async shipOrder(orderId) {
    const User = require('../../models/User.model');
    let order;
    let user;
    let isSubdocument = false;

    // Try finding in standalone Order collection
    order = await Order.findById(orderId);

    // If not found, try finding in User.orders subdocuments
    if (!order) {
      user = await User.findOne({ 'orders._id': orderId });
      if (user) {
        order = user.orders.id(orderId);
        isSubdocument = true;
      }
    }

    if (!order) throw new Error('Order not found');
    if (order.trackingNumber) throw new Error('Order already shipped');

    const carrierService = await this.getActiveCarrierService();
    const settings = await ShippingSetting.findOne();

    // Prepare data for shipment (mapping fields if necessary)
    const shipmentData = {
      customerName: order.customerName || (user ? user.username : 'Customer'),
      email: order.email || (user ? user.email : ''),
      phone: order.phone || (user ? user.phone : ''),
      address: order.address || (order.shippingAddress ? order.shippingAddress.address : ''),
      totalAmount: order.totalAmount,
      products: order.products.map(p => ({
        product_name: p.product_name || p.bookName,
        product_quantity: p.product_quantity || p.quantity
      }))
    };

    const shipmentResult = await carrierService.createShipment(shipmentData);

    if (shipmentResult.success) {
      order.shippingCarrier = settings.activeCarrier;
      order.trackingNumber = shipmentResult.trackingNumber;
      order.shippingId = shipmentResult.shippingId;
      order.shippingLabelUrl = shipmentResult.labelUrl;
      order.status = isSubdocument ? 'تم الشحن' : 'shipped';
      
      if (isSubdocument) {
        await user.save();
      } else {
        await order.save();
      }
      
      return order;
    }
    
    throw new Error('Shipment creation failed');
  }
}

module.exports = new ShippingService();
