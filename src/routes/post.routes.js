const express = require('express');
const { authMiddleware } = require('../middlewares/authmiddleware');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

const {
    createPost, getFeed, getExplore, getPost,
    updatePost, deletePost, toggleLike, addComment, deleteComment, getUserPosts
} = require("../controllers/post.controller");

router.post('/', authMiddleware, upload.single("image"), createPost);
router.get('/feed', authMiddleware, getFeed);
router.get('/explore', authMiddleware, getExplore);
router.get('/user/:userId', authMiddleware, getUserPosts);
router.get('/:id', authMiddleware, getPost);
router.put('/:id', authMiddleware, updatePost);
router.delete('/:id', authMiddleware, deletePost);
router.post('/:id/like', authMiddleware, toggleLike);
router.post('/:id/comment', authMiddleware, addComment);
router.delete('/:id/comment/:commentId', authMiddleware, deleteComment);

module.exports = router;