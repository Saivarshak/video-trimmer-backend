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
app.use(cors());
app.use(express.json());
app.use("/trimmed", express.static(trimmedDir, {
  setHeaders: (res, path) => {
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
// Multer storage config
// ===========================
const storage = multer.diskStorage({
  destination: "uploads",
  filename: (req, file, cb) => {
    cb(null, Date.now() + ".mp4");
  }
});

const upload = multer({ storage });

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
// Trim route (UPDATED)
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
    return res.json({
      success: false,
      error: "Missing start or end time"
    });
  }

  const inputPath = path.join(__dirname, "uploads", filename);
  const outputName = "trim-" + Date.now() + ".mp4";
  const outputPath = path.join(__dirname, "trimmed", outputName);

  const command = `"${ffmpegPath}" -i "${inputPath}" -ss ${start} -to ${end} -c:v libx264 -c:a aac -strict experimental "${outputPath}"`;


  exec(command, (err) => {
    if (err) {
      return res.json({
        success: false,
        error: err.message
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
