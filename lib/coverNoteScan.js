// lib/coverNoteScan.js — extracts plate(s), validity dates, insurer, and
// cover note number from a single insurance cover note (a 2-page PDF chunk
// already sliced from a larger source document). Printed insurer
// documents, not handwriting, so this should read far more reliably than
// e.g. the fuel-receipt scanner's handwritten plates — but the result is
// still only ever a starting point for the review step, never filed
// without a human confirming the plate match, per Ramzanali's call.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5-20251001"; // fast + cheap, well-suited to structured extraction — see product-self-knowledge

const EXTRACTION_PROMPT = `This is a 2-page vehicle insurance cover note. Extract the following as JSON, with no other text before or after the JSON:

{
  "plates": ["array of every vehicle registration/plate number mentioned as covered by this note — usually just one, but list all if more than one vehicle is covered"],
  "startDate": "the cover start date, as YYYY-MM-DD, or null if not visible",
  "expiryDate": "the cover expiry/end date, as YYYY-MM-DD, or null if not visible",
  "insurerName": "the insurance company's name, or null if not visible",
  "coverNoteNumber": "the cover note / policy reference number, or null if not visible"
}

Rules:
- Normalize each plate to how Tanzanian plates are usually written (e.g. "T 123 ABC" or "Z123ABC" as printed — keep the same spacing style as printed on the document, just clean up obvious OCR noise).
- Dates must be YYYY-MM-DD. If only day/month/year in another order is printed, convert it correctly.
- Use null for anything not clearly present — never guess.
- Return ONLY the JSON object, nothing else.`;

export async function extractCoverNoteInfo({ fileBase64, mimeType }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !fileBase64) return { plates: [], startDate: "", expiryDate: "", insurerName: "", coverNoteNumber: "" };

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: mimeType || "application/pdf", data: fileBase64 } },
          { type: "text", text: EXTRACTION_PROMPT },
        ],
      }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) return { plates: [], startDate: "", expiryDate: "", insurerName: "", coverNoteNumber: "" };

    const raw = textBlock.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    const parsed = JSON.parse(raw);
    return {
      plates: Array.isArray(parsed.plates) ? parsed.plates.filter(Boolean) : [],
      startDate: parsed.startDate || "",
      expiryDate: parsed.expiryDate || "",
      insurerName: parsed.insurerName || "",
      coverNoteNumber: parsed.coverNoteNumber || "",
    };
  } catch {
    // Best-effort — a failed scan just means an empty starting point for
    // the review step, never a blocked upload.
    return { plates: [], startDate: "", expiryDate: "", insurerName: "", coverNoteNumber: "" };
  }
}
