import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { MIN_IMAGE_HEIGHT_PX, MIN_IMAGE_WIDTH_PX } from "./kdpSpecs.ts";

/** Test-only helper: writes `count` blank white PNGs sized to pass validation, named "01.png".."NN.png". */
export async function writeValidTestImages(imagesDir: string, count: number): Promise<void> {
  mkdirSync(imagesDir, { recursive: true });
  for (let i = 1; i <= count; i++) {
    const fileName = `${String(i).padStart(2, "0")}.png`;
    await sharp({
      create: {
        width: MIN_IMAGE_WIDTH_PX,
        height: MIN_IMAGE_HEIGHT_PX,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .png()
      .toFile(join(imagesDir, fileName));
  }
}

export async function writeUndersizedTestImage(path: string): Promise<void> {
  await sharp({
    create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .png()
    .toFile(path);
}
