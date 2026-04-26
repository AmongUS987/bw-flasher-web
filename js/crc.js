// bw-flasher-web — crc.js
// CRC utilities — CRC-16/XMODEM and CRC-32 (matches Python binascii)
// ScooterTeam © 2024-2025 CC BY-NC-SA 4.0

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
//  CRC UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

/** CRC-16/XMODEM (poly=0x1021, init=0, no reflection) — same as Python's crc_hqx(data, 0x0) */
function crc16(data, init = 0) {
  let crc = init & 0xFFFF;
  for (const b of data) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) {
      crc = (crc & 0x8000) ? (((crc << 1) ^ 0x1021) & 0xFFFF) : ((crc << 1) & 0xFFFF);
    }
  }
  return crc & 0xFFFF;
}

/** CRC-32 (zlib) — same as Python's binascii.crc32 */
const _crc32Table = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (const b of data) crc = _crc32Table[(crc ^ b) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
