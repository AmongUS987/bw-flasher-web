// bw-flasher-web — brightway.js
// Brightway DFU flasher — full state machine (UID→VER→BLE_RAND→MCU_KEY→NVM_WRITE→…)
// ScooterTeam © 2024-2025 CC BY-NC-SA 4.0

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
//  BRIGHTWAY FLASHER (DFU Protocol)
// ═══════════════════════════════════════════════════════════════════════════

const BW_STATE = {
  UID:'UID', VER_INIT:'VER_INIT', INIT:'INIT', BLE_RAND:'BLE_RAND',
  MCU_RAND:'MCU_RAND', MCU_KEY:'MCU_KEY', NVM_WRITE:'NVM_WRITE',
  SEND_FW:'SEND_FW', WR_INFO:'WR_INFO', DFU_VERIFY:'DFU_VERIFY',
  DFU_ACTIVE:'DFU_ACTIVE', VER_DONE:'VER_DONE', DONE:'DONE'
};
const PACKET_SIZE = 0x800;
const CHUNK_SIZE  = 0x80;
const CHUNKS_PER_PACKET = PACKET_SIZE / CHUNK_SIZE; // 16
const MAX_REPEATS = 20;

class BrightwayFlasher {
  constructor(serial, { simulation = false, debug = false, onLog, onStatus, onProgress, abortSignal } = {}) {
    this.serial = serial;
    this.simulation = simulation;
    this.debug = debug;
    this.log = onLog || (() => {});
    this.status = onStatus || (() => {});
    this.progress = onProgress || (() => {});
    this.abort = abortSignal || { aborted: false };

    this.state = BW_STATE.UID;
    this.prevState = BW_STATE.UID;
    this.fw = null;
    this.fwOffsets = [];
    this.uid = null;
    this.bleRand = new Uint8Array([1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]);
    this.mcuRand = null;
    this.packet = null;
    this.dataSent = new Uint8Array(0);
    this._dataSentChunks = [];
    this.totalPackets = 0;
    this.nPacketsSent = 0;

    if (simulation) this._setupSim();
  }

  _setupSim() {
    const sim = this.serial;
    const flasher = this;
    sim._onWrite = async (data) => {
      await sleep(10);
      if (flasher.state === BW_STATE.UID) {
        const uid = strToBytes("foobarfoobar1337");
        sim.injectResponse(new Uint8Array([0x64, 0x2A, 0x10, ...uid, 0x10, 0x9B]));
      } else if ([BW_STATE.VER_INIT, BW_STATE.VER_DONE].includes(flasher.state)) {
        sim.injectResponse(strToBytes("0010\r"));
      } else if (flasher.state === BW_STATE.INIT) {
        sim.injectResponse(new Uint8Array([0x6F, 0x6B, ...new Uint8Array(23), 0x0D]));
      } else if (flasher.state === BW_STATE.BLE_RAND) {
        const uid = strToBytes("foobarfoobar1337");
        const bleKey = flasher.fw
          ? signRand(uid, flasher.bleRand, flasher.fw, flasher.fwOffsets[0], flasher.fwOffsets[1])
          : new Uint8Array(16);
        sim.injectResponse(new Uint8Array([0x6F, 0x6B, 0x20, ...bleKey, 0x0D]));
      } else if (flasher.state === BW_STATE.MCU_RAND) {
        const mcuRand = crypto.getRandomValues(new Uint8Array(16));
        flasher._simMcuRand = mcuRand;
        sim.injectResponse(new Uint8Array([0x6F, 0x6B, 0x20, ...mcuRand, 0x0D]));
      } else if (flasher.state === BW_STATE.SEND_FW) {
        sim.injectResponse(new Uint8Array([0x06]));
      } else {
        sim.injectResponse(strToBytes("ok\r"));
      }
    };
  }

  loadFirmware(data) {
    this.fw = data;

    const offsets0 = findPatternOffsets('637C', data);
    if (offsets0.length !== 1) throw new Error('Invalid/unsupported firmware: expected single 637C pattern');
    const off0 = offsets0[0];

    const offsets1 = findPatternOffsets('0102', data, off0);
    if (offsets1.length !== 1) throw new Error('Invalid/unsupported firmware: expected single 0102 pattern after 637C');
    const off1 = offsets1[0] - 1;

    this.fwOffsets = [off0, off1];
    this.totalPackets = Math.ceil(data.length / PACKET_SIZE);
    this.log(`Firmware loaded: ${data.length} bytes, ${this.totalPackets} packets`, 'info');
  }

  _emitState(text) {
    if (this.prevState !== this.state) this.status(text);
    this.prevState = this.state;
  }

  _emitProgress() {
    if (this.totalPackets > 0)
      this.progress(Math.min(99, Math.floor(this.nPacketsSent / this.totalPackets * 100)));
  }

  async _send(data) {
    const bytes = (data instanceof Uint8Array) ? data : new Uint8Array(data);
    this.debugLog('TX', bytes);
    await this.serial.write(bytes);
  }

  async _recv(n, term = 0x0D, timeout = 2000) {
    const resp = await this.serial.receiveResponse(n, term, timeout);
    this.debugLog('RX', resp);
    return resp;
  }

  debugLog(label, bytes) {
    if (!this.debug) return;
    const hex = Array.from(bytes).map(b => b.toString(16).padStart(2,'0').toUpperCase()).join(' ');
    this.log(`${label}: ${hex}`, label === 'TX' ? 'tx' : 'rx');
  }

  async run() {
    if (!this.fw) throw new Error('No firmware loaded');
    while (this.state !== BW_STATE.DONE) {
      if (this.abort.aborted) throw new Error('Aborted by user');
      await this._step();
      this._emitProgress();
    }
    this._emitState(`${this.state} → Enjoy!`);
    this.progress(100);
  }

  async _step() {
    switch (this.state) {
      case BW_STATE.UID:        this._emitState('Fetching UID…');          await this._getUid();       break;
      case BW_STATE.VER_INIT:   this._emitState("Sending 'get_ver'…");     await this._getVer();       break;
      case BW_STATE.INIT:       this._emitState("Sending 'rd_info'…");     await this._sendRdInfo();   break;
      case BW_STATE.BLE_RAND:   this._emitState('Sending BLE_RAND…');      await this._sendBleRand();  break;
      case BW_STATE.MCU_RAND:   this._emitState('Requesting MCU_RAND…');   await this._reqMcuRand();   break;
      case BW_STATE.MCU_KEY:    this._emitState('Sending MCU_KEY…');       await this._sendMcuKey();   break;
      case BW_STATE.NVM_WRITE:  this._emitState('NVM Write…');             await this._sendNvmWrite(); break;
      case BW_STATE.SEND_FW:    this._emitState('Sending firmware…');      await this._sendFwPacket(); break;
      case BW_STATE.WR_INFO:    this._emitState('WR_INFO…');               await this._sendWrInfo();   break;
      case BW_STATE.DFU_VERIFY: this._emitState('Verifying DFU…');         await this._verifyDfu();    break;
      case BW_STATE.DFU_ACTIVE: this._emitState('Activating DFU…');        await this._activateDfu();  break;
      case BW_STATE.VER_DONE:   this._emitState("Final 'get_ver'…");       await this._getVer();       break;
      default: throw new Error(`Unknown state: ${this.state}`);
    }
  }

  async testConnection() {
    let retries = 0;
    while (this.state !== BW_STATE.INIT) {
      if (this.abort.aborted) throw new Error('Aborted');
      if (retries++ >= MAX_REPEATS) throw new Error('Max retries — check connection');
      if (this.state === BW_STATE.UID)      await this._getUid();
      else if (this.state === BW_STATE.VER_INIT) await this._getVer();
    }
    this.log('✓ Connection established!', 'ok');
    this.progress(100);
  }

  async _getUid() {
    const cmd = hexToBytes('532A7DAC');
    await this._send(cmd);
    const resp = await this._recv(21, 0x9B);
    if (resp.includes(0x64) && resp.includes(0x9B)) {
      const start = resp.indexOf(0x64);
      const end = resp.lastIndexOf(0x9B);
      const slice = resp.slice(start, end);
      if (slice.length >= 19 && slice[1] === cmd[1] && slice[2] === 0x10) {
        this.uid = slice.slice(3, 3 + 16);
        this.log('> Got UID: ' + bytesToAscii(this.uid));
        this.state = BW_STATE.VER_INIT;
      }
    }
  }

  async _getVer() {
    await this._send(strToBytes('down get_ver\r'));
    const resp = await this._recv(5, 0x0D, 3000);
    if (resp.length > 0 && resp[resp.length - 1] === 0x0D) {
      const ver = bytesToAscii(resp).replace(/\r.*/, '');
      if (this.state === BW_STATE.VER_INIT) {
        this.log('> MCU Version (before): ' + ver);
        this.state = BW_STATE.INIT;
      } else if (this.state === BW_STATE.VER_DONE) {
        this.log('> MCU Version (after): ' + ver);
        this.state = BW_STATE.DONE;
      }
    }
  }

  async _sendRdInfo() {
    await this._send(new Uint8Array([...strToBytes('down rd_info\r'), 0, 0, 0]));
    const resp = await this._recv(26, 0x0D, 300);
    if (startsWithOk(resp)) this.state = BW_STATE.BLE_RAND;
  }

  async _sendBleRand() {
    const expected = signRand(this.uid, this.bleRand, this.fw, this.fwOffsets[0], this.fwOffsets[1]);
    await this._send(new Uint8Array([...strToBytes('down ble_rand '), ...this.bleRand, 0x0D]));
    const resp = await this._recv(20, 0x0D);
    if (startsWithOk(resp)) {
      const bleKey = resp.slice(3, 19);
      if (this.debug) this.log('BLE_KEY: ' + toHex(bleKey), 'dbg');
      if (!this.simulation && !arrEq(bleKey, expected)) {
        throw new Error('BLE_KEY mismatch! Is the UID correct?');
      }
      this.state = BW_STATE.MCU_RAND;
    }
  }

  async _reqMcuRand() {
    await this._send(strToBytes('down mcu_rand\r'));
    const resp = await this._recv(20, 0x0D);
    if (startsWithOk(resp)) {
      this.mcuRand = resp.slice(3, 19);
      if (this.debug) this.log('MCU_RAND: ' + toHex(this.mcuRand), 'dbg');
      this.state = BW_STATE.MCU_KEY;
    }
  }

  async _sendMcuKey() {
    const mcuKey = signRand(this.uid, this.mcuRand, this.fw, this.fwOffsets[0], this.fwOffsets[1]);
    await this._send(new Uint8Array([...strToBytes('down mcu_key '), ...mcuKey, 0x0D]));
    const resp = await this._recv(3, 0x0D);
    if (arrEq(resp, strToBytes('ok\r'))) this.state = BW_STATE.NVM_WRITE;
  }

  async _sendNvmWrite() {
    const start = this.nPacketsSent * PACKET_SIZE;
    this.packet = this.fw.slice(start, start + PACKET_SIZE);
    const loc = this.nPacketsSent * PACKET_SIZE;
    const cmd = `down nvm_write ${loc.toString(16).toUpperCase().padStart(8,'0')}`;
    if (this.debug) this.log(cmd, 'dbg');
    await this._send(new Uint8Array([...strToBytes(cmd), 0x0D]));
    const resp = await this._recv(3, 0x0D, 300);
    if (resp.includes(0x6B) && resp.includes(0x0D)) this.state = BW_STATE.SEND_FW; // 'k\r'
  }

  async _sendFwPacket() {
    if (this.packet && this.packet.length > 0) {
      // Pad packet to PACKET_SIZE
      const padded = new Uint8Array(PACKET_SIZE).fill(0xFF);
      padded.set(this.packet);

      for (let n = 0; n < CHUNKS_PER_PACKET; n++) {
        if (this.abort.aborted) throw new Error('Aborted');
        const chunk = padded.slice(n * CHUNK_SIZE, (n + 1) * CHUNK_SIZE);
        const N  = (n + 1) & 0xFF;
        const N_ = (0xFF - (n + 1)) & 0xFF;
        const crcVal = crc16(chunk);
        const pkt = new Uint8Array([0x01, N, N_, ...chunk, (crcVal >> 8) & 0xFF, crcVal & 0xFF]);

        let acked = false;
        for (let rep = 0; rep < MAX_REPEATS; rep++) {
          await this._send(pkt);
          const resp = await this._recv(1, 0x06, 200);
          if (resp.length > 0 && resp[0] === 0x06) { acked = true; break; }
          if (resp.length > 0 && resp[0] === 0x15) throw new Error('CRC fail from device');
        }
        if (!acked) throw new Error(`No ACK after ${MAX_REPEATS} retries. Check adapter driver and firmware file.`);
      }
    }

    // EOT
    await this._send(new Uint8Array([0x04, 0x04, 0x04]));
    await this._recv(3, 0x06, 120); // 120ms matches Python's 0.1s serial timeout

    this.nPacketsSent++;
    // Append packet to dataSent list (avoid O(n²) realloc)
    if (this.packet && this.packet.length > 0) this._dataSentChunks.push(this.packet.slice());

    this.state = BW_STATE.WR_INFO;
  }

  async _sendWrInfo() {
    // Lazily concat all sent chunks for CRC computation
    if (this._dataSentChunks.length > 0) {
      const total = this._dataSentChunks.reduce((s, c) => s + c.length, 0);
      this.dataSent = new Uint8Array(total);
      let off = 0;
      for (const c of this._dataSentChunks) { this.dataSent.set(c, off); off += c.length; }
    }
    const crcVal = crc32(this.dataSent);
    const crcHex = crcVal.toString(16).padStart(8, '0');
    const cmd = `down wr_info ${this.nPacketsSent} ${crcHex} ${this.nPacketsSent * PACKET_SIZE}`;
    if (this.debug) this.log(cmd, 'dbg');
    await this._send(new Uint8Array([...strToBytes(cmd), 0x0D]));
    const resp = await this._recv(3, 0x0D);
    if (resp.includes(0x6B) && resp.includes(0x0D)) { // 'k\r'
      this.state = (this.packet && this.packet.length > 0) ? BW_STATE.NVM_WRITE : BW_STATE.DFU_VERIFY;
    }
  }

  async _verifyDfu() {
    await this._send(strToBytes('down dfu_verify\r'));
    const resp = await this._recv(3, 0x0D, 5000);
    if (resp.includes(0x6B)) { // 'k\r' or 'ok\r'
      if (this.debug) this.log('Firmware verified!', 'dbg');
      this.state = BW_STATE.DFU_ACTIVE;
    } else if (resp.includes(0x72)) { // 'r\r' = error
      throw new Error('DFU verify failed');
    }
  }

  async _activateDfu() {
    await this._send(strToBytes('down dfu_active\r'));
    const resp = await this._recv(3, 0x0D, 5000);
    if (resp.includes(0x6B)) {
      this.log('> Firmware update completed successfully!', 'ok');
      this.state = BW_STATE.VER_DONE;
    } else if (resp.includes(0x72)) {
      throw new Error('DFU activate failed');
    }
  }
}
