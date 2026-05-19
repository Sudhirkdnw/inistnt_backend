const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middlewares/authmiddleware");

const { getAICaption, getAIHashtags, getAIBio, improveAIBio } = require("../controllers/ai.controller");

router.post("/caption", authMiddleware, getAICaption);
router.post("/hashtags", authMiddleware, getAIHashtags);
router.post("/bio/generate", authMiddleware, getAIBio);
router.post("/bio/improve", authMiddleware, improveAIBio);

module.exports = router;
