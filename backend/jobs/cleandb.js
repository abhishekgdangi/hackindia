require("dns").setDefaultResultOrder("ipv4first");
require("dns").setServers(["8.8.8.8","8.8.4.4"]);
require("dotenv").config();
const mongoose   = require("mongoose");
const Hackathon  = require("../models/Hackathon");
const Event      = require("../models/Event");
const logger     = require("../utils/logger");

async function cleanDB() {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/hackindia");
  logger.info("Connected to MongoDB — starting cleanup…");

  // Remove dev.events stale data
  const devDel = await Event.deleteMany({
    $or: [
      { uniqueId: /^devevents-/i },
      { description: /Source: dev\.events/i },
    ]
  });
  logger.info(`Removed ${devDel.deletedCount} dev.events entries`);

  // Remove Devfolio hackathons
  const devfolioDel = await Hackathon.deleteMany({ sourcePlatform: /devfolio/i });
  logger.info(`Removed ${devfolioDel.deletedCount} Devfolio hackathons`);

  // Remove non-India OFFLINE hackathons only (keep all online)
  const INDIA_KW = ["india","bangalore","bengaluru","mumbai","delhi","hyderabad",
    "chennai","pune","kolkata","noida","gurugram","gurgaon","ahmedabad","jaipur",
    "kochi","chandigarh","indore","bhopal","lucknow","surat","trivandrum","kochi"];

  const offlineHacks = await Hackathon.find({
    mode: { $regex: /offline|in-person/i }
  });
  let removedOffline = 0;
  for (const h of offlineHacks) {
    const loc = ((h.location||"")+" "+(h.city||"")+" "+(h.country||"")).toLowerCase();
    if (!loc.trim()) continue; // no location = keep
    const isIndia = INDIA_KW.some(k => loc.includes(k));
    if (!isIndia) {
      await Hackathon.deleteOne({ _id: h._id });
      removedOffline++;
    }
  }
  logger.info(`Removed ${removedOffline} non-India offline hackathons`);

  const [fH, fE] = await Promise.all([Hackathon.countDocuments(), Event.countDocuments()]);
  logger.info(`After cleanup: ${fH} hackathons, ${fE} events`);
  await mongoose.disconnect();
  process.exit(0);
}
cleanDB().catch(e => { console.error(e.message); process.exit(1); });
