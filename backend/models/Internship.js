/**
 * models/Internship.js
 */

const mongoose = require("mongoose");

const internshipSchema = new mongoose.Schema(
  {
    company:        { type: String, required: true, trim: true },
    role:           { type: String, required: true, trim: true },
    logo:           { type: String, default: "💼" },
    stipend:        { type: String, default: "Unpaid" },
    stipendNumeric: { type: Number, default: 0 },
    duration:       { type: String, default: "3 months" },
    location:       { type: String, default: "India" },
    isRemote:       { type: Boolean, default: false },
    skills:         [{ type: String }],
    applyLink:      { type: String, required: true },
    deadline:       { type: Date },
    description:    { type: String, default: "" },
    sourcePlatform: { type: String, default: "Other" },
    externalId:     { type: String },
    status:         { type: String, enum: ["OPEN", "CLOSED"], default: "OPEN" },
    isActive:       { type: Boolean, default: true },
    lastScrapedAt:  { type: Date },
  },
  { timestamps: true, versionKey: false }
);

internshipSchema.index({ status: 1, isActive: 1, deadline: 1 });
internshipSchema.index({ company: "text", role: "text" });

module.exports = mongoose.model("Internship", internshipSchema);
