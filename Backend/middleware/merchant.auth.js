const jwt = require('jsonwebtoken');
const User = require('../models/User.model');

const authenticateMerchant = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const merchant = await User.findOne({ _id: decoded.merchantId, role: 'merchant' });

    if (!merchant) {
      return res.status(401).json({ success: false, message: 'Invalid token.' });
    }

    req.merchant = merchant;

    // Allow getCurrentMerchant even if not approved
    if (req.originalUrl.includes('/current') && req.method === 'GET') {
      return next();
    }

    if (!merchant.approved) {
      return res.status(403).json({ success: false, message: 'حساب التاجر غير مفعل. يرجى انتظار موافقة الإدارة.' });
    }

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ success: false, message: 'Invalid token.' });
  }
};

module.exports = authenticateMerchant;
