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

// Persistent storage folders (Render disks)
const uploadFolder = "/uploads";
const trimmedFolder = "/trimmed";

if (!fs.existsSync(uploadFolder)) fs.mkdirSync(uploadFolder, { recursive: true });
if (!fs.existsSync(trimmedFolder)) fs.mkdirSync(trimmedFolder, { recursive: true });

// Serve trimmed files publicly
app.use("/trimmed", express.static(trimmedFolder));

// Serve frontend files if you want (optional)
app.use(express.static(__dirname));

// Homepage (optional if frontend on GoDaddy)
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// Multer storage
const storage = multer.diskStorage({
    destination: uploadFolder,
    filename: (req, file, cb) => {
        const safeName = Date.now() + ".mp4";
        cb(null, safeName);
    }
});
const upload = multer({ storage });

// Upload API
app.post("/upload", upload.single("video"), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, error: "No file uploaded." });
    }

    res.json({
        success: true,
        filename: req.file.filename
    });
});

// Trim API
app.post("/trim", (req, res) => {
    const { filename, start, end } = req.body;

    if (!filename) {
        return res.json({ success: false, error: "Filename missing" });
    }

    const inputPath = path.join(uploadFolder, filename);
    const outputName = "trim-" + Date.now() + ".mp4";
    const outputPath = path.join(trimmedFolder, outputName);

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

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Running on port", PORT));
