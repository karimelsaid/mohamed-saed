const User = require('../models/User.model');
const Product = require('../models/Product.model');
const Order = require('../models/Order.model');
const GlobalPrize = require('../models/GlobalPrize.model');
const mongoose = require('mongoose');

// Generate a random short code for referral links
function generateShortCode(length = 6) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Helper to get base URL dynamically
const getBaseUrl = (req) => {
    let protocol = req.headers['x-forwarded-proto'] || req.protocol;
    let host = req.headers.host;
 
    if (host && host.includes('knoozbook.com')) {
        protocol = 'https';
    } else if (host && host.includes('localhost:3000')) {
        // Local development fix: redirect back to Angular port 4200
        host = host.replace('3000', '4200');
    }
 
    return `${protocol}://${host}`;
};

exports.getDashboardStats = async (req, res) => {
    try {
        const userId = req.user.id;
        console.log(`📊 [MARKETER_DASHBOARD] Fetching stats for user: ${userId}`);
        const user = await User.findById(userId);

        if (!user) {
            console.error(`❌ [MARKETER_DASHBOARD] User not found: ${userId}`);
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // Return application status even if not approved yet
        if (!user.marketer || (user.marketer.applicationStatus !== 'approved' && user.role !== 'admin' && user.role !== 'staff')) {
            return res.json({
                success: true,
                isApproved: false,
                applicationStatus: user.marketer?.applicationStatus || 'none',
                rejectionReason: user.marketer?.rejectionReason
            });
        }

        console.log(`👤 [MARKETER_DASHBOARD] Found user: ${user.email}, Role: ${user.role}, Balance: ${user.marketer?.balance}, Points: ${user.marketer?.points}`);

        // Get recent orders attributed to this marketer
        const users = await User.find({ 'orders.referredByMarketer': userId });
        let recentOrders = [];
        users.forEach(u => {
            u.orders.forEach(o => {
                if (o.referredByMarketer?.toString() === userId) {
                    recentOrders.push({
                        id: o._id,
                        customerName: u.username,
                        amount: o.totalAmount,
                        commission: o.marketerCommission,
                        status: o.status,
                        date: o.date
                    });
                }
            });
        });

        // Sort by date descending
        recentOrders.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Populate referral links with product names if they are books
        const Product = require('../models/Product.model');
        const baseUrl = getBaseUrl(req);
        const referralLinks = await Promise.all((user.marketer.referralLinks || []).map(async (link) => {
            let targetName = link.targetId;
            let targetImage = '';
            if (link.targetType === 'book') {
                const product = await Product.findOne({ 
                    $or: [
                        { barcode: link.targetId },
                        { products_id: link.targetId }
                    ]
                });
                if (product) {
                    targetName = product.product_name;
                    targetImage = product.image_path;
                }
            }
            return {
                ...link.toObject(),
                targetName,
                targetImage,
                fullUrl: `${baseUrl}/p/${link.shortCode}`
            };
        }));

        res.json({
            success: true,
            isApproved: true,
            stats: {
                balance: user.marketer.balance,
                totalEarnings: user.marketer.totalEarnings,
                ordersCount: user.marketer.ordersCount,
                clicksCount: user.marketer.clicksCount,
                level: user.marketer.level,
                levelLabel: user.marketer.levelLabel,
                points: user.marketer.points || 0,
                commissionRate: user.marketer.commissionRate
            },
            recentOrders: recentOrders.slice(0, 5),
            referralLinks: referralLinks.reverse(), // Newest first
            tasks: await Promise.all((user.marketer.tasks || []).map(async (t) => {
                let targetName = '';
                let targetImage = '';
                if (t.targetId && t.targetType === 'book') {
                    const product = await Product.findOne({ barcode: t.targetId });
                    if (product) {
                        targetName = product.product_name;
                        targetImage = product.image_path;
                    }
                }
                return { ...t.toObject(), targetName, targetImage };
            })),
            prizes: [
                ...(await GlobalPrize.find({ active: true })),
                ...(user.marketer.prizes || [])
            ]
        });
    } catch (error) {
        console.error('Error fetching marketer dashboard:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getMarketingOpportunities = async (req, res) => {
    try {
        const userId = req.user.id;
        const User = require('../models/User.model');
        const Product = require('../models/Product.model');
        const user = await User.findById(userId);

        if (!user || !user.marketer) {
            return res.status(404).json({ success: false, message: 'Marketer not found' });
        }

        // 1. Get Trending Products (High discount or low stock - scarcity)
        const trendingProducts = await Product.find({ 
            product_quantity: { $gt: 0 },
            $or: [
                { product_discount_percent: { $gt: 15 } },
                { product_quantity: { $lt: 10 } }
            ]
        })
        .sort({ product_discount_percent: -1 })
        .limit(6);

        // 2. Define Marketing Quests (Dynamic if empty)
        let quests = user.marketer.tasks || [];
        if (quests.length === 0) {
            quests = [
                { 
                    id: 'quest_1',
                    title: 'الإنطلاقة الأولى', 
                    description: 'قم بإنشاء 3 روابط ترويجية لمنتجات مختلفة', 
                    target: 3, 
                    current: user.marketer.referralLinks?.length || 0,
                    reward: 50,
                    status: (user.marketer.referralLinks?.length >= 3) ? 'completed' : 'active'
                },
                { 
                    id: 'quest_2',
                    title: 'بطل المبيعات', 
                    description: 'حقق أول عملية بيع ناجحة لك', 
                    target: 1, 
                    current: user.marketer.ordersCount || 0,
                    reward: 100,
                    status: (user.marketer.ordersCount >= 1) ? 'completed' : 'active'
                },
                { 
                    id: 'quest_3',
                    title: 'ناشر السعادة', 
                    description: 'احصل على 50 نقرة على روابطك', 
                    target: 50, 
                    current: user.marketer.clicksCount || 0,
                    reward: 200,
                    status: (user.marketer.clicksCount >= 50) ? 'completed' : 'active'
                }
            ];
            user.marketer.tasks = quests;
            await user.save();
        }

        // 3. Marketer Stats Summary
        const stats = {
            totalClicks: user.marketer.clicksCount || 0,
            totalOrders: user.marketer.ordersCount || 0,
            conversionRate: user.marketer.clicksCount ? ((user.marketer.ordersCount / user.marketer.clicksCount) * 100).toFixed(1) : 0,
            earnings: user.marketer.totalEarnings || 0
        };

        res.json({
            success: true,
            trendingProducts: trendingProducts.map(p => ({
                id: p.products_id,
                barcode: p.barcode,
                name: p.product_name,
                price: p.product_price,
                discount: p.product_discount_percent,
                image: p.image_path || p.product_image,
                stock: p.product_quantity,
                alreadyHasLink: user.marketer.referralLinks?.some(link => link.targetId === p.barcode)
            })),
            quests: await Promise.all((quests || []).map(async (t) => {
                let targetName = '';
                let targetImage = '';
                if (t.targetId && t.targetType === 'book') {
                    const product = await Product.findOne({ barcode: t.targetId });
                    if (product) {
                        targetName = product.product_name;
                        targetImage = product.image_path;
                    }
                }
                // If it's a mongoose doc use toObject, otherwise it's a plain object from the dynamic list
                const tObj = (typeof t.toObject === 'function') ? t.toObject() : t;
                return { ...tObj, targetName, targetImage };
            })),
            stats: stats
        });
    } catch (error) {
        console.error('Error fetching marketing opportunities:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.submitApplication = async (req, res) => {
    console.log('📝 [MARKETER_APPLY] Request hit controller!');
    console.log('📝 [MARKETER_APPLY] Request received from user:', req.user?.id);
    console.log('📝 [MARKETER_APPLY] Body received:', JSON.stringify(req.body));
    try {
        const bio = req.body.bio;
        console.log('📝 [MARKETER_APPLY] Bio received:', bio);
        
        if (!req.user || !req.user.id) {
             console.error('❌ [MARKETER_APPLY] req.user is missing or incomplete');
             return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            console.error('❌ [MARKETER_APPLY] User not found in DB:', req.user.id);
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        console.log('📝 [MARKETER_APPLY] Current Status:', user.marketer?.applicationStatus);

        if (user.marketer?.applicationStatus === 'approved') {
            console.warn('⚠️ [MARKETER_APPLY] User already approved:', user.email);
            return res.status(400).json({ success: false, message: 'Already an approved marketer' });
        }

        // Initialize marketer object if it doesn't exist
        if (!user.marketer) {
            user.marketer = {};
        }

        user.marketer.applicationStatus = 'pending';
        user.marketer.bio = bio || '';
        user.marketer.applicationDate = new Date();
        
        console.log('📝 [MARKETER_APPLY] Saving user...');
        await user.save();
        console.log('✅ [MARKETER_APPLY] Application saved for:', user.email);
        res.json({ success: true, message: 'Application submitted successfully' });
    } catch (error) {
        console.error('🔥 [MARKETER_APPLY] ERROR:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error submitting application', 
            error: error.message,
            stack: error.stack 
        });
    }
};

exports.getPendingApplications = async (req, res) => {
    console.log('🔍 [ADMIN_MARKETER] Fetching pending applications... Requested by:', req.user?.email);
    try {
        const applications = await User.find(
            { 'marketer.applicationStatus': 'pending' }, 
            'username email marketer.bio marketer.applicationDate'
        );
        console.log(`✅ [ADMIN_MARKETER] Found ${applications.length} pending applications.`);
        if (applications.length > 0) {
            console.log('📝 [ADMIN_MARKETER] First application email:', applications[0].email);
        }
        res.json({ success: true, applications });
    } catch (error) {
        console.error('🔥 [ADMIN_MARKETER] Error fetching applications:', error);
        res.status(500).json({ success: false, message: 'Error fetching applications' });
    }
};

exports.processApplication = async (req, res) => {
    try {
        const { userId, status, rejectionReason } = req.body; // status: 'approved' or 'rejected'
        console.log(`⚖️ [ADMIN_MARKETER] Processing application for ${userId} -> Status: ${status}`);
        
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        user.marketer.applicationStatus = status;
        if (status === 'approved') {
            user.marketer.isMarketer = true;
            user.role = 'marketer';
            // Force add marketing permission if not present
            if (!user.permissions) user.permissions = [];
            if (!user.permissions.includes('marketing')) {
                user.permissions.push('marketing');
            }
            console.log(`✅ [ADMIN_MARKETER] User ${user.email} is now an APPROVED marketer.`);
        } else {
            user.marketer.rejectionReason = rejectionReason;
            console.log(`❌ [ADMIN_MARKETER] User ${user.email} application was REJECTED.`);
        }

        await user.save();
        res.json({ success: true, message: `Application ${status}` });
    } catch (error) {
        console.error('🔥 [ADMIN_MARKETER] Error processing application:', error);
        res.status(500).json({ success: false, message: 'Error processing application' });
    }
};

exports.searchProducts = async (req, res) => {
    try {
        const { query } = req.query;
        const products = await Product.find({
            $or: [
                { product_name: { $regex: query, $options: 'i' } },
                { barcode: query }
            ]
        }).limit(10).select('product_name barcode images product_price image_path');
        
        res.json({ success: true, products });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error searching products' });
    }
};

exports.generateLink = async (req, res) => {
    try {
        const { targetId, targetType } = req.body;
        const userId = req.user.id;

        const shortCode = generateShortCode();
        const user = await User.findById(userId);

        user.marketer.referralLinks.push({
            targetId,
            targetType,
            shortCode,
            clicks: 0
        });

        await user.save();

        const baseUrl = getBaseUrl(req);
        res.json({
            success: true,
            link: `${baseUrl}/p/${shortCode}`,
            shortCode
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error generating link' });
    }
};

exports.getEarningsHistory = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        res.json({ success: true, balance: user.marketer.balance, total: user.marketer.totalEarnings });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching history' });
    }
};

exports.claimPrize = async (req, res) => {
    try {
        const { prizeId } = req.params;
        const user = await User.findById(req.user.id);

        const prize = user.marketer.prizes.id(prizeId);
        if (!prize || prize.claimed) {
            return res.status(400).json({ success: false, message: 'Prize not found or already claimed' });
        }

        prize.claimed = true;
        if (prize.type === 'cash') {
            user.marketer.balance += parseFloat(prize.value);
        }

        await user.save();
        res.json({ success: true, message: 'Prize claimed successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error claiming prize' });
    }
};

exports.redirectShortLink = async (req, res) => {
    const { shortCode } = req.params;
    const origin = req.headers.origin || 'N/A';
    console.log(`🚀 [MARKETER_REDIRECT] >>> START >>> Code: [${shortCode}] | Origin: ${origin}`);
    try {
        // Find user who has this link
        console.log(`🔍 [MARKETER_REDIRECT] Searching DB for shortCode: ${shortCode}...`);
        const user = await User.findOne({ 'marketer.referralLinks.shortCode': shortCode });
        
        if (!user) {
            console.error(`❌ [MARKETER_REDIRECT] FAILED: No user found for code: ${shortCode}`);
            return res.status(404).redirect('/Home?error=invalid_link');
        }

        console.log(`✅ [MARKETER_REDIRECT] Found User: ${user.username} (${user._id})`);

        const linkData = user.marketer.referralLinks.find(l => l.shortCode === shortCode);
        if (!linkData) {
            console.error(`❌ [MARKETER_REDIRECT] CRITICAL: User found but linkData missing for code: ${shortCode}`);
            return res.status(404).redirect('/Home?error=broken_link');
        }
        
        console.log(`🔗 [MARKETER_REDIRECT] Link Target: ${linkData.targetType} -> ${linkData.targetId}`);

        // Update click counts
        linkData.clicks = (linkData.clicks || 0) + 1;
        user.marketer.clicksCount = (user.marketer.clicksCount || 0) + 1;
        
        await user.save();

        // Construct redirect URL
        let redirectUrl = '/Home';
        const refParam = `ref=${user._id}`;

        if (linkData) {
            if (linkData.targetType === 'book') {
                // Try to get name for better SEO/routing
                const product = await Product.findOne({ barcode: linkData.targetId });
                const nameSlug = product ? encodeURIComponent(product.product_name.replace(/\s+/g, '-')) : 'book';
                redirectUrl = `/book/${linkData.targetId}/${nameSlug}`;
            } else if (linkData.targetType === 'category') {
                redirectUrl = `/category/${linkData.targetId}`;
            }
        }

        // Add ref parameter
        redirectUrl += (redirectUrl.includes('?') ? '&' : '?') + refParam;

        console.log(`✅ [REDIRECT_FINAL] Redirecting to: ${redirectUrl}`);
        
        let finalUrl;
        const host = req.headers.host;
        if (host && host.includes('localhost:3000')) {
            // RELATIVE redirect is better for proxy scenarios to keep the session/cookies safe
            finalUrl = redirectUrl;
        } else {
            finalUrl = getBaseUrl(req) + redirectUrl;
        }
        
        console.log(`✅ [REDIRECT_RESULT] Final URL: ${finalUrl}`);
 
        // If user wants to see the debug alert/page
        if (req.query.debug === 'true') {
            return res.send(`
                <div style="direction: ltr; padding: 20px; font-family: sans-serif; background: #1a1a1a; color: #00ff00; border: 2px solid #333; border-radius: 8px;">
                    <h2>🔍 Marketer Redirect Debug</h2>
                    <p><strong>Code:</strong> ${shortCode}</p>
                    <p><strong>Target URL:</strong> ${redirectUrl}</p>
                    <p><strong>Final URL:</strong> ${finalUrl}</p>
                    <p><strong>Marketer ID:</strong> ${user._id}</p>
                    <p><strong>Base URL Used:</strong> ${getBaseUrl(req)}</p>
                    <hr style="border-color: #333;">
                    <button onclick="window.location.href='${finalUrl}'" style="padding: 10px 20px; background: #00ff00; color: #000; border: none; border-radius: 4px; cursor: pointer;">
                        Proceed to Redirect
                    </button>
                </div>
            `);
        }

        res.redirect(finalUrl);
    } catch (error) {
        console.error('Redirect error:', error);
        res.status(500).redirect(getBaseUrl(req) + '/Home');
    }
};
