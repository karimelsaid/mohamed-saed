const mongoose = require('mongoose');
const User = require('./models/User.model');

async function checkMerchantRates() {
  const uri = "mongodb+srv://karimmohamed2729:joufTO0k8VcsbZcd@kenouz.oup4o7v.mongodb.net/?retryWrites=true&w=majority&appName=kenouz";
  try {
    await mongoose.connect(uri);
    const merchant = await User.findById('68c7510b354f4f80b893e0a1');
    if (merchant) {
      console.log('Merchant Name:', merchant.merchantName);
      console.log('Shipping Rates:', JSON.stringify(merchant.shippingRates, null, 2));
    } else {
      console.log('Merchant not found');
    }
  } catch (err) {
    console.error(err);
  } finally {
    await mongoose.disconnect();
  }
}

checkMerchantRates();
