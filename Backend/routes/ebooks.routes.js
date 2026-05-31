const express = require('express');
const router = express.Router();
const ebookController = require('../controllers/ebook.controller');
const multer = require('multer');
const path = require('path');

// Configure multer for EPUB file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/ebooks/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'ebook-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const isEpub = file.mimetype === 'application/epub+zip' || ext === '.epub';
    const isImage = ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype) || ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
    
    if (isEpub || isImage) {
        cb(null, true);
    } else {
        cb(new Error('يجب أن يكون الملف بصيغة EPUB أو صورة (JPG, PNG, WebP)'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB max
});

const ebookUploadFields = upload.fields([
    { name: 'epubFile', maxCount: 1 },
    { name: 'coverImage', maxCount: 1 }
]);

// Middleware to verify authentication (you should have this already)
const verifyToken = require('../middleware/auth.middleware');

// Public routes
router.get('/', ebookController.getAllEbooks);
router.get('/:id/stream/public', ebookController.streamEbookPublic); // Must be before /:id to not be caught as ID
router.get('/:id/stream', ebookController.streamEbook); // Allow guests to stream (Full file, restricted by client)
router.get('/:id', ebookController.getEbookById);

// Protected routes (require authentication)
router.get('/:ebookId/check-access', verifyToken, ebookController.checkAccess);
// router.get('/:id/stream', verifyToken, ebookController.streamEbook); // Moved to public

// Admin routes (require admin role)
const verifyAdmin = require('../middleware/admin.middleware');
router.post('/reindex-pages', verifyToken, verifyAdmin, ebookController.reindexPages);
router.post('/', verifyToken, verifyAdmin, ebookUploadFields, ebookController.createEbook);
router.put('/:id', verifyToken, verifyAdmin, ebookUploadFields, ebookController.updateEbook);
router.delete('/:id', verifyToken, verifyAdmin, ebookController.deleteEbook);

module.exports = router;
