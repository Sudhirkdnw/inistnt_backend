const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middlewares/authmiddleware');
const cacheMiddleware = require('../middlewares/cacheMiddleware');
const { getDashboardStats } = require('../controllers/dashboard.controller');

// GET /api/dashboard/stats — single endpoint for all home-screen stat cards
router.get('/stats', authMiddleware, cacheMiddleware(60), getDashboardStats);

module.exports = router;
