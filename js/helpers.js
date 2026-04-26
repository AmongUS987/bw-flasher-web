// bw-flasher-web — helpers.js
// Utility helpers — sleep, hex conversions, byte array utilities
// ScooterTeam © 2024-2025 CC BY-NC-SA 4.0

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function hexToBytes(hex) {
  const h = hex.replace(/\s/g, '');
  const arr = new Uint8Array(h.length / 2);
  for (let i = 0; i < h.length; i += 2) arr[i/2] = parseInt(h.substring(i, 2+i), 16);
  return arr;
}
function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ');
}
function strToBytes(s) { return new TextEncoder().encode(s); }
function bytesToAscii(bytes) { return new TextDecoder('ascii', {fatal: false}).decode(bytes); }
function startsWithOk(bytes) { return bytes.length >= 2 && bytes[0] === 0x6F && bytes[1] === 0x6B; }
function arrEq(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
// Add includes to Uint8Array
Uint8Array.prototype.includes = function(val) {
  for (const b of this) if (b === val) return true; return false;
};
Uint8Array.prototype.indexOf = function(val) {
  for (let i = 0; i < this.length; i++) if (this[i] === val) return i; return -1;
};
Uint8Array.prototype.lastIndexOf = function(val) {
  for (let i = this.length - 1; i >= 0; i--) if (this[i] === val) return i; return -1;
};
