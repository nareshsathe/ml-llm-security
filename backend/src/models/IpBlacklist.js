const mongoose = require("mongoose");

const IpBlacklistSchema = new mongoose.Schema({
  ip_address: { type: String, required: true, unique: true },
  reason: { type: String, default: "Repeated malicious prompts" },
  banned_at: { type: Date, default: Date.now },
  expires_at: { type: Date, required: true },
});

module.exports = mongoose.model("IpBlacklist", IpBlacklistSchema);
