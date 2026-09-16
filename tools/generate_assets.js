/**
 * Generates the PNG/ICO image assets for PUBG Food Truck.
 *
 * Pure Node -- uses only built-in `zlib` and `fs`, no dependencies.
 * Shapes are drawn at 3x and downsampled, which gives smooth edges.
 *
 * Run:  node tools/generate_assets.js
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// ---------------------------------------------------------------- palette
const C = {
  orange: [244, 123, 32, 255],
  orangeDark: [217, 99, 26, 255],
  amber: [255, 193, 7, 255],
  charcoal: [30, 35, 43, 255],
  charcoal2: [42, 48, 58, 255],
  ink: [18, 21, 26, 255],
  cream: [255, 248, 239, 255],
  creamDark: [239, 224, 203, 255],
  glass: [207, 230, 245, 255],
  teal: [72, 201, 216, 255],
  steel: [138, 148, 159, 255],
  transparent: [0, 0, 0, 0],
};

// ---------------------------------------------------------------- raster
class Raster {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8ClampedArray(w * h * 4); // transparent
  }

  blend(x, y, [r, g, b, a]) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || a === 0) return;
    const i = (y * this.w + x) * 4;
    const sa = a / 255;
    const d = this.data;
    const da = d[i + 3] / 255;
    const outA = sa + da * (1 - sa);
    if (outA === 0) {
      d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0;
      return;
    }
    d[i] = (r * sa + d[i] * da * (1 - sa)) / outA;
    d[i + 1] = (g * sa + d[i + 1] * da * (1 - sa)) / outA;
    d[i + 2] = (b * sa + d[i + 2] * da * (1 - sa)) / outA;
    d[i + 3] = outA * 255;
  }

  fill(color) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) this.blend(x, y, color);
  }

  rect(x, y, w, h, color) {
    const x0 = Math.round(x), y0 = Math.round(y);
    const x1 = Math.round(x + w), y1 = Math.round(y + h);
    for (let yy = y0; yy < y1; yy++)
      for (let xx = x0; xx < x1; xx++) this.blend(xx, yy, color);
  }

  roundRect(x, y, w, h, r, color) {
    r = Math.min(r, w / 2, h / 2);
    const x0 = Math.round(x), y0 = Math.round(y);
    const x1 = Math.round(x + w), y1 = Math.round(y + h);
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        // distance into a corner region, if any
        const dx = xx < x0 + r ? x0 + r - xx : xx > x1 - r - 1 ? xx - (x1 - r - 1) : 0;
        const dy = yy < y0 + r ? y0 + r - yy : yy > y1 - r - 1 ? yy - (y1 - r - 1) : 0;
        if (dx > 0 && dy > 0 && dx * dx + dy * dy > r * r) continue;
        this.blend(xx, yy, color);
      }
    }
  }

  circle(cx, cy, r, color) {
    const x0 = Math.floor(cx - r), x1 = Math.ceil(cx + r);
    const y0 = Math.floor(cy - r), y1 = Math.ceil(cy + r);
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        const dx = xx - cx, dy = yy - cy;
        if (dx * dx + dy * dy <= r * r) this.blend(xx, yy, color);
      }
    }
  }

  /** Axis-aligned trapezoid used for the truck cab. */
  cab(x, y, w, h, slope, color) {
    for (let yy = 0; yy < h; yy++) {
      const t = yy / h;
      const inset = Math.round(slope * (1 - t));
      this.rect(x + inset, y + yy, w - inset, 1, color);
    }
  }

  /** Box-downsample by an integer factor. */
  downsample(factor) {
    const ow = Math.round(this.w / factor);
    const oh = Math.round(this.h / factor);
    const out = new Raster(ow, oh);
    const n = factor * factor;
    for (let y = 0; y < oh; y++) {
      for (let x = 0; x < ow; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let sy = 0; sy < factor; sy++) {
          for (let sx = 0; sx < factor; sx++) {
            const i = ((y * factor + sy) * this.w + (x * factor + sx)) * 4;
            const sa = this.data[i + 3];
            r += this.data[i] * sa;
            g += this.data[i + 1] * sa;
            b += this.data[i + 2] * sa;
            a += sa;
          }
        }
        const o = (y * ow + x) * 4;
        if (a > 0) {
          out.data[o] = r / a;
          out.data[o + 1] = g / a;
          out.data[o + 2] = b / a;
        }
        out.data[o + 3] = a / n;
      }
    }
    return out;
  }
}

// ---------------------------------------------------------------- PNG encode
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePNG(raster) {
  const { w, h, data } = raster;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < w * 4; x++) {
      raw[y * (w * 4 + 1) + 1 + x] = data[y * w * 4 + x];
    }
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Wrap a 32x32 PNG in an .ico container. */
function encodeICO(pngBuffer, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  const entry = Buffer.alloc(16);
  entry[0] = size === 256 ? 0 : size;
  entry[1] = size === 256 ? 0 : size;
  entry[2] = 0;
  entry[3] = 0;
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(pngBuffer.length, 8);
  entry.writeUInt32LE(22, 12); // offset
  return Buffer.concat([header, entry, pngBuffer]);
}

// ---------------------------------------------------------------- artwork
/**
 * Draws the food truck inside the box (x, y, w, h).
 * Proportions follow a 132 x 58 design grid.
 */
function drawTruck(r, x, y, w) {
  const u = w / 132; // unit
  const px = (n) => x + n * u;
  const py = (n) => y + n * u;
  const s = (n) => n * u;

  // awning + stripes
  r.roundRect(px(0), py(8), s(100), s(9), s(4), C.orangeDark);
  for (let i = 0; i < 5; i++) {
    r.rect(px(4 + i * 20), py(8), s(10), s(9), C.amber);
  }

  // body
  r.roundRect(px(0), py(16), s(100), s(30), s(5), C.cream);
  r.rect(px(0), py(40), s(100), s(6), C.creamDark);

  // serving window
  r.roundRect(px(11), py(21), s(54), s(19), s(3), C.charcoal2);
  r.roundRect(px(14), py(24), s(48), s(13), s(2), C.teal);

  // counter
  r.roundRect(px(8), py(40), s(60), s(4), s(2), C.orange);

  // cab
  r.cab(px(100), py(24), s(32), s(22), s(10), C.charcoal2);
  r.roundRect(px(105), py(27), s(18), s(11), s(2), C.glass);

  // wheels
  const wy = py(48);
  r.circle(px(24), wy, s(10), C.ink);
  r.circle(px(24), wy, s(4), C.steel);
  r.circle(px(110), wy, s(10), C.ink);
  r.circle(px(110), wy, s(4), C.steel);
}

const SS = 3; // supersample factor

function makeIcon(size, { bg, rounded = false, inset = 0.16 } = {}) {
  const r = new Raster(size * SS, size * SS);
  const S = size * SS;
  if (bg) {
    if (rounded) r.roundRect(0, 0, S, S, S * 0.22, bg);
    else r.fill(bg);
  }
  const tw = S * (1 - inset * 2);
  drawTruck(r, (S - tw) / 2, S * 0.34, tw);
  return r.downsample(SS);
}

// ---------------------------------------------------------------- write
function write(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  console.log(`  ${(buf.length / 1024).toFixed(1).padStart(8)} KB  ${file}`);
}

const ROOT = path.resolve(__dirname, "..");
const WEB_PUB = path.join(ROOT, "frontend", "public");
const WEB_IMG = path.join(ROOT, "frontend", "src", "assets", "images");

console.log("Generating image assets...\n");

// --- Website ---
write(path.join(WEB_PUB, "logo192.png"), encodePNG(makeIcon(192, { bg: C.orange, rounded: true })));
write(path.join(WEB_PUB, "logo512.png"), encodePNG(makeIcon(512, { bg: C.orange, rounded: true })));
const fav32 = encodePNG(makeIcon(32, { bg: C.orange }));
write(path.join(WEB_PUB, "favicon.png"), fav32);
write(path.join(WEB_PUB, "favicon.ico"), encodeICO(fav32, 32));
write(path.join(WEB_IMG, "logo-truck.png"), encodePNG(makeIcon(512, { bg: C.orange, rounded: true })));

console.log("\nDone.");
