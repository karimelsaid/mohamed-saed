const fs = require('fs');
const path = require('path');
// const sharp = require('sharp'); // Disabled due to causing server crash
const multer = require('multer');
const User = require('../models/User.model');

// Multer Config (Disk Storage instead of Memory to save directly)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const profilesDir = path.join(__dirname, '../uploads/profiles');
        if (!fs.existsSync(profilesDir)) {
            fs.mkdirSync(profilesDir, { recursive: true });
        }
        cb(null, profilesDir);
    },
    filename: (req, file, cb) => {
        const userId = req.body.userId || req.user?._id || 'unknown';
        const ext = path.extname(file.originalname) || '.jpg';
        cb(null, `profile-${userId}-${Date.now()}${ext}`);
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
            if (!req.file) {
                return res.status(400).json({ message: 'No image uploaded' });
            }

            const userId = req.body.userId || req.user?._id;
            if (!userId) {
                // If no user ID, clean up the uploaded file
                fs.unlinkSync(req.file.path);
                return res.status(400).json({ message: 'User ID is required' });
            }

            // Construct Public URL
            const filename = req.file.filename;
            const publicUrl = `/uploads/profiles/${filename}`;

            // 1. Find User to clean up old image (optional but good practice)
            const user = await User.findById(userId).select('profileImage');
            if (!user) {
                fs.unlinkSync(req.file.path);
                return res.status(404).json({ message: 'User not found' });
            }

            // Delete old image if it exists and is not a default/external one
            if (user.profileImage && user.profileImage.includes('uploads/profiles')) {
                const oldFilename = user.profileImage.split('/').pop();
                const oldPath = path.join(__dirname, '../uploads/profiles', oldFilename);
                if (fs.existsSync(oldPath) && oldFilename !== filename) {
                    try {
                        fs.unlinkSync(oldPath);
                    } catch (err) {
                        console.error('Error deleting old profile image:', err);
                    }
                }
            }

            // 2. Atomic Update (Prevent overwriting Gamification/Reward locks)
            const updatedUser = await User.findByIdAndUpdate(
                userId,
                { profileImage: publicUrl },
                { new: true }
            );

            res.status(200).json({
                message: 'Profile image updated successfully',
                imageUrl: publicUrl
            });

        } catch (error) {
            console.error('Error uploading profile image:', error);
            res.status(500).json({
                message: 'Error processing image',
                error: error.message
            });
        }
    }
];
