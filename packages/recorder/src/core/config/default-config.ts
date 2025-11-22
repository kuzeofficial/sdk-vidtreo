import type { TranscodeConfig } from "../processor/types";

export const DEFAULT_TRANSCODE_CONFIG: Readonly<TranscodeConfig> =
  Object.freeze({
    format: "mp4",
    fps: 30,
    width: 1280,
    height: 720,
    bitrate: 500_000,
    audioCodec: "aac",
    preset: "medium",
    packetCount: 1200,
  });
