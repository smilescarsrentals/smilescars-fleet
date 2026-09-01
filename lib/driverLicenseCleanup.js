// lib/driverLicenseCleanup.js — auto-straighten and crop a photographed
// driving license so it reads as a clean scan instead of a tilted photo
// with a lot of background around it (the exact problem Ramzanali flagged
// with real examples: a small tilted card on a countertop / dark fabric).
//
// Two Claude vision passes rather than one: first detect the rotation
// angle and level the image, THEN detect the card's bounding box in the
// now-level image. Asking for both in one pass would mean re-deriving the
// bounding box's new coordinates after rotation ourselves — trigonometry
// we have no way to visually verify is correct. Two passes sidesteps that
// entirely; the extra vision call is negligible cost (Haiku).
//
// Deliberately conservative: any step that can't produce a plausible
// result (missing API key, a bounding box that doesn't look like a real
// card, a crop that would be tiny) is skipped rather than risking cutting
// off part of a real license on a bad estimate — worst case, the image
// comes out normalized/re-encoded but otherwise untouched.
import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";

const MODEL = "claude-haiku-4-5-20251001";

async function callVision(buffer, mimeType, prompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 200,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mimeType, data: buffer.toString("base64") } },
          { type: "text", text: prompt },
        ],
      }],
    });
    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) return null;
    const raw = textBlock.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const ANGLE_PROMPT = `This photo shows a driving license or ID card, possibly tilted on a surface. How many degrees would the image need to be rotated CLOCKWISE for the card and its text to sit level (horizontal)? A card whose right side is too low and needs turning counter-clockwise to level should be a NEGATIVE number. A card that's already level is 0.

Return ONLY this JSON, no other text: {"angleDegrees": <number between -45 and 45>}`;

const BBOX_PROMPT = `This photo shows a driving license or ID card against a background surface. Find the bounding box of just the card itself (not the background behind it), as fractions of the full image width and height (0 to 1), with a small margin (about 2%) so no edge of the card is cut off.

Return ONLY this JSON, no other text: {"left": <0-1>, "top": <0-1>, "width": <0-1>, "height": <0-1>}`;

export async function autoStraightenAndCropLicense(inputBuffer, mimeType) {
  // Pass 1: detect and correct rotation.
  let working;
  const angleResult = await callVision(inputBuffer, mimeType, ANGLE_PROMPT);
  const angle = angleResult && typeof angleResult.angleDegrees === "number" ? angleResult.angleDegrees : 0;
  if (Math.abs(angle) > 0.5 && Math.abs(angle) <= 45) {
    working = await sharp(inputBuffer).rotate(angle, { background: { r: 255, g: 255, b: 255 } }).jpeg({ quality: 92 }).toBuffer();
  } else {
    working = await sharp(inputBuffer).jpeg({ quality: 92 }).toBuffer(); // normalize format even when no rotation is needed
  }

  // Pass 2: detect the card's bounding box in the now-level image.
  const meta = await sharp(working).metadata();
  const bboxResult = await callVision(working, "image/jpeg", BBOX_PROMPT);

  if (bboxResult && [bboxResult.left, bboxResult.top, bboxResult.width, bboxResult.height].every((v) => typeof v === "number")) {
    const { left: l, top: t, width: w, height: h } = bboxResult;
    const plausible = w >= 0.25 && w <= 1 && h >= 0.25 && h <= 1 && l >= 0 && l < 1 && t >= 0 && t < 1;
    if (plausible) {
      const left = Math.max(0, Math.round(l * meta.width));
      const top = Math.max(0, Math.round(t * meta.height));
      const width = Math.min(meta.width - left, Math.round(w * meta.width));
      const height = Math.min(meta.height - top, Math.round(h * meta.height));
      if (width > 50 && height > 50) {
        working = await sharp(working).extract({ left, top, width, height }).jpeg({ quality: 92 }).toBuffer();
      }
    }
  }

  return working;
}
