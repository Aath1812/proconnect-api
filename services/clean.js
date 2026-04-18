/**
 * services/clean.js
 * 
 * Purpose: Prepares the raw extracted PDF text for analysis.
 * Why it's needed: Resumes contain a lot of junk formatting, HTML, and PII. 
 * We must protect technical tokens (C++, .NET) before stripping symbols,
 * and we must scrub PII (Privacy Rule).
 */

// We protect these words so the cleaning regex doesn't destroy the "++" or ".js"
const TECH_WHITELIST = [
  { token: "C++", placeholder: "__CPLUS__" },
  { token: "C#", placeholder: "__CSHARP__" },
  { token: ".NET", placeholder: "__DOTNET__" },
  { token: "Node.js", placeholder: "__NODEJS__" },
  { token: "React.js", placeholder: "__REACTJS__" },
  { token: "Vue.js", placeholder: "__VUEJS__" },
];

const PHONE_REGEX = /(\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function clean(text) {
  if (typeof text !== "string") return "";
  let result = text;

  // 1. Swap technical tokens with safe placeholders
  for (const { token, placeholder } of TECH_WHITELIST) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(escaped, "gi"), placeholder);
  }

  // 2. Strip HTML tags and decode HTML entities
  result = result.replace(/<[^>]*>/g, " ");
  result = result.replace(/&[a-z]+;|&#\d+;/gi, " ");

  // 3. PII Scrubbing (Hide sensitive applicant information)
  result = result.replace(EMAIL_REGEX, "[EMAIL_REDACTED]");
  result = result.replace(PHONE_REGEX, "[PHONE_REDACTED]");

  // 4. Clean up whitespace
  result = result.replace(/[\t\r\f\v]+/g, " ").replace(/ {2,}/g, " ");

  // 5. Restore the technical tokens back to their original form
  for (const { token, placeholder } of TECH_WHITELIST) {
    result = result.replace(new RegExp(placeholder, "g"), token);
  }

  return result.trim();
}

module.exports = clean;
