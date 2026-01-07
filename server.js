const express = require("express");
const cors = require("cors");
const multer = require("multer");
const { exec } = require("child_process");
const ffmpegPath = require("ffmpeg-static");
const path = require("path");
const fs = require("fs");
const https = require("https");
const http = require("http");

const app = express();

app.use(cors());
app.use(express.json());

const UPLOADS_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

// =====================
// Multer upload storage
// =====================
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const safeName = Date.now() + "_" + Math.round(Math.random() * 1e6) + ext;
    cb(null, safeName);
  }
});

const upload = multer({ storage });

// =====================
// Utility: download file from URL
// =====================
function downloadVideoFromUrl(videoUrl, outputPath) {
  return new Promise((resolve, reject) => {
    const protocol = videoUrl.startsWith("https") ? https : http;

    protocol.get(videoUrl, response => {
      if (response.statusCode !== 200) {
        reject(new Error("Unable to download. Status " + response.statusCode));
        return;
      }

      const fileStream = fs.createWriteStream(outputPath);
      response.pipe(fileStream);

      fileStream.on("finish", () => {
        fileStream.close(resolve);
      });
    }).on("error", reject);
  });
}

// =====================
// Validate direct video URL
// =====================
function isDirectVideoUrl(url) {
  if (!url) return false;

  const validVideoExt = [".mp4", ".mov", ".webm", ".mkv"];

  try {
    const u = new URL(url);
    return validVideoExt.some(ext => u.pathname.endsWith(ext));
  } catch {
    return false;
  }
}

// =====================
// Upload local file
// =====================
app.post("/upload", upload.single("video"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  res.json({
    message: "Uploaded successfully",
    filepath: "/uploads/" + req.file.filename
  });
});

// =====================
// Upload from URL
// =====================
app.post("/upload-url", async (req, res) => {
  const { videoUrl } = req.body;

  if (!videoUrl) {
    return res.status(400).json({ error: "videoUrl required" });
  }

  // ---- URL validation logic ----
  if (!isDirectVideoUrl(videoUrl)) {
    return res.status(400).json({
      error: "This is not a direct video file URL (.mp4/.mov/.webm). " +
        "Social media page links are not direct media files."
    });
  }

  try {
    const fileName = Date.now() + "_remote.mp4";
    const filePath = path.join(UPLOADS_DIR, fileName);

    await downloadVideoFromUrl(videoUrl, filePath);

    res.json({
      message: "Downloaded successfully",
      filepath: "/uploads/" + fileName
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =====================
// Trim endpoint
// =====================
app.post("/trim", async (req, res) => {
  const { inputPath, start, duration } = req.body;

  if (!inputPath || start == null || duration == null) {
    return res.status(400).json({ error: "inputPath, start, duration required" });
  }

  const inputFile = path.join(__dirname, inputPath.replace("/uploads/", "uploads/"));
  const outputFile = path.join(
    UPLOADS_DIR,
    "trimmed_" + Date.now() + ".mp4"
  );

  const cmd = `"${ffmpegPath}" -y -i "${inputFile}" -ss ${start} -t ${duration} -c copy "${outputFile}"`;

  exec(cmd, (error) => {
    if (error) {
      return res.status(500).json({ error: "FFmpeg error: " + error.message });
    }

    res.json({
      message: "Trimmed successfully",
      filepath: "/uploads/" + path.basename(outputFile)
    });
  });
});

// =====================
// Static file route
// =====================
app.use("/uploads", express.static(UPLOADS_DIR));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log("Server running on", PORT);
});
