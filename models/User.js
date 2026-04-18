/**
 * models/User.js
 * 
 * Purpose: Defines the schema for Candidate/Recruiter accounts in ProConnect.
 * Why it's needed: We need to authenticate users and ensure candidates can only 
 * see their own application scores.
 */

const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: { 
      type: String, 
      required: true,
      trim: true 
    },
    email: { 
      type: String, 
      required: true, 
      unique: true, // Prevents duplicate accounts
      lowercase: true 
    },
    passwordHash: { 
      type: String, 
      required: true 
    },
    role: { 
      type: String, 
      enum: ["applicant", "recruiter"], 
      default: "applicant" 
    },
  },
  { timestamps: true } // Auto-adds createdAt and updatedAt
);

module.exports = mongoose.models.User || mongoose.model("User", UserSchema);
