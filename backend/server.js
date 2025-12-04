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

// Serve frontend files
app.use(express.static(__dirname));

// Ensure folders exist
if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");
if (!fs.existsSync("trimmed")) fs.mkdirSync("trimmed");

// Serve trimmed files publicly
app.use("/trimmed", express.static(path.join(__dirname, "trimmed")));

// Homepage
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// Storage settings for multer
const storage = multer.diskStorage({
    destination: "uploads",
    filename: (req, file, cb) => {
        const safeName = Date.now() + ".mp4";
        cb(null, safeName);
    }
});
const upload = multer({ storage });

// Upload route
app.post("/upload", upload.single("video"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: "No file uploaded." });
    }

    res.json({
        success: true,
        filename: req.file.filename
    });
});

// Trim route
app.post("/trim", (req, res) => {
    const { filename, start, end } = req.body;

    if (!filename) {
        return res.json({ success: false, error: "Filename missing" });
    }

    const inputPath = path.join(__dirname, "uploads", filename);
    const outputName = "trim-" + Date.now() + ".mp4";
    const outputPath = path.join(__dirname, "trimmed", outputName);

    const command = `"${ffmpegPath}" -i "${inputPath}" -ss ${start} -to ${end} -c copy "${outputPath}"`;

    exec(command, (error) => {
        if (error) {
            return res.json({ success: false, error: error.message });
        }

        res.json({
            success: true,
            url: "/trimmed/" + outputName
        });
    });
});

// Server start
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Running on port", PORT));
