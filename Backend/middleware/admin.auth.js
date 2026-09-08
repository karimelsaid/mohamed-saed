const jwt = require('jsonwebtoken');
const User = require('../models/User.model');

const authenticateAdmin = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '') || req.query.token;

    if (!token) {
      return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    const admin = await User.findOne({ _id: decoded.adminId || decoded.userId, role: { $in: ['admin', 'staff'] } });

    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid token.' });
    }

    console.log('🔐 [AdminAuth] Authenticated user:', admin.email, 'role:', admin.role, 'permissions:', admin.permissions);

    // Set both req.admin and req.user for compatibility
    req.admin = admin;
    req.user = admin;
    next();
  } catch (error) {
    console.error('❌ [AdminAuth] Error:', error);
    res.status(401).json({ success: false, message: 'Invalid token.' });
  }
};

module.exports = authenticateAdmin;
