const express = require("express");
const { signToken } = require("../middleware/auth");

const router = express.Router();

// POST /api/auth/login
// Demo-only auth: no user database required to run the project out of the
// box. For a real deployment, replace this with a proper user store +
// bcrypt password check (bcryptjs is already in package.json for this).
router.post("/login", (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: "username required" });

  const token = signToken({ id: username, role: "admin" });
  res.json({ token, user: { id: username, role: "admin" } });
});

module.exports = router;
