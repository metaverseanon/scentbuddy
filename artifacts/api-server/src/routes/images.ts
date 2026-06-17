import { Router } from "express";
import { Jimp } from "jimp";
import { logger } from "../lib/logger";

const router = Router();

const TARGET_W = 400;
const TARGET_H = 600;
const ALPHA_THRESHOLD = 15;
// Every bottle is scaled so its visible HEIGHT fills this fraction of the
// canvas. Height-based (not bounding-box-fit) scaling is what makes bottles of
// different shapes look the same size standing on a shelf.
const CONTENT_HEIGHT_RATIO = 0.86;
// A wide item (e.g. a bottle photographed next to its box) is allowed to take
// at most this fraction of the width; if it would exceed it, we scale down so
// it never overflows the canvas.
const MAX_CONTENT_WIDTH_RATIO = 0.92;
// No bottom margin: the bottle base sits flush against the canvas bottom edge
// so that, when rendered bottom-aligned in the shelf, bottles visually "stand"
// directly on the shelf line instead of floating above it.
const BOTTOM_MARGIN_RATIO = 0;
// Allow upscaling small/low-res bottles enough to reach a uniform height.
// Capped to avoid extreme blur.
const MAX_UPSCALE = 3.0;

async function normalizeBottleImage(base64Input: string): Promise<string> {
  const buffer = Buffer.from(base64Input, "base64");
  const src = await Jimp.fromBuffer(buffer);

  const w = src.bitmap.width;
  const h = src.bitmap.height;

  let minX = w, maxX = 0, minY = h, maxY = 0;
  let foundPixels = false;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const alpha = src.bitmap.data[idx + 3];
      if (alpha > ALPHA_THRESHOLD) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        foundPixels = true;
      }
    }
  }

  if (!foundPixels) {
    logger.warn("[NORMALIZE] No non-transparent pixels found, returning original");
    return base64Input;
  }

  // Crop tightly to the actual bottle (no padding) so we control the final
  // height precisely.
  const bottleW = maxX - minX + 1;
  const bottleH = maxY - minY + 1;
  src.crop({ x: minX, y: minY, w: bottleW, h: bottleH });

  // Scale by height first; clamp by width for wide items; cap the upscale.
  const targetContentH = TARGET_H * CONTENT_HEIGHT_RATIO;
  const maxContentW = TARGET_W * MAX_CONTENT_WIDTH_RATIO;
  const scale = Math.min(
    targetContentH / bottleH,
    maxContentW / bottleW,
    MAX_UPSCALE,
  );

  const scaledW = Math.max(1, Math.round(bottleW * scale));
  const scaledH = Math.max(1, Math.round(bottleH * scale));

  src.resize({ w: scaledW, h: scaledH });

  const canvas = new Jimp({ width: TARGET_W, height: TARGET_H, color: 0x00000000 });
  const bottomMargin = Math.round(TARGET_H * BOTTOM_MARGIN_RATIO);
  // Horizontally centered, bottom-aligned (bottles stand on the shelf).
  const offsetX = Math.round((TARGET_W - scaledW) / 2);
  const offsetY = Math.max(0, TARGET_H - bottomMargin - scaledH);

  canvas.composite(src, offsetX, offsetY);

  const outBuffer = await canvas.getBuffer("image/png");
  return outBuffer.toString("base64");
}

router.post("/images/normalize", async (req, res) => {
  try {
    const { base64 } = req.body as { base64?: string };
    if (!base64) {
      res.status(400).json({ error: "base64 is required" });
      return;
    }

    logger.info("[NORMALIZE] Normalizing bottle image");
    const normalized = await normalizeBottleImage(base64);
    logger.info("[NORMALIZE] Done");

    res.json({ base64: normalized });
  } catch (err) {
    logger.error({ err }, "[NORMALIZE] Error normalizing image");
    res.status(500).json({ error: "Failed to normalize image" });
  }
});

export default router;
