import { describe, expect, test } from "bun:test";
import { DEFAULT_TRANSCODE_CONFIG } from "@/core/config/default-config";
import { transcodeVideo } from "@/core/processor/processor";
import type {
  TranscodeConfig,
  TranscodeInput,
  TranscodeResult,
} from "@/core/processor/types";

describe("Main module exports", () => {
  test("should export transcodeVideo function", () => {
    expect(typeof transcodeVideo).toBe("function");
  });

  test("should export DEFAULT_TRANSCODE_CONFIG", () => {
    expect(DEFAULT_TRANSCODE_CONFIG).toBeDefined();
    expect(DEFAULT_TRANSCODE_CONFIG.format).toBe("mp4");
  });

  test("should export TranscodeConfig type", () => {
    const config: TranscodeConfig = DEFAULT_TRANSCODE_CONFIG;
    expect(config).toBeDefined();
  });

  test("should export TranscodeInput type", () => {
    const input1: TranscodeInput = new Blob(["test"], { type: "video/mp4" });
    const input2: TranscodeInput = "/path/to/video.mp4";
    expect(input1).toBeDefined();
    expect(typeof input2).toBe("string");
  });

  test("should export TranscodeResult type", () => {
    const result: TranscodeResult = {
      buffer: new ArrayBuffer(0),
      blob: new Blob([], { type: "video/mp4" }),
    };
    expect(result).toBeDefined();
  });
});
