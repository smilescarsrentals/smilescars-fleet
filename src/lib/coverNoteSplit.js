// src/lib/coverNoteSplit.js — slices a source PDF (which may bundle many
// cover notes back-to-back) into 2-page chunks, one per cover note, using
// real PDF page copying (pdf-lib) rather than re-rasterizing pages to
// images — keeps the original document quality and text. Runs entirely
// client-side so only small, already-split chunks are ever sent to the
// backend, never the (potentially much larger) full source file — the
// same lesson learned from the Workflows 413 fix.
import { PDFDocument } from "pdf-lib";

const MAX_SOURCE_PAGES = 60; // sanity cap — a bundle of 17 files each a handful of notes shouldn't come close

function bytesToBase64(bytes) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([bytes], { type: "application/pdf" });
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Could not encode a PDF chunk."));
    reader.readAsDataURL(blob);
  });
}

// Returns [{ pageRange, base64, filename }] — one entry per 2-page group.
// A trailing odd page (source PDF has an odd page count) becomes its own
// 1-page chunk rather than being silently dropped.
export async function splitIntoCoverNoteChunks(file) {
  const buf = await file.arrayBuffer();
  const src = await PDFDocument.load(buf);
  const pageCount = src.getPageCount();
  if (pageCount > MAX_SOURCE_PAGES) {
    throw new Error(`This PDF has ${pageCount} pages — that's more than expected (max ${MAX_SOURCE_PAGES}). Check the file is correct.`);
  }

  const baseName = file.name.replace(/\.pdf$/i, "");
  const chunks = [];
  for (let i = 0; i < pageCount; i += 2) {
    const indices = i + 1 < pageCount ? [i, i + 1] : [i];
    const chunkDoc = await PDFDocument.create();
    const copied = await chunkDoc.copyPages(src, indices);
    copied.forEach((p) => chunkDoc.addPage(p));
    const bytes = await chunkDoc.save();
    const base64 = await bytesToBase64(bytes);
    const label = indices.length === 2 ? `p${i + 1}-${i + 2}` : `p${i + 1}`;
    chunks.push({ pageRange: label, base64, filename: `${baseName} - ${label}.pdf` });
  }
  return chunks;
}
