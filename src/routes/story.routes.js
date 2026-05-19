const express = require("express");
const router = express.Router();
const { authMiddleware } = require("../middlewares/authmiddleware");
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });

const { createStory, getStoryFeed, viewStory, deleteStory } = require("../controllers/story.controller");

router.post("/", authMiddleware, upload.single("image"), createStory);
router.get("/feed", authMiddleware, getStoryFeed);
router.post("/:id/view", authMiddleware, viewStory);
router.delete("/:id", authMiddleware, deleteStory);

module.exports = router;
