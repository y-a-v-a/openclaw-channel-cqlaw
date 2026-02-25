#!/usr/bin/env bash
set -euo pipefail

export HOME="${HOME:-/tmp}"
mkdir -p "${HOME}/.config/pulse"

FLDIGI_HOST="${FLDIGI_HOST:-127.0.0.1}"
FLDIGI_PORT="${FLDIGI_PORT:-7362}"
PULSE_SOCKET="${PULSE_SOCKET:-/tmp/pulse.sock}"
export PULSE_SERVER="${PULSE_SERVER:-unix:${PULSE_SOCKET}}"
export AUDIODEV="${AUDIODEV:-pulse}"

# Start PulseAudio and a null sink for virtual CW audio routing.
cat > /tmp/pulse-daemon.pa <<EOF
load-module module-native-protocol-unix auth-anonymous=1 socket=${PULSE_SOCKET}
load-module module-null-sink sink_name=virtual_cw sink_properties=device.description=CW_Virtual_Input
set-default-sink virtual_cw
EOF

pulseaudio --daemonize=yes --disallow-exit --exit-idle-time=-1 -n -F /tmp/pulse-daemon.pa
sleep 1
pactl set-default-source virtual_cw.monitor >/dev/null 2>&1 || true

# Start fldigi under a virtual X display.
# Explicitly configure XML-RPC endpoint to avoid distro-dependent defaults.
echo "[start-fldigi] Starting fldigi with XML-RPC ${FLDIGI_HOST}:${FLDIGI_PORT}"
exec xvfb-run -a fldigi \
  --xmlrpc-server-address "${FLDIGI_HOST}" \
  --xmlrpc-server-port "${FLDIGI_PORT}"
