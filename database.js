/**
 * database.js
 * 
 * Purpose: Connects the application to MongoDB.
 * Why it's needed: We use MongoDB to store User data, Resume Metadata (URLs, scores), 
 * and Job Keywords. This file ensures we have a stable connection.
 */

const mongoose = require("mongoose");
require("dotenv").config();

async function connectDB() {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`[Database] MongoDB Connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(`[Database] Connection Error: ${err.message}`);
    process.exit(1); 
  }
}

module.exports = connectDB;
