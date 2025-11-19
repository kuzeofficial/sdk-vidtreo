import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  Conversion,
  FilePathSource,
  Input,
  Mp4OutputFormat,
  Output,
} from "mediabunny";
import { DEFAULT_TRANSCODE_CONFIG } from "./config";
import type { TranscodeConfig, TranscodeInput, TranscodeResult } from "./types";

function createSource(input: TranscodeInput): BlobSource | FilePathSource {
  if (typeof input === "string") {
    return new FilePathSource(input);
  }
  if (input instanceof Blob) {
    return new BlobSource(input);
  }
  throw new Error("Invalid input type. Expected Blob, File, or file path string.");
}

function createConversionOptions(config: TranscodeConfig) {
  const video = {
    width: config.width,
    height: config.height,
    fit: "contain" as const,
    frameRate: config.fps,
    bitrate: config.bitrate,
    forceTranscode: true,
  };
  const audio = {
    codec: config.audioCodec,
    forceTranscode: true,
  };
  return { video, audio };
}

function validateConversion(conversion: Conversion): void {
  if (!conversion.isValid) {
    const reasons = conversion.discardedTracks.map((track) => track.reason).join(", ");
    throw new Error(`Conversion is invalid. Discarded tracks: ${reasons}`);
  }
}

export async function transcodeVideo(
  input: TranscodeInput,
  config: Partial<TranscodeConfig> = {},
  onProgress?: (progress: number) => void
): Promise<TranscodeResult> {
  const finalConfig: TranscodeConfig = {
    ...DEFAULT_TRANSCODE_CONFIG,
    ...config,
  };

  const source = createSource(input);
  const mediabunnyInput = new Input({
    formats: ALL_FORMATS,
    source,
  });

  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget(),
  });

  const conversion = await Conversion.init({
    input: mediabunnyInput,
    output,
    ...createConversionOptions(finalConfig),
  });

  validateConversion(conversion);

  if (onProgress) {
    conversion.onProgress = onProgress;
  }

  await conversion.execute();

  const buffer = output.target.buffer;
  if (!buffer) {
    throw new Error("Transcoding completed but no output buffer was generated");
  }

  return {
    buffer,
    blob: new Blob([buffer], { type: "video/mp4" }),
  };
}
