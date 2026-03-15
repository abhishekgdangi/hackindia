/**
 * models/Event.js
 * Mongoose schema for technical events (conferences, meetups, webinars, etc.)
 */

const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    title:            { type: String, required: true, trim: true },
    description:      { type: String, default: "", trim: true },
    eventType: {
      type: String,
      enum: [
        "Hackathon", "Conference", "Meetup", "Workshop",
        "Webinar", "Bootcamp", "AI/ML Event",
        "Startup Event", "Coding Competition", "Internship Event", "Other"
      ],
      default: "Other",
    },
    platform:         { type: String, default: "Unknown", trim: true },
    date:             { type: String, default: "" },
    dateISO:          { type: Date,   default: null },
    location:         { type: String, default: "Online", trim: true },
    price:            { type: String, default: "Free", enum: ["Free", "Paid", "Unknown"] },
    registrationLink: { type: String, default: "" },
    imageUrl:         { type: String, default: "" },
    scrapedAt:        { type: Date, default: Date.now },
    uniqueId:         { type: String, required: true },
    isActive:         { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false }
);

eventSchema.index({ eventType: 1 });
eventSchema.index({ location: 1 });
eventSchema.index({ price: 1 });
eventSchema.index({ platform: 1 });
eventSchema.index({ uniqueId: 1 }, { unique: true });
eventSchema.index(
  { title: "text", description: "text" },
  { weights: { title: 3, description: 1 } }
);

module.exports = mongoose.model("Event", eventSchema);
