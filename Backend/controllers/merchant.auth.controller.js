const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/User.model');

const loginMerchant = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    // Find user with merchant role
    const user = await User.findOne({ email, role: 'merchant' });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Allow login even if user is suspended, but not if not approved
    if (!user.approved) {
      return res.status(403).json({ success: false, message: 'Merchant account pending approval' });
    }

    const token = jwt.sign(
      { merchantId: user._id, email: user.email },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      merchant: {
        _id: user._id,
        merchantName: user.merchantName || user.username,
        name: user.username,
        email: user.email,
        phone: user.phone,
        governorate: user.governorate,
        city: user.city,
        village: user.village,
        taxNumber: user.taxNumber,
        logo: user.logo,
        approved: user.approved,
        suspended: user.suspended || false
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

const logoutMerchant = async (req, res) => {
  res.json({ success: true, message: 'Logged out successfully' });
};

module.exports = {
  loginMerchant,
  logoutMerchant
};
