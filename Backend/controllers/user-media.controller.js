const fs = require('fs');
const path = require('path');
// const sharp = require('sharp'); // Disabled due to causing server crash
const multer = require('multer');
const User = require('../models/User.model');

// Multer Config (Disk Storage instead of Memory to save directly)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Use req.user._id (from verifyToken) as first priority, then body
        const userId = (req.user && req.user._id) ? req.user._id.toString() : (req.body.userId || 'unknown');
        const userDir = path.join(__dirname, '../uploads/users', userId);
        if (!fs.existsSync(userDir)) {
            fs.mkdirSync(userDir, { recursive: true });
        }
        cb(null, userDir);
    },
    filename: (req, file, cb) => {
        const userId = (req.user && req.user._id) ? req.user._id.toString() : (req.body.userId || 'unknown');
        const ext = path.extname(file.originalname) || '.jpg';
        const prefix = req.path.includes('cover') ? 'cover' : 'profile';
        cb(null, `${prefix}-${userId}-${Date.now()}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only images are allowed!'), false);
        }
    }
});

exports.uploadProfileImage = [
    upload.single('image'),
    async (req, res) => {
        try {
            console.log('📸 [ProfileUpload] User ID from body:', req.body.userId);
            console.log('👤 [ProfileUpload] User from Req (Auth):', req.user?._id);
            console.log('📁 [ProfileUpload] File Info:', req.file ? {
                filename: req.file.filename,
                path: req.file.path,
                size: req.file.size
            } : 'No file');

            if (!req.file) {
                return res.status(400).json({ message: 'No image uploaded' });
            }

            const userId = req.body.userId || (req.user ? req.user._id.toString() : null);
            if (!userId) {
                console.error('❌ [ProfileUpload] No User ID provided!');
                fs.unlinkSync(req.file.path);
                return res.status(400).json({ message: 'User ID is required' });
            }

            // Construct Public URL
            const filename = req.file.filename;
            const publicUrl = `/uploads/users/${userId}/${filename}`;

            // 1. Find User to clean up old image
            const user = await User.findById(userId).select('profileImage');
            if (!user) {
                console.error(`❌ [ProfileUpload] User ${userId} not found in DB`);
                fs.unlinkSync(req.file.path);
                return res.status(404).json({ message: 'User not found' });
            }

            // Delete old image if it exists in local storage
            if (user.profileImage && user.profileImage.includes('/uploads/')) {
                let oldPath;
                if (user.profileImage.includes('/uploads/profiles/')) {
                    const oldFilename = user.profileImage.split('/').pop();
                    oldPath = path.join(__dirname, '../uploads/profiles', oldFilename);
                } else {
                    const parts = user.profileImage.split('/');
                    const uId = parts[parts.length - 2];
                    const fName = parts[parts.length - 1];
                    oldPath = path.join(__dirname, '../uploads/users', uId, fName);
                }

                if (fs.existsSync(oldPath)) {
                    try { 
                        fs.unlinkSync(oldPath);
                        console.log('🗑️ [ProfileUpload] Old image deleted:', oldPath);
                    } catch (err) { 
                        console.error('Error deleting old profile image:', err); 
                    }
                }
            }

            await User.findByIdAndUpdate(userId, { profileImage: publicUrl });
            console.log(`✅ [ProfileUpload] User ${userId} updated with: ${publicUrl}`);

            res.status(200).json({
                message: 'Profile image updated successfully',
                imageUrl: publicUrl
            });

        } catch (error) {
            console.error('🔥 [ProfileUpload] Error:', error);
            if (req.file) fs.unlinkSync(req.file.path);
            res.status(500).json({ message: 'Error processing image', error: error.message });
        }
    }
];

exports.uploadCoverImage = [
    upload.single('image'),
    async (req, res) => {
        try {
            console.log('📸 [CoverUpload] User ID from body:', req.body.userId);
            console.log('👤 [CoverUpload] User from Req (Auth):', req.user?._id);

            if (!req.file) {
                return res.status(400).json({ message: 'No image uploaded' });
            }

            const userId = req.body.userId || (req.user ? req.user._id.toString() : null);
            if (!userId) {
                console.error('❌ [CoverUpload] No User ID provided!');
                fs.unlinkSync(req.file.path);
                return res.status(400).json({ message: 'User ID is required' });
            }

            const filename = req.file.filename;
            const publicUrl = `/uploads/users/${userId}/${filename}`;

            const user = await User.findById(userId).select('coverPhoto');
            if (!user) {
                console.error(`❌ [CoverUpload] User ${userId} not found in DB`);
                fs.unlinkSync(req.file.path);
                return res.status(404).json({ message: 'User not found' });
            }

            if (user.coverPhoto && user.coverPhoto.includes('/uploads/')) {
                let oldPath;
                if (user.coverPhoto.includes('/uploads/profiles/')) {
                    const oldFilename = user.coverPhoto.split('/').pop();
                    oldPath = path.join(__dirname, '../uploads/profiles', oldFilename);
                } else {
                    const parts = user.coverPhoto.split('/');
                    const uId = parts[parts.length - 2];
                    const fName = parts[parts.length - 1];
                    oldPath = path.join(__dirname, '../uploads/users', uId, fName);
                }

                if (fs.existsSync(oldPath)) {
                    try { 
                        fs.unlinkSync(oldPath);
                        console.log('🗑️ [CoverUpload] Old cover deleted:', oldPath);
                    } catch (err) { 
                        console.error('Error deleting old cover photo:', err); 
                    }
                }
            }

            await User.findByIdAndUpdate(userId, { coverPhoto: publicUrl });
            console.log(`✅ [CoverUpload] User ${userId} updated with: ${publicUrl}`);

            res.status(200).json({
                message: 'Cover photo updated successfully',
                imageUrl: publicUrl
            });
        } catch (error) {
            console.error('🔥 [CoverUpload] Error:', error);
            if (req.file) fs.unlinkSync(req.file.path);
            res.status(500).json({ message: 'Error processing image', error: error.message });
        }
    }
];
