#!/usr/bin/env bash
#
# Play a WAV file through the virtual audio device into fldigi,
# then poll fldigi's RX buffer via XML-RPC to show decoded text.
#
# Usage:
#   ./scripts/play-wav-to-fldigi.sh <path-to-wav>
#   ./scripts/play-wav-to-fldigi.sh test/fixtures/wav/clean/clean-cq.wav
#
# Prerequisites:
#   - fldigi running with XML-RPC enabled (port 7362)
#   - Virtual audio device configured (BlackHole on macOS, PulseAudio null sink on Linux)
#   - See docs/development.md for setup instructions

set -euo pipefail

FLDIGI_HOST="${FLDIGI_HOST:-127.0.0.1}"
FLDIGI_PORT="${FLDIGI_PORT:-7362}"
POLL_INTERVAL=0.5

# --- argument parsing ---

if [ $# -lt 1 ]; then
  echo "Usage: $0 <path-to-wav>"
  echo ""
  echo "Plays a WAV file into fldigi via virtual audio and shows decoded text."
  echo "Set FLDIGI_HOST and FLDIGI_PORT env vars to override defaults."
  exit 1
fi

WAV_FILE="$1"

if [ ! -f "$WAV_FILE" ]; then
  echo "Error: WAV file not found: $WAV_FILE"
  exit 1
fi

# --- helper: XML-RPC call to fldigi ---

xmlrpc_call() {
  local method="$1"
  shift
  local params=""
  for p in "$@"; do
    # Detect type: integer if purely digits, string otherwise
    if [[ "$p" =~ ^[0-9]+$ ]]; then
      params="${params}<param><value><int>${p}</int></value></param>"
    else
      params="${params}<param><value><string>${p}</string></value></param>"
    fi
  done

  curl -sf -X POST "http://${FLDIGI_HOST}:${FLDIGI_PORT}/RPC2" \
    -H "Content-Type: text/xml" \
    -d "<?xml version=\"1.0\"?><methodCall><methodName>${method}</methodName><params>${params}</params></methodCall>" \
    2>/dev/null || echo ""
}

# Extract the value from an XML-RPC response
extract_value() {
  # Crude but works for fldigi's simple responses
  echo "$1" | sed -n 's/.*<value>\(<[^>]*>\)\?\([^<]*\).*/\2/p' | head -1
}

# --- preflight checks ---

echo "Checking fldigi connection at ${FLDIGI_HOST}:${FLDIGI_PORT}..."
FLDIGI_VERSION=$(extract_value "$(xmlrpc_call fldigi.version)")
if [ -z "$FLDIGI_VERSION" ]; then
  echo "Error: Cannot connect to fldigi XML-RPC at ${FLDIGI_HOST}:${FLDIGI_PORT}"
  echo "Make sure fldigi is running with XML-RPC enabled. See docs/development.md"
  exit 1
fi
echo "Connected to fldigi ${FLDIGI_VERSION}"

# Get current mode
FLDIGI_MODE=$(extract_value "$(xmlrpc_call modem.get_name)")
echo "Current mode: ${FLDIGI_MODE}"
if [ "$FLDIGI_MODE" != "CW" ]; then
  echo "Warning: fldigi is not in CW mode. Setting to CW..."
  xmlrpc_call modem.set_by_name CW > /dev/null
  sleep 0.5
  FLDIGI_MODE=$(extract_value "$(xmlrpc_call modem.get_name)")
  echo "Mode set to: ${FLDIGI_MODE}"
fi

# Record current RX buffer length (so we only show new text)
RX_START=$(extract_value "$(xmlrpc_call text.get_rx_length)")
echo "RX buffer position: ${RX_START}"

# --- detect OS and play WAV ---

echo ""
echo "Playing: ${WAV_FILE}"
echo "---"

OS="$(uname -s)"
case "$OS" in
  Darwin)
    # macOS: try BlackHole first, fall back to default output
    if system_profiler SPAudioDataType 2>/dev/null | grep -q "BlackHole"; then
      afplay -d "BlackHole 2ch" "$WAV_FILE" &
    else
      echo "Warning: BlackHole not detected. Playing to default output."
      echo "         fldigi won't hear this unless your audio routing is set up differently."
      afplay "$WAV_FILE" &
    fi
    ;;
  Linux)
    # Linux: try PulseAudio virtual sink, fall back to paplay default
    if pactl list sinks short 2>/dev/null | grep -q "virtual_cw"; then
      paplay --device=virtual_cw "$WAV_FILE" &
    else
      echo "Warning: virtual_cw sink not found. Playing to default output."
      echo "         Run: pactl load-module module-null-sink sink_name=virtual_cw"
      paplay "$WAV_FILE" &
    fi
    ;;
  *)
    echo "Error: Unsupported OS: $OS"
    exit 1
    ;;
esac

PLAY_PID=$!

# --- poll fldigi RX buffer and print new text ---

echo ""
echo "Decoded text:"

LAST_LENGTH="$RX_START"
while kill -0 "$PLAY_PID" 2>/dev/null; do
  CURRENT_LENGTH=$(extract_value "$(xmlrpc_call text.get_rx_length)")
  if [ -n "$CURRENT_LENGTH" ] && [ "$CURRENT_LENGTH" -gt "$LAST_LENGTH" ] 2>/dev/null; then
    NEW_LEN=$((CURRENT_LENGTH - LAST_LENGTH))
    NEW_TEXT=$(extract_value "$(xmlrpc_call text.get_rx "$LAST_LENGTH" "$NEW_LEN")")
    if [ -n "$NEW_TEXT" ]; then
      printf '%s' "$NEW_TEXT"
    fi
    LAST_LENGTH="$CURRENT_LENGTH"
  fi
  sleep "$POLL_INTERVAL"
done

# One final poll after playback finishes (decoder may still have buffered text)
sleep 1
CURRENT_LENGTH=$(extract_value "$(xmlrpc_call text.get_rx_length)")
if [ -n "$CURRENT_LENGTH" ] && [ "$CURRENT_LENGTH" -gt "$LAST_LENGTH" ] 2>/dev/null; then
  NEW_LEN=$((CURRENT_LENGTH - LAST_LENGTH))
  NEW_TEXT=$(extract_value "$(xmlrpc_call text.get_rx "$LAST_LENGTH" "$NEW_LEN")")
  if [ -n "$NEW_TEXT" ]; then
    printf '%s' "$NEW_TEXT"
  fi
fi

echo ""
echo "---"
echo "Done."
