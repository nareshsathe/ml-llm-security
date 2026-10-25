const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.MONGO_URI || "mongodb://mongodb:27017/llm_security";
  try {
    await mongoose.connect(uri);
    console.log(`[db] Connected to MongoDB at ${uri}`);
  } catch (err) {
    console.error("[db] MongoDB connection failed:", err.message);
    console.error("[db] Retrying in 5s...");
    setTimeout(connectDB, 5000);
  }
}

module.exports = connectDB;
