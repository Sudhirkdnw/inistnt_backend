const express = require('express');
const router = express.Router();
const collegeController = require('../controllers/college.controller');

router.get('/search', collegeController.searchColleges);

module.exports = router;
