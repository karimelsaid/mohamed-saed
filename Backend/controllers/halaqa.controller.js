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
// إعداد multer لرفع الملفات (PDF وغيرها)
const fileStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = path.join(__dirname, '../uploads/files');
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, 'file-' + uniqueSuffix + ext);
    }
});

const fileUpload = multer({
    storage: fileStorage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

const Message = require('../models/Message.model');
const crypto = require('crypto');

// إنشاء حلقة جديدة
exports.createHalaqa = async (req, res) => {
    try {
        const { name, description, maxMembers, leaderId, gender } = req.body;

        const leader = await User.findById(leaderId);
        if (!leader) return res.status(404).json({ success: false, message: 'User not found' });

        // التحقق من وجود الجنس (مطلوب لإنشاء الحلقة)
        const finalGender = gender || leader.gender;
        if (!finalGender) {
            return res.status(400).json({
                success: false,
                message: 'يجب تحديد الجنس (ذكر/أنثى) في ملفك الشخصي قبل إنشاء حلقة'
            });
        }

        // إذا كان المستخدم ليس لديه جنس في الملف الشخصي، نقوم بتحديثه الآن
        if (!leader.gender && finalGender) {
            leader.gender = finalGender;
            await leader.save();
        }

        // توليد كود دعوة فريد
        const inviteCode = crypto.randomBytes(3).toString('hex').toUpperCase();

        const newHalaqa = new Halaqa({
            name,
            description,
            gender: finalGender, // ضبط الجنس تلقائياً حسب منشئ الحلقة
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
        const { limit = 50, before, pinned } = req.query;

        const query = { halaqaId: id, isDeleted: false };
        if (before) {
            query.createdAt = { $lt: new Date(before) };
        }
        if (pinned === 'true') {
            query.isPinned = true;
        }

        const messages = await Message.find(query)
            .sort({ createdAt: -1 })
            .limit(parseInt(limit))
            .populate('sender', 'username profileImage')
            .populate({
                path: 'replyTo',
                populate: { path: 'sender', select: 'username' }
            })
            .populate('mentions', 'username');

        res.status(200).json({ success: true, data: messages.reverse() });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.searchMessages = async (req, res) => {
    try {
        const { id } = req.params;
        const { q, limit = 20, offset = 0 } = req.query;

        if (!q) {
            return res.status(400).json({ success: false, message: 'Search query is required' });
        }

        // Escape special regex characters to prevent errors
        const escapedQuery = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const query = {
            halaqaId: new mongoose.Types.ObjectId(id),
            isDeleted: false,
            content: { $regex: escapedQuery, $options: 'i' }
        };

        const messages = await Message.find(query)
            .populate('sender', 'username profileImage')
            .sort({ createdAt: -1 })
            .skip(parseInt(offset))
            .limit(parseInt(limit));

        res.status(200).json({ success: true, data: messages });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// إرسال رسالة
exports.sendMessage = async (req, res) => {
    try {
        const { id } = req.params;
        const { userId, content, type, replyTo, mentions, fileMetadata } = req.body;

        const halaqa = await Halaqa.findById(id);
        if (!halaqa) return res.status(404).json({ success: false, message: 'Halaqa not found' });

        // Verify membership (using .toString() for robustness)
        const isMember = halaqa.members.some(m => m.toString() === userId.toString());
        const isLeader = halaqa.leader.toString() === userId.toString();

        if (!isLeader && !isMember) {
            return res.status(403).json({ success: false, message: 'Not a member of this Halaqa' });
        }

        // Announcement check: Only leaders can send announcements
        if (type === 'announcement' && !isLeader) {
            return res.status(403).json({ success: false, message: 'Only leaders can send announcements' });
        }

        const newMessage = new Message({
            halaqaId: id,
            sender: userId,
            content,
            type: type || 'text',
            replyTo: replyTo || null,
            mentions: mentions || [],
            fileMetadata: fileMetadata || null
        });

        await newMessage.save();

        // Populate sender and replyTo for immediate display
        await newMessage.populate('sender', 'username profileImage');
        if (newMessage.replyTo) {
            await newMessage.populate({
                path: 'replyTo',
                populate: { path: 'sender', select: 'username' }
            });
        }
        if (newMessage.mentions && newMessage.mentions.length > 0) {
            await newMessage.populate('mentions', 'username');
        }

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

// تثبيت رسالة أو إلغاء تثبيتها (للقائد ومساعديه)
exports.togglePinMessage = async (req, res) => {
    try {
        const { messageId } = req.params;
        const { userId } = req.body;

        const message = await Message.findById(messageId);
        if (!message) return res.status(404).json({ success: false, message: 'Message not found' });

        const halaqa = await Halaqa.findById(message.halaqaId);
        if (!halaqa) return res.status(404).json({ success: false, message: 'Halaqa not found' });

        // Verify leader or assistant
        const isLeader = halaqa.leader.toString() === userId.toString();
        const isAssistant = halaqa.assistants?.some(a => a.toString() === userId.toString());

        if (!isLeader && !isAssistant) {
            return res.status(403).json({ success: false, message: 'Only leaders and assistants can pin messages' });
        }

        const newPinState = !message.isPinned;
        message.isPinned = newPinState;
        message.pinnedBy = newPinState ? userId : null;
        message.pinnedAt = newPinState ? new Date() : null;

        await message.save();

        // Broadcast update
        if (req.io) {
            req.io.to(halaqa._id.toString()).emit('message_pinned_update', {
                messageId: message._id,
                isPinned: newPinState,
                pinnedBy: userId
            });
        }

        res.status(200).json({ success: true, data: message });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- Voice Message Upload ---

exports.uploadVoiceMessage = [
    voiceUpload.single('audio'),
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'No audio file uploaded' });
            }

            const publicUrl = `/uploads/voice/${req.file.filename}`;

            res.status(200).json({
                success: true,
                message: 'Voice message uploaded successfully',
                url: publicUrl
            });
        } catch (error) {
            console.error('Error uploading voice message:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }
];

exports.uploadFile = [
    fileUpload.single('file'),
    async (req, res) => {
        try {
            if (!req.file) {
                return res.status(400).json({ success: false, message: 'No file uploaded' });
            }

            const publicUrl = `/uploads/files/${req.file.filename}`;

            res.status(200).json({
                success: true,
                message: 'File uploaded successfully',
                url: publicUrl,
                fileMetadata: {
                    name: req.file.originalname,
                    size: req.file.size,
                    mimeType: req.file.mimetype
                }
            });
        } catch (error) {
            console.error('Error uploading file:', error);
            res.status(500).json({ success: false, message: error.message });
        }
    }
];

// --- Private DM Logic ---

exports.getOrCreateDM = async (req, res) => {
    try {
        const { userId, otherUserId } = req.body;

        if (!userId || !otherUserId) {
            return res.status(400).json({ success: false, message: 'Both user IDs are required' });
        }

        // Check for existing DM
        let dm = await Halaqa.findOne({
            isDM: true,
            dmParticipants: { $all: [userId, otherUserId] },
            active: true
        });

        if (dm) {
            return res.status(200).json({ success: true, data: dm });
        }

        // Fetch users to ensure they exist and get their usernames + gender
        const users = await User.find({ _id: { $in: [userId, otherUserId] } });

        if (users.length < 2 && userId !== otherUserId) {
            return res.status(404).json({ success: false, message: 'One or more users not found' });
        }

        const user1 = users.find(u => u._id.toString() === userId.toString());
        const user2 = users.find(u => u._id.toString() === otherUserId.toString());

        if (!user1 || !user2) {
            return res.status(404).json({ success: false, message: 'User verification failed' });
        }

        const title = `دردشة خاصة: ${user1.username} و ${user2.username}`;

        // Create new DM "Halaqa"
        const inviteCode = crypto.randomBytes(4).toString('hex').toUpperCase();
        dm = new Halaqa({
            name: title,
            description: 'دردشة خاصة',
            gender: user1.gender, // Use gender from one of participants
            leader: userId,
            members: [otherUserId],
            dmParticipants: [userId, otherUserId],
            isDM: true,
            isPrivate: true,
            inviteCode
        });

        await dm.save();
        res.status(201).json({ success: true, data: dm });
    } catch (error) {
        console.error('Error in getOrCreateDM:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// --- Statistics & Insights ---

exports.getHalaqaStats = async (req, res) => {
    try {
        const { id } = req.params;
        const mongoose = require('mongoose');

        const halaqa = await Halaqa.findById(id);
        if (!halaqa) return res.status(404).json({ success: false, message: 'Halaqa not found' });

        // Aggregate message counts per user
        const stats = await Message.aggregate([
            { $match: { halaqaId: new mongoose.Types.ObjectId(id), isDeleted: false } },
            {
                $group: {
                    _id: "$sender",
                    messageCount: { $sum: 1 },
                    lastActive: { $max: "$createdAt" }
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "_id",
                    as: "userInfo"
                }
            },
            { $unwind: "$userInfo" },
            {
                $project: {
                    userId: "$_id",
                    username: "$userInfo.username",
                    profileImage: "$userInfo.profileImage",
                    messageCount: 1,
                    lastActive: 1,
                    hifzProgress: {
                        $cond: {
                            if: { $gt: ["$userInfo.quranProgress.versesMemorized", 0] },
                            then: { $multiply: [{ $divide: ["$userInfo.quranProgress.versesMemorized", 6236] }, 100] },
                            else: 0
                        }
                    }
                }
            },
            { $sort: { messageCount: -1 } }
        ]);

        // Total messages in halaqa
        const totalMessages = stats.reduce((sum, s) => sum + s.messageCount, 0);

        res.status(200).json({
            success: true,
            data: {
                totalMessages,
                memberStats: stats,
                generatedAt: new Date()
            }
        });
    } catch (error) {
        console.error('Error in getHalaqaStats:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getHalaqaMedia = async (req, res) => {
    try {
        const { id } = req.params;
        const media = await Message.find({
            halaqaId: id,
            isDeleted: false,
            type: { $in: ['image', 'file', 'voice', 'audio'] }
        }).sort({ createdAt: -1 }).populate('sender', 'username');

        res.status(200).json({ success: true, data: media });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
