// ===========================
// Video Trimmer Backend (URL Only)
// ===========================
const express = require("express");
const cors = require("cors");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();

// ===========================
// Middlewares
// ===========================
app.use(cors({
  origin: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

// Limit request body size
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Allow video preview across domains
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
});

// ===========================
// Create folders
// ===========================
const uploadDir = path.join("/tmp", "uploads");
const trimmedDir = path.join("/tmp", "trimmed");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(trimmedDir)) fs.mkdirSync(trimmedDir, { recursive: true });

// ===========================
// Static serving
// ===========================
app.use("/uploads", express.static(uploadDir, {
  setHeaders: res => res.set("Content-Type", "video/mp4")
}));
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
// Download from URL (streaming)
// ===========================
app.post("/download-url", (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "URL required" });

  const filename = `url-${Date.now()}.mp4`;
  const filePath = path.join(uploadDir, filename);
  const file = fs.createWriteStream(filePath);

  const client = url.startsWith("https") ? https : http;
  const request = client.get(url, response => {
    response.pipe(file);
    file.on("finish", () => {
      file.close(() => res.json({ filename, url: `/uploads/${filename}` }));
    });
  });

  request.setTimeout(30000, () => {
    request.abort();
    fs.unlink(filePath, () => {});
    res.status(500).json({ error: "Download timed out" });
  });

  request.on("error", () => {
    fs.unlink(filePath, () => {});
    res.status(500).json({ error: "Download failed" });
  });
});

// ===========================
// Trim route (streaming, memory-efficient)
// ===========================
app.post("/trim", (req, res) => {
  const { filename, start, end } = req.body;
  if (!filename) return res.status(400).json({ error: "Filename required" });
  if (Number(start) >= Number(end)) return res.status(400).json({ error: "Invalid trim range" });

  const inputPath = path.join(uploadDir, filename);
  if (!fs.existsSync(inputPath)) return res.status(404).json({ error: "Input file not found" });

  const outputName = `trim-${Date.now()}.mp4`;
  const outputPath = path.join(trimmedDir, outputName);

  ffmpeg(inputPath)
    .setStartTime(start)
    .setDuration(end - start)
    .output(outputPath)
    .videoCodec("libx264")
    .audioCodec("aac")
    .on("start", cmd => console.log("FFMPEG CMD:", cmd))
    .on("error", (err, stdout, stderr) => {
      console.error("❌ FFMPEG ERROR:", err.message);
      console.error("STDERR:", stderr);
      res.status(500).json({ error: "Video processing failed" });
    })
    .on("end", () => {
      res.json({ url: `/trimmed/${outputName}` });
    })
    .run();
});

// ===========================
// Auto delete old files
// ===========================
const FILE_MAX_AGE = 48 * 60 * 60 * 1000; // 48 hours
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
}, 30 * 60 * 1000); // every 30 min

// ===========================
// Start server
// ===========================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running on port", PORT));
