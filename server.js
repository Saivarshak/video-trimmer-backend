document.addEventListener("DOMContentLoaded", () => {
  const API = "https://video-trimmer-backend.onrender.com";

  // --- Elements
  const preview = document.getElementById("preview");
  const trimmedVideo = document.getElementById("trimmedvideo");
  const timelineWrap = document.getElementById("timelineWrap");
  const thumbStrip = document.getElementById("thumbStrip");
  const startHandle = document.getElementById("startHandle");
  const endHandle = document.getElementById("endHandle");
  const startBubble = document.getElementById("startBubble");
  const endBubble = document.getElementById("endBubble");

  const fileInput = document.getElementById("openFile");
  const urlInput = document.querySelector('input#loadBtn');
  const loadUrlBtn = document.querySelector('button#loadVideoBtn');
  const trimBtn = document.getElementById("trimBtn");
  const resetBtn = document.getElementById("resetBtn");
  const downloadTrimBtn = document.getElementById("downloadTrimBtn");

  if (!preview || !trimmedVideo || !timelineWrap || !startHandle || !endHandle) return;

  // --- State
  let videoDuration = 0;
  let startTime = 0;
  let endTime = 0;
  let currentFileObject = null;
  let lastUploadedFilename = null;
  let lastTrimmedUrl = null;

  const setStatus = msg => console.log("[trimmer] " + (msg || ""));

  // --- Overlay masks & selection
  const leftMask = document.createElement("div");
  const rightMask = document.createElement("div");
  const selectionOverlay = document.createElement("div");
  [leftMask, rightMask, selectionOverlay].forEach(el => {
    el.style.position = "absolute";
    el.style.top = "0";
    el.style.bottom = "0";
    el.style.pointerEvents = "none";
  });
  leftMask.style.background = rightMask.style.background = "rgba(0,0,0,0.65)";
  selectionOverlay.style.border = "4px solid rgba(0,123,255,0.95)";
  selectionOverlay.style.borderRadius = "10px";

  if (getComputedStyle(timelineWrap).position === "static") timelineWrap.style.position = "relative";
  timelineWrap.append(leftMask, rightMask, selectionOverlay);

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = sec => !isFinite(sec) ? "00:00" : `${String(Math.floor(sec/60)).padStart(2,"0")}:${String(Math.floor(sec%60)).padStart(2,"0")}`;

  function updateBubbles() {
    if (startBubble) startBubble.textContent = fmt(startTime);
    if (endBubble) endBubble.textContent = fmt(endTime);
    if (startBubble && startHandle) startBubble.style.left = (parseFloat(startHandle.style.left) + 4) + "px";
    if (endBubble && endHandle && timelineWrap) endBubble.style.left = (parseFloat(endHandle.style.left) - 40) + "px";
  }

  function updateMasks() {
    const w = timelineWrap.clientWidth || 0;
    const s = clamp(parseFloat(startHandle.style.left) || 0, 0, w);
    const e = clamp(parseFloat(endHandle.style.left) || w, 0, w);
    leftMask.style.width = s + "px";
    rightMask.style.left = e + "px";
    rightMask.style.width = (w - e) + "px";
    selectionOverlay.style.left = s + "px";
    selectionOverlay.style.width = (e - s) + "px";
    selectionOverlay.style.opacity = (e - s < 8 ? "0" : "1");
  }

  function makeDraggable(handle, isStart) {
    handle.style.position = "absolute";
    const startDrag = (clientX) => {
      const rect = timelineWrap.getBoundingClientRect();
      const startLeft = parseFloat(handle.style.left) || 0;
      const offset = clientX - (rect.left + startLeft);

      const onMove = (clientXMove) => {
        const r = timelineWrap.getBoundingClientRect();
        let x = clamp(clientXMove - r.left - offset, 0, r.width);
        if (isStart) {
          x = Math.min(x, parseFloat(endHandle.style.left) || r.width);
          startHandle.style.left = x + "px";
          startTime = (x / r.width) * videoDuration;
        } else {
          x = Math.max(x, parseFloat(startHandle.style.left) || 0);
          endHandle.style.left = x + "px";
          endTime = (x / r.width) * videoDuration;
        }
        updateMasks();
        updateBubbles();
      };

      const onMouseMove = ev => onMove(ev.clientX);
      const onTouchMove = ev => { if (ev.touches[0]) onMove(ev.touches[0].clientX); };
      const onUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onUp);
        document.removeEventListener("touchmove", onTouchMove);
        document.removeEventListener("touchend", onUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onUp);
      document.addEventListener("touchmove", onTouchMove, { passive: true });
      document.addEventListener("touchend", onUp);
    };

    handle.addEventListener("mousedown", e => { e.preventDefault(); startDrag(e.clientX); });
    handle.addEventListener("touchstart", e => { if (e.touches[0]) startDrag(e.touches[0].clientX); }, { passive: true });
  }

  makeDraggable(startHandle, true);
  makeDraggable(endHandle, false);

  function syncHandlesToTimes() {
    const w = timelineWrap.clientWidth || 0;
    startHandle.style.left = (startTime / videoDuration) * w + "px";
    endHandle.style.left = (endTime / videoDuration) * w + "px";
    updateMasks();
    updateBubbles();
  }

  // --- Upload
  async function uploadFile(file) {
    if (!file) return;
    try {
      setStatus("Uploading...");
      const fd = new FormData();
      fd.append("video", file);
      const res = await fetch(`${API}/upload`, { method: "POST", body: fd });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Upload failed");
      lastUploadedFilename = data.filename;
      setStatus("Upload complete");
    } catch (err) {
      alert("Upload failed: " + err.message);
      setStatus("Upload failed: " + err.message);
    }
  }

  // File selection
  if (fileInput) {
    fileInput.addEventListener("change", e => {
      const f = e.target.files[0];
      if (f) {
        currentFileObject = f;
        preview.src = URL.createObjectURL(f);
        preview.load();
        uploadFile(f);
      }
    });
    preview.style.cursor = "pointer";
    preview.addEventListener("click", () => fileInput.click());
  }

  // Load from URL
  if (loadUrlBtn && urlInput) {
    loadUrlBtn.addEventListener("click", async () => {
      const url = urlInput.value.trim();
      if (!url) return alert("Paste a video URL");
      try {
        const res = await fetch(url);
        const blob = await res.blob();
        const file = new File([blob], "remote.mp4", { type: blob.type || "video/mp4" });
        currentFileObject = file;
        preview.src = URL.createObjectURL(file);
        preview.load();
        uploadFile(file);
      } catch {
        preview.src = url;
        currentFileObject = null;
        alert("Server-side trimming may fail due to CORS.");
      }
    });
  }

  // --- Trim
  if (trimBtn) {
    trimBtn.addEventListener("click", async () => {
      if (!lastUploadedFilename) return alert("Upload the file first!");
      const rect = timelineWrap.getBoundingClientRect();
      const w = rect.width || 1;
      startTime = (parseFloat(startHandle.style.left) || 0) / w * videoDuration;
      endTime = (parseFloat(endHandle.style.left) || w) / w * videoDuration;
      if (startTime >= endTime) return alert("Start must be before end.");

      try {
        const fd = new FormData();
        fd.append("filename", lastUploadedFilename);
        fd.append("start", String(startTime));
        fd.append("end", String(endTime));
        const res = await fetch(`${API}/trim`, { method: "POST", body: fd });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || "Trim failed");
        lastTrimmedUrl = `${API}${data.url}`;
        trimmedVideo.src = lastTrimmedUrl;
        trimmedVideo.currentTime = 0;
        trimmedVideo.play().catch(() => {});
      } catch (err) {
        alert("Server trim failed: " + err.message);
      }
    });
  }

  // --- Reset
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      startTime = 0;
      endTime = videoDuration || 0;
      syncHandlesToTimes();
    });
  }

  // --- Download
  if (downloadTrimBtn) {
    downloadTrimBtn.addEventListener("click", async () => {
      if (!lastTrimmedUrl) return alert("No trimmed video available");
      const res = await fetch(lastTrimmedUrl);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "trimmed_video.mp4";
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  // --- Preview seek
  timelineWrap.addEventListener("click", e => {
    const rect = timelineWrap.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    preview.currentTime = pct * videoDuration;
  });

  // --- Keep masks updated
  window.addEventListener("resize", syncHandlesToTimes);
  const rafLoop = () => { updateMasks(); requestAnimationFrame(rafLoop); };
  requestAnimationFrame(rafLoop);

  // --- Preview loaded metadata
  preview.addEventListener("loadedmetadata", () => {
    videoDuration = preview.duration || 0;
    startTime = 0;
    endTime = videoDuration;
    syncHandlesToTimes();
  });
});
