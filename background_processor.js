/**
 * background_processor.js
 * 
 * Purpose: The Background Data Processor.
 * Why it's needed: Parsing PDFs and scoring algorithms consume deep CPU resources.
 * By moving this to a dedicated background process, the API Gateway never blocks.
 * Hundreds of applicants can upload resumes instantly.
 */

require("dotenv").config();
const { Worker } = require("bullmq");
const fs = require("fs");
const http = require("http");
const pdfParse = require("pdf-parse");
const connectDB = require("./database");

// --- Models & Services ---
const Application = require("./models/Application");
const Job = require("./models/Job");
const clean = require("./services/clean");
const segment = require("./services/segment");
const score = require("./services/score");
const suggest = require("./services/ai");

// Boot up MongoDB
connectDB();

console.log("[Worker] Initializing Background Engine...");

if (process.env.WORKER_HEALTH_PORT) {
  http
    .createServer((req, res) => {
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", service: "worker" }));
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    })
    .listen(process.env.WORKER_HEALTH_PORT, () => {
      console.log(`[Worker] Health server listening on port ${process.env.WORKER_HEALTH_PORT}`);
    });
}

// The heavy lifting pipeline definition
const worker = new Worker("jobs", async (job) => {
  const { applicationId } = job.data;
  console.log(`\n[Worker] 📥 Picked up task ${job.id} mapping to application ${applicationId}`);

  try {
    // 1. Fetch Application from Database
    const appRecord = await Application.findById(applicationId);
    if (!appRecord) throw new Error("Application record not found in MongoDB.");

    appRecord.status = "processing";
    await appRecord.save();

    // 2. Extract Text (via PDF or Raw JSON)
    let rawText = appRecord.resumeText;
    if (appRecord.filePath) {
      console.log(`[Worker] Extracting text from PDF: ${appRecord.filePath}`);
      const fileBuffer = fs.readFileSync(appRecord.filePath);
      const pdfData = await pdfParse(fileBuffer);
      rawText = pdfData.text;
      appRecord.resumeText = rawText; // Cache in DB for debugging
    }
    
    if (!rawText) throw new Error("No text or PDF file provided.");

    // 3. Clean Text (Scrub PII, strip garbage characters)
    const activeText = clean(rawText);

    // 4. Segment Text (Slice into Experience, Skills, Education)
    const textSegments = segment(activeText);

    // 5. Score Resume (The Multi-Factor Algorithm)
    const { finalScore, analysis } = await score(activeText, textSegments);
    appRecord.score = finalScore;
    appRecord.analysis = analysis;

    console.log(`[Worker] Score generated: ${finalScore}/100.`);

    // 6. Gemini AI Assistance (Proxy)
    // We ALWAYS call Gemini now. If the score is high, it suggests how to get a perfect 100.
    console.log(`[Worker] Score generated: ${finalScore}/100. Triggering AI Suggestions to maximize score...`);
    appRecord.suggestions = await suggest(analysis, finalScore);

    // 7. Save Final Results
    appRecord.status = "done";
    await appRecord.save();

    console.log(`[Worker] ✅ Task ${job.id} completed successfully.`);

  } catch (err) {
    console.error(`[Worker] ❌ Task ${job.id} FAILED: ${err.message}`);
    // Update DB so the user knows it broke
    await Application.findByIdAndUpdate(applicationId, { status: "failed" }).catch(()=>null);
  }
}, {
  connection: { url: process.env.REDIS_URL || "redis://localhost:6379" },
  concurrency: 5 // Can process 5 PDFs simultaneously 
});

worker.on("ready", () => {
  console.log(`[Worker] 🚀 Ready and listening to Redis queue "jobs" with concurrency of 5.`);
});
