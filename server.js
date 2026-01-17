// ===========================
// Video Trimmer Backend (URL Only)
// ===========================
const express = require("express");
const cors = require("cors");
const { exec } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const path = require("path");
const fs = require("fs");
const http = require("http");
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
// Download from URL
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

  // Timeout for slow URLs
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
// Trim route
// ===========================
app.post("/trim", (req, res) => {
  const { filename, start, end } = req.body;

  if (!filename) return res.status(400).json({ error: "Filename required" });
  if (Number(start) >= Number(end)) return res.status(400).json({ error: "Invalid trim range" });

  const inputPath = path.join(uploadDir, filename);
  if (!fs.existsSync(inputPath)) return res.status(404).json({ error: "Input file not found" });

  const outputName = `trim-${Date.now()}.mp4`;
  const outputPath = path.join(trimmedDir, outputName);

  const cmd =
    `"${ffmpegPath}" -y -ss ${start} -i "${inputPath}" -t ${end - start} -c:v libx264 -c:a aac "${outputPath}"`;

  console.log("FFMPEG CMD:", cmd);

  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.error("❌ FFMPEG ERROR:", err);
      console.error("STDERR:", stderr);
      return res.status(500).json({ error: "Video processing failed" });
    }
    console.log("✅ Trim success:", outputPath);
    res.json({ url: `/trimmed/${outputName}` });
  });
});

// ===========================
// Auto delete old files (optional)
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
