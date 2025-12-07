const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { exec } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const path = require("path");
const fs = require("fs");

const app = express();

// Create folders if they don't exist
const uploadDir = path.join(__dirname, "uploads");
const trimmedDir = path.join(__dirname, "trimmed");

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
if (!fs.existsSync(trimmedDir)) fs.mkdirSync(trimmedDir);

app.use(cors());
app.use(express.json());

// Serve trimmed files publicly
app.use("/trimmed", express.static(trimmedDir));

// Health check route
app.get("/", (req, res) => {
  res.send("Video Trimmer Backend Running");
});


// --------------------------------------
// Multer storage
// --------------------------------------
const storage = multer.diskStorage({
  destination: "uploads",
  filename: (req, file, cb) => {
    cb(null, Date.now() + ".mp4");
  }
});

const upload = multer({ storage });

// --------------------------------------
// File upload route
// --------------------------------------
app.post("/upload", upload.single("video"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No file uploaded" });
  }

  res.json({
    success: true,
    filename: req.file.filename
  });
});
app.post("/trim", (req, res) => {
  const { filename, start, end } = req.body;

  if (!filename) {
    return res.status(400).json({ success: false, error: "Filename is required" });
  }

  if (start === undefined || end === undefined) {
    return res.json({ success: false, error: "Missing start or end time" });
  }

  const inputPath = path.join(__dirname, "uploads", filename);
  const outputName = "trim-" + Date.now() + ".mp4";
  const outputPath = path.join(__dirname, "trimmed", outputName);

  const command = `"${ffmpegPath}" -i "${inputPath}" -ss ${start} -to ${end} -c copy "${outputPath}"`;

  exec(command, (err) => {
    if (err) {
      return res.json({ success: false, error: err.message });
    }

    res.sendFile(outputPath);
  });
});
