// lib/fuelReceiptScan.js — same phase-1 philosophy as invoiceScan.js: photo
// in, structured extraction out, nothing saved or trusted until a human
// confirms it. Built for the TRA legal fuel-pump receipt format (Puma/etc)
// — printed product/litres/amount/date, with the plate handwritten in pen
// at the top since the pump itself has no idea which car it's fuelling.
// The plate field is the one genuinely unreliable part of this extraction:
// handwriting varies station to station, so callers must treat it as a
// starting guess for a picker, never as a value to save directly.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5-20251001"; // fast + cheap, well-suited to structured extraction — see product-self-knowledge

const EXTRACTION_PROMPT = `You are reading a photo of a Tanzanian fuel station pump receipt (a TRA "legal receipt" from a service station). The car's plate number is usually handwritten in pen somewhere on the receipt (often at the top) since the printed receipt itself has no plate field — read that handwriting carefully. Extract the following as JSON, with no other text before or after the JSON:

{
  "plate": "the handwritten plate number, normalized to a Tanzanian plate format like 'T 123 ABC' if legible, or null if not visible/illegible",
  "plateConfidence": "high" | "low",
  "receiptDate": "the RECEIPT DATE as printed (any format), or null if not visible",
  "product": "the fuel product as printed, e.g. 'Diesel', 'Unleaded', 'Super', or null",
  "litres": <number, the quantity of fuel dispensed (the number before the '×' in the pump line, e.g. 47.90), or null if not visible>,
  "litresConfidence": "high" | "low",
  "totalAmount": <number, the TOTAL INCL.TAX value, or null if not visible>,
  "totalAmountConfidence": "high" | "low"
}

Rules:
- The plate is handwritten and often the hardest part to read — mark plateConfidence "low" whenever the handwriting is ambiguous, could be read more than one way, or you're genuinely guessing at a character. Only use "high" when the handwriting is clean and unambiguous.
- Numbers must be plain numbers (no currency symbols, no thousands separators).
- Use TOTAL INCL.TAX for totalAmount, not TOTAL EXCL.TAX.
- If a field is illegible, unclear, or absent, use null rather than guessing.
- If the image isn't a readable fuel receipt at all, return {"plate": null, "plateConfidence": "low", "receiptDate": null, "product": null, "litres": null, "litresConfidence": "low", "totalAmount": null, "totalAmountConfidence": "low"}.
- Return ONLY the JSON object, nothing else.`;

// Accepts a base64 image (already compressed client-side) and returns the
// raw extraction for a human to review — nothing here is trusted as final.
export async function extractFuelReceiptData({ imageBase64, mimeType }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Receipt scanning isn't configured yet — missing ANTHROPIC_API_KEY.");
  if (!imageBase64) throw new Error("No image provided.");

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mimeType || "image/jpeg", data: imageBase64 } },
        { type: "text", text: EXTRACTION_PROMPT },
      ],
    }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) throw new Error("No response from the vision model.");

  const raw = textBlock.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error("Could not read a clear fuel receipt from this photo — try a clearer or better-lit shot.");
  }

  return {
    plate: parsed.plate || "",
    plateConfidence: parsed.plateConfidence === "high" ? "high" : "low",
    receiptDate: parsed.receiptDate || "",
    product: parsed.product || "",
    litres: parsed.litres != null ? Number(parsed.litres) : null,
    litresConfidence: parsed.litresConfidence === "high" ? "high" : "low",
    totalAmount: parsed.totalAmount != null ? Number(parsed.totalAmount) : null,
    totalAmountConfidence: parsed.totalAmountConfidence === "high" ? "high" : "low",
  };
}
