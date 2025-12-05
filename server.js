const express = require("express");
const multer = require("multer");
const cors = require("cors");
const { exec } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const path = require("path");
const fs = require("fs");

const app = express();

// -----------------------------
// CORS + CORB FIX
// -----------------------------
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }

  // CORB fix
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  next();
});

app.use(cors());
app.use(express.json());

// -----------------------------
// Ensure upload folders exist
// -----------------------------
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
if (!fs.existsSync("trimmed")) fs.mkdirSync("trimmed");

// Serve trimmed files publicly
app.use("/trimmed", express.static(path.join(__dirname, "trimmed")));

// Backend status route
app.get("/", (req, res) => {
  res.send("Video trimmer backend is running");
});

// -----------------------------
// Multer Storage
// -----------------------------
const storage = multer.diskStorage({
  destination: "uploads",
  filename: (req, file, cb) => {
    cb(null, Date.now() + ".mp4");
  }
});

const upload = multer({ storage });

// -----------------------------
// Upload Route
// -----------------------------
app.post("/upload", upload.single("video"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No file uploaded" });
  }

  res.json({
    success: true,
    filename: req.file.filename
  });
});

// -----------------------------
// Trim Route
// -----------------------------
app.post("/trim", (req, res) => {
  const { filename, start, end } = req.body;

  if (!filename || start === undefined || end === undefined) {
    return res.json({ success: false, error: "Missing parameters" });
  }

  const inputPath = path.join(__dirname, "uploads", filename);
  const outputName = "trim-" + Date.now() + ".mp4";
  const outputPath = path.join(__dirname, "trimmed", outputName);

  const command = `"${ffmpegPath}" -i "${inputPath}" -ss ${start} -to ${end} -c copy "${outputPath}"`;

  exec(command, (err) => {
    if (err) {
      return res.json({ success: false, error: err.message });
    }

    res.json({
      success: true,
      url: "/trimmed/" + outputName
    });
  });
});

// -----------------------------
// Start Server
// -----------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
