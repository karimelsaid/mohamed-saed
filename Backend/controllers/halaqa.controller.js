const Halaqa = require('../models/Halaqa.model');
const User = require('../models/User.model');
const Message = require('../models/Message.model');
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

// --- New Methods for Phase 2 ---

// جلب تفاصيل الحلقة (مع الأعضاء والرسائل الأخيرة)
exports.getHalaqaDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const halaqa = await Halaqa.findById(id)
            .populate('leader', 'username profileImage')
            .populate('members', 'username profileImage gender') // Include gender to valid
            .populate('assistants', 'username profileImage');

        if (!halaqa) return res.status(404).json({ success: false, message: 'Halaqa not found' });

        // Check if user is member (Optional privacy check)
        // For now open details is fine, or check req.user if available

        // Get invite code only if member/leader
        // But for "Join by Code", user needs to type code.
        // If already member, we show code.

        res.status(200).json({ success: true, data: halaqa });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// جلب رسائل الحلقة
exports.getMessages = async (req, res) => {
    try {
        const { id } = req.params;
        const { limit = 50, before } = req.query;

        const query = { halaqaId: id, isDeleted: false };
        if (before) {
            query.createdAt = { $lt: new Date(before) };
        }

        const messages = await Message.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .populate('sender', 'username profileImage');

        res.status(200).json({ success: true, data: messages.reverse() });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// إرسال رسالة
exports.sendMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId, content, type } = req.body;

        const halaqa = await Halaqa.findById(id);
        if (!halaqa) return res.status(404).json({ success: false, message: 'Halaqa not found' });

        // Verify membership
        if (halaqa.leader.toString() !== userId && !halaqa.members.includes(userId)) {
            return res.status(403).json({ success: false, message: 'Not a member of this Halaqa' });
        }

        const newMessage = new Message({
            halaqaId: id,
            sender: userId,
            content,
            type: type || 'text'
        });

        await newMessage.save();

        // Populate sender for immediate display
        await newMessage.populate('sender', 'username profileImage');

        res.status(201).json({ success: true, data: newMessage });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// حذف الحلقة (للقائد فقط)
exports.deleteHalaqa = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body; // or from req.user if using auth middleware

        const halaqa = await Halaqa.findById(id);
        if (!halaqa) return res.status(404).json({ success: false, message: 'Halaqa not found' });

        // Verify leader
        if (halaqa.leader.toString() !== userId) {
            return res.status(403).json({ success: false, message: 'Only the leader can delete this Halaqa' });
        }

        // Delete all messages associated with this Halaqa
        await Message.deleteMany({ halaqaId: id });

        // Delete the Halaqa itself
        await Halaqa.findByIdAndDelete(id);

        res.status(200).json({ success: true, message: 'Halaqa and all messages deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
