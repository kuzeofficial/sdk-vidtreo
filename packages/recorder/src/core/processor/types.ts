export type TranscodeConfig = {
  format: "mp4";
  fps: number;
  width: number;
  height: number;
  bitrate: number;
  audioCodec: "aac";
  preset: "medium";
  packetCount: number;
  audioBitrate?: number;
};

export type TranscodeInput = Blob | File | string;

export type TranscodeResult = {
  buffer: ArrayBuffer;
  blob: Blob;
};

export type StreamProcessorResult = {
  blob: Blob;
  totalSize: number;
};

export type StreamProcessorOptions = Record<string, never>;
