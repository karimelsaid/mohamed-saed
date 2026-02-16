const jwt = require('jsonwebtoken');
const User = require('../models/User.model');

const authenticateAdmin = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const admin = await User.findOne({ _id: decoded.adminId || decoded.userId, role: 'admin' });

    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid token.' });
    }

    req.admin = admin;
    next();
  } catch (error) {
    console.error('Admin auth middleware error:', error);
    res.status(401).json({ success: false, message: 'Invalid token.' });
  }
};

module.exports = authenticateAdmin;
