# OpenClaw CQlaw — Complete Implementation Task List

This document defines every task required to fully implement the OpenClaw QC (CW/Morse) radio channel plugin, from initial project scaffolding through agent intelligence features. Tasks are organized by phase, with implementation details included for each.

---

## Phase 1 — Scaffold the OpenClaw Channel Plugin

**Goal**: A working channel plugin that accepts hardcoded test strings, proving the integration path with the gateway before any radio hardware enters the picture.

### 1.1 Project Initialization

- [x] **1.1.1** Initialize the project with `package.json` including `openclaw.extensions` entry point field
- [x] **1.1.2** Set up TypeScript configuration (`tsconfig.json`) targeting the OpenClaw plugin runtime (jiti, no compile step required)
- [x] **1.1.3** Create `openclaw.plugin.json` manifest declaring the plugin name (`cqlaw`), version, and capabilities
- [ ] **1.1.4** Set up linting (ESLint) and formatting (Prettier) configuration
- [x] **1.1.5** Set up the `test/` directory structure with a test runner (vitest or jest)
- [x] **1.1.6** Create a `.gitignore` covering `node_modules/`, `dist/`, and any local config files
- [x] **1.1.7** Add a `README.md` with basic project description, prerequisites, and install instructions

### 1.2 Channel Registration

- [x] **1.2.1** Implement the `register()` entry function that the OpenClaw gateway calls on plugin load
- [x] **1.2.2** Inside `register()`, call `api.registerChannel()` with a `morse-radio` channel definition
- [x] **1.2.3** Set channel capabilities to `direct` chat type only (no groups — radio is modeled as 1:1 session per frequency)
- [x] **1.2.4** Define the channel's metadata: name, description, icon identifier, and supported message types (text only initially)

### 1.3 Outbound Message Handler (Stub)

- [x] **1.3.1** Implement the `outbound.sendText` handler function
- [x] **1.3.2** For Phase 1, this handler should log the agent's text response to console/gateway logs with a prefix like `[CW-TX-STUB]`
- [x] **1.3.3** Include a placeholder comment/TODO marking where future fldigi `main.tx_text` XML-RPC calls will go
- [x] **1.3.4** Return a success acknowledgment to the gateway so the message flow completes cleanly

### 1.4 Background Service Stub

- [x] **1.4.1** Create a background service class/module to be registered via `api.registerService()`
- [x] **1.4.2** Implement the service lifecycle methods: `start()`, `stop()`, and any health-check hooks the gateway expects
- [x] **1.4.3** In the `start()` method, push a hardcoded test string (`"CQ CQ DE PI4ABC"`) into the gateway session as an inbound message using `api.dispatchInbound({ text, peer, channel })`
- [x] **1.4.4** Confirm the test string arrives in the agent session by checking gateway logs
- [x] **1.4.5** Add a configurable delay before dispatching the test string (e.g., 2 seconds after service start) to allow the gateway to fully initialize

### 1.5 Channel Configuration Schema

- [x] **1.5.1** Define the channel config structure in `openclaw.json` with the following fields:
  - `frequency` (number, Hz — e.g., `7030000` for 7.030 MHz)
  - `mode` (string — `"CW"`, `"USB"`, etc.)
  - `fldigi.host` (string — default `"127.0.0.1"`)
  - `fldigi.port` (number — default `7362`)
  - `fldigi.pollingIntervalMs` (number — default `250`)
  - `sdr.enabled` (boolean — default `false`)
  - `sdr.device` (string — device identifier for rtl_sdr)
  - `sdr.sampleRate` (number — default `48000`)
  - `tx.enabled` (boolean — default `false`)
  - `tx.maxDurationSeconds` (number — safety limit)
  - `tx.wpm` (number — words per minute, default `20`)
  - `tx.callsign` (string — the station's own callsign, required for TX)
- [x] **1.5.2** Implement config validation with clear error messages for missing/invalid fields
- [x] **1.5.3** Implement config defaults so only required fields need to be specified
- [x] **1.5.4** Document each config field with inline comments or a config schema reference

### 1.6 Installation and Verification

- [ ] **1.6.1** Verify the plugin installs via `openclaw plugins install -l .` without errors
- [ ] **1.6.2** Verify the gateway logs show the `morse-radio` channel registered successfully
- [ ] **1.6.3** Verify the hardcoded test string `"CQ CQ DE PI4ABC"` appears in the agent session as an inbound message
- [ ] **1.6.4** Verify the agent's response is logged by the `outbound.sendText` stub
- [ ] **1.6.5** Write a smoke test script that automates the above verification steps

---

## Phase 2 — Fldigi Integration (Receive Path)

**Goal**: Replace the hardcoded test string with live decoded Morse text from fldigi's XML-RPC interface.

### 2.1 XML-RPC Client

- [ ] **2.1.1** Add an XML-RPC client library dependency (e.g., `xmlrpc` npm package or implement a minimal client using raw HTTP POST since XML-RPC is simple)
- [ ] **2.1.2** Create an `FldigiClient` class that encapsulates the XML-RPC connection to fldigi
- [ ] **2.1.3** Implement the `connect()` method that validates fldigi is reachable at the configured host:port
- [ ] **2.1.4** Implement `getRxData()` method wrapping fldigi's `main.get_rx_data` (or `text.get_rx` depending on fldigi version — detect which is available)
- [ ] **2.1.5** Implement `getRxText()` as an alternative method for fetching decoded text from the receive buffer
- [ ] **2.1.6** Implement `getVersion()` to query fldigi version and log it on startup for debugging
- [ ] **2.1.7** Implement `getFrequency()` to read the currently tuned frequency from fldigi
- [ ] **2.1.8** Implement `getMode()` to read the current operating mode from fldigi
- [ ] **2.1.9** Implement `getSignalNoiseRatio()` to read the S/N ratio for signal quality metadata
- [ ] **2.1.10** Implement `getWpm()` to read the detected receive speed (WPM) from fldigi
- [ ] **2.1.11** Add TypeScript type definitions for all fldigi XML-RPC method responses

### 2.2 Polling Loop

- [ ] **2.2.1** Replace the hardcoded test string dispatch in the background service with a polling loop
- [ ] **2.2.2** The polling loop calls `FldigiClient.getRxData()` at the configured interval (default 250ms)
- [ ] **2.2.3** Track the last-read position in fldigi's receive buffer to avoid re-reading old data
- [ ] **2.2.4** Implement a clean start/stop mechanism for the polling loop tied to the service lifecycle
- [ ] **2.2.5** Add performance logging: log polling latency periodically (e.g., every 60 seconds) to detect bottlenecks
- [ ] **2.2.6** Ensure the polling loop does not drift — if a poll takes longer than the interval, skip rather than queue up

### 2.3 Sentence Buffering Logic

- [ ] **2.3.1** Create a `SentenceBuffer` class that accumulates decoded characters from the polling loop
- [ ] **2.3.2** Implement word boundary detection: fldigi inserts spaces between decoded words based on dit/dah timing
- [ ] **2.3.3** Implement silence-based flush: if no new characters arrive for a configurable threshold (default 3 seconds), flush the buffer as a complete message
- [ ] **2.3.4** Implement prosign-based flush: detect `AR` (end of message) and `SK` (end of contact) prosigns and flush immediately when encountered
- [ ] **2.3.5** Implement `K` (go ahead) detection as a flush trigger — this signals the other station is done transmitting and expects a response
- [ ] **2.3.6** Implement `KN` (go ahead, named station only) detection as a flush trigger
- [ ] **2.3.7** Implement `BK` (break) detection as a flush trigger for break-in conversations
- [ ] **2.3.8** Handle partial words at flush boundaries: if the silence threshold fires mid-word, either wait slightly longer or include the partial
- [ ] **2.3.9** Strip leading/trailing whitespace and normalize multiple spaces to single spaces in flushed messages
- [ ] **2.3.10** Dispatch the flushed message to the gateway via `api.dispatchInbound({ text, peer, channel })`
- [ ] **2.3.11** Include metadata with dispatched messages: timestamp, frequency, detected WPM, S/N ratio

### 2.4 Callsign Extraction

- [ ] **2.4.1** Implement a regex-based callsign pattern matcher that recognizes standard amateur radio callsign formats (prefix + digit + suffix, e.g., `PA3XYZ`, `W1AW`, `VU2ABC`)
- [ ] **2.4.2** Detect `CQ ... DE <callsign>` patterns in decoded text to identify who is calling
- [ ] **2.4.3** Detect `<callsign> DE <callsign>` patterns to identify both sides of a QSO
- [ ] **2.4.4** Tag the gateway session peer with the extracted callsign so the agent knows who it's talking to
- [ ] **2.4.5** Handle compound callsigns (e.g., `PA3XYZ/P` for portable, `DL2ABC/MM` for maritime mobile)
- [ ] **2.4.6** Handle special event callsigns and contest callsigns that may deviate from standard formats

### 2.5 Error Handling and Resilience

- [ ] **2.5.1** Implement reconnect logic: if fldigi becomes unreachable, retry with exponential backoff (1s, 2s, 4s, 8s, max 30s)
- [ ] **2.5.2** Log warnings when fldigi connection is lost, log info when reconnected
- [ ] **2.5.3** Graceful degradation: if XML-RPC is unavailable, the plugin should remain loaded but inactive, not crash the gateway
- [ ] **2.5.4** Handle fldigi restart mid-session: detect buffer reset (position jump backward) and re-synchronize
- [ ] **2.5.5** Handle XML-RPC timeout: set a per-request timeout (e.g., 5 seconds) and treat timeouts as temporary failures
- [ ] **2.5.6** Emit channel status events to the gateway: `connected`, `disconnected`, `reconnecting`, `error`

### 2.6 Development Tooling for Phase 2

- [ ] **2.6.1** Document how to install fldigi on macOS (`brew install fldigi`) and Linux (`apt install fldigi`)
- [ ] **2.6.2** Document how to set up a virtual audio device for testing without hardware:
  - macOS: BlackHole virtual audio driver
  - Linux: PulseAudio null sink (`pactl load-module module-null-sink`)
- [ ] **2.6.3** Document how to pipe a WAV file through the virtual audio device into fldigi for testing
- [ ] **2.6.4** Create a development script that automates the WAV-to-fldigi pipeline for rapid iteration
- [ ] **2.6.5** Document how to enable fldigi's XML-RPC server (default port 7362) and verify it's running

---

## Phase 3 — SDR Audio Pipeline

**Goal**: Wire up the RTL-SDR dongle so fldigi receives live radio audio, completing the receive chain.

### 3.1 RTL-SDR Process Management

- [ ] **3.1.1** Create an `RtlSdrManager` class that manages the `rtl_fm` child process
- [ ] **3.1.2** Implement `start()`: spawn `rtl_fm` with the correct arguments derived from channel config:
  - `-f <frequency>` (e.g., `7030000` for 7.030 MHz)
  - `-M usb` (USB mode for CW — upper sideband)
  - `-s <sampleRate>` (e.g., `48000`)
  - `-r <sampleRate>` (resample to match fldigi input)
- [ ] **3.1.3** Implement audio routing from `rtl_fm` stdout to fldigi's audio input via the virtual audio device
- [ ] **3.1.4** Implement `stop()`: gracefully terminate the `rtl_fm` process (SIGTERM, then SIGKILL after timeout)
- [ ] **3.1.5** Implement `restart()`: stop and start with the new configuration (e.g., frequency change)
- [ ] **3.1.6** Implement `setFrequency(hz: number)`: change the tuned frequency, requiring a process restart or using rtl_fm's control interface if available

### 3.2 Process Lifecycle and Error Handling

- [ ] **3.2.1** Monitor the `rtl_fm` child process for unexpected exit and auto-restart with backoff
- [ ] **3.2.2** Handle USB disconnect: detect when the RTL-SDR dongle is unplugged (rtl_fm exits with specific error) and emit a `device-disconnected` event
- [ ] **3.2.3** Handle USB reconnect: detect when the dongle is plugged back in and auto-restart `rtl_fm`
- [ ] **3.2.4** Tie `rtl_fm` lifecycle to the channel enabled/disabled state: start when channel is enabled, stop when disabled
- [ ] **3.2.5** Log `rtl_fm` stderr output for debugging (it reports tuner info, gain, and errors there)
- [ ] **3.2.6** Validate that `rtl_fm` binary is available on PATH at plugin startup, log a clear error if not found
- [ ] **3.2.7** Validate that `librtlsdr` is installed, log install instructions if missing

### 3.3 Frequency Configuration

- [ ] **3.3.1** Expose the frequency setting from `openclaw.json` channel config to the `RtlSdrManager`
- [ ] **3.3.2** Validate frequency against known amateur CW band segments:
  - 160m: 1.800–1.840 MHz
  - 80m: 3.500–3.570 MHz
  - 40m: 7.000–7.040 MHz
  - 30m: 10.100–10.130 MHz
  - 20m: 14.000–14.070 MHz
  - 17m: 18.068–18.095 MHz
  - 15m: 21.000–21.070 MHz
  - 12m: 24.890–24.915 MHz
  - 10m: 28.000–28.070 MHz
- [ ] **3.3.3** Warn (but don't block) if the configured frequency is outside standard CW band segments
- [ ] **3.3.4** Allow the agent (or user) to request a frequency change via a channel command or API

### 3.4 Signal Quality Metadata

- [ ] **3.4.1** Read fldigi's S/N ratio via the `FldigiClient` and include it in inbound message context
- [ ] **3.4.2** Read the detected signal strength and include it as metadata
- [ ] **3.4.3** Map S/N ratio to approximate RST readability values for the agent's reference:
  - S/N > 20 dB → RST 599 (excellent)
  - S/N 10–20 dB → RST 579 (good)
  - S/N 3–10 dB → RST 449 (fair)
  - S/N < 3 dB → RST 339 (poor)
- [ ] **3.4.4** Log signal quality periodically for monitoring and debugging

### 3.5 Multi-Frequency Scanning (Optional/Future)

- [ ] **3.5.1** Research `rtl_power` for scanning a frequency range and detecting CW activity
- [ ] **3.5.2** Design an architecture for spawning multiple `rtl_fm` instances or time-sharing a single instance across frequencies
- [ ] **3.5.3** Implement activity detection: switch fldigi's input to the frequency where CW activity is detected
- [ ] **3.5.4** Implement a scan plan: define a list of frequencies to monitor with dwell times
- [ ] **3.5.5** Allow the agent to request autonomous frequency hunting when no activity is detected on the current frequency

---

## Phase 4 — Transmit Path (Outbound)

**Goal**: The agent can send Morse code back over radio via fldigi.

### 4.1 Fldigi TX Integration

- [ ] **4.1.1** Extend `FldigiClient` with a `sendTxText(text: string)` method wrapping fldigi's `main.tx_text` XML-RPC call
- [ ] **4.1.2** Implement `getTxData()` to read the current TX buffer contents (for verification and testing)
- [ ] **4.1.3** Implement `abortTx()` to immediately stop transmission via fldigi XML-RPC
- [ ] **4.1.4** Implement `setTxFrequency(hz: number)` to set the transmit frequency via fldigi
- [ ] **4.1.5** Implement `setWpm(wpm: number)` to set the transmit speed, matching the detected receive speed

### 4.2 Outbound.sendText Implementation

- [ ] **4.2.1** Replace the Phase 1 stub `outbound.sendText` with actual fldigi TX integration
- [ ] **4.2.2** Before transmitting, check that `tx.enabled` is `true` in channel config — refuse to transmit if disabled
- [ ] **4.2.3** Before transmitting, check that `tx.callsign` is configured — refuse to transmit without a callsign
- [ ] **4.2.4** Sanitize agent text for CW transmission: strip characters that can't be sent in Morse, uppercase everything
- [ ] **4.2.5** Ensure proper CW formatting: add appropriate prosigns (DE, K, AR, SK) based on context
- [ ] **4.2.6** Push the sanitized text into fldigi's TX buffer via `sendTxText()`

### 4.3 PTT (Push-to-Talk) Control

- [ ] **4.3.1** Implement PTT control via fldigi's built-in CAT/RIG control (fldigi handles PTT when text is in TX buffer)
- [ ] **4.3.2** Implement fallback PTT via VOX (voice-operated relay — fldigi's audio output triggers the rig's TX)
- [ ] **4.3.3** Implement fallback PTT via serial DTR/RTS line for rigs that support it
- [ ] **4.3.4** Add `tx.pttMethod` config field: `"cat"`, `"vox"`, `"serial"`, or `"none"` (for testing without a rig)
- [ ] **4.3.5** Verify PTT activates before TX audio starts and deactivates after TX audio ends

### 4.4 Speed Matching (Critical Operator Etiquette)

- [ ] **4.4.1** Read the detected incoming WPM from fldigi via `getWpm()`
- [ ] **4.4.2** Before each transmission, set the TX WPM to match or be slightly slower than the detected receive WPM
- [ ] **4.4.3** This MUST be a hard-coded constraint, not an LLM suggestion — enforce it in the sendText handler before the text reaches fldigi
- [ ] **4.4.4** If no incoming WPM is detected (e.g., agent is calling CQ), use the configured default `tx.wpm`
- [ ] **4.4.5** Log the WPM match decision: `"RX detected 22 WPM, setting TX to 20 WPM"`

### 4.5 Safety Guards

- [ ] **4.5.1** Implement max TX duration: if a single transmission exceeds `tx.maxDurationSeconds` (default 120s), abort automatically via `abortTx()`
- [ ] **4.5.2** Implement a TX inhibit flag in config (`tx.inhibit: boolean`) that immediately prevents all transmission when set to `true`
- [ ] **4.5.3** Implement a confirmation prompt before the very first transmission of a session — require explicit operator approval
- [ ] **4.5.4** Implement a `/stop-tx` command (or equivalent OpenClaw Control UI button) that immediately calls `abortTx()` and sets the inhibit flag
- [ ] **4.5.5** Implement a TX cooldown: minimum gap between consecutive transmissions (e.g., 500ms) to prevent keying issues
- [ ] **4.5.6** Log every transmission: timestamp, text content, WPM, duration, frequency — for regulatory compliance and debugging

### 4.6 Legal Identification Timer

- [ ] **4.6.1** Implement a timer that tracks time since last callsign identification was transmitted
- [ ] **4.6.2** If 10 minutes have elapsed since last ID and the station is transmitting, automatically append the station callsign
- [ ] **4.6.3** Always include the station callsign at the end of each complete communication (QSO end)
- [ ] **4.6.4** This MUST be a hard-coded timer-based behaviour, NOT left to the LLM's judgment — regulatory requirement
- [ ] **4.6.5** Log each identification event for compliance records

### 4.7 Band Manners Enforcement (Hard Constraints)

- [ ] **4.7.1** Before first TX on a frequency, automatically send `QRL?` ("is this frequency in use?") and wait for a response period (configurable, default 5 seconds)
- [ ] **4.7.2** If a response to `QRL?` is detected (any decoded text during the wait), abort the TX attempt and report to the agent that the frequency is occupied
- [ ] **4.7.3** Implement a "listen before transmit" guard: require at least N seconds (configurable, default 10s) of receive monitoring before allowing any TX on a new frequency
- [ ] **4.7.4** Log all band manner checks for debugging

---

## Phase 5 — Agent Intelligence

**Goal**: Make the agent genuinely useful as a radio operator/assistant through domain knowledge, structured logging, external data integration, and error correction.

### 5a. Protocol Understanding (SOUL.md)

- [ ] **5a.1** Create a `SOUL.md` file for the CW operator agent persona
- [ ] **5a.2** Document Q-codes with usage context (not just definitions):
  - `QTH` — "my location is" / "what is your location?"
  - `QSL` — "I confirm receipt" / "do you confirm?"
  - `QRZ` — "who is calling me?"
  - `QRS` — "send more slowly"
  - `QRQ` — "send faster"
  - `QRM` — "I am being interfered with"
  - `QRN` — "I am troubled by static noise"
  - `QSB` — "your signals are fading"
  - `QRL` — "this frequency is in use" / "is this frequency in use?"
  - `QRV` — "I am ready"
  - `QSY` — "change frequency to..."
  - `QRX` — "wait" / "stand by"
  - `QRP` — "low power operation"
  - And all other commonly used Q-codes
- [ ] **5a.3** Document prosigns with usage context:
  - `K` — "go ahead" (invitation for any station to transmit)
  - `KN` — "go ahead, named station only" (private conversation)
  - `SK` — "end of contact"
  - `AR` — "end of message"
  - `BK` — "break" (break-in keying)
  - `CL` — "closing station"
  - `BT` — separator (equivalent to paragraph break)
  - `HH` — "error, disregard previous"
- [ ] **5a.4** Document standard QSO flow with detailed turn-by-turn examples:
  - CQ call format
  - Responding to a CQ
  - Signal report exchange (RST system explained)
  - Name and QTH exchange
  - Equipment/weather/remarks exchange
  - Signoff sequence (73, SK, etc.)
- [ ] **5a.5** Include examples of complete QSOs at different formality levels:
  - Contest exchange (minimal: callsign + RST + serial/zone)
  - Standard casual QSO (RST, name, QTH, rig, weather)
  - Ragchew / extended QSO (longer conversation, personal details)
  - DX QSO (brief, efficient, often through pileup)
- [ ] **5a.6** Document common abbreviations used in CW:
  - `UR` = your, `RST` = readability/strength/tone, `ES` = and, `HR` = here
  - `GM` = good morning, `GA` = good afternoon, `GE` = good evening
  - `73` = best regards (NEVER "73s"), `88` = love and kisses
  - `OM` = old man (any male operator), `YL` = young lady (any female operator)
  - `XYL` = wife, `HI` = laughter, `TU` = thank you, `TNX` = thanks
  - `FB` = fine business (great), `SRI` = sorry, `PSE` = please
  - `HPE` = hope, `CUAGN` = see you again, `WX` = weather
  - `RIG` = equipment, `ANT` = antenna, `PWR` = power
- [ ] **5a.7** Document when the agent should and shouldn't respond:
  - DO respond to a CQ if TX is enabled and operator has enabled auto-reply
  - DO respond when directly called (own callsign heard)
  - DO NOT respond to a CQ if TX is disabled (listen-only mode)
  - DO NOT respond if the frequency is in the middle of another QSO
  - DO NOT respond if the QSO is a contest and the agent is not configured for that contest
  - DO NOT transmit on a frequency without checking QRL first
- [ ] **5a.8** Document the transparency requirement: if the agent transmits, include "OP IS AI ASSISTED" or similar disclosure in the QSO
- [ ] **5a.9** Document pileup behaviour: do not call into a pileup unless explicitly instructed by the operator
- [ ] **5a.10** Document the speed-matching etiquette rule in SOUL.md as a behavioral constraint the agent must follow
- [ ] **5a.11** Have the SOUL.md reviewed by an experienced CW operator before finalizing (flag this as a human review task)

### 5b. Contact Logging (ADIF)

- [ ] **5b.1** Implement an ADIF (Amateur Data Interchange Format) file writer module
- [ ] **5b.2** Support the following ADIF fields:
  - `<CALL>` — contacted station's callsign
  - `<QSO_DATE>` — date of contact (YYYYMMDD)
  - `<TIME_ON>` — start time of contact (HHMMSS UTC)
  - `<TIME_OFF>` — end time of contact (HHMMSS UTC)
  - `<BAND>` — band (e.g., `40m`, `20m`)
  - `<FREQ>` — frequency in MHz (e.g., `7.030`)
  - `<MODE>` — mode (`CW`)
  - `<RST_SENT>` — signal report sent (e.g., `599`)
  - `<RST_RCVD>` — signal report received (e.g., `579`)
  - `<NAME>` — other operator's name
  - `<QTH>` — other operator's location
  - `<GRIDSQUARE>` — Maidenhead grid locator
  - `<COMMENT>` — free-form notes
  - `<TX_PWR>` — transmit power
  - `<CONTEST_ID>` — contest identifier (if applicable)
  - `<SRX>` — received serial number (contest)
  - `<STX>` — sent serial number (contest)
- [ ] **5b.3** Implement ADIF field encoding: `<FIELDNAME:LENGTH>VALUE` format (e.g., `<CALL:6>DL2ABC`)
- [ ] **5b.4** Implement ADIF file header with `<ADIF_VER:5>3.1.4` and `<PROGRAMID>` and `<EOH>` marker
- [ ] **5b.5** Implement append-mode writing: new QSOs are appended to the log file, each terminated by `<EOR>` (end of record)
- [ ] **5b.6** Implement the QSO field extractor: given a decoded conversation transcript, use the LLM (via agent tool or structured extraction) to extract:
  - Callsign of the other station
  - RST sent and received
  - Name
  - QTH
  - Any additional exchanged information
- [ ] **5b.7** Derive band from frequency automatically (e.g., 7.030 MHz → `40m`)
- [ ] **5b.8** Record QSO start/end timestamps from message dispatch times
- [ ] **5b.9** Implement dupe detection: check if the same callsign has already been worked on the same band (and optionally same mode)
- [ ] **5b.10** Flag dupes visually in agent responses and in the log
- [ ] **5b.11** Store the ADIF log file at a configurable path (default: `~/.openclaw/cqlaw/log.adi`)
- [ ] **5b.12** Implement log rotation or archival (optional): create a new log file per day/month or when size exceeds a threshold
- [ ] **5b.13** Implement export to external logging software APIs (optional/future):
  - Cloudlog API integration
  - Log4OM import
  - LOTW (Logbook of The World) ADIF upload

### 5c. QRZ.com Callsign Lookup

- [ ] **5c.1** Register a new OpenClaw tool plugin for QRZ.com callsign lookup
- [ ] **5c.2** Implement the QRZ XML API client:
  - Authentication: session key based, requires QRZ.com account credentials
  - Endpoint: `https://xmldata.qrz.com/xml/current/`
  - Login call to obtain session key
  - Lookup call with callsign parameter
- [ ] **5c.3** Add QRZ.com credentials to channel config:
  - `qrz.username` (string)
  - `qrz.password` (string, should support environment variable reference for security)
- [ ] **5c.4** Parse the QRZ XML response and extract:
  - Full name (`fname`, `name`)
  - Address / QTH (`addr1`, `addr2`, `state`, `country`)
  - Grid square (`grid`)
  - License class (`class`)
  - Email
  - Bio URL
  - QSL info (bureau, direct, LOTW)
  - Image URL
- [ ] **5c.5** Implement session key caching: reuse the session key until it expires, then re-authenticate
- [ ] **5c.6** Implement callsign lookup caching: cache results for N hours (configurable, default 24h) to avoid redundant API calls
- [ ] **5c.7** Trigger automatic lookup when a new callsign is detected in the decoded stream
- [ ] **5c.8** Enrich the agent's context with the lookup data so it knows who it's talking to before the QSO even starts
- [ ] **5c.9** Handle lookup failures gracefully: if QRZ is unreachable or the callsign is not found, log a warning and continue without enrichment
- [ ] **5c.10** Respect QRZ.com API rate limits (currently ~100 lookups per 24h for free accounts, unlimited for subscribers)

### 5d. Propagation Awareness

- [ ] **5d.1** Register a new OpenClaw tool plugin for propagation data
- [ ] **5d.2** Implement a client for solar/propagation data from hamqsl.com:
  - Solar Flux Index (SFI)
  - K-index (geomagnetic activity)
  - A-index
  - Sunspot number
  - Band condition forecasts (which bands are open to which regions)
- [ ] **5d.3** Parse the hamqsl.com XML/image data into structured propagation status
- [ ] **5d.4** Implement PSKReporter integration:
  - Query the PSKReporter API for stations heard on specific bands/modes
  - Filter for CW mode spots
  - Show which callsigns are currently active and from which grid squares
- [ ] **5d.5** Implement DX cluster integration (optional):
  - Connect to a DX cluster node via telnet (e.g., `dxwatch.com:23`)
  - Parse spot announcements: callsign, frequency, spotter, timestamp, comment
  - Filter for CW spots
- [ ] **5d.6** Implement Reverse Beacon Network (RBN) integration:
  - Query the RBN API for real-time CW spots
  - Show which stations are currently calling CQ and on which frequencies
  - Include signal strength reports from RBN skimmer nodes
- [ ] **5d.7** Enable the agent to make band suggestions: "20 meters is open to North America right now" based on propagation data + PSKReporter activity
- [ ] **5d.8** Cache propagation data with appropriate TTL (solar indices change slowly — hourly refresh is fine; spots need near-real-time)
- [ ] **5d.9** Present propagation data to the agent in a structured format it can reason about

### 5e. Contest Operation

- [ ] **5e.1** Define a contest profile schema with the following fields:
  - `contestId` (string — e.g., `"CQWW"`, `"ARRL-FD"`, `"CQ-WPX"`)
  - `name` (string — human-readable name)
  - `exchangeFormat` (object — what fields are exchanged)
  - `scoringRules` (object — how points and multipliers are calculated)
  - `bandPlan` (object — which bands are used)
  - `duration` (object — start/end times, typically UTC)
- [ ] **5e.2** Implement contest profiles for popular events:
  - **CQ WW DX Contest**: Exchange = RST + CQ zone (1-40). Multipliers = countries + zones per band.
  - **CQ WPX Contest**: Exchange = RST + serial number. Multipliers = unique prefixes per band.
  - **ARRL Field Day**: Exchange = category + ARRL section (e.g., `"2A ENY"`). Scoring by mode and power.
  - **IARU HF Championship**: Exchange = RST + ITU zone (or HQ station identifier). Multipliers = zones + HQ stations.
  - **ARRL Sweepstakes**: Exchange = serial + precedence + callsign + check + section.
- [ ] **5e.3** Implement a contest session manager:
  - Activate a specific contest profile
  - Track the contest clock (elapsed time, time remaining)
  - Maintain contest-specific state (current serial number for TX, etc.)
- [ ] **5e.4** Implement real-time scoring:
  - Calculate QSO points based on contest rules (e.g., CQ WW: same continent = 1 pt, different continent = 3 pts)
  - Track multipliers: new countries, new zones, new prefixes — per band
  - Calculate running total score: points × multipliers
- [ ] **5e.5** Implement the dupe sheet:
  - In-memory lookup of all worked callsigns per band
  - Instant detection when a callsign has already been worked on the current band
  - Flag dupes to the agent so it can skip or QSY
- [ ] **5e.6** Implement rate tracking:
  - Contacts per hour (current rate, average rate, peak rate)
  - Projected final score based on current rate
  - Rate chart data for display
- [ ] **5e.7** Implement multiplier tracking and alerts:
  - Flag when a decoded callsign is a new multiplier (new country, new zone, etc.)
  - Prioritize new multipliers — the agent should alert the operator that a new multiplier is available
- [ ] **5e.8** Implement Cabrillo log export:
  - Cabrillo is the standard contest log submission format
  - Generate a valid Cabrillo file from the contest session data
  - Include header fields: contest ID, callsign, category, club, operators, etc.
- [ ] **5e.9** Implement contest exchange parsing: given a decoded contest exchange, extract the expected fields based on the active contest profile
- [ ] **5e.10** Implement contest exchange generation: compose the agent's contest exchange based on the active profile and current serial number

### 5f. Error Correction and Context

- [ ] **5f.1** Implement fuzzy callsign matching: when fldigi decodes a callsign with uncertain characters (e.g., `PA3X?Z`), query the QRZ database for likely matches
- [ ] **5f.2** Implement Levenshtein distance or similar edit-distance matching for callsign candidates
- [ ] **5f.3** Implement contextual reconstruction for common fields:
  - RST: if decoded as `5?9`, infer `599` (the most common report)
  - Zone numbers: cross-reference with callsign prefix to validate
  - Serial numbers: should be monotonically increasing in contests
- [ ] **5f.4** Implement confidence scoring for each extracted field:
  - `high` — decoded clearly with no ambiguity
  - `medium` — decoded with minor uncertainty, contextually resolved
  - `low` — significant uncertainty, flagged for human review
- [ ] **5f.5** Flag low-confidence fields visually in the log and agent responses
- [ ] **5f.6** Implement cross-repetition aggregation: CW operators typically send their callsign 2-3 times — aggregate across repetitions to build confidence
  - If first decode is `DL2A?C` and second is `DL2AB?`, merge to `DL2ABC`
- [ ] **5f.7** Implement context-aware noise filtering: strip common decode artifacts (random characters from noise bursts, garbled prosigns)
- [ ] **5f.8** Implement a "decode confidence" metric for entire messages based on the proportion of high-confidence vs low-confidence characters

### 5g. QSO Memory Across Sessions

- [ ] **5g.1** Implement a persistent QSO database (beyond the ADIF log file) that stores structured contact records queryable by callsign
- [ ] **5g.2** When a callsign is detected, automatically query the database for previous contacts
- [ ] **5g.3** Provide the agent with previous QSO context: last contact date, band, RST exchanged, name, QTH, any remarks
- [ ] **5g.4** Enable the agent to reference previous contacts naturally: "Hello Hans, we last worked on 40 meters in March"
- [ ] **5g.5** Combine QSO memory with QRZ.com data for rich context about returning stations
- [ ] **5g.6** Ensure the memory recall feels natural and not uncanny — the agent should reference previous contacts the way a human operator would (briefly, warmly), not recite a dossier

### 5h. Pileup Awareness

- [ ] **5h.1** Detect pileup conditions: many stations responding to a single CQ, decoded as overlapping/garbled text
- [ ] **5h.2** Identify the DX station's operating pattern from the decoded stream:
  - Are they working stations geographically (by call area)?
  - Are they listening on a split frequency ("UP 2")?
  - What is their QSO rate?
- [ ] **5h.3** Advise the operator on pileup strategy: "They're working call area 1 now, your area hasn't been worked yet — try now"
- [ ] **5h.4** Do NOT call into a pileup autonomously — this must require explicit operator instruction (hard constraint)

### 5i. DX Cluster and Spotting Network Integration

- [ ] **5i.1** Implement DX cluster spot consumption (from task 5d.5) and present spots to the agent
- [ ] **5i.2** Implement the ability to contribute spots back to the DX cluster: when the agent hears a station, optionally post a spot
- [ ] **5i.3** Implement smart spot filtering: prioritize spots for stations the operator hasn't worked (new DXCC entities, new bands)
- [ ] **5i.4** Implement RBN-enhanced monitoring: compare what the agent hears with what the RBN network reports to validate decode accuracy

---

## Phase 6 — Testing Strategy

**Goal**: Comprehensive test coverage across all layers, from unit tests to full end-to-end tests.

### 6.1 Test Fixture Generation

- [ ] **6.1.1** Create a Morse code WAV generator script:
  - Input: plain text string, WPM speed, tone frequency (default 700 Hz), sample rate (default 48000)
  - Output: PCM WAV file with mathematically precise Morse timing:
    - Dit duration = 1200 / WPM (ms)
    - Dah duration = 3 × dit
    - Inter-element gap = 1 × dit
    - Inter-character gap = 3 × dit
    - Inter-word gap = 7 × dit
  - Pure sine wave generation, no external audio tools needed
- [ ] **6.1.2** Generate the clean fixture set:
  - `clean-cq.wav` — `"CQ CQ DE PA3XYZ K"` at 20 WPM, no noise
  - `clean-qso.wav` — Full QSO exchange at 20 WPM, no noise
  - `clean-contest.wav` — Contest exchange at 28 WPM
- [ ] **6.1.3** Generate the noisy fixture set (add white noise at various S/N ratios):
  - `noisy-strong.wav` — S/N ~20 dB (easy decode)
  - `noisy-moderate.wav` — S/N ~10 dB (some errors expected)
  - `noisy-weak.wav` — S/N ~3 dB (heavy errors, partial decode)
- [ ] **6.1.4** Generate the QRM (interference) fixture set:
  - `qrm-two-stations.wav` — Two Morse signals at different pitches (300 Hz apart)
- [ ] **6.1.5** Generate the QSB (fading) fixture set:
  - `qsb-fading.wav` — Signal with periodic sinusoidal amplitude fading
- [ ] **6.1.6** Generate speed variation fixtures:
  - `fast-contest.wav` — 30 WPM contest exchange
  - `slow-beginner.wav` — 10 WPM with long gaps
- [ ] **6.1.7** Create corresponding expected-output transcript files for each WAV fixture

### 6.2 Unit Tests — Sentence Buffer

- [ ] **6.2.1** Test basic character accumulation: feed characters one at a time, verify buffer contents
- [ ] **6.2.2** Test silence-based flush: feed text, wait past the silence threshold, verify message is dispatched
- [ ] **6.2.3** Test prosign-based flush: feed text ending with `AR`, verify immediate flush
- [ ] **6.2.4** Test `SK` prosign flush
- [ ] **6.2.5** Test `K` prosign flush
- [ ] **6.2.6** Test `KN` prosign flush
- [ ] **6.2.7** Test `BK` prosign flush
- [ ] **6.2.8** Test word boundary detection: verify spaces are correctly preserved between words
- [ ] **6.2.9** Test rapid text burst: many characters in quick succession, verify single message dispatched after silence
- [ ] **6.2.10** Test empty buffer: no characters received, verify no spurious dispatches
- [ ] **6.2.11** Test whitespace normalization: multiple spaces collapsed, leading/trailing whitespace stripped
- [ ] **6.2.12** Test configurable silence threshold: verify different threshold values produce correct flush timing

### 6.3 Unit Tests — Contact Log Extraction

- [ ] **6.3.1** Test clean QSO transcript: extract callsign, RST, name, QTH from a perfectly decoded exchange
- [ ] **6.3.2** Test noisy QSO transcript: extract fields from a transcript with `?` characters and garbled text
- [ ] **6.3.3** Test partial QSO: extract whatever fields are available from an interrupted/incomplete exchange
- [ ] **6.3.4** Test contest exchange extraction: extract RST + zone from a CQ WW exchange
- [ ] **6.3.5** Test contest exchange extraction: extract RST + serial number from a CQ WPX exchange
- [ ] **6.3.6** Test multiple QSOs in sequence: correctly separate and extract fields from back-to-back contacts

### 6.4 Unit Tests — ADIF Writer

- [ ] **6.4.1** Test single record output: verify correct `<FIELD:LENGTH>VALUE` formatting
- [ ] **6.4.2** Test header output: verify `<ADIF_VER>`, `<PROGRAMID>`, `<EOH>` present
- [ ] **6.4.3** Test multi-record append: verify multiple records each terminated by `<EOR>`
- [ ] **6.4.4** Test special characters: verify fields with spaces, punctuation, etc. are handled correctly
- [ ] **6.4.5** Test all supported field types from task 5b.2

### 6.5 Unit Tests — Callsign Extraction

- [ ] **6.5.1** Test standard callsign formats: `W1AW`, `PA3XYZ`, `VU2ABC`, `JA1ABC`
- [ ] **6.5.2** Test compound callsigns: `PA3XYZ/P`, `DL2ABC/MM`, `W1AW/4`
- [ ] **6.5.3** Test `CQ DE <callsign>` pattern detection
- [ ] **6.5.4** Test `<call1> DE <call2>` pattern detection
- [ ] **6.5.5** Test callsign with noise characters: `PA3X?Z` — verify uncertainty is flagged

### 6.6 Unit Tests — Error Correction

- [ ] **6.6.1** Test fuzzy callsign matching: `PA3X?Z` → `PA3XYZ` with QRZ database mock
- [ ] **6.6.2** Test RST contextual reconstruction: `5?9` → `599`
- [ ] **6.6.3** Test cross-repetition aggregation: `DL2A?C` + `DL2AB?` → `DL2ABC`
- [ ] **6.6.4** Test confidence scoring: verify high/medium/low assignments for various input quality levels

### 6.7 Integration Tests — Mock XML-RPC

- [ ] **6.7.1** Create a mock XML-RPC server that replays recorded fldigi response sequences
- [ ] **6.7.2** Test normal flow: simulate a steady stream of decoded text, verify correct message dispatch
- [ ] **6.7.3** Test fldigi restart mid-QSO: simulate connection drop and reconnect, verify graceful recovery
- [ ] **6.7.4** Test XML-RPC timeout: simulate slow responses, verify timeout handling
- [ ] **6.7.5** Test empty buffer for extended periods: verify no spurious dispatches, polling continues
- [ ] **6.7.6** Test burst of rapid text: simulate fast contest exchange, verify correct buffering

### 6.8 Integration Tests — Fldigi Decode Chain

- [ ] **6.8.1** Create a Docker-based test environment:
  - `Dockerfile` with fldigi installed, PulseAudio configured for null sink/source
  - `docker-compose.test.yml` orchestrating fldigi + test runner
- [ ] **6.8.2** Test `clean-cq.wav` → fldigi → XML-RPC → assert decoded text matches `"CQ CQ DE PA3XYZ K"`
- [ ] **6.8.3** Test `clean-qso.wav` → assert complete QSO transcript decoded correctly
- [ ] **6.8.4** Test `noisy-weak.wav` → assert partial decode with gaps, `?` handling
- [ ] **6.8.5** Test `qrm-two-stations.wav` → assert primary station decoded, interference filtered by fldigi
- [ ] **6.8.6** Test `qsb-fading.wav` → assert decode with gaps during fades, buffer resilience
- [ ] **6.8.7** Test `fast-contest.wav` → assert 30 WPM contest exchange decoded correctly
- [ ] **6.8.8** Test `slow-beginner.wav` → assert 10 WPM text decoded with long gap handling

### 6.9 End-to-End Tests

- [ ] **6.9.1** Full acceptance test: WAV file → fldigi → plugin → OpenClaw gateway → agent session
- [ ] **6.9.2** Assert the agent correctly parsed the callsign from the decoded text
- [ ] **6.9.3** Assert the agent generated a valid ADIF log entry
- [ ] **6.9.4** Assert the agent's response (if TX enabled) contains the correct callsign and valid RST report
- [ ] **6.9.5** Use deterministic model configuration (temperature 0) for reproducible results
- [ ] **6.9.6** Validate against expected patterns rather than exact strings (callsign present, RST format valid, prosigns correct)

### 6.10 Transmit Path Tests

- [ ] **6.10.1** Feed text into `outbound.sendText`, capture what fldigi receives via `main.get_tx_data` XML-RPC
- [ ] **6.10.2** Assert the transmitted text is correctly formatted for CW
- [ ] **6.10.3** Assert speed matching: TX WPM matches or is below detected RX WPM
- [ ] **6.10.4** Assert safety guards: max duration, inhibit flag, callsign identification timer
- [ ] **6.10.5** Assert no actual RF transmission in test environment (fldigi TX buffer only, no PTT)

### 6.11 CI Pipeline Configuration

- [ ] **6.11.1** Configure the **fast** tier (every commit):
  - Unit tests for buffer logic, callsign extraction, log extraction, ADIF writer, error correction
  - No external dependencies, runs in seconds
- [ ] **6.11.2** Configure the **medium** tier (every PR):
  - Plugin integration tests with mocked XML-RPC
  - No fldigi needed, runs in seconds
- [ ] **6.11.3** Configure the **slow** tier (nightly / pre-release):
  - Full fldigi integration tests in Docker
  - End-to-end tests with gateway
  - Requires Docker, runs in minutes

---

## Phase 7 — Infrastructure and DevOps

### 7.1 Docker Development Environment

- [ ] **7.1.1** Create a `Dockerfile` for the development environment including:
  - Node.js runtime
  - fldigi (headless)
  - PulseAudio (null sink configuration)
  - rtl-sdr tools (librtlsdr, rtl_fm)
- [ ] **7.1.2** Create a `docker-compose.yml` for local development:
  - Plugin service container
  - fldigi container (with XML-RPC exposed on port 7362)
  - Optional: OpenClaw gateway container
- [ ] **7.1.3** Create a `docker-compose.test.yml` specifically for CI test runs
- [ ] **7.1.4** Document the Docker-based development workflow in the README

### 7.2 Configuration and Secrets Management

- [ ] **7.2.1** Ensure sensitive config values (QRZ.com password, callsign) can be provided via environment variables
- [ ] **7.2.2** Add a `.env.example` file documenting all environment variables
- [ ] **7.2.3** Ensure `.env` is in `.gitignore`
- [ ] **7.2.4** Validate all required configuration at plugin startup with clear error messages

### 7.3 Documentation

- [ ] **7.3.1** Write a comprehensive README covering:
  - Project overview and motivation
  - Prerequisites (hardware, software)
  - Installation instructions (plugin install via OpenClaw)
  - Configuration reference (all `openclaw.json` fields)
  - Development setup (with and without hardware)
  - Testing instructions
- [ ] **7.3.2** Document the architecture with a diagram showing the full signal flow:
  - RTL-SDR → rtl_fm → PulseAudio → fldigi → XML-RPC → Plugin → Gateway → Agent
- [ ] **7.3.3** Document the regulatory considerations per jurisdiction (at least US/FCC, EU, Netherlands/AT)
- [ ] **7.3.4** Document the community considerations and transparency guidelines for AI-assisted CW operation

---

## Open Questions (To Be Resolved During Implementation)

- [ ] **OQ.1** Decide session modeling: one session per frequency vs. one session per detected callsign. Per-callsign allows tracking separate conversations on the same frequency but adds complexity.
- [ ] **OQ.2** Define the acceptable end-to-end latency budget from received Morse to agent response. CW QSOs are slow (20-30 WPM max) so a few seconds of LLM thinking time is likely acceptable for casual QSOs, but contests require sub-second response. Investigate pre-composing likely responses.
- [ ] **OQ.3** Investigate full-duplex monitoring: can the agent continue monitoring (RX) while composing a TX response? Single SDR can't do simultaneous RX/TX, but the agent can listen until the other station sends `K`, then switch to TX.
- [ ] **OQ.4** Research per-country regulations for automated CW transmission before Phase 4 implementation:
  - US (FCC Part 97)
  - Netherlands (Agentschap Telecom)
  - Germany (BNetzA)
  - UK (OFCOM)
  - Japan (MIC)
- [ ] **OQ.5** Determine the right level of autonomy for the agent on the autonomy spectrum:
  - Minimal: decode + log only (operator does all TX)
  - Moderate: decode + log + suggest responses (operator approves before TX)
  - Full: decode + log + auto-respond (operator monitors, can intervene)
- [ ] **OQ.6** Evaluate whether to use an existing XML-RPC npm package or write a minimal client (fldigi's XML-RPC surface is small enough that a custom client may be simpler and have fewer dependencies).
