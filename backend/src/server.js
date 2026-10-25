require("dotenv").config();

const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const mongoose = require("mongoose");

const connectDB = require("./config/db");
const { optionalAuth } = require("./middleware/auth");
const { fixedWindowLimiter, banGuard } = require("./middleware/rateLimiter");
const { checkHealth } = require("./services/mlService");

const authRoutes = require("./routes/auth");
const checkPromptRoutes = require("./routes/checkPrompt");
const checkMultimodalRoutes = require("./routes/checkMultimodal");
const dashboardRoutes = require("./routes/dashboard");

// Safety net: log and keep running instead of crashing the whole process.
// This is what should have caught the Mongo-timeout crash — every route
// handler is also now individually wrapped (see asyncHandler.js / the
// try/catch in checkPrompt.js), but this exists as a last line of defense
// for anything still missed.
process.on("unhandledRejection", (reason) => {
  console.error("[server] Unhandled promise rejection (server kept running):", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[server] Uncaught exception (server kept running):", err);
});

const app = express();
const PORT = process.env.PORT || 5000;

app.set("trust proxy", 1); // needed for correct req.ip behind Docker/Nginx
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));
app.use(optionalAuth);

connectDB();

app.get("/api/health", async (req, res) => {
  const mlHealth = await checkHealth();
  const mongoStates = ["disconnected", "connected", "connecting", "disconnecting"];
  const mongoState = mongoStates[mongoose.connection.readyState] || "unknown";
  const allOk = mlHealth.status === "ok" && mongoState === "connected";
  res.json({
    status: allOk ? "ok" : "degraded",
    ml_service: mlHealth,
    mongodb: { state: mongoState },
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/check-prompt", banGuard, fixedWindowLimiter, checkPromptRoutes);
app.use("/api/check-multimodal", banGuard, fixedWindowLimiter, checkMultimodalRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.use((req, res) => res.status(404).json({ error: "Not found" }));

app.use((err, req, res, next) => {
  console.error("[server] Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`[server] LLM Security backend listening on port ${PORT}`);
});
