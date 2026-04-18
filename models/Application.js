/**
 * models/Application.js
 * 
 * Purpose: Stores details about a submitted resume. 
 * Why it's needed: The API Gateway creates this document first, then passes its ID 
 * to the Worker. The Worker parses the PDF, calculates the score, and updates this document.
 */

const mongoose = require("mongoose");

const ApplicationSchema = new mongoose.Schema(
  {
    applicantName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    
    // The path to the uploaded PDF file on the server (We don't store raw PDFs in DB)
    filePath: { type: String, default: null },
    
    // The extracted text from the PDF (Populated by the worker)
    resumeText: { type: String, default: null },

    // Tracking the lifecycle: pending -> processing -> done / failed
    status: { 
      type: String, 
      enum: ["pending", "processing", "done", "failed"], 
      default: "pending" 
    },
    
    // The final calculated score out of 100
    score: { type: Number, default: null },
    
    // The BullMQ Task ID for debugging
    jobId: { type: String, default: null },

    // Links this application to the User who submitted it
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },

    // The breakdown of how the final score was calculated
    analysis: {
      presenceScore: { type: Number, default: 0 },   // Weight of matching keywords
      sectionScore: { type: Number, default: 0 },    // Weight of keywords in EXPERIENCE section
      durationScore: { type: Number, default: 0 },   // Weight of years of experience
      matchedKeywords: [String],                     // Used for the Heatmap UI (Green)
      missingKeywords: [String],                     // Used for the Heatmap UI (Red)
      yearsOfExperience: { type: Number, default: 0 }
    },

    // AI feedback from Gemini (Only generated if score is below passing threshold)
    suggestions: [String],
  },
  { timestamps: true }
);

// We index by jobId and status to make status polling extremely fast
ApplicationSchema.index({ jobId: 1, status: 1 });

module.exports = mongoose.models.Application || mongoose.model("Application", ApplicationSchema);
