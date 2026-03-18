const express = require('express');
const router = express.Router();
const Post = require('../models/Post.model');
const User = require('../models/User.model');

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

// Get all book swaps (placeholder)
router.get('/book-swaps', async (req, res) => {
  try {
    res.json([]);
  } catch (err) {
    res.status(500).json({ message: err.message });
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

module.exports = router;
