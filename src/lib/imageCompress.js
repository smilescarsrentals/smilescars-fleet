// src/lib/imageCompress.js
// Shrinks a camera photo before it goes up to the API.
//
// Uploads used to land in Google Drive, which didn't care how big they were.
// They now travel through a serverless function (hard ~4.5 MB request cap) and
// are stored in Postgres, so a raw 8 MB phone photo would simply fail. A
// licence photo only needs to be readable, so 1600px at JPEG quality 0.82 is
// plenty — that lands around 200-400 KB.

const MAX_DIMENSION = 1600;
const QUALITY = 0.82;

// Returns { base64, mimeType, filename } ready for uploadBlacklistImage.
// Anything that isn't a raster image the browser can decode (a PDF, a HEIC on
// an unsupported browser) is passed through untouched.
export async function compressImage(file, { maxDimension = MAX_DIMENSION, quality = QUALITY } = {}) {
  const readAsDataUrl = () =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error("Could not read the selected file."));
      r.readAsDataURL(file);
    });

  const dataUrl = await readAsDataUrl();
  const passthrough = {
    base64: String(dataUrl).split(",")[1],
    mimeType: file.type || "application/octet-stream",
    filename: file.name,
  };
  if (!/^image\//.test(file.type) || /svg/.test(file.type)) return passthrough;

  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("decode failed"));
      i.src = dataUrl;
    });

    const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
    // Already small enough and already a JPEG — re-encoding would only lose quality.
    if (scale === 1 && file.type === "image/jpeg") return passthrough;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // JPEG has no alpha; without this, transparency turns black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const out = canvas.toDataURL("image/jpeg", quality);
    const base64 = out.split(",")[1];
    if (!base64 || base64.length >= passthrough.base64.length) return passthrough; // no win, keep the original
    return {
      base64,
      mimeType: "image/jpeg",
      filename: file.name.replace(/\.[^.]+$/, "") + ".jpg",
    };
  } catch {
    return passthrough; // never block an upload because compression failed
  }
}
