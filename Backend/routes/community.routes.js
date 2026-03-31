const express = require('express');
const router = express.Router();
const Post = require('../models/Post.model');
const User = require('../models/User.model');
const BookSwap = require('../models/BookSwap.model');
const Auction = require('../models/Auction.model');
const FreeShippingRule = require('../models/FreeShippingRule.model');

// Helper to enrich posts with up-to-date user info
const enrichPost = async (post, adminIds = []) => {
    // If adminIds not provided, fetch them
    if (adminIds.length === 0) {
        const admins = await User.find({ role: 'admin' }).select('_id');
        adminIds = admins.map(a => a._id.toString());
    }

    const postObj = post.toObject ? post.toObject() : post;
    const user = await User.findById(postObj.userId).select('role profileImage full_name username');
    
    // Enrich comments
    const enrichedComments = await Promise.all((postObj.comments || []).map(async (comment) => {
        const commentUser = await User.findById(comment.userId).select('role profileImage full_name username');
        
        // Enrich replies
        const enrichedReplies = await Promise.all((comment.replies || []).map(async (reply) => {
            const replyUser = await User.findById(reply.userId).select('role profileImage full_name username');
            return {
                ...reply,
                userName: replyUser ? (replyUser.full_name || replyUser.username) : reply.userName,
                userAvatar: replyUser ? replyUser.profileImage : reply.userAvatar,
                userRole: replyUser ? replyUser.role : 'user'
            };
        }));

        return {
            ...comment,
            userName: commentUser ? (commentUser.full_name || commentUser.username) : comment.userName,
            userAvatar: commentUser ? commentUser.profileImage : comment.userAvatar,
            userRole: commentUser ? commentUser.role : 'user',
            replies: enrichedReplies
        };
    }));

    return {
        ...postObj,
        userName: user ? (user.full_name || user.username) : postObj.userName,
        userAvatar: user ? user.profileImage : postObj.userAvatar,
        userRole: user ? user.role : (adminIds.includes(postObj.userId) ? 'admin' : (postObj.userRole || 'user')),
        comments: enrichedComments
    };
};

const enrichSwap = async (swap) => {
    const swapObj = swap.toObject ? swap.toObject() : swap;
    const user = await User.findById(swapObj.userId).select('full_name username profileImage');
    const enrichedRequests = await Promise.all((swapObj.requests || []).map(async (req) => {
        const reqUser = await User.findById(req.requesterId).select('full_name username profileImage');
        return {
            ...req,
            requesterName: reqUser ? (reqUser.full_name || reqUser.username) : 'قارئ',
            requesterAvatar: reqUser ? reqUser.profileImage : null
        };
    }));

    return {
        ...swapObj,
        ownerName: user ? (user.full_name || user.username) : 'قارئ',
        ownerAvatar: user ? user.profileImage : null,
        requests: enrichedRequests
    };
};

const enrichAuction = async (auction) => {
    const auctionObj = auction.toObject ? auction.toObject() : auction;
    const user = await User.findById(auctionObj.userId).select('full_name username profileImage');
    const enrichedBids = await Promise.all((auctionObj.bids || []).map(async (bid) => {
        const bidUser = await User.findById(bid.userId).select('full_name username profileImage');
        return {
            ...bid,
            userName: bidUser ? (bidUser.full_name || bidUser.username) : bid.userName,
            userAvatar: bidUser ? bidUser.profileImage : null
        };
    }));

    return {
        ...auctionObj,
        userName: user ? (user.full_name || user.username) : 'بائع',
        userAvatar: user ? user.profileImage : null,
        bids: enrichedBids
    };
};

// Admin Helpers
const enrichSwapData = async (swap) => {
    const s = await BookSwap.findById(swap._id)
        .populate('userId', 'username full_name phone email governorate city village')
        .populate('requests.requesterId', 'username full_name phone email governorate city village');
    
    const acceptedRequest = s.requests.find(r => r.status === 'accepted');
    
    return {
        _id: s._id,
        bookTitle: s.bookTitle,
        userName: s.userId?.full_name || s.userId?.username || 'N/A',
        userPhone: s.userId?.phone || 'N/A',
        userEmail: s.userId?.email || 'N/A',
        location: s.location,
        status: s.status,
        shippingStatus: s.shippingStatus || 'pending',
        ownerName: (s.userId?.full_name || s.userId?.username || 'N/A'),
        ownerPhone: s.userId?.phone || 'N/A',
        ownerEmail: s.userId?.email || 'N/A',
        ownerAddress: [
            s.userId?.governorate,
            s.userId?.city,
            s.userId?.village
        ].filter(Boolean).join(' - ') || 'غير محدد',
        acceptedRequester: acceptedRequest ? {
            name: (acceptedRequest.requesterId?.full_name || acceptedRequest.requesterId?.username || 'N/A'),
            phone: acceptedRequest.requesterId?.phone || 'N/A',
            email: acceptedRequest.requesterId?.email || 'N/A',
            address: [
                acceptedRequest.requesterId?.governorate,
                acceptedRequest.requesterId?.city,
                acceptedRequest.requesterId?.village
            ].filter(Boolean).join(' - ') || 'غير محدد',
            offeredBook: acceptedRequest.offeredBookTitle,
            offeredBookCondition: acceptedRequest.offeredBookCondition,
            offeredBookNotes: acceptedRequest.offeredBookNotes,
            offeredBookImage: acceptedRequest.offeredBookImage
        } : null
    };
};

const enrichAuctionData = async (auction) => {
    const a = await Auction.findById(auction._id)
        .populate('userId', 'username full_name phone email governorate city village')
        .populate('highestBidder', 'username full_name phone email governorate city village');

    return {
        _id: a._id,
        bookTitle: a.bookTitle,
        userName: a.userId?.full_name || a.userId?.username || 'N/A',
        userPhone: a.userId?.phone || 'N/A',
        userEmail: a.userId?.email || 'N/A',
        userAddress: [
            a.userId?.governorate,
            a.userId?.city,
            a.userId?.village
        ].filter(Boolean).join(' - ') || 'غير محدد',
        currentPrice: a.currentPrice,
        bidsCount: a.bids.length,
        status: a.status,
        highestBidder: a.highestBidder ? {
            name: a.highestBidder.full_name || a.highestBidder.username || 'N/A',
            phone: a.highestBidder.phone || 'N/A',
            email: a.highestBidder.email || 'N/A',
            address: [
                a.highestBidder.governorate,
                a.highestBidder.city,
                a.highestBidder.village
            ].filter(Boolean).join(' - ') || 'غير محدد'
        } : null
    };
};

// Get community feed
router.get('/feed', async (req, res) => {
  try {
    const posts = await Post.find().sort({ isPinned: -1, createdAt: -1 }).limit(100).lean();
    
    const admins = await User.find({ role: 'admin' }).select('_id');
    const adminIds = admins.map(a => a._id.toString());
    
    const enrichedPosts = await Promise.all(posts.map(post => enrichPost(post, adminIds)));
    
    res.json(enrichedPosts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create new post
router.post('/posts', async (req, res) => {
  try {
    const { userId, content, type, bookTitle, rating } = req.body;
    
    // Validate userId
    if (!userId || !userId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: 'Invalid User ID format' });
    }

    // Find user to get their name
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const newPost = new Post({
      userId,
      userName: user.full_name || user.username || 'قارئ مجهول',
      userAvatar: user.profileImage, // Store user avatar
      userRole: user.role || 'user',
      content,
      type,
      bookTitle,
      rating
    });

    const savedPost = await newPost.save();
    const enrichedPost = await enrichPost(savedPost);
    res.status(201).json(enrichedPost);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Like/Unlike post
router.post('/posts/:id/like', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const { userId } = req.body;
    const index = post.likes.indexOf(userId);

    if (index === -1) {
      post.likes.push(userId);
    } else {
      post.likes.splice(index, 1);
    }

    await post.save();
    const enrichedPost = await enrichPost(post);
    res.json(enrichedPost);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Add comment
router.post('/posts/:id/comments', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const { userId, userName, content } = req.body;
    post.comments.push({ userId, userName, content, replies: [] });
    
    await post.save();
    const enrichedPost = await enrichPost(post);
    res.json(enrichedPost);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Add reply to a comment
router.post('/posts/:postId/comments/:commentId/replies', async (req, res) => {
  try {
    const post = await Post.findById(req.params.postId);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const comment = post.comments.id(req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    const { userId, userName, content } = req.body;
    comment.replies.push({ userId, userName, content });

    await post.save();
    const enrichedPost = await enrichPost(post);
    res.json(enrichedPost);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Get user specific posts
router.get('/user-posts/:userId', async (req, res) => {
  try {
    const posts = await Post.find({ userId: req.params.userId }).sort({ isPinned: -1, createdAt: -1 }).lean();
    const enrichedPosts = await Promise.all(posts.map(post => enrichPost(post)));
    res.json(enrichedPosts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get all book swaps
router.get('/book-swaps', async (req, res) => {
  try {
    const swaps = await BookSwap.find().sort({ createdAt: -1 }).lean();
    const enrichedSwaps = await Promise.all(swaps.map(swap => enrichSwap(swap)));
    res.json(enrichedSwaps);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create new book swap
router.post('/book-swaps', async (req, res) => {
  try {
    const { userId, bookTitle, author, condition, description, notes, lookingFor, location, images } = req.body;
    const newSwap = new BookSwap({
      userId,
      bookTitle,
      author,
      condition,
      description,
      notes,
      lookingFor,
      location,
      images: images || []
    });
    const savedSwap = await newSwap.save();
    const enriched = await enrichSwap(savedSwap);
    res.status(201).json(enriched);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Send swap request
router.post('/book-swaps/:id/request', async (req, res) => {
    try {
        const { requesterId, offeredBookTitle, offeredBookCondition, offeredBookNotes, offeredBookImage } = req.body;
        const swap = await BookSwap.findById(req.params.id);
        if (!swap) return res.status(404).json({ message: 'العرض غير موجود' });

        const user = await User.findById(requesterId);
        if (!user) return res.status(404).json({ message: 'المستخدم غير موجود' });

        // Check if user already requested
        const existingRequest = swap.requests.find(r => r.requesterId.toString() === requesterId);
        if (existingRequest) return res.status(400).json({ message: 'لقد أرسلت طلباً بالفعل لهذا العرض' });

        swap.requests.push({
            requesterId,
            offeredBookTitle,
            offeredBookCondition,
            offeredBookNotes,
            offeredBookImage,
            status: 'pending'
        });

        await swap.save();
        res.json({ message: 'تم إرسال طلب التبديل بنجاح', success: true });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// --- Auctions ---

// Get active auctions
router.get('/auctions', async (req, res) => {
  try {
    const auctions = await Auction.find().sort({ endTime: 1 }).lean();
    const enrichedAuctions = await Promise.all(auctions.map(a => enrichAuction(a)));
    res.json(enrichedAuctions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Create new auction
router.post('/auctions', async (req, res) => {
  try {
    const { userId, bookTitle, author, description, condition, startingPrice, durationHours, images } = req.body;
    
    const endTime = new Date();
    endTime.setHours(endTime.getHours() + (durationHours || 24));

    const newAuction = new Auction({
      userId,
      bookTitle,
      author,
      description,
      condition,
      startingPrice,
      currentPrice: startingPrice,
      endTime,
      images: images || []
    });

    const savedAuction = await newAuction.save();
    const enriched = await enrichAuction(savedAuction);
    res.status(201).json(enriched);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Place a bid
router.post('/auctions/:id/bid', async (req, res) => {
  try {
    const { userId, amount } = req.body;
    const auction = await Auction.findById(req.params.id);
    
    if (!auction) return res.status(404).json({ message: 'Auction not found' });
    if (auction.status !== 'active' || new Date() > auction.endTime) {
      return res.status(400).json({ message: 'هذا المزاد انتهى' });
    }
    
    if (amount <= auction.currentPrice) {
      return res.status(400).json({ message: 'يجب أن يكون العرض أعلى من السعر الحالي' });
    }

    if (auction.userId.toString() === userId) {
      return res.status(400).json({ message: 'لا يمكنك المزايدة على كتابك الخاص' });
    }

    const user = await User.findById(userId).select('full_name username');
    
    auction.currentPrice = amount;
    auction.highestBidder = userId;
    auction.bids.push({
      userId,
      userName: user ? (user.full_name || user.username) : 'قارئ',
      amount,
      timestamp: new Date()
    });

    await auction.save();
    const enriched = await enrichAuction(auction);
    res.json(enriched);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Get public profile
router.get('/users/profile/:id', async (req, res) => {
  try {
    const { viewerId } = req.query;
    const user = await User.findById(req.params.id)
      .select('username full_name profileImage coverPhoto bio followers following role');
    
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isFollowing = viewerId ? user.followers.includes(viewerId) : false;

    res.json({
      id: user._id,
      username: user.full_name || user.username,
      profileImage: user.profileImage,
      role: user.role,
      bio: user.bio,
      followersCount: user.followers.length,
      followingCount: user.following.length,
      isFollowing
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get user social stats
router.get('/users/:userId/social', async (req, res) => {
  try {
    const { viewerId } = req.query;
    const user = await User.findById(req.params.userId).select('following followers');
    if (!user) return res.status(404).json({ message: 'User not found' });
    
    const isFollowing = viewerId ? user.followers.includes(viewerId) : false;
    
    res.json({
      likesReceived: 0, // Placeholder for now
      followingCount: user.following?.length || 0,
      followersCount: user.followers?.length || 0,
      isFollowing
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Follow user
router.post('/users/:id/follow', async (req, res) => {
  try {
    const { followerId } = req.body; // Who is following
    const targetId = req.params.id; // Who is being followed

    if (followerId === targetId) return res.status(400).json({ message: 'Cannot follow yourself' });

    const [follower, target] = await Promise.all([
      User.findById(followerId),
      User.findById(targetId)
    ]);

    if (!follower || !target) return res.status(404).json({ message: 'User not found' });

    if (!follower.following.includes(targetId)) {
      follower.following.push(targetId);
      target.followers.push(followerId);
      await Promise.all([follower.save(), target.save()]);
    }

    res.json({ message: 'Followed successfully' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Unfollow user
router.post('/users/:id/unfollow', async (req, res) => {
  try {
    const { followerId } = req.body;
    const targetId = req.params.id;

    const [follower, target] = await Promise.all([
      User.findById(followerId),
      User.findById(targetId)
    ]);

    if (!follower || !target) return res.status(404).json({ message: 'User not found' });

    follower.following = follower.following.filter(id => id.toString() !== targetId);
    target.followers = target.followers.filter(id => id.toString() !== followerId);

    await Promise.all([follower.save(), target.save()]);
    res.json({ message: 'Unfollowed successfully' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Community Search
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ posts: [], users: [] });

    const searchRegex = new RegExp(q, 'i');

    const [posts, users] = await Promise.all([
      Post.find({ 
        $or: [
          { content: searchRegex },
          { bookTitle: searchRegex },
          { userName: searchRegex }
        ]
      }).sort({ createdAt: -1 }).limit(20).lean(),
      User.find({
        $or: [
          { username: searchRegex },
          { full_name: searchRegex }
        ]
      }).select('username full_name profileImage role').limit(10).lean()
    ]);

    // Fix userRole and avatars for posts in search
    const enrichedSearchResults = await Promise.all(posts.map(post => enrichPost(post)));

    res.json({ posts: enrichedSearchResults, users });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Delete post
router.delete('/posts/:id', async (req, res) => {
  try {
    const { userId } = req.body;
    const post = await Post.findById(req.params.id);
    
    if (!post) return res.status(404).json({ message: 'Post not found' });
    if (post.userId.toString() !== userId) return res.status(403).json({ message: 'Unauthorized to delete this post' });

    await Post.findByIdAndDelete(req.params.id);
    res.json({ message: 'Post deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Pin post
router.post('/posts/:id/pin', async (req, res) => {
  try {
    const { userId, type } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const isAdmin = user.role === 'admin';
    const isOwner = post.userId.toString() === userId;

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ message: 'Unauthorized to pin this post' });
    }

    if (type === 'community' && !isAdmin) {
      return res.status(403).json({ message: 'Only admins can pin posts to community' });
    }

    // If pinning to community, unpin other community posts (optional, or keep multiple)
    // For now, let's allow multiple but usually only 1-3 are pinned at once.
    
    post.isPinned = true;
    post.pinType = type || 'personal';
    await post.save();
    
    res.json(post);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Unpin post
router.post('/posts/:id/unpin', async (req, res) => {
  try {
    const { userId } = req.body;
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const user = await User.findById(userId);
    const isAdmin = user?.role === 'admin';
    const isOwner = post.userId.toString() === userId;

    if (!isAdmin && !isOwner) {
      return res.status(403).json({ message: 'Unauthorized to unpin this post' });
    }

    post.isPinned = false;
    post.pinType = null;
    await post.save();
    
    res.json(post);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Accept a swap request
router.post('/book-swaps/:id/accept/:requestId', async (req, res) => {
    try {
        const swap = await BookSwap.findById(req.params.id);
        if (!swap) return res.status(404).json({ message: 'العرض غير موجود' });

        // Update swap status
        swap.status = 'swapped';
        
        // Update requests status
        swap.requests.forEach(request => {
            if (request._id.toString() === req.params.requestId) {
                request.status = 'accepted';
            } else if (request.status === 'pending') {
                request.status = 'rejected';
            }
        });

        await swap.save();

        // Create orders for both parties to track shipping
        try {
            const acceptedReq = swap.requests.find(r => r._id.toString() === req.params.requestId);
            if (acceptedReq) {
                const owner = await User.findById(swap.userId);
                const requester = await User.findById(acceptedReq.requesterId);

                if (owner && requester) {
                    // Fetch community shipping cost from settings
                    let swapShippingCost = 70;
                    try {
                        const shippingRules = await FreeShippingRule.findOne().sort({ createdAt: -1 }).exec();
                        if (shippingRules) {
                            swapShippingCost = shippingRules.swapShippingCost !== undefined ? shippingRules.swapShippingCost : (shippingRules.communityShippingCost || 70);
                        }
                    } catch (e) { /* use default */ }

                    // Construct address string robustly
                    const constructAddress = (u) => {
                        const parts = [];
                        if (u.governorate) parts.push(u.governorate);
                        if (u.city) parts.push(u.city);
                        if (u.village) parts.push(u.village);
                        
                        let addr = parts.length > 0 ? parts.join(', ') : '';
                        
                        // If no profile address, check post office
                        if (!addr && u.postOffice && u.postOffice.governorate) {
                            addr = `مكتب بريد: ${u.postOffice.governorate}, ${u.postOffice.city}, ${u.postOffice.name || ''}`;
                        }
                        
                        // Fallback if still empty
                        if (!addr) addr = 'العنوان غير محدد في الملف الشخصي';
                        
                        if (u.phone) addr += ` - هاتف: ${u.phone}`;
                        return addr;
                    };

                    const constructShippingAddress = (u) => ({
                        governorate: u.governorate || u.postOffice?.governorate || '',
                        city: u.city || u.postOffice?.city || '',
                        village: u.village || '',
                        phone: u.phone || '',
                        deliveryType: u.postOffice?.governorate ? 'postOffice' : 'delivery',
                        name: u.postOffice?.name || '',
                        address: u.postOffice?.address || ''
                    });

                    // 1. Order for Owner
                    owner.orders.push({
                        date: new Date(),
                        products: [{
                            bookId: swap._id.toString(),
                            bookName: `[تبادل] ${swap.bookTitle} مقابل ${acceptedReq.offeredBookTitle}`,
                            quantity: 1,
                            price: 0
                        }],
                        shippingCost: swapShippingCost,
                        totalAmount: swapShippingCost,
                        subTotal: 0,
                        paymentStatus: 'pending',
                        status: 'قيد الإنتظار',
                        isCommunityItem: true,
                        communityItemId: swap._id.toString(),
                        communityOwnerId: requester._id.toString(),
                        communityOwnerName: requester.username || requester.email,
                        communityOwnerPhone: requester.phone || '',
                        communityOwnerAddress: constructAddress(requester),
                        paymentMethod: 'online',
                        address: constructAddress(owner),
                        shippingAddress: constructShippingAddress(owner)
                    });
                    
                    owner.notifications.push({
                        message: `تم قبول طلب التبادل لكتابك: ${swap.bookTitle}. يرجى دفع مصاريف الشحن (${swapShippingCost} ج.م) لبدء عملية التنسيق.`,
                        type: 'order',
                        createdAt: new Date(),
                        relatedId: swap._id.toString()
                    });
                    await owner.save({ validateBeforeSave: false });

                    // 2. Order for Requester
                    requester.orders.push({
                        date: new Date(),
                        products: [{
                            bookId: swap._id.toString(),
                            bookName: `[تبادل] ${acceptedReq.offeredBookTitle} مقابل ${swap.bookTitle}`,
                            quantity: 1,
                            price: 0
                        }],
                        shippingCost: swapShippingCost,
                        totalAmount: swapShippingCost,
                        subTotal: 0,
                        paymentStatus: 'pending',
                        status: 'قيد الإنتظار',
                        isCommunityItem: true,
                        communityItemId: swap._id.toString(),
                        communityOwnerId: owner._id.toString(),
                        communityOwnerName: owner.username || owner.email,
                        communityOwnerPhone: owner.phone || '',
                        communityOwnerAddress: constructAddress(owner),
                        paymentMethod: 'online',
                        address: constructAddress(requester),
                        shippingAddress: constructShippingAddress(requester)
                    });
                    
                    requester.notifications.push({
                        message: `مبروك! تم قبول طلب التبادل لكتاب ${acceptedReq.offeredBookTitle}. يرجى دفع مصاريف الشحن (${swapShippingCost} ج.م) لبدء عملية التنسيق.`,
                        type: 'order',
                        createdAt: new Date(),
                        relatedId: swap._id.toString()
                    });
                    await requester.save({ validateBeforeSave: false });
                }
            }
        } catch (orderErr) {
            console.error('Error creating orders for swap:', orderErr);
        }

        res.json({ message: 'تم قبول الطلب بنجاح وتم إخطار الطرف الآخر', swap });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Reject a swap request (Removes it from the list)
router.post('/book-swaps/:id/reject/:requestId', async (req, res) => {
    try {
        const swap = await BookSwap.findById(req.params.id);
        if (!swap) return res.status(404).json({ message: 'العرض غير موجود' });

        // Filter out the request
        swap.requests = swap.requests.filter(r => r._id.toString() !== req.params.requestId);
        
        await swap.save();
        res.json({ message: 'تم رفض وحذف طلب التبادل بنجاح', success: true });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Delete a swap listing
router.delete('/book-swaps/:id', async (req, res) => {
    try {
        const { userId } = req.body;
        const swap = await BookSwap.findById(req.params.id);
        if (!swap) return res.status(404).json({ message: 'العرض غير موجود' });

        // Check ownership or admin
        const user = await User.findById(userId);
        if (swap.userId.toString() !== userId && user?.role !== 'admin') {
            return res.status(403).json({ message: 'غير مصرح لك بحذف هذا العرض' });
        }

        await BookSwap.findByIdAndDelete(req.params.id);
        res.json({ message: 'تم حذف العرض بنجاح' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Delete an auction listing
router.delete('/auctions/:id', async (req, res) => {
    try {
        const { userId } = req.body;
        const auction = await Auction.findById(req.params.id);
        if (!auction) return res.status(404).json({ message: 'المزاد غير موجود' });

        const user = await User.findById(userId);
        if (auction.userId.toString() !== userId && user?.role !== 'admin') {
            return res.status(403).json({ message: 'غير مصرح لك بحذف هذا المزاد' });
        }

        await Auction.findByIdAndDelete(req.params.id);
        res.json({ message: 'تم حذف المزاد بنجاح' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Finalize auction
router.post('/auctions/:id/finalize', async (req, res) => {
    try {
        const auction = await Auction.findById(req.params.id);
        if (!auction) return res.status(404).json({ message: 'المزاد غير موجود' });

        auction.status = 'ended';
        await auction.save();

        // Create order for the winner if exists
        if (auction.highestBidder) {
            const winnerId = auction.highestBidder;
            const winner = await User.findById(winnerId);
            const owner = await User.findById(auction.userId); // Get auction owner

            if (winner) {
                // Fetch community shipping cost from settings
                let auctionShippingCost = 70;
                try {
                    const shippingRules = await FreeShippingRule.findOne().sort({ createdAt: -1 }).exec();
                    if (shippingRules) {
                        auctionShippingCost = shippingRules.auctionShippingCost !== undefined ? shippingRules.auctionShippingCost : (shippingRules.communityShippingCost || 70);
                    }
                } catch (e) { /* use default */ }

                const totalWithShipping = auction.currentPrice + auctionShippingCost;
                // Construct address string robustly
                const constructAddress = (u) => {
                    const parts = [];
                    if (u.governorate) parts.push(u.governorate);
                    if (u.city) parts.push(u.city);
                    if (u.village) parts.push(u.village);
                    
                    let addr = parts.length > 0 ? parts.join(', ') : '';
                    
                    if (!addr && u.postOffice && u.postOffice.governorate) {
                        addr = `مكتب بريد: ${u.postOffice.governorate}, ${u.postOffice.city}, ${u.postOffice.name || ''}`;
                    }
                    
                    if (!addr) addr = 'العنوان غير محدد في الملف الشخصي';
                    
                    if (u.phone) addr += ` - هاتف: ${u.phone}`;
                    return addr;
                };

                const constructShippingAddress = (u) => ({
                    governorate: u.governorate || u.postOffice?.governorate || '',
                    city: u.city || u.postOffice?.city || '',
                    village: u.village || '',
                    phone: u.phone || '',
                    deliveryType: u.postOffice?.governorate ? 'postOffice' : 'delivery',
                    name: u.postOffice?.name || '',
                    address: u.postOffice?.address || ''
                });

                const newOrder = {
                    date: new Date(),
                    products: [{
                        bookId: auction._id.toString(),
                        bookName: `[مزاد] ${auction.bookTitle}`,
                        quantity: 1,
                        price: auction.currentPrice
                    }],
                    shippingCost: auctionShippingCost,
                    totalAmount: totalWithShipping,
                    subTotal: auction.currentPrice,
                    paymentStatus: 'pending',
                    status: 'قيد الإنتظار',
                    isCommunityItem: true,
                    communityItemId: auction._id.toString(),
                    communityOwnerId: owner._id.toString(),
                    communityOwnerName: owner.username || owner.email,
                    communityOwnerPhone: owner.phone || '',
                    communityOwnerAddress: constructAddress(owner),
                    paymentMethod: 'online',
                    address: constructAddress(winner),
                    shippingAddress: constructShippingAddress(winner)
                };
                winner.orders.push(newOrder);
                
                // Add notification for winner
                winner.notifications.push({
                    message: `مبروك! لقد فزت في مزاد: ${auction.bookTitle}. يرجى إتمام الدفع لبدء إجراءات الشحن.`,
                    type: 'order',
                    createdAt: new Date(),
                    relatedId: auction._id.toString()
                });
                
                await winner.save({ validateBeforeSave: false });
            }
        }
        
        res.json({ message: 'تم إنهاء المزاد بنجاح', auction });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Admin stats and management
router.get('/admin/stats', async (req, res) => {
    try {
        const swaps = await BookSwap.find().sort({ createdAt: -1 });
        const auctions = await Auction.find().sort({ createdAt: -1 });
        
        const stats = {
            swaps: await Promise.all(swaps.map(enrichSwapData)),
            auctions: await Promise.all(auctions.map(enrichAuctionData))
        };

        res.json({
            success: true,
            stats
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update community item status (Admin)
router.post('/community/update-status', async (req, res) => {
    try {
        const { id, type, field, value } = req.body; // type: 'swap' or 'auction', field: 'shippingStatus' or 'paymentStatus'
        let item;
        if (type === 'swap') {
            item = await BookSwap.findByIdAndUpdate(id, { [field]: value }, { new: true });
        } else {
            item = await Auction.findByIdAndUpdate(id, { [field]: value }, { new: true });
        }
        if (!item) return res.status(404).json({ message: 'العنصر غير موجود' });

        // Sync with User Order if it's a community item
        try {
            // Find the user who has this community item in their orders
            const user = await User.findOne({ 'orders.communityItemId': id });
            if (user) {
                const order = user.orders.find(o => o.communityItemId === id);
                if (order) {
                    if (field === 'paymentStatus') {
                        // Map community payment status to order payment status
                        order.paymentStatus = (value === 'paid') ? 'completed' : 'pending';
                    } else if (field === 'shippingStatus') {
                        // Map community shipping status to order status
                        // Order status mapping: 'قيد الإنتظار', 'تم الإلغاء', 'تم الشحن', 'تم الاستلام', 'تم التسليم'
                        if (value === 'completed') order.status = 'تم التسليم';
                        else if (value === 'delivering_to_winner' || value === 'delivering_to_both') order.status = 'تم الشحن';
                        else if (value === 'received_by_admin') order.status = 'تم الاستلام';
                        else order.status = 'قيد الإنتظار';
                    }
                    await user.save({ validateBeforeSave: false });
                }
            }
        } catch (syncErr) {
            console.error('Error syncing community status to order:', syncErr);
        }

        res.json({ message: 'تم تحديث الحالة بنجاح', success: true });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
