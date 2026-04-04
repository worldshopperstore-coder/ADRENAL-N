const fs = require('fs');
const zlib = require('zlib');

// Generate proper PWA icon: orange gradient background + white lightning bolt
function createIconPNG(size) {
  const scale = size / 192;

  // Lightning bolt polygon (from SVG 192x192 viewport)
  const boltPoints = [
    [104, 28], [60, 108], [88, 108], [80, 164], [136, 76], [106, 76]
  ].map(([x, y]) => [Math.round(x * scale), Math.round(y * scale)]);

  // Rounded rect radius
  const radius = Math.round(40 * scale);

  // Create pixel buffer (RGB)
  const pixels = new Uint8Array(size * size * 3);

  // Check if point is inside rounded rect
  function inRoundedRect(x, y) {
    if (x < radius) {
      if (y < radius) return ((x - radius) ** 2 + (y - radius) ** 2) <= radius ** 2;
      if (y >= size - radius) return ((x - radius) ** 2 + (y - (size - radius - 1)) ** 2) <= radius ** 2;
    } else if (x >= size - radius) {
      if (y < radius) return ((x - (size - radius - 1)) ** 2 + (y - radius) ** 2) <= radius ** 2;
      if (y >= size - radius) return ((x - (size - radius - 1)) ** 2 + (y - (size - radius - 1)) ** 2) <= radius ** 2;
    }
    return x >= 0 && x < size && y >= 0 && y < size;
  }

  // Fill with orange-red gradient inside rounded rect
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 3;
      if (!inRoundedRect(x, y)) {
        // Transparent → use dark bg for PNG (no alpha channel)
        pixels[idx] = 9; pixels[idx + 1] = 9; pixels[idx + 2] = 11;
        continue;
      }
      // Diagonal gradient: #f97316 → #dc2626
      const t = (x + y) / (size * 2);
      pixels[idx]     = Math.round(249 + (220 - 249) * t); // R
      pixels[idx + 1] = Math.round(115 + (38 - 115) * t);  // G
      pixels[idx + 2] = Math.round(22 + (38 - 22) * t);    // B
    }
  }

  // Rasterize lightning bolt (scanline fill) — white
  for (let y = 0; y < size; y++) {
    const intersections = [];
    for (let i = 0; i < boltPoints.length; i++) {
      const [x1, y1] = boltPoints[i];
      const [x2, y2] = boltPoints[(i + 1) % boltPoints.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        const t2 = (y - y1) / (y2 - y1);
        intersections.push(Math.round(x1 + t2 * (x2 - x1)));
      }
    }
    intersections.sort((a, b) => a - b);
    for (let i = 0; i < intersections.length - 1; i += 2) {
      for (let x = intersections[i]; x <= intersections[i + 1]; x++) {
        if (x >= 0 && x < size) {
          const idx = (y * size + x) * 3;
          pixels[idx] = 255; pixels[idx + 1] = 255; pixels[idx + 2] = 255;
        }
      }
    }
  }

  // Build PNG
  const rawData = [];
  for (let y = 0; y < size; y++) {
    rawData.push(0); // filter: None
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 3;
      rawData.push(pixels[idx], pixels[idx + 1], pixels[idx + 2]);
    }
  }

  const compressed = zlib.deflateSync(Buffer.from(rawData));
  const chunks = [];
  chunks.push(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  chunks.push(makeChunk('IHDR', ihdr));
  chunks.push(makeChunk('IDAT', compressed));
  chunks.push(makeChunk('IEND', Buffer.alloc(0)));

  return Buffer.concat(chunks);
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);

  // CRC32
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < crcData.length; i++) {
    crc ^= crcData[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  crc ^= 0xFFFFFFFF;
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc >>> 0, 0);

  return Buffer.concat([len, typeBuffer, data, crcBuf]);
}

// Generate 192x192 and 512x512 icons with orange gradient + lightning bolt
const icon192 = createIconPNG(192);
const icon512 = createIconPNG(512);

fs.writeFileSync('public/icon-192.png', icon192);
fs.writeFileSync('public/icon-512.png', icon512);
console.log('Generated icon-192.png (' + icon192.length + ' bytes)');
console.log('Generated icon-512.png (' + icon512.length + ' bytes)');
