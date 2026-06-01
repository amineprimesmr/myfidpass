import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  upscaleFlyerAiBackgroundPng,
  upscaleFlyerAiBackgroundBase64,
} from "./flyer-image-upscale.js";
import { FLYER_EXPORT_WIDTH, FLYER_EXPORT_HEIGHT } from "./flyer-export-dimensions.js";

describe("flyer-image-upscale", () => {
  it("upscale un PNG portrait vers les dimensions export", async () => {
    const src = await sharp({
      create: {
        width: 1024,
        height: 1536,
        channels: 3,
        background: { r: 200, g: 50, b: 80 },
      },
    })
      .png()
      .toBuffer();

    const out = await upscaleFlyerAiBackgroundPng(src);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(FLYER_EXPORT_WIDTH);
    expect(meta.height).toBe(FLYER_EXPORT_HEIGHT);
    expect(meta.format).toBe("png");
  });

  it("upscale depuis base64", async () => {
    const src = await sharp({
      create: {
        width: 512,
        height: 768,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .png()
      .toBuffer();
    const b64 = src.toString("base64");
    const outB64 = await upscaleFlyerAiBackgroundBase64(b64);
    const meta = await sharp(Buffer.from(outB64, "base64")).metadata();
    expect(meta.width).toBe(FLYER_EXPORT_WIDTH);
    expect(meta.height).toBe(FLYER_EXPORT_HEIGHT);
  });
});
