/**
 * services/segment.js
 * 
 * Purpose: Slices the cleaned resume text into distinct logical sections.
 * Why it's needed: Finding the keyword "Node.js" inside the "Experience" section 
 * is much more valuable than finding it inside the "Hobbies" section.
 * Segmenting the text allows our scoring engine to apply Sectional Weights.
 */

// Common headers found in resumes
const SECTION_HEADERS = [
  { key: "experience", regex: /\b(work\s+)?experience\b|\bemployment(\s+history)?\b/i },
  { key: "skills", regex: /\bskills?\b|\btechnical\s+(skills?|proficiency)\b/i },
  { key: "education", regex: /\beducation(al)?\b|\bacademic\b|\bqualifications?\b/i },
];

function segment(cleanText) {
  if (!cleanText) {
    return { experience: "", skills: "", education: "", other: "" };
  }

  const lines = cleanText.split("\n");
  const sections = { experience: [], skills: [], education: [], other: [] };
  let activeSection = "other";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let isHeader = false;
    for (const { key, regex } of SECTION_HEADERS) {
      // If a relatively short line matches a header pattern, we swap active sections
      if (trimmed.length < 80 && regex.test(trimmed)) {
        activeSection = key;
        isHeader = true;
        break;
      }
    }

    // Add the text to the currently active section bucket
    if (!isHeader) {
      sections[activeSection].push(trimmed);
    }
  }

  // Join the arrays back into full text blocks
  return {
    experience: sections.experience.join(" "),
    skills: sections.skills.join(" "),
    education: sections.education.join(" "),
    other: sections.other.join(" "),
  };
}

module.exports = segment;
