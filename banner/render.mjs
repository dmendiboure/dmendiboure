// Renders banner.html frame by frame in headless Chromium and encodes the frames as a looping GIF.
// Usage: npm run build            → ../assets/banner.gif
//        node render.mjs --still  → frames/still.png, one frame to check the framing

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import gifenc from "gifenc";
import { chromium } from "playwright";
import { PNG } from "pngjs";

const { GIFEncoder, applyPalette, quantize } = gifenc;

const here = dirname(fileURLToPath(import.meta.url));
const width = 1000;
const height = 300;
const fontSize = 104;
const fps = 12;
const seconds = 6; // the loop's length
const fade = 1.5; // how long the end fades into the start
const start = 4; // a moment where the fields have settled into a good spread
const speed = 1.6; // the site's motion, sped up so a short loop still shows it moving

const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(join(here, "banner.html")).href);
await page.waitForFunction(() => typeof window.setup === "function");
await page.evaluate(([w, h, size]) => window.setup(w, h, { fontSize: size }), [width, height, fontSize]);
const stage = page.locator("#stage");

const capture = async (t) => {
  await page.evaluate((time) => window.frame(time), t);
  return PNG.sync.read(await stage.screenshot({ type: "png" })).data;
};

mkdirSync(join(here, "frames"), { recursive: true });

if (process.argv.includes("--still")) {
  const png = new PNG({ width, height });
  png.data = await capture(start);
  writeFileSync(join(here, "frames", "still.png"), PNG.sync.write(png));
  await browser.close();
  process.exit(0);
}

// Frame i shows time t. During the first `fade` seconds it is a crossfade, pixel by pixel, from the frame one
// loop later to it: the first frame is exactly where the last one was heading, so the loop never jumps.
const count = Math.round(seconds * fps);
const frames = [];
for (let i = 0; i < count; i++) {
  const t = i / fps;
  const frame = await capture(start + t * speed);
  const mix = t < fade ? 1 - t / fade : 0;
  const weight = mix * mix * (3 - 2 * mix);
  if (weight > 0) {
    const later = await capture(start + (t + seconds) * speed);
    for (let p = 0; p < frame.length; p++) frame[p] = Math.round(frame[p] + (later[p] - frame[p]) * weight);
  }
  frames.push(frame);
  process.stdout.write(`\rframe ${i + 1}/${count}`);
}
await browser.close();

// The seam, checked: the step from the last frame back to the first should be no bigger than any other step.
const step = (a, b) => a.reduce((sum, value, p) => sum + Math.abs(value - b[p]), 0) / a.length;
const steps = frames.slice(1).map((frame, i) => step(frames[i], frame));
console.log(`\nseam ${step(frames.at(-1), frames[0]).toFixed(2)}, largest step ${Math.max(...steps).toFixed(2)}`);

// One palette for the whole loop, so a pixel that does not change keeps its index and costs almost nothing.
const sample = new Uint8Array(frames.length * 4000 * 4);
for (let f = 0; f < frames.length; f++) {
  for (let s = 0; s < 4000; s++) {
    const pixel = Math.floor(Math.random() * width * height) * 4;
    sample.set(frames[f].subarray(pixel, pixel + 4), (f * 4000 + s) * 4);
  }
}
// The last index is kept free for transparency: after the first frame, a pixel whose colour has not changed is
// left transparent, so the frame below shows through and the long runs of it compress to almost nothing.
const palette = quantize(sample, 255, { format: "rgb565" });
while (palette.length < 256) palette.push([0, 0, 0]);
const clear = 255;
const tolerance = 16 * 16;

const gif = GIFEncoder();
const delay = Math.round(1000 / fps);
// The tolerance lets small differences pile up, and the first frame is drawn whole when the GIF starts again,
// so it eases to nothing over the loop's last second: the last frame matches its colours exactly.
const settle = fps;
let shown = null;
for (const [i, data] of frames.entries()) {
  const allowed = tolerance * Math.min(1, (count - 1 - i) / settle);
  const index = applyPalette(data, palette, "rgb565");
  if (!shown) {
    shown = index.slice();
    gif.writeFrame(index, width, height, { palette, delay, repeat: 0 });
    continue;
  }
  // A colour within a few levels of what is already shown counts as unchanged: the eye cannot tell under the
  // grain, and it is what keeps the file small.
  for (let p = 0; p < index.length; p++) {
    const [r, g, b] = palette[shown[p]];
    const dr = data[p * 4] - r;
    const dg = data[p * 4 + 1] - g;
    const db = data[p * 4 + 2] - b;
    if (index[p] === shown[p] || dr * dr + dg * dg + db * db < allowed) index[p] = clear;
    else shown[p] = index[p];
  }
  gif.writeFrame(index, width, height, { delay, transparent: true, transparentIndex: clear, dispose: 1 });
}
gif.finish();

const out = join(here, "..", "assets", "banner.gif");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, gif.bytes());
console.log(`\n${out}: ${(gif.bytes().length / 1024 / 1024).toFixed(2)} MB`);
