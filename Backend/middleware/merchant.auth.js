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
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ success: false, message: 'Invalid token.' });
  }
};

module.exports = authenticateMerchant;
