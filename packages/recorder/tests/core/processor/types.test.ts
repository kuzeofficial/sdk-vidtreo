import { describe, expect, test } from "bun:test";
import type {
  TranscodeConfig,
  TranscodeInput,
  TranscodeResult,
} from "@/core/processor/types";

describe("TranscodeConfig Type", () => {
  test("should accept valid config values", () => {
    const validConfig: TranscodeConfig = {
      format: "mp4",
      fps: 30,
      width: 1280,
      height: 720,
      bitrate: 500_000,
      audioCodec: "aac",
      preset: "medium",
      packetCount: 1200,
    };

    expect(validConfig.format).toBe("mp4");
    expect(validConfig.fps).toBe(30);
    expect(validConfig.width).toBe(1280);
    expect(validConfig.height).toBe(720);
    expect(validConfig.bitrate).toBe(500_000);
    expect(validConfig.audioCodec).toBe("aac");
    expect(validConfig.preset).toBe("medium");
    expect(validConfig.packetCount).toBe(1200);
  });
});

describe("TranscodeInput Type", () => {
  test("should accept Blob as input", () => {
    const blob: TranscodeInput = new Blob(["test"], { type: "video/mp4" });
    expect(blob).toBeInstanceOf(Blob);
  });

  test("should accept File as input", () => {
    const file: TranscodeInput = new File(["test"], "test.mp4", {
      type: "video/mp4",
    });
    expect(file).toBeInstanceOf(File);
  });

  test("should accept string path as input", () => {
    const path: TranscodeInput = "/path/to/video.mp4";
    expect(typeof path).toBe("string");
  });
});

describe("TranscodeResult Type", () => {
  test("should have buffer and blob properties", () => {
    const buffer = new ArrayBuffer(100);
    const blob = new Blob([buffer], { type: "video/mp4" });
    const result: TranscodeResult = { buffer, blob };

    expect(result.buffer).toBeInstanceOf(ArrayBuffer);
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.buffer.byteLength).toBe(100);
    expect(result.blob.type).toBe("video/mp4");
  });
});
