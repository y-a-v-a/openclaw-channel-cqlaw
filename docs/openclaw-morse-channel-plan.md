# OpenClaw Morse Radio Channel Plugin

## Implementation Plan

A channel plugin for OpenClaw that receives (and optionally transmits) Morse code via SDR radio, using fldigi as the signal decoder. The agent gets a new communication surface: shortwave radio.

---

## Phase 1 — Scaffold the OpenClaw Channel Plugin

**Goal**: A working channel plugin that accepts hardcoded test strings, proving the integration path with the gateway before any radio hardware enters the picture.

### Deliverables

- Project scaffolded with TypeScript, `openclaw.plugin.json` manifest, and `package.json` with `openclaw.extensions` entry
- `register()` function that calls `api.registerChannel()` with a `morse-radio` channel definition
- `outbound.sendText` handler that logs agent responses (placeholder for future CW transmission)
- A background service stub (registered via `api.registerService()`) that will later host the fldigi bridge
- Inbound message dispatch: the service pushes a hardcoded test string (`"CQ CQ DE PI4ABC"`) into the gateway session on startup, confirming end-to-end message flow
- Channel config structure in `openclaw.json` with account for frequency, mode, and fldigi connection settings
- Install via `openclaw plugins install -l .` and verify in gateway logs

### Key decisions

- Channel capabilities: `direct` chat type only (no groups — radio is inherently broadcast but we model it as a 1:1 session per frequency)
- The plugin runs inside the gateway process; fldigi runs as a separate OS process, bridged via its XML-RPC API

---

## Phase 2 — Fldigi Integration (Receive Path)

**Goal**: Replace the hardcoded test string with live decoded Morse text from fldigi's XML-RPC interface.

### Prerequisites

- fldigi installed and configured for CW mode (`brew install fldigi` on macOS, `apt install fldigi` on Linux)
- Audio input routed from SDR (or a test WAV file via virtual audio device for development)
- fldigi's XML-RPC server enabled (default port 7362)

### Deliverables

- XML-RPC client in TypeScript that connects to fldigi's `main.get_rx_data` method (or `text.get_rx` depending on version)
- Polling loop in the background service: periodically reads decoded text from fldigi's receive buffer
- Sentence buffering logic: accumulate characters, detect word boundaries (fldigi handles dit/dah timing internally), and flush complete words or sentences to the gateway as inbound messages
- Configurable polling interval (e.g., 250ms) and flush threshold (e.g., flush after 3 seconds of silence or on prosign detection like `AR` or `SK`)
- Callsign extraction: optionally parse the decoded stream for standard CQ/callsign patterns and tag the session peer accordingly
- Error handling: reconnect logic if fldigi is restarted, graceful degradation if XML-RPC is unavailable

### Architecture

```
fldigi (CW decoder, XML-RPC server on :7362)
    ↑ audio input
    │
RTL-SDR → rtl_fm → pulseaudio/virtual cable → fldigi
    │
    ↓ XML-RPC: main.get_rx_data
    │
Plugin background service (polling loop)
    │
    ↓ api.dispatchInbound({ text, peer, channel })
    │
OpenClaw Gateway → Agent session
```

### Development shortcut

For testing without hardware, pipe a WAV recording of Morse code through a virtual audio device (e.g., BlackHole on macOS, PulseAudio null sink on Linux) into fldigi. This lets you iterate on the plugin without touching an SDR dongle.

---

## Phase 3 — SDR Audio Pipeline

**Goal**: Wire up the RTL-SDR dongle so fldigi receives live radio audio, completing the receive chain.

### Prerequisites

- RTL-SDR dongle (RTL2832U-based, ~€25)
- `librtlsdr` installed (`brew install librtlsdr` / `apt install rtl-sdr`)
- Frequency and mode known (e.g., 7.030 MHz USB for 40m CW band)

### Deliverables

- `rtl_fm` spawned as a child process from the plugin service, piping demodulated audio to fldigi's audio input
- Command construction: `rtl_fm -f 7030000 -M usb -s 48000 -r 48000 | ...` routed into fldigi via virtual audio or direct pipe
- Frequency configuration exposed in `openclaw.json` channel config so the agent (or user) can tune to different bands
- Signal quality metadata: optionally read fldigi's S/N ratio via XML-RPC and include it in the inbound message context
- Process lifecycle management: start/stop `rtl_fm` when the channel is enabled/disabled, handle USB disconnect gracefully

### Optional: multi-frequency scanning

Spawn multiple `rtl_fm` instances or use `rtl_power` to scan a range, switching fldigi's input when CW activity is detected. This is a nice-to-have for autonomous frequency hunting by the agent.

---

## Phase 4 — Transmit Path (Outbound)

**Goal**: The agent can send Morse code back over radio. This is where it gets truly wild.

### Prerequisites

- A transmitter or transceiver (e.g., QRP rig) connected to the system
- A valid amateur radio license (required in all jurisdictions for transmission)
- fldigi configured for TX with appropriate audio routing to the rig

### Deliverables

- `outbound.sendText` implementation: convert the agent's text response to Morse via fldigi's `main.tx_text` XML-RPC method
- fldigi handles the text-to-CW conversion and keying — we just push text into its TX buffer
- PTT (push-to-talk) control: either via fldigi's CAT/RIG control, VOX, or a serial DTR/RTS line
- Safety guards: max TX duration, TX inhibit flag in config, confirmation prompt before first transmission
- WPM (words per minute) configuration matching the receive speed

### Regulatory note

Automated transmission on amateur bands has specific rules that vary by country. In most jurisdictions, the control operator must be present and able to shut down transmission at any time. The plugin should make this easy — a `/stop-tx` command or kill switch in the OpenClaw Control UI.

---

## Phase 5 — Agent Intelligence

**Goal**: Make the agent actually useful as a radio operator, not just a dumb pipe. This phase turns raw decoded text into structured knowledge and gives the agent the domain fluency to participate in the CW operating world.

### Background: How CW Conversations Work

Morse code (CW) conversations on amateur radio follow rigid conventions evolved over 100+ years. They're essentially a text protocol with their own vocabulary, abbreviations, and handshake patterns — think of it as HTTP for humans with telegraph keys.

A typical CW conversation (QSO) looks like this:

```
Station A:  CQ CQ CQ DE PA3XYZ PA3XYZ K
            ("Calling anyone, this is PA3XYZ, go ahead")

Station B:  PA3XYZ DE DL2ABC DL2ABC K
            ("PA3XYZ, this is DL2ABC, go ahead")

Station A:  DL2ABC DE PA3XYZ GM UR RST 599 599 NAME VINCENT VINCENT
            QTH AMSTERDAM AMSTERDAM HW? K
            ("Good morning, your signal report is 599, my name is
             Vincent, I'm in Amsterdam, how copy?")
```

The whole thing is heavily abbreviated. **Q-codes** are three-letter shorthands dating back to 1912: QTH means "my location is", QSL means "I confirm receipt", QRZ means "who is calling me?". **Prosigns** are procedural signals: K means "go ahead", SK means "end of contact", AR means "end of message". **RST** is a signal quality report (readability, strength, tone) — 599 means "perfect copy".

**Contests** are timed competitive events where operators try to contact as many stations as possible. The exchanges become even more formulaic — often just a callsign, signal report, and a serial number or zone code. Thousands of stations participate simultaneously across bands.

### 5a. Protocol Understanding (SOUL.md)

The agent needs a system prompt (SOUL.md in OpenClaw terms) that teaches it CW operating conventions. Not just the codes, but the *flow* — when to send K vs KN, when a QSO is ending, what "599 TU" means in a contest context versus a casual chat. This is prompt engineering, not code. The LLM already understands natural language — you're giving it a phrasebook and etiquette guide for a very specific subculture.

Deliverables:

- SOUL.md section covering Q-codes, prosigns, standard QSO flow, and contest exchange formats
- Examples of complete QSOs at different formality levels (contest, casual, DX)
- Guidance on when the agent should and shouldn't respond (e.g., don't reply to a CQ unless the transmit path is active and the operator has enabled auto-reply)

### 5b. Contact Logging

Every ham radio contact gets logged — callsign, date/time, frequency, signal report, name, location. This is legally required in many countries and practically universal. The agent parses the decoded conversation and extracts structured fields into an **ADIF file** (Amateur Data Interchange Format — the standard ham radio log format, basically a flat-text key-value format from the 90s, trivially parseable).

This is where the agent's pattern recognition shines: messy, noisy decoded text with errors, and the agent can still figure out the callsign was `DL2ABC` even if fldigi decoded it as `DL2AB?`.

Deliverables:

- ADIF file writer (simple text format: `<CALL:6>DL2ABC <BAND:3>40m <MODE:2>CW <RST_SENT:3>599 ...`)
- Structured extraction of: callsign, RST sent/received, name, QTH, frequency, timestamp
- Dupe detection: flag if the same station has already been worked on the same band
- Optional integration with logging software (e.g., export to Cloudlog or Log4OM via API)

### 5c. QRZ.com Callsign Lookup

QRZ.com is the phone book for ham radio. Every callsign maps to a name, location, and often a bio. The agent uses this as an OpenClaw tool — when it hears a new callsign, it looks it up and knows it's talking to "Hans in Munich" before the other station even says so.

Deliverables:

- OpenClaw tool plugin hitting the QRZ XML API (requires a QRZ.com account)
- Automatic lookup triggered when a new callsign is detected in the decoded stream
- Context enrichment: the agent knows the other station's name, country, grid square, and license class before the QSO even starts

### 5d. Propagation Awareness

Radio propagation depends on ionospheric conditions, solar activity, time of day, and season. A frequency that reaches Japan at noon might only reach 200km at midnight. Services like hamqsl.com and PSKReporter provide real-time propagation data.

Deliverables:

- Tool plugin for propagation data (Solar Flux Index, K-index, band condition forecasts)
- PSKReporter integration: see which stations are currently being heard on which bands
- Agent can suggest band changes: "20 meters is open to North America right now" — something a human operator does by experience, but an agent can do by data

### 5e. Contest Operation

This is arguably the killer use case. Contests are *extremely* repetitive and formulaic. The exchange is the same every time, the pace is fast, and accuracy matters. An agent that can decode, log, and respond in contest format would be a legitimate operating assistant.

The agent wouldn't replace the operator (regulations require a licensed human in control), but it could handle the bookkeeping, dupe-checking, and multiplier tracking (contests award bonus points for new countries/zones).

Deliverables:

- Contest profiles for popular events: CQ WW, ARRL Field Day, CQ WPX, IARU HF Championship
- Each profile defines the expected exchange format (e.g., RST + zone, RST + serial number, RST + state)
- Real-time scoring: calculate points, track multipliers, flag new countries/zones
- Dupe sheet: instant detection of already-worked stations per band
- Rate display: contacts per hour, projected final score

### 5f. Error Correction and Context

Real CW decoding is noisy. Fldigi will produce garbled text, especially on weak signals or crowded bands. The agent can use contextual understanding to clean this up — if it sees `PA3X?Z` it can infer from the QRZ database and the conversation flow that this is probably `PA3XYZ`.

Deliverables:

- Fuzzy callsign matching against QRZ database when decode confidence is low
- Contextual reconstruction: if the RST field decoded as `5?9`, it's almost certainly `599` (the most common report)
- Confidence scoring on extracted fields: flag uncertain data in the log for human review
- Learning from repetition: CW operators typically send their callsign multiple times — the agent aggregates across repetitions to build confidence

---

## Testing Strategy

The entire pipeline is deterministic given a known input signal, making this project unusually testable for something involving radio hardware. WAV files with known Morse content serve as the foundational test fixtures across all layers.

### Generating Test Fixtures

Morse code is mathematically precise: a tone at a fixed frequency (typically 700 Hz) with exact on/off timing. At 20 WPM, a dit is 60ms, a dah is 180ms, inter-element gap is 60ms, inter-character gap is 180ms, inter-word gap is 420ms. This means any test WAV can be generated programmatically with basic PCM audio writing — pure sine wave math, no hardware, no external tools.

A fixture generator script produces WAV files from plain text:

- `"CQ CQ DE PA3XYZ K"` → clean 599 signal, no noise
- Same content with additive white noise at various S/N ratios → simulated weak signals
- Two overlapping Morse signals at different pitches → QRM (interference) scenarios
- Signal with periodic amplitude fading → QSB (fading) simulation

The ham radio community also shares real-world recordings of CW signals at various quality levels, which can supplement the synthetic fixtures for realistic edge cases.

### Test Layers

**Unit tests — Sentence buffer and message dispatch**

The plugin's polling loop, sentence buffer, and character accumulation logic are pure functions that don't depend on fldigi or audio. Feed in text chunks with simulated timing gaps and assert correct sentence boundary detection and gateway dispatch.

Input: `["CQ ", "CQ ", "DE ", "PA3", "XYZ ", "K"]` delivered at intervals.
Assert: a single inbound message dispatched containing `"CQ CQ DE PA3XYZ K"` after the silence threshold.

These tests also cover prosign detection (flush on AR, SK), word boundary logic, and the configurable silence threshold for sentence completion. Fast, no external dependencies, run on every commit.

**Unit tests — Contact log extraction**

Given a decoded QSO transcript as a string, assert correct extraction of structured fields: callsign, RST, name, QTH, timestamp. Test against clean transcripts, noisy transcripts with garbled characters, and partial QSOs that were interrupted.

**Unit tests — ADIF writer**

Given structured contact data, assert correct ADIF output format. This is trivial but worth testing because ADIF has quirky formatting (field lengths encoded in the tags).

**Integration tests — Fldigi decode chain**

Spawn fldigi in headless mode, pipe a test WAV into its audio input via virtual audio device, poll the XML-RPC interface, assert the decoded text matches expected output. This validates the actual fldigi configuration (frequency, filter bandwidth, CW mode settings) against known signals.

These are slower tests (~seconds per fixture) but CI-friendly. Fldigi can run in a Docker container with PulseAudio configured for null sink/source routing. A `docker-compose.test.yml` sets up the environment.

Test matrix:

| Fixture | Signal quality | Expected decode | Tests |
|---------|---------------|-----------------|-------|
| `clean-cq.wav` | 599, no noise | `CQ CQ DE PA3XYZ K` | Baseline decode accuracy |
| `clean-qso.wav` | 599, full exchange | Complete QSO transcript | Multi-sentence buffering |
| `noisy-weak.wav` | 339, heavy noise | Partial decode with gaps | Error tolerance, `?` handling |
| `qrm-two-stations.wav` | Two signals, 300 Hz apart | Primary station only | Fldigi filter selectivity |
| `qsb-fading.wav` | Periodic deep fades | Decode with gaps during fades | Buffer resilience |
| `fast-contest.wav` | 30 WPM contest exchange | `599 14` (RST + zone) | High-speed decode |
| `slow-beginner.wav` | 10 WPM, long gaps | Full text | Timing threshold flexibility |

**Plugin integration tests — Mock XML-RPC**

Replace the live fldigi XML-RPC connection with a mock server that replays recorded response sequences. This tests the plugin's polling logic, reconnection handling, and error paths without needing fldigi running.

Scenarios: normal flow, fldigi restart mid-QSO, XML-RPC timeout, empty buffer for extended periods, burst of rapid text.

**End-to-end tests — WAV to agent response**

The full acceptance test: WAV file → fldigi → plugin → OpenClaw gateway → agent session → assert the agent correctly parsed the callsign, generated a valid log entry, and (if transmit is enabled) produced an appropriate response.

These run against a real OpenClaw gateway instance with a deterministic model configuration (temperature 0, fixed seed if available). The agent's response is validated against expected patterns rather than exact strings — e.g., assert the response contains the correct callsign and a valid RST report.

**Transmit path tests (Phase 4)**

For the outbound direction, the test runs in reverse: feed text into `outbound.sendText`, capture what fldigi receives via `main.get_tx_data` XML-RPC, and assert correct Morse encoding. No actual RF transmission — fldigi's TX buffer is inspected directly.

### Fixture Library Organisation

```
test/
  fixtures/
    wav/
      clean/           — Perfect signals at various WPM speeds
      noisy/           — S/N ratio variations (weak, moderate, strong)
      qrm/             — Interference from overlapping stations
      qsb/             — Fading patterns
      contest/         — Fast contest exchanges
    transcripts/
      expected/        — Expected decode output per WAV fixture
      qso-logs/        — Expected structured contact log entries
    xmlrpc-mocks/
      normal-flow/     — Recorded XML-RPC response sequences
      error-cases/     — Timeout, disconnect, empty buffer scenarios
```

### CI Pipeline

1. **Fast** (every commit): Unit tests for buffer logic, log extraction, ADIF writer — no external dependencies, runs in seconds
2. **Medium** (every PR): Plugin integration tests with mocked XML-RPC — no fldigi needed, runs in seconds
3. **Slow** (nightly / pre-release): Full fldigi integration tests in Docker, end-to-end tests with gateway — minutes, requires Docker

---

## Technology Stack Summary

| Layer | Technology | Role |
|-------|-----------|------|
| Hardware | RTL-SDR dongle | Radio reception |
| RF demodulation | `rtl_fm` (librtlsdr) | Frequency tuning, USB/CW demod |
| Audio routing | PulseAudio / BlackHole | Virtual audio pipe |
| Signal decoding | fldigi (XML-RPC) | CW → text, text → CW |
| Plugin runtime | TypeScript (jiti, no compile) | OpenClaw channel plugin |
| Gateway | OpenClaw Gateway | Agent session routing |
| Agent | Claude / any LLM via OpenClaw | Reasoning, response generation |

---

## Open Questions

- **Latency budget**: What's acceptable end-to-end latency from received Morse to agent response? CW QSOs are slow by nature (20-30 WPM max), so even a few seconds of LLM thinking time is fine.
- **Session modeling**: Is one session per frequency the right abstraction, or one session per detected callsign? Per-callsign would allow the agent to track separate conversations on the same frequency.
- **Bidirectional simultaneously**: Full-duplex isn't possible on a single SDR, but the agent could monitor while composing a response and TX when the other station finishes (break-in keying).
- **Legal review**: Automated CW transmission rules differ per country. Worth documenting per-jurisdiction before Phase 4.
