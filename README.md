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
| `qrz.username` | string | `""` | QRZ XML API username (optional, for callsign enrichment) |
| `qrz.password` | string | `""` | QRZ XML API password or key (optional, can be provided via env var) |

Environment variable overrides (useful for secrets and deployment):

- `CQLAW_TX_CALLSIGN` (or `OPENCLAW_TX_CALLSIGN`)
- `CQLAW_QRZ_USERNAME`
- `CQLAW_QRZ_PASSWORD`
- `CQLAW_FREQUENCY`, `CQLAW_MODE`
- `CQLAW_FLDIGI_HOST`, `CQLAW_FLDIGI_PORT`, `CQLAW_FLDIGI_POLLING_INTERVAL_MS`
- `CQLAW_SDR_ENABLED`, `CQLAW_SDR_DEVICE`, `CQLAW_SDR_SAMPLE_RATE`
- `CQLAW_TX_ENABLED`, `CQLAW_TX_INHIBIT`, `CQLAW_TX_MAX_DURATION_SECONDS`, `CQLAW_TX_WPM`, `CQLAW_TX_PTT_METHOD`

## Development

```bash
# Type-check
npm run typecheck

# Build
npm run build

# Run tests
npm test
```

For testing with fldigi and virtual audio (no radio hardware needed), see the full **[Development Guide](docs/development.md)** — covers fldigi installation, virtual audio setup, and the WAV-to-decode pipeline.

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
  index.ts            — Plugin entry point, registers channel and service
  config.ts           — Channel configuration schema, defaults, validation
  openclaw-api.ts     — OpenClaw Gateway API type definitions
  outbound.ts         — Outbound message handler (wired TX path via Transmitter)
  service.ts          — Background service (fldigi polling + inbound enrichment)
  xmlrpc.ts           — Zero-dependency XML-RPC client (Node built-in http)
  fldigi-client.ts    — Typed wrapper for fldigi's XML-RPC API
  fldigi-poller.ts    — Polling loop: fldigi → SentenceBuffer → callsign → dispatch
  sentence-buffer.ts  — Accumulates decoded CW, flushes on prosign or silence
  callsign.ts         — Amateur radio callsign pattern extraction
scripts/
  play-wav-to-fldigi.sh — Play a WAV into fldigi via virtual audio, show decoded text
docs/
  development.md      — Full dev setup guide (fldigi, virtual audio, testing workflow)
```

## License

ISC
