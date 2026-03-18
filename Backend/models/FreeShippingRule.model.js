const mongoose = require('mongoose');

const FreeShippingRuleSchema = new mongoose.Schema({
  minQuantity: { type: Number, default: 3 },
  minOrderValue: { type: Number, default: 0 },
  userGroups: { type: [String], default: [] },
  includedProducts: { type: [String], default: [] },
  includedCategories: { type: [String], default: [] },
  includedGovernorates: { type: [String], default: [] },
  freeShippingEnabled: { type: Boolean, default: true },
  codFee: { type: Number, default: 10 },
}, { timestamps: true });

const FreeShippingRule = mongoose.model('FreeShippingRule', FreeShippingRuleSchema);

module.exports = FreeShippingRule;
