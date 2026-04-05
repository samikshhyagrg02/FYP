const express = require('express');
const { body, param, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const CommunityGroup = require('../models/CommunityGroup');
const CommunityPost = require('../models/CommunityPost');
const CommunityComment = require('../models/CommunityComment');
const GroupMembership = require('../models/GroupMembership');
const ContentReport = require('../models/ContentReport');

const router = express.Router();

// ============================================
// COMMUNITY GROUPS
// ============================================

// GET /api/community/groups - Get all active groups
router.get('/groups', async (req, res) => {
  try {
    const groups = await CommunityGroup.find({ isActive: true })
      .sort('name')
      .select('-createdBy');

    res.json({ groups });
  } catch (error) {
    console.error('Get groups error:', error);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

// POST /api/community/groups - Create a new group (authenticated users only)
router.post('/groups', [
  authenticateToken,
  body('name').trim().isLength({ min: 3, max: 100 }).withMessage('Name must be between 3 and 100 characters'),
  body('description').trim().isLength({ min: 10, max: 500 }).withMessage('Description must be between 10 and 500 characters'),
  body('topic').isIn(['anxiety', 'depression', 'stress', 'relationships', 'self-care', 'mindfulness', 'sleep', 'work-life-balance', 'general-support']).withMessage('Invalid topic'),
  body('icon').optional().trim(),
  body('color').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, topic, icon, color } = req.body;

    // Check if group name already exists
    const existingGroup = await CommunityGroup.findOne({ name: name.trim() });
    if (existingGroup) {
      return res.status(409).json({ error: 'A group with this name already exists' });
    }

    // Create new group
    const group = new CommunityGroup({
      name: name.trim(),
      description: description.trim(),
      topic,
      icon: icon || '💬',
      color: color || '#8BCF9B',
      createdBy: req.user._id,
      memberCount: 1,
      isActive: true
    });

    await group.save();

    // Automatically add creator as a member with creator role
    const membership = new GroupMembership({
      userId: req.user._id,
      groupId: group._id,
      role: 'creator'
    });
    await membership.save();

    res.status(201).json({ 
      message: 'Group created successfully',
      group 
    });
  } catch (error) {
    console.error('Create group error:', error);
    res.status(500).json({ error: 'Failed to create group' });
  }
});

// GET /api/community/groups/:id - Get specific group
router.get('/groups/:id', [
  param('id').isMongoId().withMessage('Invalid group ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const group = await CommunityGroup.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    res.json({ group });
  } catch (error) {
    console.error('Get group error:', error);
    res.status(500).json({ error: 'Failed to fetch group' });
  }
});

// POST /api/community/groups/:id/join - Join a group
router.post('/groups/:id/join', [
  authenticateToken,
  param('id').isMongoId().withMessage('Invalid group ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const group = await CommunityGroup.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if already a member
    const existingMembership = await GroupMembership.findOne({
      userId: req.user._id,
      groupId: req.params.id
    });

    if (existingMembership) {
      return res.status(400).json({ error: 'Already a member of this group' });
    }

    // Create membership
    const membership = new GroupMembership({
      userId: req.user._id,
      groupId: req.params.id
    });
    await membership.save();

    // Update member count
    await CommunityGroup.findByIdAndUpdate(req.params.id, {
      $inc: { memberCount: 1 }
    });

    res.status(201).json({
      message: 'Successfully joined group',
      membership
    });
  } catch (error) {
    console.error('Join group error:', error);
    res.status(500).json({ error: 'Failed to join group' });
  }
});

// POST /api/community/groups/:id/leave - Leave a group
router.post('/groups/:id/leave', [
  authenticateToken,
  param('id').isMongoId().withMessage('Invalid group ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const membership = await GroupMembership.findOneAndDelete({
      userId: req.user._id,
      groupId: req.params.id
    });

    if (!membership) {
      return res.status(404).json({ error: 'Not a member of this group' });
    }

    // Update member count
    await CommunityGroup.findByIdAndUpdate(req.params.id, {
      $inc: { memberCount: -1 }
    });

    res.json({ message: 'Successfully left group' });
  } catch (error) {
    console.error('Leave group error:', error);
    res.status(500).json({ error: 'Failed to leave group' });
  }
});

// GET /api/community/groups/:id/membership - Check membership status
router.get('/groups/:id/membership', [
  authenticateToken,
  param('id').isMongoId().withMessage('Invalid group ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const membership = await GroupMembership.findOne({
      userId: req.user._id,
      groupId: req.params.id
    });

    res.json({
      isMember: !!membership,
      membership: membership || null
    });
  } catch (error) {
    console.error('Check membership error:', error);
    res.status(500).json({ error: 'Failed to check membership' });
  }
});

// ============================================
// POSTS
// ============================================

// GET /api/community/groups/:id/posts - Get posts in a group
router.get('/groups/:id/posts', [
  param('id').isMongoId().withMessage('Invalid group ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { limit = 20, skip = 0 } = req.query;

    const posts = await CommunityPost.getPostsWithAuthor(
      { groupId: req.params.id, isHidden: false },
      { limit: parseInt(limit), skip: parseInt(skip) }
    );

    const total = await CommunityPost.countDocuments({
      groupId: req.params.id,
      isHidden: false
    });

    // Format posts to handle anonymous users
    const formattedPosts = posts.map(post => {
      const postObj = post.toObject();
      if (post.isAnonymous) {
        postObj.userId = { username: 'Anonymous', isAnonymous: true };
      }
      return postObj;
    });

    res.json({
      posts: formattedPosts,
      total,
      hasMore: total > parseInt(skip) + posts.length
    });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// POST /api/community/groups/:id/posts - Create a post
router.post('/groups/:id/posts', [
  authenticateToken,
  param('id').isMongoId().withMessage('Invalid group ID'),
  body('content')
    .trim()
    .isLength({ min: 1, max: 2000 })
    .withMessage('Content must be between 1 and 2000 characters'),
  body('isAnonymous')
    .optional()
    .isBoolean()
    .withMessage('isAnonymous must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Check if user is a member of the group
    const membership = await GroupMembership.findOne({
      userId: req.user._id,
      groupId: req.params.id
    });

    if (!membership) {
      return res.status(403).json({ error: 'Must be a member to post in this group' });
    }

    const { content, isAnonymous = false } = req.body;

    const post = new CommunityPost({
      groupId: req.params.id,
      userId: req.user._id,
      content,
      isAnonymous
    });

    await post.save();

    // Update post count
    await CommunityGroup.findByIdAndUpdate(req.params.id, {
      $inc: { postCount: 1 }
    });

    // Populate author info
    await post.populate('userId', 'username isAnonymous avatar');
    await post.populate('groupId', 'name icon color');

    // Format response
    const postObj = post.toObject();
    if (post.isAnonymous) {
      postObj.userId = { username: 'Anonymous', isAnonymous: true };
    }

    res.status(201).json({
      message: 'Post created successfully',
      post: postObj
    });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// DELETE /api/community/posts/:id - Delete a post
router.delete('/posts/:id', [
  authenticateToken,
  param('id').isMongoId().withMessage('Invalid post ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const post = await CommunityPost.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check if user owns the post
    if (post.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to delete this post' });
    }

    await CommunityPost.findByIdAndDelete(req.params.id);

    // Delete associated comments
    await CommunityComment.deleteMany({ postId: req.params.id });

    // Update post count
    await CommunityGroup.findByIdAndUpdate(post.groupId, {
      $inc: { postCount: -1 }
    });

    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// POST /api/community/posts/:id/like - Like/unlike a post
router.post('/posts/:id/like', [
  authenticateToken,
  param('id').isMongoId().withMessage('Invalid post ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const post = await CommunityPost.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const userId = req.user._id;
    const hasLiked = post.isLikedBy(userId);

    if (hasLiked) {
      // Unlike
      post.likes = post.likes.filter(id => id.toString() !== userId.toString());
      post.likeCount = Math.max(0, post.likeCount - 1);
    } else {
      // Like
      post.likes.push(userId);
      post.likeCount += 1;
    }

    await post.save();

    res.json({
      message: hasLiked ? 'Post unliked' : 'Post liked',
      liked: !hasLiked,
      likeCount: post.likeCount
    });
  } catch (error) {
    console.error('Like post error:', error);
    res.status(500).json({ error: 'Failed to like post' });
  }
});

// ============================================
// COMMENTS
// ============================================

// GET /api/community/posts/:id/comments - Get comments for a post
router.get('/posts/:id/comments', [
  param('id').isMongoId().withMessage('Invalid post ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const comments = await CommunityComment.find({
      postId: req.params.id,
      isHidden: false
    })
      .populate('userId', 'username isAnonymous avatar')

    // Format comments to handle anonymous users
    const formattedComments = comments.map(comment => {
      const commentObj = comment.toObject();
      if (comment.isAnonymous) {
        commentObj.userId = { username: 'Anonymous', isAnonymous: true };
      }
      return commentObj;
    });

    res.json({ comments: formattedComments });
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: 'Failed to fetch comments' });
  }
});

// POST /api/community/posts/:id/comments - Create a comment
router.post('/posts/:id/comments', [
  authenticateToken,
  param('id').isMongoId().withMessage('Invalid post ID'),
  body('content')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Content must be between 1 and 1000 characters'),
  body('isAnonymous')
    .optional()
    .isBoolean()
    .withMessage('isAnonymous must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const post = await CommunityPost.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const { content, isAnonymous = false } = req.body;

    const comment = new CommunityComment({
      postId: req.params.id,
      userId: req.user._id,
      content,
      isAnonymous
    });

    await comment.save();

    // Update comment count
    await CommunityPost.findByIdAndUpdate(req.params.id, {
      $inc: { commentCount: 1 }
    });

    // Populate author info
    await comment.populate('userId', 'username isAnonymous avatar');

    // Format response
    const commentObj = comment.toObject();
    if (comment.isAnonymous) {
      commentObj.userId = { username: 'Anonymous', isAnonymous: true };
    }

    res.status(201).json({
      message: 'Comment created successfully',
      comment: commentObj
    });
  } catch (error) {
    console.error('Create comment error:', error);
    res.status(500).json({ error: 'Failed to create comment' });
  }
});

// DELETE /api/community/comments/:id - Delete a comment
router.delete('/comments/:id', [
  authenticateToken,
  param('id').isMongoId().withMessage('Invalid comment ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const comment = await CommunityComment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Check if user owns the comment
    if (comment.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: 'Not authorized to delete this comment' });
    }

    await CommunityComment.findByIdAndDelete(req.params.id);

    // Update comment count
    await CommunityPost.findByIdAndUpdate(comment.postId, {
      $inc: { commentCount: -1 }
    });

    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ error: 'Failed to delete comment' });
  }
});

// POST /api/community/comments/:id/like - Like/unlike a comment
router.post('/comments/:id/like', [
  authenticateToken,
  param('id').isMongoId().withMessage('Invalid comment ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const comment = await CommunityComment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const userId = req.user._id;
    const hasLiked = comment.isLikedBy(userId);

    if (hasLiked) {
      // Unlike
      comment.likes = comment.likes.filter(id => id.toString() !== userId.toString());
      comment.likeCount = Math.max(0, comment.likeCount - 1);
    } else {
      // Like
      comment.likes.push(userId);
      comment.likeCount += 1;
    }

    await comment.save();

    res.json({
      message: hasLiked ? 'Comment unliked' : 'Comment liked',
      liked: !hasLiked,
      likeCount: comment.likeCount
    });
  } catch (error) {
    console.error('Like comment error:', error);
    res.status(500).json({ error: 'Failed to like comment' });
  }
});

// ============================================
// CONTENT REPORTING
// ============================================

// POST /api/community/report - Report content
router.post('/report', [
  authenticateToken,
  body('contentType')
    .isIn(['post', 'comment'])
    .withMessage('Content type must be post or comment'),
  body('contentId')
    .isMongoId()
    .withMessage('Invalid content ID'),
  body('reason')
    .isIn(['harassment', 'hate-speech', 'spam', 'misinformation', 'self-harm', 'inappropriate', 'other'])
    .withMessage('Invalid reason'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { contentType, contentId, reason, description } = req.body;

    // Check if content exists
    const Model = contentType === 'post' ? CommunityPost : CommunityComment;
    const content = await Model.findById(contentId);
    if (!content) {
      return res.status(404).json({ error: 'Content not found' });
    }

    // Create report
    const report = new ContentReport({
      reportedBy: req.user._id,
      contentType,
      contentId,
      reason,
      description
    });

    await report.save();

    // Update content report count
    await Model.findByIdAndUpdate(contentId, {
      isReported: true,
      $inc: { reportCount: 1 }
    });

    res.status(201).json({
      message: 'Content reported successfully. Our team will review it.',
      report: {
        id: report._id,
        status: report.status
      }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'You have already reported this content' });
    }
    console.error('Report content error:', error);
    res.status(500).json({ error: 'Failed to report content' });
  }
});

module.exports = router;
