const Feedback = require('../models/Feedback.model');

exports.submitFeedback = async (req, res) => {
    try {
        const { content, page, username, email } = req.body;
        const userId = req.user ? req.user._id : null;

        const feedback = new Feedback({
            userId,
            username: username || (req.user ? req.user.username : 'Anonymous'),
            email: email || (req.user ? req.user.email : ''),
            content,
            page
        });

        await feedback.save();
        res.json({ success: true, message: 'شكراً لملاحظاتك، تم استلامها بنجاح.' });
    } catch (error) {
        console.error('Error submitting feedback:', error);
        res.status(500).json({ success: false, message: 'حدث خطأ أثناء إرسال ملاحظاتك.' });
    }
};

exports.getAllFeedback = async (req, res) => {
    try {
        const feedback = await Feedback.find().sort({ createdAt: -1 });
        res.json({ success: true, feedback });
    } catch (error) {
        console.error('Error fetching feedback:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};
