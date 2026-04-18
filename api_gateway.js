/**
 * api_gateway.js
 * 
 * Purpose: The API Gateway for ProConnect. 
 * Why it's needed: This handles incoming HTTP requests from the Front-End, 
 * manages authentication, accepts file uploads (Multer), and offloads 
 * heavy PDF parsing onto BullMQ so the server never "blocks" or freezes.
 */

require("dotenv").config();
const express = require("express");
const multer = require("multer");
const { Queue } = require("bullmq");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const connectDB = require("./database");

// --- MongoDB Models ---
const User = require("./models/User");
const Application = require("./models/Application");
const Job = require("./models/Job");

// --- Initialize App & Queue ---
const app = express();
app.use(express.json());

connectDB(); // Boot up database

// Create the Message Broker queue connection
const jobsQueue = new Queue("jobs", {
  connection: { url: process.env.REDIS_URL || "redis://localhost:6379" }
});

// Configure Multer to stream uploaded PDFs directly to ProConnect's local disk
const upload = multer({ 
  dest: "uploads/",
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Only PDFs are allowed"));
  }
});


// ==========================================
// 1. DATABASE SEEDING (Auto-creates the Answer Key)
// ==========================================
async function seedDefaultJob() {
  const count = await Job.countDocuments();
  if (count === 0) {
    await Job.create({
      title: "Backend Engineer",
      threshold: 70, // Needs 70/100 to pass without AI help
      keywords: [
        { skill: "Node.js", weight: 3 },
        { skill: "MongoDB", weight: 2 },
        { skill: "Express", weight: 2 },
        { skill: "REST", weight: 1 },
        { skill: "Redis", weight: 2 }
      ]
    });
    console.log("[Gateway] Database Seeded with Default Backend Engineer Job Key.");
  }
}
seedDefaultJob();


// ==========================================
// 2. AUTHENTICATION (Register & Login)
// ==========================================
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "api" });
});

app.post("/api/v1/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    // Check if user exists
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ error: "Email already exists" });

    // Hash the password securely and save
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, passwordHash });

    res.status(201).json({ message: "Registration successful" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/v1/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate JWT Token valid for 1 hour
    const token = jwt.sign({ sub: user._id, role: user.role }, process.env.JWT_SECRET || "secret", { expiresIn: "1h" });
    
    res.json({ token, user: { id: user._id, name: user.name, email: user.email }});
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ==========================================
// 3. SECURITY MIDDLEWARE 
// ==========================================
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "Missing token" });

  const token = header.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "secret");
    req.user = decoded; // Attach user info to the request
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}


// ==========================================
// 4. MAIN PIPELINE (Apply & Offload to Worker)
// ==========================================
app.post("/api/v1/apply", requireAuth, upload.single("resume"), async (req, res) => {
  try {
    const { applicantName, email, resumeText } = req.body;
    const file = req.file; 

    // We accept EITHER a PDF file OR raw text (useful for debugging)
    if (!file && !resumeText) {
      return res.status(400).json({ error: "Provide a PDF file or 'resumeText' payload." });
    }

    // Step 1: Create a Pending Database Record immediately
    const appRecord = await Application.create({
      applicantName,
      email,
      userId: req.user.sub,
      filePath: file ? file.path : null,
      resumeText: resumeText || null, // Raw text fallback
      status: "pending"
    });

    // Step 2: Push the heavy task to BullMQ (Redis)
    const job = await jobsQueue.add("process-resume", {
      applicationId: appRecord._id
    });

    // Step 3: Update the record with the Queue Job ID
    appRecord.jobId = job.id;
    await appRecord.save();

    // Step 4: Respond IMMEDATELY (Non-blocking)
    res.status(202).json({
      message: "Application queued for asynchronous processing.",
      applicationId: appRecord._id,
      jobId: job.id
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ==========================================
// 5. STATUS POLLING (Check background progress)
// ==========================================
app.get("/api/v1/status/:applicationId", requireAuth, async (req, res) => {
  try {
    const appRecord = await Application.findById(req.params.applicationId);
    if (!appRecord) return res.status(404).json({ error: "Application not found" });

    // Only the user who created it can look at it!
    if (appRecord.userId.toString() !== req.user.sub && req.user.role !== "recruiter") {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json({
      applicationId: appRecord._id,
      status: appRecord.status,
      score: appRecord.score,
      analysis: appRecord.analysis,
      suggestions: appRecord.suggestions
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ==========================================
// 6. JOB MANAGEMENT (Optimistic Locking)
// ==========================================
app.put("/api/v1/jobs/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { keywords, threshold, version } = req.body;

    if (version === undefined) {
      return res.status(400).json({ error: "Version number is required for optimistic locking." });
    }

    // Find the job but ALSO ensure the version matches what the client expects
    const job = await Job.findOneAndUpdate(
      { _id: id, __v: version },
      { 
        $set: { keywords, threshold },
        $inc: { __v: 1 } // Increment version after a successful update
      },
      { new: true } // Return the updated document
    );

    if (!job) {
      // If we couldn't find it with that version, someone else updated it (or it doesn't exist)
      const existingJob = await Job.findById(id);
      if (!existingJob) {
        return res.status(404).json({ error: "Job not found." });
      }
      return res.status(409).json({ 
        error: "Conflict: The job was updated by another recruiter. Please fetch the latest version and try again.",
        currentVersion: existingJob.__v
      });
    }

    res.json({ message: "Job updated successfully", job });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Start listening
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`[Gateway] Express API Server running on port ${PORT}`);
});
