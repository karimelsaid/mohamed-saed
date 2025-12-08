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
    if (file.mimetype === 'application/epub+zip' || path.extname(file.originalname).toLowerCase() === '.epub') {
        cb(null, true);
    } else {
        cb(new Error('يجب أن يكون الملف بصيغة EPUB فقط'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB max
});

// Middleware to verify authentication (you should have this already)
const verifyToken = require('../middleware/auth.middleware');

// Public routes
router.get('/', ebookController.getAllEbooks);
router.get('/:id/stream/public', ebookController.streamEbookPublic); // Must be before /:id to not be caught as ID
router.get('/:id', ebookController.getEbookById);

// Protected routes (require authentication)
router.get('/:ebookId/check-access', verifyToken, ebookController.checkAccess);
router.get('/:id/stream', verifyToken, ebookController.streamEbook);

// Admin routes (require admin role)
const verifyAdmin = require('../middleware/admin.middleware');
router.post('/', verifyToken, verifyAdmin, upload.single('epubFile'), ebookController.createEbook);
router.put('/:id', verifyToken, verifyAdmin, upload.single('epubFile'), ebookController.updateEbook);
router.delete('/:id', verifyToken, verifyAdmin, ebookController.deleteEbook);

module.exports = router;
