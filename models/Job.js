/**
 * models/Job.js
 * 
 * Purpose: Defines the "Answer Key" for a given role (e.g., Backend Engineer).
 * Why it's needed: To assign deterministic scores, we need a list of expected 
 * technical skills and the "weight" or importance of each skill (1 to 5).
 */

const mongoose = require("mongoose");

const JobSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, unique: true },
    
    // Minimum score required to bypass AI feedback. If lower, Gemini is triggered.
    threshold: { type: Number, default: 70 },
    
    // The expected skills and their importance
    keywords: {
      type: [
        {
          skill: { type: String, required: true },
          weight: { type: Number, default: 1, min: 1, max: 5 },
        },
      ],
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Job || mongoose.model("Job", JobSchema);
