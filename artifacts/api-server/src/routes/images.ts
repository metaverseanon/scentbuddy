import { Router } from "express";
import { Jimp } from "jimp";
import { logger } from "../lib/logger";

const router = Router();

const TARGET_W = 400;
const TARGET_H = 600;
const FILL_RATIO = 0.85;
const ALPHA_THRESHOLD = 15;
const PADDING_RATIO = 0.10;
const MAX_UPSCALE = 1.5;

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

  const bottleW = maxX - minX + 1;
  const bottleH = maxY - minY + 1;

  const padX = Math.round(bottleW * PADDING_RATIO);
  const padY = Math.round(bottleH * PADDING_RATIO);

  const cropX = Math.max(0, minX - padX);
  const cropY = Math.max(0, minY - padY);
  const cropW = Math.min(w - cropX, bottleW + padX * 2);
  const cropH = Math.min(h - cropY, bottleH + padY * 2);

  src.crop({ x: cropX, y: cropY, w: cropW, h: cropH });

  const scaleW = (TARGET_W * FILL_RATIO) / cropW;
  const scaleH = (TARGET_H * FILL_RATIO) / cropH;
  const scale = Math.min(scaleW, scaleH, MAX_UPSCALE);

  const scaledW = Math.round(cropW * scale);
  const scaledH = Math.round(cropH * scale);

  src.resize({ w: scaledW, h: scaledH });

  const canvas = new Jimp({ width: TARGET_W, height: TARGET_H, color: 0x00000000 });
  const offsetX = Math.round((TARGET_W - scaledW) / 2);
  const offsetY = Math.round((TARGET_H - scaledH) / 2);

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
