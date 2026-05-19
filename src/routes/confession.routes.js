const express = require('express');
const { authMiddleware } = require('../middlewares/authmiddleware');
const router = express.Router();

const {
    createConfession, getFeed, getExplore, getConfession,
    deleteConfession, toggleLike, addComment, deleteComment,
    getComments, getReplies, toggleCommentLike,
    reportConfession, getUserConfessions
} = require("../controllers/confession.controller");

router.post('/', authMiddleware, createConfession);
router.get('/feed', authMiddleware, getFeed);
router.get('/explore', authMiddleware, getExplore);
router.get('/user/:userId', authMiddleware, getUserConfessions);
router.get('/:id', authMiddleware, getConfession);
router.delete('/:id', authMiddleware, deleteConfession);
router.post('/:id/like', authMiddleware, toggleLike);
router.get('/:id/comments', authMiddleware, getComments);
router.get('/comment/:commentId/replies', authMiddleware, getReplies);
router.post('/:id/comment', authMiddleware, addComment);
router.delete('/comment/:commentId', authMiddleware, deleteComment);
router.post('/comment/:commentId/like', authMiddleware, toggleCommentLike);
router.post('/:id/report', authMiddleware, reportConfession);

module.exports = router;
