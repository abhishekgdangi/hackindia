/**
 * models/AgentLog.js
 * Audit trail for every agent run — useful for the /api/agent-status endpoint.
 */

const mongoose = require("mongoose");

const agentLogSchema = new mongoose.Schema(
  {
    agent: {
      type: String,
      enum: [
        "DiscoveryAgent", "ScraperAgent", "ValidationAgent",
        "FilterAgent", "ClassificationAgent", "UpdateAgent",
      ],
      required: true,
    },
    action:         { type: String },
    platform:       { type: String },
    status:         { type: String, enum: ["running", "success", "partial", "failed"] },
    itemsProcessed: { type: Number, default: 0 },
    itemsAdded:     { type: Number, default: 0 },
    itemsUpdated:   { type: Number, default: 0 },
    itemsRemoved:   { type: Number, default: 0 },
    durationMs:     { type: Number },
    message:        { type: String },
    errorStack:     { type: String },
    metadata:       { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true, versionKey: false }
);

agentLogSchema.index({ agent: 1, createdAt: -1 });
agentLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model("AgentLog", agentLogSchema);
