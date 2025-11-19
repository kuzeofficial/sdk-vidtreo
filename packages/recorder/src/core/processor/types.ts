export type TranscodeConfig = {
  format: "mp4";
  fps: number;
  width: number;
  height: number;
  bitrate: number;
  audioCodec: "aac";
  preset: "medium";
  packetCount: number;
};

export type TranscodeInput = Blob | File | string;

export type TranscodeResult = {
  buffer: ArrayBuffer;
  blob: Blob;
};
