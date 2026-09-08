const mongoose = require('mongoose');
const Order = require('./Backend/models/Order.model');
const ShippingService = require('./Backend/services/shipping/shipping.service');
const ShippingSetting = require('./Backend/models/ShippingSetting.model');
const dotenv = require('dotenv');

dotenv.config({ path: './Backend/.env' });

async function testShipping() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/kenouz');
    console.log('✅ Connected to MongoDB');

    // Create a mock order
    const testOrder = new Order({
      customerName: 'Test Customer',
      email: 'test@bosta.co',
      phone: '01000000000',
      address: '123 Test Street, Maadi',
      totalAmount: 150.50,
      products: [{
        product_name: 'Test Book',
        product_quantity: 1,
        product_price: 150.50
      }],
      status: 'pending',
      deliveryMethod: 'توصيل للمنزل'
    });

    await testOrder.save();
    console.log('✅ Created mock order with ID:', testOrder._id.toString());

    // Make sure Bosta is active
    const settings = await ShippingSetting.findOne();
    if (!settings || settings.activeCarrier !== 'bosta') {
      console.log('⚠️ Shipping active carrier is not set to Bosta. Updating it for the test...');
      if (!settings) {
        await ShippingSetting.create({ activeCarrier: 'bosta', bosta: { apiKey: '09527ae07f54fc7484466a823b845b71d31ba1fa7e1c0cd18ae79b7a30edaa8b', isTestMode: false } });
      } else {
        settings.activeCarrier = 'bosta';
        await settings.save();
      }
    }

    // Call the shipping service
    const shippingService = new ShippingService();
    console.log('🚀 Initiating shipment with Bosta API...');
    const shippedOrder = await shippingService.shipOrder(testOrder._id);

    console.log('🎉 Shipment Created Successfully!');
    console.log('Tracking Number:', shippedOrder.trackingNumber);
    console.log('Shipping Label URL:', shippedOrder.shippingLabelUrl);
    console.log('Shipping ID:', shippedOrder.shippingId);

    // Clean up mock order
    await Order.findByIdAndDelete(testOrder._id);
    console.log('🧹 Cleaned up mock order.');

    process.exit(0);
  } catch (err) {
    console.error('❌ Test Failed:', err.message);
    process.exit(1);
  }
}

testShipping();
