const express = require('express');
const { authMiddleware } = require('../middlewares/authmiddleware');
const cacheMiddleware = require('../middlewares/cacheMiddleware');
const router = express.Router();

const {
    createConfession, getFeed, getExplore, getConfession,
    deleteConfession, toggleLike, addComment, deleteComment,
    getComments, getReplies, toggleCommentLike,
    reportConfession, getUserConfessions, votePollOption
} = require("../controllers/confession.controller");

router.post('/', authMiddleware, createConfession);
router.get('/feed', authMiddleware, cacheMiddleware(30), getFeed);
router.get('/explore', authMiddleware, getExplore); // internal cache is used here
router.get('/user/:userId', authMiddleware, cacheMiddleware(60), getUserConfessions);
router.get('/:id', authMiddleware, cacheMiddleware(60), getConfession);
router.delete('/:id', authMiddleware, deleteConfession);
router.post('/:id/like', authMiddleware, toggleLike);
router.post('/:id/vote', authMiddleware, votePollOption);
router.get('/:id/comments', authMiddleware, getComments);
router.get('/comment/:commentId/replies', authMiddleware, getReplies);
router.post('/:id/comment', authMiddleware, addComment);
router.delete('/comment/:commentId', authMiddleware, deleteComment);
router.post('/comment/:commentId/like', authMiddleware, toggleCommentLike);
router.post('/:id/report', authMiddleware, reportConfession);

module.exports = router;
