const Halaqa = require('../models/Halaqa.model');
const HalaqaRating = require('../models/HalaqaRating.model');
const User = require('../models/User.model');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Multer Config for Voice Messages
const voiceStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const voiceDir = path.join(__dirname, '../uploads/voice');
        if (!fs.existsSync(voiceDir)) {
            fs.mkdirSync(voiceDir, { recursive: true });
        }
        cb(null, voiceDir);
    },
    filename: (req, file, cb) => {
        const userId = req.body.userId || 'unknown';
        const ext = path.extname(file.originalname) || '.webm';
        cb(null, `voice-${userId}-${Date.now()}${ext}`);
    }
});

const voiceUpload = multer({
    storage: voiceStorage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit for audio
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('audio/') || file.originalname.endsWith('.webm') || file.originalname.endsWith('.m4a')) {
            cb(null, true);
        } else {
            cb(new Error('Only audio files are allowed!'), false);
        }
    }
});
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

// جلب الحلقات المتاحة لنفس جنس المستخدم (العامة فقط)
exports.getAvailableHalaqas = async (req, res) => {
    try {
        const { gender, userId, search, page = 1, limit = 10 } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const query = { gender, active: true, isPrivate: false };

        // Search filter
        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }

        // Exclude halaqas where user is already leader or member
        if (userId) {
            query._id = { $nin: [] }; // Initialize
            const myGroups = await Halaqa.find({
                $or: [{ leader: userId }, { members: userId }],
                active: true
            }).select('_id');
            const myGroupIds = myGroups.map(g => g._id);
            query._id = { $nin: myGroupIds };
        }

        const totalCount = await Halaqa.countDocuments(query);
        const halaqas = await Halaqa.find(query)
            .populate('leader', 'username profileImage')
            .select('-inviteCode')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit));

        res.status(200).json({
            success: true,
            data: halaqas,
            pagination: {
                total: totalCount,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(totalCount / parseInt(limit))
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// جلب الحلقات الخاصة بالمستخدم (التي يقودها أو انضم إليها)
exports.getMyHalaqas = async (req, res) => {
    try {
        const { userId } = req.params;
        const halaqas = await Halaqa.find({
            $or: [
                { leader: userId },
                { members: userId }
            ],
            active: true
        }).populate('leader', 'username profileImage');

        res.status(200).json({ success: true, data: halaqas });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.rateMember = async (req, res) => {
    try {
        const { fromUserId, toUserId, halaqaId, rating, feedback } = req.body;

        // Verify that they are both in the same halaqa
        const halaqa = await Halaqa.findById(halaqaId);
        if (!halaqa) return res.status(404).json({ success: false, message: 'Halaqa not found' });

        const isFromMember = halaqa.members.some(m => m.toString() === fromUserId.toString()) || halaqa.leader.toString() === fromUserId.toString();
        const isToMember = halaqa.members.some(m => m.toString() === toUserId.toString()) || halaqa.leader.toString() === toUserId.toString();

        if (!isFromMember || !isToMember) {
            return res.status(403).json({ success: false, message: 'Both users must be members of the same Halaqa' });
        }

        const newRating = new HalaqaRating({
            fromUser: fromUserId,
            toUser: toUserId,
            halaqaId,
            rating,
            feedback
        });

        await newRating.save();
        res.status(201).json({ success: true, message: 'Rating submitted successfully' });

    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// الانضمام لحلقة عبر كود الدعوة
exports.joinHalaqa = async (req, res) => {
    try {
        let { userId, inviteCode } = req.body;

        // Normalize invite code
        if (inviteCode) {
            inviteCode = inviteCode.trim().toUpperCase();
        }

        const user = await User.findById(userId);
        const halaqa = await Halaqa.findOne({ inviteCode, active: true });

        if (!halaqa) return res.status(404).json({ success: false, message: 'Halaqa not found' });
        if (user.gender !== halaqa.gender) {
            return res.status(403).json({ success: false, message: 'Gender mismatch' });
        }

        if (halaqa.members.length >= halaqa.maxMembers) {
            return res.status(400).json({ success: false, message: 'Halaqa is full' });
        }

        if (halaqa.members.some(m => m.toString() === userId.toString()) || halaqa.leader.toString() === userId.toString()) {
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
        console.log(`🔍 [HalaqaController] Fetching details for ID: ${id}`);
        const halaqa = await Halaqa.findById(id)
            .populate('leader', 'username profileImage')
            .populate('members', 'username profileImage gender') // Include gender to valid
            .populate('assistants', 'username profileImage');

        if (!halaqa) {
            console.warn(`⚠️ [HalaqaController] Halaqa not found for ID: ${id}`);
            return res.status(404).json({ success: false, message: 'Halaqa not found' });
        }
        console.log(`✅ [HalaqaController] Found Halaqa: ${halaqa.name}`);

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

        // Verify membership (using .toString() for robustness)
        const isMember = halaqa.members.some(m => m.toString() === userId.toString());
        const isLeader = halaqa.leader.toString() === userId.toString();

        if (!isLeader && !isMember) {
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

        // Broadcast to room
        if (req.io) {
            req.io.to(id).emit('new_message', {
                halaqaId: id,
                message: newMessage
            });
        }

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
        if (halaqa.leader.toString() !== userId.toString()) {
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
