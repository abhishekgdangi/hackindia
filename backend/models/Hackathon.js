/**
 * models/Hackathon.js
 * Full Mongoose schema for hackathon events.
 * Includes all fields, indexes, virtuals, and auto-slug generation.
 */

const mongoose = require("mongoose");

const hackathonSchema = new mongoose.Schema(
  {
    // ── Identity ─────────────────────────────────────────────────
    name:      { type: String, required: true, trim: true },
    slug:      { type: String, unique: true, sparse: true },
    organizer: { type: String, trim: true, default: "" },
    logo:      { type: String, default: "🚀" },

    // ── Mode & Location ──────────────────────────────────────────
    mode: {
      type: String,
      enum: ["Online", "Offline", "Online + Offline", "Unknown"],
      default: "Unknown",
    },
    city:         { type: String, default: "Online", trim: true },
    state:        { type: String, trim: true },
    country:      { type: String, default: "India", trim: true },
    venueName:    { type: String, trim: true },
    venueAddress: { type: String, trim: true },

    // ── Dates ────────────────────────────────────────────────────
    startDate:            { type: Date },
    endDate:              { type: Date },
    registrationDeadline: { type: Date, required: true },

    // ── Prize & Team ─────────────────────────────────────────────
    prize:         { type: String, default: "TBA" },
    prizeNumeric:  { type: Number, default: 0 },
    teamSizeMin:   { type: Number, default: 1 },
    teamSizeMax:   { type: Number, default: 4 },
    teamSizeLabel: { type: String, default: "1–4" },

    // ── Domains & Classification ─────────────────────────────────
    domains: [{ type: String }],
    tags:    [{ type: String }],
    level: {
      type: String,
      enum: ["College", "City", "Regional", "National", "International", "Global", "Unknown"],
      default: "Unknown",
    },
    eligibility:  { type: String, default: "" },
    description:  { type: String, default: "" },

    // ── Links ────────────────────────────────────────────────────
    applyLink:   { type: String, required: true },
    websiteLink: { type: String },
    sourceUrl:   { type: String },

    // ── Source Platform ──────────────────────────────────────────
    sourcePlatform: {
      type: String,
      enum: [
        "Devfolio", "Unstop", "HackerEarth", "DoraHacks",
        "MLH", "Devpost", "LinkedIn", "Eventbrite",
        "Hackalist", "WhereUElevate", "Official", "Other",
      ],
      default: "Other",
    },
    externalId: { type: String, default: "" },

    // ── Status (agent-managed) ───────────────────────────────────
    status: {
      type: String,
      enum: ["OPEN", "CLOSED", "UPCOMING", "UNKNOWN"],
      default: "OPEN",
    },
    registrationOpen: { type: Boolean, default: true },
    isVerified:       { type: Boolean, default: false },
    isActive:         { type: Boolean, default: true },
    isDuplicate:      { type: Boolean, default: false },
    isFeatured:       { type: Boolean, default: false },
    linkBroken:       { type: Boolean, default: false },

    // ── Analytics ────────────────────────────────────────────────
    registrationCount: { type: Number, default: 0 },
    viewCount:         { type: Number, default: 0 },
    bookmarkCount:     { type: Number, default: 0 },
    qualityScore:      { type: Number, default: 50 },

    // ── Agent Audit ──────────────────────────────────────────────
    lastScrapedAt:   { type: Date },
    lastValidatedAt: { type: Date },
    agentNotes:      { type: String },
    scrapeVersion:   { type: Number, default: 1 },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// ── Indexes ───────────────────────────────────────────────────────
hackathonSchema.index({ status: 1, isActive: 1, registrationDeadline: 1 });
hackathonSchema.index({ domains: 1 });
hackathonSchema.index({ mode: 1 });
hackathonSchema.index({ city: 1 });
hackathonSchema.index({ sourcePlatform: 1 });
hackathonSchema.index({ prizeNumeric: -1 });
hackathonSchema.index({ isFeatured: -1, registrationDeadline: 1 });
hackathonSchema.index({ externalId: 1, sourcePlatform: 1 });
hackathonSchema.index(
  { name: "text", description: "text", organizer: "text" },
  { weights: { name: 3, organizer: 2, description: 1 } }
);

// ── Auto slug ────────────────────────────────────────────────────
hackathonSchema.pre("save", function (next) {
  if (!this.slug) {
    this.slug =
      this.name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 80) +
      "-" +
      Date.now().toString(36);
  }
  next();
});

// ── Virtual: days until deadline ─────────────────────────────────
hackathonSchema.virtual("daysUntilDeadline").get(function () {
  if (!this.registrationDeadline) return null;
  return Math.ceil((new Date(this.registrationDeadline) - new Date()) / 86400000);
});

hackathonSchema.set("toJSON", { virtuals: true });

module.exports = mongoose.model("Hackathon", hackathonSchema);
