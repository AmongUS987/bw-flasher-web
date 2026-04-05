# DO NOT USE IT FOR NOW !!! I DON'T KNOW IF IT WORKS

# bw-flasher-web

Web-based flasher for Brightway and LEQI scooter controllers over UART — runs entirely in the browser, no installation required.

![Screenshot](resources/screenshot_v0.5.3.png)

> Ported from [bw-flasher](https://github.com/scooterteam/bw-flasher) by ScooterTeam

---

## How to use

1. Download `bw-flasher-web.html`
2. Open it in Chrome, Edge, or Opera
3. Connect your USB-UART adapter
4. Select a firmware file (`.bin`)
5. Click **Connect** and then **Flash Firmware**

No Python, no pip, no installation. One file.

---

## Browser & OS support

| | Web Serial | WebUSB |
|---|---|---|
| Windows | ✅ | ✅ (requires Zadig) |
| Linux | ✅ | ✅ (requires udev rules) |
| macOS | ✅ | ✅ |
| Android (Chrome) | ❌ | ✅ |
| Firefox | ❌ | ❌ |

**Web Serial** — uses the OS driver (CH340, FT232, CP2102 appear as COM/ttyUSB). Recommended on desktop.

**WebUSB** — communicates with the adapter directly, bypassing OS drivers. Required on Android. On Windows the OS driver must be replaced with WinUSB using [Zadig](https://zadig.akeo.ie/) — this removes the device from the COM port list until you revert it.

---

## Supported hardware

**Firmware types:** Brightway (DFU protocol), LEQI (binary 5A 12 packets)

**USB-UART adapters:** CH340 / CH341A, FT232R, CP2102 / CP2104, PL2303

---

## Features

- Auto-detection of firmware type from file contents
- Simulation mode — full flash cycle without hardware
- Debug mode — verbose TX/RX hex logging
- Test Connection — verify adapter and device before flashing
- Automatic update check against GitHub releases


## 🔓 Our Principles

**You own what you buy.** If you purchased a device, you have the right to understand how it works, repair it, and modify it. Vendors should not lock you out of hardware you own.

**Knowledge should be free.** Reverse engineering findings belong in the public domain. Hoarding this information only empowers those selling black-market tools while honest users stay in the dark.

**Transparency over obscurity.** Weak encryption and absent authentication are security flaws, not secrets to protect. Documenting them pushes manufacturers toward better security.

**Personal responsibility matters.** We provide tools for research and education. What you do with them — and the consequences — are yours. Know your local laws. Prioritize safety.

**No commercial exploitation.** This work is shared freely for the community, not for building products that profit from bypassing safety features.

**This is not an invitation to break laws or endanger people. This is an assertion that understanding technology is a fundamental right.**

---

## ⚠️ Safety warning

**Modifying device firmware can be dangerous and illegal.**

- May void your warranty
- May violate local laws and regulations
- Creates serious safety risks by bypassing manufacturer safety features
- Modified devices may be illegal to operate
- You assume ALL liability for injuries, accidents, and legal consequences

**Use at your own risk. This software is for educational and research purposes only.**

---

## Disclaimer

This software is not affiliated with, endorsed by, or associated with any company. Use of this tool is entirely at your own risk, as it is provided as-is without any guarantees or warranties. The developers assume no responsibility for any damage, malfunctions, warranty voidance, or legal consequences resulting from its use. This tool is intended solely for personal use, and users are fully responsible for ensuring compliance with local laws and regulations. By using this software, you acknowledge and agree to these terms.

---

## License

[Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International](http://creativecommons.org/licenses/by-nc-sa/4.0/) — ScooterTeam © 2024-2025
