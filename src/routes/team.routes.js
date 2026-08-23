const express = require('express');
const router = express.Router();
const { authMiddleware, softAuthMiddleware } = require('../middlewares/authmiddleware');
const {
  getTeams,
  getTeamDetails,
  createTeam,
  applyToTeam,
  getMyTeams,
  getTeamApplications,
  respondToApplication,
  updateTeamStatus
} = require('../controllers/team.controller');

// ── Public / Soft Auth Routes ────────────────────────────────────────────────
// Soft auth allows logged in users to get personalized eligibility statuses
router.get('/', softAuthMiddleware, getTeams);

// ── Authenticated User Team Routes ───────────────────────────────────────────
router.get('/user/my-teams', authMiddleware, getMyTeams);
router.get('/:id', softAuthMiddleware, getTeamDetails);
router.post('/', authMiddleware, createTeam);
router.post('/:id/apply', authMiddleware, applyToTeam);
router.get('/:id/applications', authMiddleware, getTeamApplications);
router.put('/:id/applications/:applicationId', authMiddleware, respondToApplication);
router.put('/:id/status', authMiddleware, updateTeamStatus);

module.exports = router;
