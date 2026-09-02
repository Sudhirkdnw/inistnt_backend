const express = require('express');
const router = express.Router();
const careerCtrl = require('../controllers/career.controller');
const { softAuthMiddleware } = require('../middlewares/authmiddleware');

// Public endpoints
router.get('/', careerCtrl.getPublicJobs);
router.get('/:id', careerCtrl.getPublicJobById);
router.post('/:id/apply', softAuthMiddleware, careerCtrl.applyForJob);

module.exports = router;
