# CQlaw Development Guide

How to set up a local development environment for the CQlaw plugin, including fldigi and virtual audio — no radio hardware needed.

---

## 1. Install fldigi

fldigi is the signal decoder that converts CW audio into text. The plugin talks to it via XML-RPC.

### macOS

```bash
brew install --cask fldigi
```

If the cask isn't available, download the `.dmg` directly from [w1hkj.com](http://www.w1hkj.com/download.html).

### Linux (Debian/Ubuntu)

```bash
sudo apt update
sudo apt install fldigi
```

### Linux (Fedora)

```bash
sudo dnf install fldigi
```

### Verify installation

```bash
fldigi --version
```

---

## 2. Enable fldigi's XML-RPC server

The plugin communicates with fldigi over XML-RPC (HTTP + XML on port 7362). This is enabled by default in most fldigi builds, but verify it:

1. Open fldigi
2. Go to **Configure → Misc → NBEMS** (or **Configure → Config Dialog**)
3. Under the **XML-RPC** section, ensure:
   - **Enable XML-RPC server** is checked
   - **Port** is `7362` (default)
   - **Allow remote access** is unchecked (keep it local-only for security)
4. Click **Save**, then restart fldigi

### Verify XML-RPC is running

With fldigi open, run:

```bash
curl -s -X POST http://127.0.0.1:7362/RPC2 \
  -H "Content-Type: text/xml" \
  -d '<?xml version="1.0"?><methodCall><methodName>fldigi.version</methodName><params></params></methodCall>'
```

You should see an XML response containing the fldigi version string, e.g.:

```xml
<?xml version="1.0"?><methodResponse><params><param><value><string>4.2.05</string></value></param></params></methodResponse>
```

If you get `Connection refused`, fldigi's XML-RPC server isn't running — check the config above.

### Quick test from Node

```bash
node -e "
const http = require('http');
const body = '<?xml version=\"1.0\"?><methodCall><methodName>fldigi.version</methodName><params></params></methodCall>';
const req = http.request({ hostname: '127.0.0.1', port: 7362, method: 'POST', path: '/RPC2', headers: { 'Content-Type': 'text/xml' } }, (res) => {
  let data = '';
  res.on('data', (c) => data += c);
  res.on('end', () => console.log(data));
});
req.write(body);
req.end();
"
```

---

## 3. Set up a virtual audio device

To test without radio hardware, you pipe a WAV file through a virtual audio device into fldigi. This simulates what an SDR dongle would do.

### macOS — BlackHole

[BlackHole](https://github.com/ExistentialAudio/BlackHole) is a free virtual audio driver for macOS.

```bash
brew install --cask blackhole-2ch
```

After installation:

1. Open **Audio MIDI Setup** (in `/Applications/Utilities/`)
2. You should see **BlackHole 2ch** listed as an audio device
3. In fldigi, go to **Configure → Sound Card**
4. Set **Capture** (input) to **BlackHole 2ch**
5. Leave **Playback** (output) as your regular output (or another BlackHole channel for TX testing)

Now any audio played *to* BlackHole will be received by fldigi as input.

### Linux — PulseAudio null sink

Create a virtual audio sink that acts as a loopback:

```bash
# Create a null sink (virtual output device)
pactl load-module module-null-sink sink_name=virtual_cw sink_properties=device.description="CW_Virtual_Input"

# Create a loopback: route the null sink's monitor to fldigi's input
pactl load-module module-loopback source=virtual_cw.monitor
```

In fldigi's sound card config, set the capture device to `virtual_cw.monitor` (or `Monitor of CW_Virtual_Input`).

To remove the virtual devices later:

```bash
pactl unload-module module-null-sink
pactl unload-module module-loopback
```

### Linux — PipeWire (modern distros)

PipeWire is compatible with PulseAudio commands, so the above `pactl` commands work. Alternatively:

```bash
pw-loopback --capture-props="media.class=Audio/Sink" &
```

---

## 4. Pipe a WAV file into fldigi

With the virtual audio device set up, play a WAV file and fldigi will decode it.

### macOS

```bash
# Play WAV to BlackHole (fldigi will hear it)
afplay -d BlackHole\ 2ch test/fixtures/wav/clean/clean-cq.wav
```

Or use SoX (more control):

```bash
brew install sox
sox test/fixtures/wav/clean/clean-cq.wav -d  # Plays to default output
# To play to BlackHole specifically:
AUDIODEV="BlackHole 2ch" play test/fixtures/wav/clean/clean-cq.wav
```

### Linux

```bash
# Play to the virtual sink
paplay --device=virtual_cw test/fixtures/wav/clean/clean-cq.wav
```

Or with SoX:

```bash
sudo apt install sox libsox-fmt-all
AUDIODEV=virtual_cw play test/fixtures/wav/clean/clean-cq.wav
```

### What to expect

When the WAV plays, you should see characters appearing in fldigi's RX text panel. If fldigi is in CW mode and the WAV contains valid Morse at the right tone frequency (~700 Hz), fldigi will decode it into text.

Make sure fldigi is set to **CW** mode:
1. Click the mode selector (bottom-left of fldigi)
2. Select **CW**
3. Adjust the receive filter bandwidth if needed (typically 100–500 Hz)

---

## 5. Automated dev script

The `scripts/play-wav-to-fldigi.sh` script automates the WAV→virtual-audio→fldigi pipeline:

```bash
./scripts/play-wav-to-fldigi.sh test/fixtures/wav/clean/clean-cq.wav
```

It auto-detects your OS, plays the WAV to the correct virtual audio device, and monitors fldigi's RX buffer via XML-RPC so you can see the decoded text in your terminal.

---

## 6. Set fldigi to CW mode via XML-RPC

You can configure fldigi remotely without touching the GUI:

```bash
# Set mode to CW
curl -s -X POST http://127.0.0.1:7362/RPC2 \
  -H "Content-Type: text/xml" \
  -d '<?xml version="1.0"?><methodCall><methodName>modem.set_by_name</methodName><params><param><value><string>CW</string></value></param></params></methodCall>'

# Check current mode
curl -s -X POST http://127.0.0.1:7362/RPC2 \
  -H "Content-Type: text/xml" \
  -d '<?xml version="1.0"?><methodCall><methodName>modem.get_name</methodName><params></params></methodCall>'
```

---

## 7. Development workflow summary

1. Start fldigi (with XML-RPC enabled, CW mode, virtual audio input)
2. Run the plugin: `npm run build && node dist/src/index.js` (or via OpenClaw gateway)
3. Play a test WAV: `./scripts/play-wav-to-fldigi.sh test/fixtures/wav/clean/clean-cq.wav`
4. Watch the decoded text flow through the plugin into the gateway

For rapid iteration without hardware, this loop is all you need. The WAV files are deterministic test fixtures — same input always produces the same decode.
