/**
 * services/score.js
 * 
 * Purpose: Calculates the final score out of 100 for the candidate.
 * Why it's needed: ATS systems rely on algorithms to rank candidates deterministically 
 * instead of using black-box Machine Learning logic.
 * 
 * Our Multi-Factor Formula:
 * 40% Keyword Presence + 40% Sectional Relevance + 20% Duration of Experience
 */

const Job = require("../models/Job");

// Experience multiplier: keywords found in the EXPERIENCE section count for more.
const EXP_MULTIPLIER = 1.5;

function extractYears(experienceText) {
  if (!experienceText) return 0;
  // Look for "5 years", "3+ years", "2.5 yrs"
  const yearRegex = /(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)/gi;
  let totalLogs = 0;
  let match;
  while ((match = yearRegex.exec(experienceText)) !== null) {
    totalLogs += parseFloat(match[1]);
  }
  return totalLogs;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function score(cleanText, segments) {
  // 1. Fetch the Job Key (What skills do we want?)
  // For simplicity, we just grab the first Job document we find.
  const job = await Job.findOne({}).lean();
  
  const analysisOutput = {
    presenceScore: 0, sectionScore: 0, durationScore: 0,
    matchedKeywords: [], missingKeywords: [], yearsOfExperience: 0
  };

  if (!job) return { finalScore: 0, analysis: analysisOutput };

  const fullText = cleanText.toLowerCase();
  const expText = segments.experience.toLowerCase();

  let matchedWeightSum = 0;
  let sectionWeightSum = 0;
  let totalWeightSum = 0;
  let maxSectionWeight = 0; // The max possible section score if everything is 1.5x

  // 2. Loop through all expected keywords and check if they exist
  for (const { skill, weight } of job.keywords) {
    const pattern = new RegExp(`\\b${escapeRegex(skill.toLowerCase())}\\b`, "i");
    
    totalWeightSum += weight;
    maxSectionWeight += weight * EXP_MULTIPLIER;

    if (pattern.test(fullText)) {
      analysisOutput.matchedKeywords.push(skill);
      matchedWeightSum += weight;

      // Sectional Weight Bonus
      if (pattern.test(expText)) {
        sectionWeightSum += weight * EXP_MULTIPLIER;
      } else {
        sectionWeightSum += weight * 1.0;
      }
    } else {
      analysisOutput.missingKeywords.push(skill);
    }
  }

  // 3. Calculate Factors out of 100
  const presenceScore = totalWeightSum > 0 ? (matchedWeightSum / totalWeightSum) * 100 : 0;
  const sectionScore = maxSectionWeight > 0 ? (sectionWeightSum / maxSectionWeight) * 100 : 0;
  
  const years = extractYears(segments.experience);
  // Cap experience at 10 years for a max score
  const durationScore = Math.min(years / 10, 1) * 100;

  analysisOutput.presenceScore = Math.round(presenceScore);
  analysisOutput.sectionScore = Math.round(sectionScore);
  analysisOutput.durationScore = Math.round(durationScore);
  analysisOutput.yearsOfExperience = years;

  // 4. Combine factors using the 40/40/20 weighted formula
  const finalScore = (presenceScore * 0.4) + (sectionScore * 0.4) + (durationScore * 0.2);
  
  return { 
    finalScore: Math.round(finalScore * 100) / 100, // Round to two decimals
    analysis: analysisOutput 
  };
}

module.exports = score;
