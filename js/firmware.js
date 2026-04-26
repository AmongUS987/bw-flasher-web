// bw-flasher-web — firmware.js
// Firmware utilities — ZIP extraction, type detection, info parsing
// ScooterTeam © 2024-2025 CC BY-NC-SA 4.0

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
//  FIRMWARE UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

function findPatternOffsets(patternHex, data, startOffset = 0) {
  const pattern = hexToBytes(patternHex);
  const offsets = [];
  let pos = startOffset;
  while (pos <= data.length - pattern.length) {
    let found = true;
    for (let i = 0; i < pattern.length; i++) {
      if (data[pos + i] !== pattern[i]) { found = false; break; }
    }
    if (found) offsets.push(pos);
    pos++;
  }
  return offsets;
}

async function processFirmware(rawData) {
  let data = new Uint8Array(rawData);

  // Try ZIP extraction
  try {
    const zip = await JSZip.loadAsync(data);
    const names = Object.keys(zip.files);
    if (names.length > 0) {
      const preferred = names.find(n => n.startsWith('EC_ESC_Driver') || n.endsWith('.enc')) || names[0];
      const content = await zip.files[preferred].async('uint8array');
      data = content;
      logMsg(`Extracted from ZIP: ${preferred}`, 'info');
    }
  } catch (e) { /* not a zip, use raw */ }

  // Trim last 2 bytes (as in Python)
  if (data.length > 4096) {
    data = data.slice(0, data.length - 2);
  }

  return data;
}

function detectFirmwareType(data) {
  if (data.length < 0x400) return 'UNKNOWN';

  // Brightway: signature "DEPRD5C\x00" at 0x800
  if (data.length > 0x808) {
    const sig = String.fromCharCode(...data.slice(0x800, 0x808));
    if (sig === 'DEPRD5C\x00') return 'BRIGHTWAY';
  }

  // Brightway alternative: single 637C pattern after 0x1000
  if (data.length > 0x1000) {
    const offsets = findPatternOffsets('637C', data);
    if (offsets.length === 1 && offsets[0] > 0x1000) return 'BRIGHTWAY';
  }

  // LEQI: many 0xAA bytes and 0xAA 0xA2 patterns in 0x80-0x400 range
  if (data.length >= 0x400) {
    const slice = data.slice(0x80, 0x400);
    let aaCount = 0, aaA2Count = 0;
    for (let i = 0; i < slice.length; i++) {
      if (slice[i] === 0xAA) {
        aaCount++;
        if (i + 1 < slice.length && slice[i+1] === 0xA2) aaA2Count++;
      }
    }
    if (aaA2Count > 10 && aaCount > 50) return 'LEQI';
  }

  return 'UNKNOWN';
}

function getFirmwareInfo(data) {
  const type = detectFirmwareType(data);
  const info = { type, size: data.length };

  if (type === 'BRIGHTWAY') {
    if (data.length > 0x808) {
      info.signature = String.fromCharCode(...data.slice(0x800, 0x807));
    }
    info.protocol = 'DFU (Device Firmware Update)';
    const offsets = findPatternOffsets('637C', data);
    if (offsets.length > 0) info.signingOffset = `0x${offsets[0].toString(16).toUpperCase()}`;
  } else if (type === 'LEQI') {
    info.encryption = 'XOR 0xAA';
    info.protocol = 'Binary packets (5A 12 header)';
  }

  return info;
}
