const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { exec } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const path = require("path");
const fs = require("fs");
const https = require("https");

const app = express();

// ===========================
// Middlewares
// ===========================
app.use(cors({
  origin: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json({ limit: "500mb" }));
app.use(express.urlencoded({ extended: true, limit: "500mb" }));

// ===========================
// Create folders
// ===========================
const uploadDir = path.join(__dirname, "uploads");
const trimmedDir = path.join(__dirname, "trimmed");

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(trimmedDir)) fs.mkdirSync(trimmedDir);

// ===========================
// Static serving
// ===========================
app.use("/uploads", express.static(uploadDir));
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
// Multer setup
// ===========================
const storage = multer.diskStorage({
  destination: uploadDir,
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
    return res.status(400).json({ error: "No file uploaded" });
  }
  res.json({ filename: req.file.filename });
});

// ===========================
// Download from URL
// ===========================
app.post("/download-url", (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL required" });

  const filename = `url-${Date.now()}.mp4`;
  const filePath = path.join(uploadDir, filename);
  const file = fs.createWriteStream(filePath);

  https.get(url, response => {
    response.pipe(file);
    file.on("finish", () => {
      file.close(() => {
        res.json({
          filename,
          url: `/uploads/${filename}`
        });
      });
    });
  }).on("error", () => {
    fs.unlink(filePath, () => {});
    res.status(500).json({ error: "Download failed" });
  });
});

// ===========================
// Trim route
// ===========================
app.post("/trim", (req, res) => {
  const { filename, start, end } = req.body;

  if (!filename) return res.status(400).json({ error: "Filename required" });
  if (Number(start) >= Number(end)) {
    return res.status(400).json({ error: "Invalid trim range" });
  }

  const inputPath = path.join(uploadDir, filename);
  if (!fs.existsSync(inputPath)) {
    return res.status(404).json({ error: "Input file not found" });
  }

  const outputName = `trim-${Date.now()}.mp4`;
  const outputPath = path.join(trimmedDir, outputName);

  const cmd =
    `"${ffmpegPath}" -y -ss ${start} -i "${inputPath}" -t ${end - start} ` +
    `-c:v libx264 -c:a aac "${outputPath}"`;

  exec(cmd, err => {
    if (err) {
      return res.status(500).json({ error: "Video processing failed" });
    }
    res.json({ url: `/trimmed/${outputName}` });
  });
});

// ===========================
// Start server
// ===========================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});

// ===========================
// Auto delete old files
// ===========================
const AUTO_DELETE_INTERVAL = 30 * 60 * 1000;
const FILE_MAX_AGE = 48 * 60 * 60 * 1000;

function deleteOldFiles(dir) {
  fs.readdir(dir, (err, files) => {
    if (err) return;
    files.forEach(file => {
      const filePath = path.join(dir, file);
      fs.stat(filePath, (err, stats) => {
        if (!err && Date.now() - stats.mtimeMs > FILE_MAX_AGE) {
          fs.unlink(filePath, () => {});
        }
      });
    });
  });
}

setInterval(() => {
  deleteOldFiles(uploadDir);
  deleteOldFiles(trimmedDir);
}, AUTO_DELETE_INTERVAL);
