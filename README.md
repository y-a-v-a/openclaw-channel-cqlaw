# CQlaw

OpenClaw channel plugin for CW/Morse code via SDR radio and fldigi.

CQ is the universal "calling all stations" signal that opens every contact on the air. And "claw" is right there in the letters. Clean, immediately readable, references both the OpenClaw ecosystem and the most fundamental CW operation.

## Prerequisites

- [Node.js](https://nodejs.org/) v22+
- [fldigi](http://www.w1hkj.com/) (for Phase 2+)
- [RTL-SDR](https://www.rtl-sdr.com/) dongle + `librtlsdr` (for Phase 3+)

## Installation

```bash
npm install
```

Install as an OpenClaw plugin:

```bash
openclaw plugins install -l .
```

## Configuration

The plugin reads its configuration from the `openclaw.json` channel config. All fields have sensible defaults — only override what you need.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `frequency` | number | `7030000` | Frequency in Hz (7.030 MHz = 40m CW) |
| `mode` | string | `"CW"` | Operating mode |
| `fldigi.host` | string | `"127.0.0.1"` | fldigi XML-RPC host |
| `fldigi.port` | number | `7362` | fldigi XML-RPC port |
| `fldigi.pollingIntervalMs` | number | `250` | How often to poll fldigi for decoded text |
| `sdr.enabled` | boolean | `false` | Enable RTL-SDR audio pipeline |
| `sdr.device` | string | `""` | RTL-SDR device identifier |
| `sdr.sampleRate` | number | `48000` | Audio sample rate |
| `tx.enabled` | boolean | `false` | Enable transmission (requires license!) |
| `tx.inhibit` | boolean | `false` | Emergency TX kill switch |
| `tx.maxDurationSeconds` | number | `120` | Safety limit for max TX duration |
| `tx.wpm` | number | `20` | Default transmit speed (words per minute) |
| `tx.callsign` | string | `""` | Station callsign (required for TX) |
| `tx.pttMethod` | string | `"none"` | PTT method: `"cat"`, `"vox"`, `"serial"`, `"none"` |

## Development

```bash
# Type-check
npm run typecheck

# Build
npm run build

# Run tests
npm test
```

## Architecture

```
fldigi (CW decoder, XML-RPC server on :7362)
    ↑ audio input
    │
RTL-SDR → rtl_fm → virtual audio → fldigi
    │
    ↓ XML-RPC: main.get_rx_data
    │
Plugin background service (polling loop)
    │
    ↓ api.dispatchInbound({ text, peer, channel })
    │
OpenClaw Gateway → Agent session
```

## Project Structure

```
src/
  index.ts          — Plugin entry point, registers channel and service
  config.ts         — Channel configuration schema, defaults, validation
  openclaw-api.ts   — OpenClaw Gateway API type definitions
  outbound.ts       — Outbound message handler (TX stub → future fldigi TX)
  service.ts        — Background service (test message → future fldigi polling)
test/
  config.test.ts    — Config validation and defaults tests
  outbound.test.ts  — Outbound handler tests
  service.test.ts   — Background service lifecycle tests
  register.test.ts  — Plugin registration tests
```

## License

ISC
