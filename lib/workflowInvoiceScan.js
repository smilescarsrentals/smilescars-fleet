// lib/workflowInvoiceScan.js — best-effort extraction of an invoice number
// and client name from an uploaded PDF, purely for a readable card title on
// the Workflows page. This is NOT a phase-1/review-before-save flow like
// invoiceScan.js or fuelReceiptScan.js — there's nothing for a human to
// confirm here (it's a label, not a value anyone acts on financially), so
// it runs silently at upload/resubmit time and simply leaves the fields
// blank if extraction fails or the API key isn't configured. It must never
// block or fail the upload itself.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5-20251001"; // fast + cheap, well-suited to structured extraction — see product-self-knowledge

const EXTRACTION_PROMPT = `Look at this invoice PDF and extract two things as JSON, with no other text before or after the JSON:

{
  "invoiceNumber": "the invoice/reference number as printed, or null if not visible",
  "clientName": "the client/customer/bill-to name the invoice is addressed to, or null if not visible"
}

Use null rather than guessing if either isn't clearly present. Return ONLY the JSON object.`;

export async function extractWorkflowInvoiceInfo({ fileBase64, mimeType }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !fileBase64) return { invoiceNumber: "", clientName: "" };

  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: mimeType || "application/pdf", data: fileBase64 } },
          { type: "text", text: EXTRACTION_PROMPT },
        ],
      }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) return { invoiceNumber: "", clientName: "" };

    const raw = textBlock.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    const parsed = JSON.parse(raw);
    return {
      invoiceNumber: parsed.invoiceNumber || "",
      clientName: parsed.clientName || "",
    };
  } catch {
    // Extraction is a nice-to-have for the card title — never let a bad
    // scan or API hiccup block the actual upload.
    return { invoiceNumber: "", clientName: "" };
  }
}
