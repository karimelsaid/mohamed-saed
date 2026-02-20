const mongoose = require('mongoose');

const promoPackageSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: { type: String },
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: false }],
    totalOriginalPrice: { type: Number },
    promoPrice: { type: Number }, // Calculated to ensure 50% profit
    minPrice: { type: Number }, // Target product price range
    maxPrice: { type: Number },
    isActive: { type: Boolean, default: true },
    image: { type: String },
    promotionTheme: { type: mongoose.Schema.Types.ObjectId, ref: 'PromotionTheme' }
}, { timestamps: true });

module.exports = mongoose.model('PromoPackage', promoPackageSchema);
