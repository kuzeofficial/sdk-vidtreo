import type { TranscodeConfig } from "../processor/types";

export type BackendPreset = "sd" | "hd" | "fhd" | "4k";

export type BackendConfigResponse = {
  presetEncoding: BackendPreset;
  max_width: number;
  max_height: number;
};

const BITRATE_MAP: Record<BackendPreset, number> = {
  sd: 500_000,
  hd: 1_000_000,
  fhd: 2_000_000,
  "4k": 8_000_000,
};

const AUDIO_BITRATE = 128_000;

const PACKET_COUNT_MAP: Record<BackendPreset, number> = {
  sd: 800,
  hd: 1200,
  fhd: 2000,
  "4k": 4000,
};

const DEFAULT_FPS = 30;
const DEFAULT_FORMAT = "mp4" as const;
const DEFAULT_AUDIO_CODEC = "aac" as const;
const DEFAULT_PRESET = "medium" as const;

export function mapPresetToConfig(
  preset: BackendPreset,
  maxWidth: number,
  maxHeight: number
): TranscodeConfig {
  if (!(preset in BITRATE_MAP)) {
    throw new Error(`Invalid preset: ${preset}`);
  }

  if (typeof maxWidth !== "number" || maxWidth <= 0) {
    throw new Error("maxWidth must be a positive number");
  }

  if (typeof maxHeight !== "number" || maxHeight <= 0) {
    throw new Error("maxHeight must be a positive number");
  }

  return {
    format: DEFAULT_FORMAT,
    fps: DEFAULT_FPS,
    width: maxWidth,
    height: maxHeight,
    bitrate: BITRATE_MAP[preset],
    audioCodec: DEFAULT_AUDIO_CODEC,
    preset: DEFAULT_PRESET,
    packetCount: PACKET_COUNT_MAP[preset],
    audioBitrate: AUDIO_BITRATE,
  };
}
