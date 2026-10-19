const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

// CRC32 table
const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c >>> 0;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  const toCrc = Buffer.concat([typeBuf, data]);
  crcBuf.writeUInt32BE(crc32(toCrc), 0);
  return Buffer.concat([lenBuf, toCrc, crcBuf]);
}

function createPng(width, height, isMaskable = false) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);

  // Generate image data
  // Color palette:
  // Brand Indigo: #3730a3 => R: 55, G: 48, B: 163
  // White: #ffffff => R: 255, G: 255, B: 255
  // Light Indigo accent: #818cf8 => R: 129, G: 140, B: 248
  // Gold accent: #f59e0b => R: 245, G: 158, B: 11

  const rowSize = 1 + width * 4;
  const rawData = Buffer.alloc(rowSize * height);

  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * (isMaskable ? 0.45 : 0.42);
  const cornerRadius = isMaskable ? 0 : width * 0.18;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    rawData[rowOffset] = 0; // Filter type 0 (None)

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;

      // Base background
      let r = 55;
      let g = 48;
      let b = 163;
      let a = 255;

      if (!isMaskable) {
        // Rounded rectangle mask
        const dx = Math.max(0, Math.abs(x - cx) - (cx - cornerRadius));
        const dy = Math.max(0, Math.abs(y - cy) - (cy - cornerRadius));
        if (Math.hypot(dx, dy) > cornerRadius) {
          a = 0; // Transparent outside rounded corner
        }
      }

      if (a > 0) {
        // Draw decorative brand icon in center:
        // Tree / Community Person motif:
        // Central head circle: center at (cx, cy - radius * 0.3), radius: radius * 0.22
        const headDx = x - cx;
        const headDy = y - (cy - radius * 0.32);
        const headDist = Math.hypot(headDx, headDy);

        // Body arc / curve:
        const bodyDx = x - cx;
        const bodyDy = y - (cy + radius * 0.28);
        const bodyDist = Math.hypot(bodyDx * 0.8, bodyDy);

        // Left smaller node:
        const leftHeadDist = Math.hypot(x - (cx - radius * 0.45), y - (cy + radius * 0.05));
        // Right smaller node:
        const rightHeadDist = Math.hypot(x - (cx + radius * 0.45), y - (cy + radius * 0.05));

        if (headDist <= radius * 0.26) {
          // Central head - White
          r = 255; g = 255; b = 255;
        } else if (bodyDist <= radius * 0.42 && bodyDy >= 0) {
          // Body - White
          r = 255; g = 255; b = 255;
        } else if (leftHeadDist <= radius * 0.16 || rightHeadDist <= radius * 0.16) {
          // Connected branch persons - Light indigo
          r = 199; g = 210; b = 254; // #c7d2fe
        } else {
          // Tree connection branch bar
          const branchY = cy + radius * 0.05;
          if (Math.abs(y - branchY) <= radius * 0.04 && Math.abs(x - cx) <= radius * 0.45) {
            r = 165; g = 180; b = 252; // #a5b4fc
          }
        }
      }

      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const deflated = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', deflated);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

const publicDir = path.resolve(__dirname, '../public');

fs.writeFileSync(path.join(publicDir, 'pwa-icon-192.png'), createPng(192, 192, false));
fs.writeFileSync(path.join(publicDir, 'pwa-icon-512.png'), createPng(512, 512, false));
fs.writeFileSync(path.join(publicDir, 'pwa-maskable-512.png'), createPng(512, 512, true));
console.log('PWA PNG icons generated successfully in public/');
