// lib/invoiceScan.js — Phase 1: photo in, structured extraction out. Does
// NOT save anything yet (no Purchase Invoice row, no photo, no Supplier/
// Part matching) — that's Phase 2+. This is deliberately the smallest
// possible slice: prove Claude can read a real invoice photo reliably
// before building the supporting infrastructure around it.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5-20251001"; // fast + cheap, well-suited to structured extraction — see product-self-knowledge

const EXTRACTION_PROMPT = `You are reading a photo of a supplier invoice or receipt for a car rental company's garage/parts purchases. Extract the following as JSON, with no other text before or after the JSON:

{
  "supplierName": "the business name printed on the invoice, or null if not legible",
  "supplierNameConfidence": "high" | "low",
  "invoiceDate": "the date as printed (any format), or null if not visible",
  "invoiceDateConfidence": "high" | "low",
  "totalAmount": <number, the invoice's stated total, or null if not visible>,
  "totalAmountConfidence": "high" | "low",
  "items": [
    { "itemName": "string", "quantity": <number>, "unitPrice": <number or null>, "lineTotal": <number or null>, "confidence": "high" | "low" }
  ]
}

Rules:
- If a field is illegible, unclear, or absent, use null rather than guessing.
- Mark a field's confidence "low" whenever you had to interpret something genuinely unclear — smudged or faded print, ambiguous handwriting, a number that could be read more than one way, or anything you're filling in from partial/uncertain visual information. Use "high" only when you're reading it cleanly and directly off the page.
- quantity defaults to 1 if the invoice doesn't show a quantity for a line item.
- Numbers must be plain numbers (no currency symbols, no thousands separators).
- If the image isn't a readable invoice/receipt at all, return {"supplierName": null, "supplierNameConfidence": "low", "invoiceDate": null, "invoiceDateConfidence": "low", "totalAmount": null, "totalAmountConfidence": "low", "items": []}.
- Return ONLY the JSON object, nothing else.`;

// Accepts a base64 image (already compressed client-side, see
// src/lib/imageCompress.js) and returns the raw extraction for a human to
// review — nothing here is trusted as final. Throws with a message safe
// to show the user on any failure (missing key, bad image, malformed
// response), since the caller has nothing better to fall back to.
export async function extractInvoiceData({ imageBase64, mimeType }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Invoice scanning isn't configured yet — missing ANTHROPIC_API_KEY.");
  if (!imageBase64) throw new Error("No image provided.");

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
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

  // Claude is instructed to return only JSON, but strip any stray code
  // fences defensively — cheap insurance against an occasional
  // ```json wrapper rather than trusting the instruction alone.
  const raw = textBlock.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error("Could not read a clear invoice from this photo — try a clearer or better-lit shot.");
  }

  return {
    supplierName: parsed.supplierName || "",
    supplierNameConfidence: parsed.supplierNameConfidence === "high" ? "high" : "low",
    invoiceDate: parsed.invoiceDate || "",
    invoiceDateConfidence: parsed.invoiceDateConfidence === "high" ? "high" : "low",
    totalAmount: parsed.totalAmount != null ? Number(parsed.totalAmount) : null,
    totalAmountConfidence: parsed.totalAmountConfidence === "high" ? "high" : "low",
    items: Array.isArray(parsed.items) ? parsed.items.map((it) => ({
      itemName: it.itemName || "",
      quantity: it.quantity != null ? Number(it.quantity) : 1,
      unitPrice: it.unitPrice != null ? Number(it.unitPrice) : null,
      lineTotal: it.lineTotal != null ? Number(it.lineTotal) : null,
      confidence: it.confidence === "high" ? "high" : "low",
    })) : [],
  };
}
