const mongoose = require('mongoose');
const ShippingSetting = require('./Backend/models/ShippingSetting.model');
const dotenv = require('dotenv');

dotenv.config({ path: './Backend/.env' });

async function test() {
  await mongoose.connect(process.env.MONGO_URI);
  const settings = await ShippingSetting.findOne();
  if (settings) {
    console.log("API Key length:", settings.bosta.apiKey.length);
    console.log("API Key:", `"${settings.bosta.apiKey}"`);
    console.log("Is Test Mode:", settings.bosta.isTestMode);
    console.log("Active Carrier:", settings.activeCarrier);
  }
  process.exit(0);
}
test();
