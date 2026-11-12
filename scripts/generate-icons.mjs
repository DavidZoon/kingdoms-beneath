// Generates the PWA icons by upscaling the 32×32 stone pickaxe (nearest neighbour) on the game background.
// Usage: node scripts/generate-icons.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "public", "assets", "stone-pickaxe.png");
const outputDir = join(root, "public", "icons");
const background = [0x17, 0x21, 0x2b, 0xff];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function decodePng(file) {
  let offset = 8;
  let header;
  let palette;
  let transparency;
  const data = [];
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString("ascii", offset + 4, offset + 8);
    const chunk = file.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      header = { width: chunk.readUInt32BE(0), height: chunk.readUInt32BE(4), depth: chunk[8], colorType: chunk[9], interlace: chunk[12] };
    } else if (type === "PLTE") palette = chunk;
    else if (type === "tRNS") transparency = chunk;
    else if (type === "IDAT") data.push(chunk);
    offset += length + 12;
  }
  const { width, height, depth, colorType, interlace } = header;
  if (depth !== 8 || interlace !== 0) throw new Error("Seuls les PNG 8 bits non entrelacés sont pris en charge.");
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  const raw = inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? pixels[y * stride + x - channels] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? pixels[(y - 1) * stride + x - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      pixels[y * stride + x] = (line[x] + predictor) & 0xff;
    }
  }
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const p = pixels.subarray(i * channels, (i + 1) * channels);
    let color;
    if (colorType === 6) color = [p[0], p[1], p[2], p[3]];
    else if (colorType === 2) color = [p[0], p[1], p[2], 255];
    else if (colorType === 4) color = [p[0], p[0], p[0], p[1]];
    else if (colorType === 0) color = [p[0], p[0], p[0], 255];
    else color = [palette[p[0] * 3], palette[p[0] * 3 + 1], palette[p[0] * 3 + 2], transparency?.[p[0]] ?? 255];
    rgba.set(color, i * 4);
  }
  return { width, height, rgba };
}

function encodePng(width, height, rgba) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc32(body), body.length + 4);
    return out;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// The sprite is scaled by an integer factor so that it fills at most `coverage` of the icon.
function renderIcon(sprite, size, coverage) {
  const scale = Math.max(1, Math.floor((size * coverage) / Math.max(sprite.width, sprite.height)));
  const offsetX = Math.floor((size - sprite.width * scale) / 2);
  const offsetY = Math.floor((size - sprite.height * scale) / 2);
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const sx = Math.floor((x - offsetX) / scale);
      const sy = Math.floor((y - offsetY) / scale);
      const inside = x >= offsetX && y >= offsetY && sx < sprite.width && sy < sprite.height;
      const s = inside ? sprite.rgba.subarray((sy * sprite.width + sx) * 4, (sy * sprite.width + sx) * 4 + 4) : null;
      const alpha = s ? s[3] / 255 : 0;
      const color = background.map((channel, c) => (c === 3 ? 255 : Math.round(s ? s[c] * alpha + channel * (1 - alpha) : channel)));
      rgba.set(color, (y * size + x) * 4);
    }
  }
  return encodePng(size, size, rgba);
}

const sprite = decodePng(readFileSync(source));
mkdirSync(outputDir, { recursive: true });
const icons = [
  ["icon-192.png", 192, 0.75],
  ["icon-512.png", 512, 0.75],
  ["maskable-512.png", 512, 0.6],
  ["apple-touch-icon.png", 180, 0.75],
];
for (const [name, size, coverage] of icons) {
  writeFileSync(join(outputDir, name), renderIcon(sprite, size, coverage));
  console.log(`public/icons/${name}`);
}
