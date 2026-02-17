const Halaqa = require('../models/Halaqa.model');
const User = require('../models/User.model');
const crypto = require('crypto');

// إنشاء حلقة جديدة
exports.createHalaqa = async (req, res) => {
    try {
        const { name, description, maxMembers, leaderId } = req.body;

        const leader = await User.findById(leaderId);
        if (!leader) return res.status(404).json({ success: false, message: 'User not found' });

        // توليد كود دعوة فريد
        const inviteCode = crypto.randomBytes(3).toString('hex').toUpperCase();

        const newHalaqa = new Halaqa({
            name,
            description,
            gender: leader.gender, // ضبط الجنس تلقائياً حسب منشئ الحلقة
            leader: leaderId,
            maxMembers: maxMembers || 20,
            inviteCode
        });

        await newHalaqa.save();
        res.status(201).json({ success: true, data: newHalaqa });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// جلب الحلقات المتاحة لنفس جنس المستخدم
exports.getAvailableHalaqas = async (req, res) => {
    try {
        const { gender } = req.query; // يفضل تمريره من الـ Frontend بناءً على بيانات المستخدم المسجل
        const halaqas = await Halaqa.find({ gender, active: true, isPrivate: false })
            .populate('leader', 'username profileImage')
            .select('-inviteCode'); // إخفاء كود الدعوة للحلقات العامة حتى يتم الانضمام

        res.status(200).json({ success: true, data: halaqas });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// الانضمام لحلقة عبر كود الدعوة
exports.joinHalaqa = async (req, res) => {
    try {
        const { userId, inviteCode } = req.body;

        const user = await User.findById(userId);
        const halaqa = await Halaqa.findOne({ inviteCode, active: true });

        if (!halaqa) return res.status(404).json({ success: false, message: 'Halaqa not found' });
        if (user.gender !== halaqa.gender) {
            return res.status(403).json({ success: false, message: 'Gender mismatch' });
        }

        if (halaqa.members.length >= halaqa.maxMembers) {
            return res.status(400).json({ success: false, message: 'Halaqa is full' });
        }

        if (halaqa.members.includes(userId) || halaqa.leader.toString() === userId) {
            return res.status(400).json({ success: false, message: 'Already a member' });
        }

        halaqa.members.push(userId);
        await halaqa.save();

        res.status(200).json({ success: true, message: 'Joined successfully', data: halaqa });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
