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
// Middlewares
// ===========================



app.options("*", cors());


app.use(cors({
  origin: [
    "https://videotrimmer.online",
    "https://www.videotrimmer.online"
  ],
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));


app.use(express.json({ limit: "500mb" }));
app.use(express.urlencoded({ extended: true, limit: "500mb" }));

// Serve trimmed videos
app.use("/trimmed", express.static(trimmedDir, {
  setHeaders: res => res.set("Content-Type", "video/mp4")
}));

// ===========================
// Health check
// ===========================
app.get("/", (req, res) => {
  res.send("Video Trimmer Backend Running");
});

// ===========================
// Multer storage config
// ===========================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 } // 500 MB
});

// ===========================
// Upload route
// ===========================
app.post("/upload", upload.single("video"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No file uploaded" });
  }
  res.json({ success: true, filename: req.file.filename });
});

// ===========================
// Trim route
// ===========================
app.post("/trim", (req, res) => {
  const { filename } = req.body;
  const start = Number(req.body.start);
  const end = Number(req.body.end);

  if (!filename) {
    return res.status(400).json({ success: false, error: "Filename is required" });
  }

  if (Number.isNaN(start) || Number.isNaN(end)) {
    return res.status(400).json({ success: false, error: "Invalid start or end time" });
  }

  if (start >= end) {
    return res.status(400).json({ success: false, error: "End time must be greater than start time" });
  }

  const inputPath = path.join(uploadDir, filename);
  if (!fs.existsSync(inputPath)) {
    return res.status(404).json({ success: false, error: "Input file not found" });
  }

  const duration = end - start;
  const outputName = `trim-${Date.now()}.mp4`;
  const outputPath = path.join(trimmedDir, outputName);

  const command = `"${ffmpegPath}" -y -ss ${start} -i "${inputPath}" -t ${duration} -c:v libx264 -c:a aac "${outputPath}"`;

  exec(command, (err) => {
    if (err) {
      console.error("FFmpeg error:", err);
      return res.status(500).json({ success: false, error: "Video processing failed" });
    }
    res.json({ success: true, url: `/trimmed/${outputName}` });
  });
});

// ===========================
// Dynamic port
// ===========================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));


// ===========================
// Auto-delete old files (24h)
// ===========================
const AUTO_DELETE_INTERVAL = 30 * 60 * 1000; // 30 minutes
const FILE_MAX_AGE = 48 * 60 * 60 * 1000; // 48 hours

function deleteOldFiles(dir) {
  fs.readdir(dir, (err, files) => {
    if (err) return console.error(`Error reading ${dir}:`, err);

    files.forEach(file => {
      const filePath = path.join(dir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return console.error(`Error stat ${filePath}:`, err);

        const now = Date.now();
        const age = now - stats.mtimeMs;

        if (age > FILE_MAX_AGE) {
          fs.unlink(filePath, err => {
            if (err) console.error(`Error deleting ${filePath}:`, err);
            else console.log(`Deleted old file: ${filePath}`);
          });
        }
      });
    });
  });
}

// Run cleanup every hour
setInterval(() => {
  deleteOldFiles(uploadDir);
  deleteOldFiles(trimmedDir);
}, AUTO_DELETE_INTERVAL);
