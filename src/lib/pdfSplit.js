// src/lib/pdfSplit.js — renders every page of a PDF as a separate image
// (JPEG data URL), for the "split a multi-document PDF into per-page
// documents" flow. Client-side only; nothing here uploads anything —
// callers get back an array of page images to show on a review screen,
// same "parse locally, only send confirmed data to the backend" pattern
// as the CSV/ZIP import work.
import * as pdfjsLib from "pdfjs-dist";

// Vite-specific pattern for referencing a worker file that ships inside a
// dependency's package (not something under our own src/) — new
// URL(..., import.meta.url) lets Vite correctly resolve and bundle this
// at build time rather than needing a manually-copied public/ asset.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).href;

const MAX_PAGES = 20; // sanity cap — a driver document PDF is never realistically this long

// Returns [{ pageNum, dataUrl, blob }] — one entry per page, rendered at a
// resolution reasonable for a document photo (not full print quality,
// which would make files unnecessarily large for what's essentially an ID
// scan).
export async function splitPdfIntoPages(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

  if (pdf.numPages > MAX_PAGES) {
    throw new Error(`This PDF has ${pdf.numPages} pages — that's more than expected for a document scan (max ${MAX_PAGES}). Check the file is correct.`);
  }

  const pages = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    // scale 1.5 balances legibility against file size — enough to read
    // text on a license/ID photo without producing an oversized image
    const viewport = page.getViewport({ scale: 1.5 });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.85));
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    pages.push({ pageNum, dataUrl, blob });
  }

  return pages;
}

// Converts a page's blob into the { base64, mimeType, filename } shape
// the existing upload endpoints (addDriverDocument, bulkAddDriverDocuments)
// already expect. Uses FileReader.readAsDataURL() — the same safe pattern
// already established in src/lib/imageCompress.js — rather than manually
// iterating the byte array with String.fromCharCode, which can hit call-
// stack limits and is measurably slower on larger images.
export async function pageToUploadPayload(page, baseFilename, index) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read rendered page"));
    reader.readAsDataURL(page.blob);
  });
  return {
    base64: String(dataUrl).split(",")[1],
    mimeType: "image/jpeg",
    filename: `${baseFilename} - page ${index + 1}.jpg`,
  };
}
