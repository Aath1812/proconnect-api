/**
 * services/ai.js
 * 
 * Purpose: Connects to Google's Gemini AI to provide Users with actionable feedback.
 * Why it's needed: Deterministic scoring ranks candidates (the "What"), but AI 
 * provides personalized improvement tips (the "Why").
 * 
 * Note: Includes an Exponential Backoff retry system.
 */

const { GoogleGenerativeAI } = require("@google/generative-ai");

let model = null;

function getModel() {
  if (!model) {
    if (!process.env.GEMINI_API_KEY) return null;
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  }
  return model;
}

async function suggest(analysis, finalScore) {
  const aiClient = getModel();
  if (!aiClient) return ["AI feedback unavailable — API Key missing."];

  let promptObjective = "";
  if (finalScore === 100) {
    promptObjective = "The candidate scored a perfect 100! Suggest advanced ways they can stand out from other perfect applicants (e.g., open source contributions, system design).";
  } else if (finalScore >= 70) {
    promptObjective = "The candidate passed! Give precise tips on how they can maximize their score to a perfect 100 by fixing minor missing keywords or unparsed experience.";
  } else if (finalScore > 30) {
    promptObjective = "The candidate is close to passing but fell short. Suggest the most critical skills they must add immediately to reach the 70/100 threshold.";
  } else {
    promptObjective = "The candidate scored very low. Provide structural advice to completely rewrite their resume to target this job and add fundamental missing skills.";
  }

  const prompt = `You are an HR consultant reviewing a resume.
Current Score: ${finalScore}/100
Missing Skills: ${analysis.missingKeywords.join(", ") || "None"}
Matched Skills: ${analysis.matchedKeywords.join(", ") || "None"}
Years of exp detected: ${analysis.yearsOfExperience}

${promptObjective}
Provide 3 to 5 concise bullet points. Start each line with a dash (-). No headers.`;

  // Graceful retries to bypass short-term rate limits (HTTP 429)
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`[Gemini] Attempt ${attempt}/3 to fetch AI suggestions...`);
      const result = await aiClient.generateContent(prompt);
      
      return result.response.text()
        .split("\n")
        .filter(line => line.trim().startsWith("-"))
        .map(line => line.replace(/^-/, "").trim());
        
    } catch (err) {
      console.warn(`[Gemini] Attempt ${attempt} Failed. Reason: ${err.message}`);
      
      if (err.message.includes("429") && attempt < 3) {
        const waitTime = attempt * 5; // Simpler backoff for dev
        console.log(`[Gemini] Rate-limited. Waiting ${waitTime} seconds...`);
        await new Promise(res => setTimeout(res, waitTime * 1000));
      } else if (attempt === 3) {
        console.log(`[Gemini] All retries exhausted. Sending Mock Data for demonstration.`);
        // Fallback demo data so the API always returns gracefully
        if (finalScore === 100) {
          return [
            "Your technical keywords and experience perfectly match our parser's expectations.",
            "To stand out among other top-tier candidates, link directly to deployed projects or open-source PRs.",
            "Emphasize quantifiable achievements metrics (e.g., 'reduced latency by 40%') rather than just listing responsibilities."
          ];
        } else if (finalScore >= 70) {
          return [
            `You have a strong score, but explicitly adding ${analysis.missingKeywords[0] || "any remaining optional skills"} will push you to a 100.`,
             "Ensure all your years of experience are mathematically visible to the parser.",
             "Consider fine-tuning your project bullet points to emphasize advanced system architectures."
          ];
        } else if (finalScore > 30) {
          return [
            `You are very close to passing. Immediately add ${analysis.missingKeywords[0] || "core backend skills"} to your resume.`,
            `Restructure your experience section to clearly connect your skills with your employment gaps.`,
            `Highlight advanced architectures to max out your sectional relevance.`
          ];
        } else {
          return [
            `Your resume currently lacks the fundamental keywords required for this role. Consider studying ${analysis.missingKeywords[0] || "the core requirements"}.`,
            `Ensure you have a dedicated 'Skills' section covering the required tech stack.`,
            `If you have relevant experience, rewrite it so the ATS parser can properly extract the duration.`
          ];
        }
      }
    }
  }
}

module.exports = suggest;
