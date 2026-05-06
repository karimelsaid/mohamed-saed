const express = require('express');
const router = express.Router();
const Newsletter = require('../models/Newsletter.model');

// @route   POST /api/newsletter/subscribe
// @desc    Subscribe to the newsletter
// @access  Public
router.post('/subscribe', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'البريد الإلكتروني مطلوب' });
    }

    // Check if already subscribed
    let subscriber = await Newsletter.findOne({ email });
    if (subscriber) {
      if (subscriber.status === 'active') {
        return res.status(400).json({ success: false, message: 'هذا البريد مسجل بالفعل في القائمة البريدية' });
      } else {
        // Reactivate
        subscriber.status = 'active';
        subscriber.subscribedAt = Date.now();
        await subscriber.save();
        return res.status(200).json({ success: true, message: 'تمت إعادة تفعيل اشتراكك بنجاح' });
      }
    }

    // Create new subscriber
    subscriber = new Newsletter({ email });
    await subscriber.save();

    res.status(201).json({ success: true, message: 'تم الاشتراك بنجاح في القائمة البريدية' });
  } catch (err) {
    console.error('Newsletter Error:', err);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء الاشتراك، يرجى المحاولة لاحقاً' });
  }
});

// @route   GET /api/newsletter/subscribers
// @desc    Get all active subscribers
// @access  Admin (Basic check for now, should use admin auth middleware)
router.get('/subscribers', async (req, res) => {
  try {
    // Note: In production, wrap this with admin auth middleware
    const subscribers = await Newsletter.find().sort({ subscribedAt: -1 });
    res.status(200).json({ success: true, subscribers });
  } catch (err) {
    console.error('Newsletter Fetch Error:', err);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب المشتركين' });
  }
});

module.exports = router;
