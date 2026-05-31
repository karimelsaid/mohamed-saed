const Ebook = require('../models/Ebook.model');
const Subscription = require('../models/Subscription.model');
const UserLibrary = require('../models/UserLibrary.model');
const fs = require('fs');
const path = require('path');
const epubService = require('../services/epub.service');
const sharp = require('sharp');

// Helper to normalize Arabic text for consistent searching (Same as main books engine)
function normalizeArabic(text) {
    if (!text) return '';
    return String(text)
        .replace(/[أإآا]/g, 'ا')
        .replace(/[ةه]/g, 'ه')
        .replace(/[يى]/g, 'ي')
        .replace(/[ؤ]/g, 'و')
        .replace(/[ئ]/g, 'ي')
        .replace(/[\u064B-\u065F]/g, '') // Remove Harakat (diacritics)
        .toLowerCase()
        .trim();
}

// Get all ebooks with filters and pagination
exports.getAllEbooks = async (req, res) => {
    try {
        const { category, language, search, status, page = 1, limit = 20, includeInvalid } = req.query;

        // Parse pagination params
        const pageNum = parseInt(page) || 1;
        const limitNum = parseInt(limit) || 20;
        const skip = (pageNum - 1) * limitNum;

        let query = {};
        if (status) query.status = status;

        if (category) {
            query.category = category;
        }

        if (language) {
            query.language = language;
        }

        if (search && search.trim()) {
            const keywords = normalizeArabic(search).split(/\s+/).filter(k => k.length > 0);
            
            // Build complex search query using keywords and normalization fallback
            // Note: Mongoose doesn't support custom normalization in $regex easily without plugins,
            // so we use a flexible regex for each keyword that covers common Arabic variations.
            const keywordQueries = keywords.map(kw => {
                const flexKw = kw
                    .replace(/[اأإآ]/g, '[اأإآ]')
                    .replace(/[هة]/g, '[هة]')
                    .replace(/[يىئ]/g, '[يىئ]')
                    .replace(/[وؤ]/g, '[وؤ]');
                
                const regex = new RegExp(flexKw, 'i');
                return {
                    $or: [
                        { title: regex },
                        { author: regex },
                        { description: regex },
                        { publisher: regex },
                        { relatedProductId: regex }
                    ]
                };
            });

            query.$and = keywordQueries;
        }

        // Get total count for pagination metadata
        const total = await Ebook.countDocuments(query);

        const ebooks = await Ebook.find(query)
            .sort({ createdAt: -1, _id: -1 })
            .skip(skip)
            .limit(limitNum)
            .select('-__v');

        let resultEbooks = ebooks;

        // Filter out ebooks whose files have been deleted ONLY if includeInvalid is NOT true
        // Relaxed Check: We bypass strict local filesystem check to ensure all books registered in MongoDB
        // remain visible in the catalog, preventing path discrepancies or sync delays from hiding books.
        if (includeInvalid !== 'true') {
            resultEbooks = ebooks;
        }

        res.json({
            success: true,
            count: resultEbooks.length,
            total,
            page: pageNum,
            pages: Math.ceil(total / limitNum),
            data: resultEbooks
        });

    } catch (error) {
        console.error('Error fetching ebooks:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب الكتب الإلكترونية',
            error: error.message
        });
    }
};

// Get single ebook by ID
exports.getEbookById = async (req, res) => {
    try {
        const { id } = req.params;

        const ebook = await Ebook.findById(id);

        if (!ebook) {
            return res.status(404).json({
                success: false,
                message: 'الكتاب الإلكتروني غير موجود'
            });
        }

        // Increment view count
        ebook.viewCount += 1;
        await ebook.save();

        res.json({
            success: true,
            data: ebook
        });
    } catch (error) {
        console.error('Error fetching ebook:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في جلب الكتاب الإلكتروني',
            error: error.message
        });
    }
};

// Check if user has access to ebook
exports.checkAccess = async (req, res) => {
    try {
        const { ebookId } = req.params;
        const userId = req.user._id;

        // Check if user has active subscription
        const activeSubscription = await Subscription.findActiveSubscription(userId);

        if (activeSubscription) {
            return res.json({
                success: true,
                hasAccess: true,
                accessType: 'subscription'
            });
        }

        // Check if user owns the ebook
        const ownsEbook = await UserLibrary.userOwnsEbook(userId, ebookId);

        if (ownsEbook) {
            return res.json({
                success: true,
                hasAccess: true,
                accessType: 'owned'
            });
        }

        res.json({
            success: true,
            hasAccess: false
        });
    } catch (error) {
        console.error('Error checking access:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في التحقق من الصلاحية',
            error: error.message
        });
    }
};

// Stream ebook file (secure endpoint)
exports.streamEbook = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user ? req.user._id : null;

        // Get ebook
        const ebook = await Ebook.findById(id);

        if (!ebook) {
            return res.status(404).json({
                success: false,
                message: 'الكتاب الإلكتروني غير موجود'
            });
        }


        // Check access - user must have subscription or own the ebook
        // const activeSubscription = userId ? await Subscription.findActiveSubscription(userId) : null;
        // const ownsEbook = userId ? await UserLibrary.userOwnsEbook(userId, id) : false;

        // Relaxed Access: Allow download for everyone (Client-side 20% limit enforcement)
        // if (!activeSubscription && !ownsEbook) {
        // Check if mini version exists for preview
        // if (ebook.miniEpubFilePath && fs.existsSync(path.join(__dirname, '..', ebook.miniEpubFilePath))) {
        // Allow access to mini version
        // } else {
        // return res.status(403).json({
        //     success: false,
        //     message: 'ليس لديك صلاحية للوصول إلى هذا الكتاب. يرجى الاشتراك أو شراء الكتاب.'
        // });
        // }
        // }

        // Determine which file to serve
        let filePath;

        // Normalize path logic from getAllEbooks
        let normalizedPath = ebook.epubFilePath;
        if (normalizedPath && normalizedPath.includes('uploads/ebooks/uploads/ebooks/')) {
            normalizedPath = normalizedPath.replace('uploads/ebooks/uploads/ebooks/', 'uploads/ebooks/');
        }

        // Try multiple possible paths to find the file
        const possiblePaths = [
            path.join(__dirname, '..', normalizedPath), // Standard: Backend/uploads/...
            path.join(__dirname, '..', '..', normalizedPath), // Root/uploads/... (if path relative to project root)
            normalizedPath // Absolute path
        ];

        // Find first existing path
        filePath = possiblePaths.find(p => fs.existsSync(p));

        console.log('--- Stream Debug ---');
        console.log('Book ID:', id);
        console.log('DB Path:', ebook.epubFilePath);
        console.log('Normalized:', normalizedPath);
        console.log('Resolved Path:', filePath);

        // Check if file exists
        if (!filePath) {
            console.error('❌ File not found in any candidate path');
            return res.status(404).json({
                success: false,
                message: 'ملف الكتاب غير موجود'
            });
        }

        // Increment download count
        ebook.downloadCount += 1;
        await ebook.save();

        // Set headers
        res.setHeader('Content-Type', 'application/epub+zip');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(ebook.title)}.epub"`);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');

        // Stream file
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

        fileStream.on('error', (error) => {
            console.error('Error streaming file:', error);
            res.status(500).json({
                success: false,
                message: 'خطأ في تحميل الكتاب'
            });
        });
    } catch (error) {
        console.error('Error streaming ebook:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في تحميل الكتاب',
            error: error.message
        });
    }
};

// Stream mini ebook for public preview (no auth required)
exports.streamEbookPublic = async (req, res) => {
    try {
        const { id } = req.params;

        const ebook = await Ebook.findById(id);
        if (!ebook) {
            return res.status(404).json({
                success: false,
                message: 'المنتج غير موجود'
            });
        }

        // Must have mini version
        if (!ebook.miniEpubFilePath) {
            return res.status(404).json({
                success: false,
                message: 'نسخة المعاينة غير متوفرة'
            });
        }

        // Normalize path and check existence
        let miniPath = ebook.miniEpubFilePath;
        if (miniPath.startsWith('uploads/ebooks/uploads/ebooks/')) {
            miniPath = miniPath.replace('uploads/ebooks/uploads/ebooks/', 'uploads/ebooks/');
        }

        const filePath = path.join(__dirname, '..', miniPath);

        if (!fs.existsSync(filePath)) {
            console.error('❌ Mini file not found:', filePath);
            return res.status(404).json({
                success: false,
                message: 'ملف المعاينة غير موجود'
            });
        }

        // Determine filename
        const filename = `preview_${ebook.title}.epub`;

        // Set headers
        res.setHeader('Content-Type', 'application/epub+zip');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(filename)}"`);
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma', 'no-cache');

        // Stream file
        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);

        fileStream.on('error', (error) => {
            console.error('Error streaming preview file:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    message: 'خطأ في تحميل نسخة المعاينة'
                });
            }
        });
    } catch (error) {
        console.error('Error streaming public ebook:', error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: 'خطأ في تحميل الكتاب',
                error: error.message
            });
        }
    }
};

// Import epub service


// Admin: Create new ebook
exports.createEbook = async (req, res) => {
    try {
        const ebookData = req.body;

        // 1. Create initial record (validate basic fields first)
        const ebook = await Ebook.create(ebookData);

        // 2. Handle EPUB upload
        if (req.files && req.files['epubFile']) {
            const file = req.files['epubFile'][0];
            const oldPath = file.path;
            const fileExt = path.extname(file.originalname);
            const sanitizedTitle = ebook.title.replace(/[^a-zA-Z0-9]/g, '_');
            const newFileName = `${sanitizedTitle}_${ebook._id}${fileExt}`;
            const newPath = path.join('uploads', 'ebooks', newFileName);

            const ebooksDir = path.join(__dirname, '..', 'uploads', 'ebooks');
            if (!fs.existsSync(ebooksDir)) fs.mkdirSync(ebooksDir, { recursive: true });

            fs.renameSync(oldPath, path.join(__dirname, '..', newPath));
            ebook.epubFilePath = newPath;
            ebook.fileSize = file.size;

            const metadata = await epubService.extractMetadata(path.join(__dirname, '..', newPath));
            if (metadata) {
                if (!ebook.author || ebook.author === 'Unknown') ebook.author = metadata.author;
                if (!ebook.publisher && metadata.publisher) ebook.publisher = metadata.publisher;
                if ((!ebook.pages || ebook.pages === 0) && metadata.pages) ebook.pages = metadata.pages;
                if (!ebook.description && metadata.description) ebook.description = metadata.description;
            }
        }

        // 3. Handle Cover Image upload
        if (req.files && req.files['coverImage']) {
            const file = req.files['coverImage'][0];
            const sanitizedTitle = ebook.title.replace(/[^a-zA-Z0-9]/g, '_');
            const newFileName = `cover_${sanitizedTitle}_${ebook._id}.webp`;
            const relativePath = path.join('uploads', 'ebooks', newFileName);
            const fullPath = path.join(__dirname, '..', relativePath);

            await sharp(file.path)
                .resize({ width: 600 })
                .webp({ quality: 80 })
                .toFile(fullPath);

            // Delete original temporary file
            if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
            
            ebook.coverImage = '/' + relativePath;
        }

        await ebook.save();

        res.status(201).json({
            success: true,
            message: 'تم إضافة الكتاب الإلكتروني بنجاح',
            data: ebook
        });

        // Update ebook-mappings.json if product link exists
        if (ebook.relatedProductId) {
            const barcode = String(ebook.relatedProductId).trim();
            const mappingPath = path.join(__dirname, '..', 'ebook-mappings.json');
            let mappings = {};
            if (fs.existsSync(mappingPath)) {
                try { mappings = JSON.parse(fs.readFileSync(mappingPath, 'utf8')); } catch (e) { }
            }
            mappings[barcode] = ebook._id.toString();
            fs.writeFileSync(mappingPath, JSON.stringify(mappings, null, 2));
            console.log(`✅ [Internal] Updated mapping for ${barcode} -> ${ebook._id}`);
        }
    } catch (error) {
        console.error('Error creating ebook:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في إضافة الكتاب الإلكتروني',
            error: error.message
        });
    }
};

// Admin: Update ebook
exports.updateEbook = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        let ebook = await Ebook.findById(id);
        if (!ebook) {
            return res.status(404).json({
                success: false,
                message: 'الكتاب الإلكتروني غير موجود'
            });
        }

        // Handle EPUB upload if new file provided
        if (req.files && req.files['epubFile']) {
            const file = req.files['epubFile'][0];
            // Delete old file
            if (ebook.epubFilePath && fs.existsSync(path.join(__dirname, '..', ebook.epubFilePath))) {
                fs.unlinkSync(path.join(__dirname, '..', ebook.epubFilePath));
            }

            const fileExt = path.extname(file.originalname);
            const sanitizedTitle = (updateData.title || ebook.title).replace(/[^a-zA-Z0-9]/g, '_');
            const newFileName = `${sanitizedTitle}_${ebook._id}${fileExt}`;
            const newPath = path.join('uploads', 'ebooks', newFileName);

            const ebooksDir = path.join(__dirname, '..', 'uploads', 'ebooks');
            if (!fs.existsSync(ebooksDir)) fs.mkdirSync(ebooksDir, { recursive: true });

            fs.renameSync(file.path, path.join(__dirname, '..', newPath));
            updateData.epubFilePath = newPath;
            updateData.fileSize = file.size;

            const metadata = await epubService.extractMetadata(path.join(__dirname, '..', newPath));
            if (metadata) {
                if (!updateData.author && (!ebook.author || ebook.author === 'Unknown')) updateData.author = metadata.author;
                if (!updateData.publisher && !ebook.publisher && metadata.publisher) updateData.publisher = metadata.publisher;
                if ((!updateData.pages || updateData.pages == 0) && metadata.pages) updateData.pages = metadata.pages;
                if (!updateData.description && !ebook.description && metadata.description) updateData.description = metadata.description;
            }
        }

        // Handle Cover Image upload
        if (req.files && req.files['coverImage']) {
            const file = req.files['coverImage'][0];
            // Delete old cover if local
            if (ebook.coverImage && ebook.coverImage.startsWith('/uploads')) {
                const oldCoverPath = path.join(__dirname, '..', ebook.coverImage.substring(1));
                if (fs.existsSync(oldCoverPath)) fs.unlinkSync(oldCoverPath);
            }

            const sanitizedTitle = (updateData.title || ebook.title).replace(/[^a-zA-Z0-9]/g, '_');
            const newFileName = `cover_${sanitizedTitle}_${ebook._id}.webp`;
            const relativePath = path.join('uploads', 'ebooks', newFileName);
            const fullPath = path.join(__dirname, '..', relativePath);

            await sharp(file.path)
                .resize({ width: 600 })
                .webp({ quality: 80 })
                .toFile(fullPath);

            if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
            updateData.coverImage = '/' + relativePath;
        }

        // Handle logic for cover image update if it's passed as a filepath string (e.g. from a separate upload handler)
        // Note: The frontend likely uploads cover separately or as part of form data?
        // Assuming updateData.coverImage contains the NEW path, we might want to delete the old one?
        // However, without a dedicated cover upload middleware here, we assume standard behavior.
        // If the implementation changes to handle cover uploads in this controller, we'd add deletion logic here.

        ebook = await Ebook.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );

        res.json({
            success: true,
            message: 'تم تحديث الكتاب الإلكتروني بنجاح',
            data: ebook
        });

        // Update ebook-mappings.json if product link changed or exists
        if (ebook.relatedProductId) {
            const barcode = String(ebook.relatedProductId).trim();
            const mappingPath = path.join(__dirname, '..', 'ebook-mappings.json');
            let mappings = {};
            if (fs.existsSync(mappingPath)) {
                try { mappings = JSON.parse(fs.readFileSync(mappingPath, 'utf8')); } catch (e) { }
            }
            // Check if this ebook was linked to another barcode before and remove it? 
            // For now, just ensure the current barcode maps to this ebook.
            mappings[barcode] = ebook._id.toString();
            fs.writeFileSync(mappingPath, JSON.stringify(mappings, null, 2));
        }
    } catch (error) {
        console.error('Error updating ebook:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في تحديث الكتاب الإلكتروني',
            error: error.message
        });
    }
};

// Admin: Delete ebook
exports.deleteEbook = async (req, res) => {
    try {
        const { id } = req.params;

        const ebook = await Ebook.findById(id);

        if (!ebook) {
            return res.status(404).json({
                success: false,
                message: 'الكتاب الإلكتروني غير موجود'
            });
        }

        // 1. Delete EPUB file from filesystem
        if (ebook.epubFilePath) {
            const filePath = path.join(__dirname, '..', ebook.epubFilePath);
            if (fs.existsSync(filePath)) {
                try { fs.unlinkSync(filePath); } catch (e) { console.error('Error deleting epub file:', e); }
            }
        }
        // 2. Delete Mini Version (for legacy books)
        if (ebook.miniEpubFilePath) {
            const miniFilePath = path.join(__dirname, '..', ebook.miniEpubFilePath);
            if (fs.existsSync(miniFilePath)) {
                try { fs.unlinkSync(miniFilePath); } catch (e) { console.error('Error deleting mini epub file:', e); }
            }
        }

        // 3. Delete Cover Image (if it's a local file)
        // Check if coverImage string looks like a local path (e.g. "uploads/...")
        if (ebook.coverImage && (ebook.coverImage.startsWith('uploads') || ebook.coverImage.startsWith('/uploads'))) {
            // Remove leading slash if present
            const relativePath = ebook.coverImage.startsWith('/') ? ebook.coverImage.substring(1) : ebook.coverImage;
            const coverPath = path.join(__dirname, '..', relativePath);
            if (fs.existsSync(coverPath)) {
                try { fs.unlinkSync(coverPath); } catch (e) { console.error('Error deleting cover image:', e); }
            }
        }

        // 4. Delete Database Record
        await Ebook.findByIdAndDelete(id);

        // 5. Cascade Delete: UserLibrary Entries
        const UserLibraryResult = await UserLibrary.deleteMany({ ebookId: id });
        console.log(`Deleted ${UserLibraryResult.deletedCount} user library references.`);

        // 6. Cascade Delete: ReadingProgress Entries
        const ReadingProgress = require('../models/ReadingProgress.model'); // Import needed here
        const progressResult = await ReadingProgress.deleteMany({ ebookId: id });
        console.log(`Deleted ${progressResult.deletedCount} reading progress records.`);

        // 7. Update any product linked to this ebook
        const Product = require('../models/Product.model');
        await Product.updateMany(
            { linkedEbookId: id },
            {
                $unset: { linkedEbookId: 1, epubFilePath: 1, miniEpubFilePath: 1 },
                $set: { productType: 'physical', digitalDelivery: false }
            }
        );

        res.json({
            success: true,
            message: 'تم حذف الكتاب الإلكتروني وجميع بياناته بنجاح'
        });
    } catch (error) {
        console.error('Error deleting ebook:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في حذف الكتاب الإلكتروني',
            error: error.message
        });
    }
};

/**
 * Re-index page counts for all ebooks that have pages=0 or missing.
 * Admin-only endpoint. Scans each EPUB file and extracts the real page count.
 */
exports.reindexPages = async (req, res) => {
    try {
        // Find all ebooks with no pages or pages=0
        const ebooks = await Ebook.find({
            $or: [
                { pages: { $exists: false } },
                { pages: null },
                { pages: 0 }
            ],
            epubFilePath: { $exists: true, $ne: null }
        });

        console.log(`📖 [REINDEX] Found ${ebooks.length} ebooks with missing page counts`);

        let updated = 0;
        let failed = 0;
        const results = [];

        for (const ebook of ebooks) {
            try {
                const fullPath = path.join(__dirname, '..', ebook.epubFilePath);
                
                if (!fs.existsSync(fullPath)) {
                    results.push({ id: ebook._id, title: ebook.title, status: 'file_missing' });
                    failed++;
                    continue;
                }

                const metadata = await epubService.extractMetadata(fullPath);
                if (metadata && metadata.pages > 0) {
                    ebook.pages = metadata.pages;
                    await ebook.save();
                    results.push({ id: ebook._id, title: ebook.title, status: 'updated', pages: metadata.pages });
                    updated++;
                    console.log(`  ✅ ${ebook.title}: ${metadata.pages} pages`);
                } else {
                    results.push({ id: ebook._id, title: ebook.title, status: 'no_pages_found' });
                    failed++;
                }
            } catch (err) {
                results.push({ id: ebook._id, title: ebook.title, status: 'error', error: err.message });
                failed++;
                console.error(`  ❌ ${ebook.title}: ${err.message}`);
            }
        }

        res.json({
            success: true,
            message: `تم تحديث ${updated} كتاب، فشل ${failed} كتاب من أصل ${ebooks.length}`,
            total: ebooks.length,
            updated,
            failed,
            results
        });
    } catch (error) {
        console.error('Error reindexing pages:', error);
        res.status(500).json({
            success: false,
            message: 'خطأ في إعادة فهرسة الصفحات',
            error: error.message
        });
    }
};
