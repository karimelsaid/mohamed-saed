const mongoose = require('mongoose');
const ShippingSetting = require('./Backend/models/ShippingSetting.model');
const dotenv = require('dotenv');

dotenv.config({ path: './Backend/.env' });

async function test() {
  await mongoose.connect(process.env.MONGO_URI);
  const settings = await ShippingSetting.findOne();
  console.log(JSON.stringify(settings, null, 2));
  process.exit(0);
}
test();
