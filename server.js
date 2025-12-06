const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { exec } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const path = require("path");
const fs = require("fs");

const app = express();

app.use(cors());
app.use(express.json());

// --------------------------------------
// Ensure required folders exist
// --------------------------------------
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
if (!fs.existsSync("trimmed")) fs.mkdirSync("trimmed");

// Serve trimmed files publicly
app.use("/trimmed", express.static(path.join(__dirname, "trimmed")));

// Health check
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

// --------------------------------------
// Trim route - FIXED VERSION
// Accepts: video file + start + end
// --------------------------------------
app.post("/trim", upload.single("video"), (req, res) => {
  const { start, end } = req.body;

  // check video presence
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No video provided for trimming" });
  }

  if (start === undefined || end === undefined) {
    return res.json({ success: false, error: "Missing start or end time" });
  }

  const inputPath = path.join(__dirname, "uploads", req.file.filename);
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

// --------------------------------------
// Start server
// --------------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
