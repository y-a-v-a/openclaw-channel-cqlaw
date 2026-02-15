/**
 * Minimal Morse code WAV generator. Converts plain text to CW audio using
 * mathematically precise timing derived from WPM speed.
 *
 * No external audio dependencies — generates PCM WAV from first principles.
 */

// --- Morse alphabet (ITU international) ---

const MORSE_TABLE: Record<string, string> = {
  A: ".-",    B: "-...",  C: "-.-.",  D: "-..",   E: ".",
  F: "..-.",  G: "--.",   H: "....",  I: "..",    J: ".---",
  K: "-.-",   L: ".-..",  M: "--",    N: "-.",    O: "---",
  P: ".--.",  Q: "--.-",  R: ".-.",   S: "...",   T: "-",
  U: "..-",   V: "...-",  W: ".--",   X: "-..-",  Y: "-.--",
  Z: "--..",
  "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
  "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
  ".": ".-.-.-", ",": "--..--", "?": "..--..", "/": "-..-.",
  "=": "-...-",  "'": ".----.", "!": "-.-.--", "(": "-.--.",
  ")": "-.--.-", "&": ".-...",  ":": "---...", ";": "-.-.-.",
  "+": ".-.-.",  "-": "-....-", '"': ".-..-.", "@": ".--.-.",
};

/** CW timing: dit duration in milliseconds at a given WPM using PARIS standard */
function ditMs(wpm: number): number {
  return 1200 / wpm;
}

/**
 * Convert text to a sequence of on/off timing intervals in milliseconds.
 * Positive values = tone on, negative values = silence.
 */
export function textToTimings(text: string, wpm: number): number[] {
  const dit = ditMs(wpm);
  const dah = dit * 3;
  const elementGap = -dit;          // gap between dits/dahs within a character
  const charGap = -dit * 3;         // gap between characters
  const wordGap = -dit * 7;         // gap between words

  const timings: number[] = [];
  const upperText = text.toUpperCase().trim();

  for (let i = 0; i < upperText.length; i++) {
    const ch = upperText[i];

    if (ch === " ") {
      // Replace the trailing charGap with a wordGap
      if (timings.length > 0) {
        timings.pop();
        timings.push(wordGap);
      }
      continue;
    }

    const morse = MORSE_TABLE[ch];
    if (!morse) continue; // skip unsupported characters

    for (let j = 0; j < morse.length; j++) {
      timings.push(morse[j] === "." ? dit : dah);
      if (j < morse.length - 1) {
        timings.push(elementGap);
      }
    }

    timings.push(charGap);
  }

  return timings;
}

/**
 * Generate PCM float samples [-1, 1] from timing intervals.
 * Applies a simple raised-cosine envelope to avoid key clicks.
 */
export function timingsToSamples(
  timings: number[],
  toneHz: number,
  sampleRate: number
): Float64Array {
  // Count total samples needed
  let totalSamples = 0;
  for (const t of timings) {
    totalSamples += Math.round((Math.abs(t) / 1000) * sampleRate);
  }
  // Add 200ms tail padding
  const paddingSamples = Math.round(0.2 * sampleRate);
  totalSamples += paddingSamples;

  const samples = new Float64Array(totalSamples);
  const angularFreq = 2 * Math.PI * toneHz / sampleRate;

  // Rise/fall time for key-click suppression (5ms cosine ramp)
  const rampSamples = Math.round(0.005 * sampleRate);

  let offset = 0;
  let phase = 0;

  for (const t of timings) {
    const duration = Math.round((Math.abs(t) / 1000) * sampleRate);
    const isOn = t > 0;

    for (let i = 0; i < duration; i++) {
      if (isOn) {
        // Raised-cosine envelope at edges
        let envelope = 1.0;
        if (i < rampSamples) {
          envelope = 0.5 * (1 - Math.cos((Math.PI * i) / rampSamples));
        } else if (i > duration - rampSamples) {
          envelope =
            0.5 *
            (1 - Math.cos((Math.PI * (duration - i)) / rampSamples));
        }
        samples[offset] = envelope * Math.sin(phase);
        phase += angularFreq;
      }
      // silence: samples[offset] stays 0
      offset++;
    }
  }

  return samples;
}

/**
 * Add white Gaussian noise at the specified signal-to-noise ratio (dB).
 * SNR = 10 * log10(signalPower / noisePower)
 */
export function addNoise(
  samples: Float64Array,
  snrDb: number
): Float64Array {
  // Measure signal power (only over non-zero portions to avoid diluting)
  let signalEnergy = 0;
  let signalCount = 0;
  for (let i = 0; i < samples.length; i++) {
    if (samples[i] !== 0) {
      signalEnergy += samples[i] * samples[i];
      signalCount++;
    }
  }
  if (signalCount === 0) return samples;

  const signalPower = signalEnergy / signalCount;
  const noisePower = signalPower / Math.pow(10, snrDb / 10);
  const noiseAmp = Math.sqrt(noisePower);

  const noisy = new Float64Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    // Box-Muller Gaussian noise
    const u1 = Math.random() || 1e-10;
    const u2 = Math.random();
    const gaussian =
      Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    noisy[i] = samples[i] + gaussian * noiseAmp;
  }

  return noisy;
}

// --- WAV file encoding ---

/** Encode float samples as a 16-bit PCM WAV file. */
export function encodeWav(
  samples: Float64Array,
  sampleRate: number
): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * blockAlign;
  const fileSize = 44 + dataSize; // 44-byte header + data

  const buffer = Buffer.alloc(fileSize);
  let pos = 0;

  // RIFF header
  buffer.write("RIFF", pos); pos += 4;
  buffer.writeUInt32LE(fileSize - 8, pos); pos += 4;
  buffer.write("WAVE", pos); pos += 4;

  // fmt sub-chunk
  buffer.write("fmt ", pos); pos += 4;
  buffer.writeUInt32LE(16, pos); pos += 4;          // sub-chunk size
  buffer.writeUInt16LE(1, pos); pos += 2;            // PCM format
  buffer.writeUInt16LE(numChannels, pos); pos += 2;
  buffer.writeUInt32LE(sampleRate, pos); pos += 4;
  buffer.writeUInt32LE(byteRate, pos); pos += 4;
  buffer.writeUInt16LE(blockAlign, pos); pos += 2;
  buffer.writeUInt16LE(bitsPerSample, pos); pos += 2;

  // data sub-chunk
  buffer.write("data", pos); pos += 4;
  buffer.writeUInt32LE(dataSize, pos); pos += 4;

  // PCM samples — clamp to [-1, 1] then scale to 16-bit signed int
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const int16 = Math.round(clamped * 32767);
    buffer.writeInt16LE(int16, pos);
    pos += 2;
  }

  return buffer;
}

/**
 * Generate a complete WAV buffer for the given text at the specified parameters.
 */
export function generateMorseWav(options: {
  text: string;
  wpm: number;
  toneHz: number;
  sampleRate: number;
  noise?: { type: "white"; snrDb: number };
}): Buffer {
  const timings = textToTimings(options.text, options.wpm);
  let samples = timingsToSamples(timings, options.toneHz, options.sampleRate);

  if (options.noise) {
    samples = addNoise(samples, options.noise.snrDb);
  }

  return encodeWav(samples, options.sampleRate);
}
