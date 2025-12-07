const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { exec } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const path = require("path");
const fs = require("fs");

const app = express();

// ===========================
// Create folders if not exist
// ===========================
const uploadDir = path.join(__dirname, "uploads");
const trimmedDir = path.join(__dirname, "trimmed");

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(trimmedDir)) fs.mkdirSync(trimmedDir);

// ===========================
// Middlewares (FIXED)
// ===========================
app.use(cors({
  origin: "https://videotrimmer.online",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json({ limit: "500mb" }));
app.use(express.urlencoded({ extended: true, limit: "500mb" }));

app.use("/trimmed", express.static(trimmedDir, {
  setHeaders: (res) => {
    res.set("Content-Type", "video/mp4");
  }
}));

// ===========================
// Health check
// ===========================
app.get("/", (req, res) => {
  res.send("Video Trimmer Backend Running");
});

// ===========================
// Multer storage config (FIXED)
// ===========================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }
});

// ===========================
// Upload route
// ===========================
app.post("/upload", upload.single("video"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: "No file uploaded"
    });
  }

  res.json({
    success: true,
    filename: req.file.filename
  });
});

// ===========================
// Trim route (FIXED)
// ===========================
app.post("/trim", (req, res) => {
  const { filename, start, end } = req.body;

  if (!filename) {
    return res.status(400).json({
      success: false,
      error: "Filename is required"
    });
  }

  if (start === undefined || end === undefined) {
    return res.status(400).json({
      success: false,
      error: "Missing start or end time"
    });
  }

  const inputPath = path.join(uploadDir, filename);

  if (!fs.existsSync(inputPath)) {
    return res.status(404).json({
      success: false,
      error: "Input file not found"
    });
  }

  const outputName = `trim-${Date.now()}.mp4`;
  const outputPath = path.join(trimmedDir, outputName);

  const command = `"${ffmpegPath}" -y -i "${inputPath}" -ss ${start} -to ${end} -c:v libx264 -c:a aac "${outputPath}"`;

  exec(command, (err) => {
    if (err) {
      console.error("FFmpeg error:", err);
      return res.status(500).json({
        success: false,
        error: "Video processing failed"
      });
    }

    res.json({
      success: true,
      url: `/trimmed/${outputName}`
    });
  });
});

// ===========================
// Dynamic port for Render
// ===========================
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
