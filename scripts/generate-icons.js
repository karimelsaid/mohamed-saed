const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Create a valid 32x32 RGBA PNG file
function createPngBuffer(width, height) {
  // PNG signature
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

  // IHDR chunk: 13 bytes
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth: 8
  ihdrData.writeUInt8(6, 9); // color type: 6 (RGBA)
  ihdrData.writeUInt8(0, 10); // compression
  ihdrData.writeUInt8(0, 11); // filter
  ihdrData.writeUInt8(0, 12); // interlace: 0

  const ihdrChunk = createChunk('IHDR', ihdrData);

  // Raw uncompressed image data with filter byte 0 at start of each scanline
  // Draw royal blue / gold themed suit icon pixels
  const rowBytes = 1 + width * 4;
  const rawData = Buffer.alloc(rowBytes * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowBytes;
    rawData[rowOffset] = 0; // Filter: None
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      // Draw a neat gold bowtie and tuxedo silhouette on dark background
      const isGold = (y >= 10 && y <= 14 && x >= 10 && x <= 22) || (y >= 15 && y <= 26 && Math.abs(x - 16) <= (y - 12) / 2);
      if (isGold) {
        rawData[pixelOffset] = 212;     // R (Gold)
        rawData[pixelOffset + 1] = 175; // G
        rawData[pixelOffset + 2] = 55;  // B
        rawData[pixelOffset + 3] = 255; // A
      } else {
        rawData[pixelOffset] = 18;      // R (Dark Navy)
        rawData[pixelOffset + 1] = 24;  // G
        rawData[pixelOffset + 2] = 38;  // B
        rawData[pixelOffset + 3] = 255; // A
      }
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idatChunk = createChunk('IDAT', compressedData);
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);

  const crcBuf = Buffer.alloc(4);
  const crc = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crc, 0);

  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// Simple CRC32 implementation
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i];
    crc = crc ^ byte;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Create valid ICO file containing the PNG image
function createIcoBuffer(pngBuffer, width, height) {
  // ICO Header: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved: 0
  header.writeUInt16LE(1, 2); // Image type: 1 = ICO
  header.writeUInt16LE(1, 4); // Number of images: 1

  // ICO Directory Entry: 16 bytes
  const dirEntry = Buffer.alloc(16);
  dirEntry.writeUInt8(width === 256 ? 0 : width, 0);   // Width
  dirEntry.writeUInt8(height === 256 ? 0 : height, 1); // Height
  dirEntry.writeUInt8(0, 2);                          // Colors (0 for >= 8bpp)
  dirEntry.writeUInt8(0, 3);                          // Reserved
  dirEntry.writeUInt16LE(1, 4);                       // Color planes
  dirEntry.writeUInt16LE(32, 6);                      // Bits per pixel
  dirEntry.writeUInt32LE(pngBuffer.length, 8);        // Image size
  dirEntry.writeUInt32LE(22, 12);                     // Offset to image data (6 + 16 = 22)

  return Buffer.concat([header, dirEntry, pngBuffer]);
}

// Generate assets
const resourcesDir = path.join(__dirname, '..', 'build-resources');
if (!fs.existsSync(resourcesDir)) fs.mkdirSync(resourcesDir, { recursive: true });

const png32 = createPngBuffer(32, 32);
const ico32 = createIcoBuffer(png32, 32, 32);

fs.writeFileSync(path.join(resourcesDir, 'icon.png'), png32);
fs.writeFileSync(path.join(resourcesDir, 'icon.ico'), ico32);

console.log('✓ Created build-resources/icon.png (32x32 RGBA PNG)');
console.log('✓ Created build-resources/icon.ico (Windows Icon)');

