import { describe, expect, test } from "bun:test";
import { DEFAULT_TRANSCODE_CONFIG } from "@/core/processor/config";

describe("Default Transcode Config", () => {
  test("should have correct default values", () => {
    expect(DEFAULT_TRANSCODE_CONFIG.format).toBe("mp4");
    expect(DEFAULT_TRANSCODE_CONFIG.fps).toBe(30);
    expect(DEFAULT_TRANSCODE_CONFIG.width).toBe(1280);
    expect(DEFAULT_TRANSCODE_CONFIG.height).toBe(720);
    expect(DEFAULT_TRANSCODE_CONFIG.bitrate).toBe(500_000);
    expect(DEFAULT_TRANSCODE_CONFIG.audioCodec).toBe("aac");
    expect(DEFAULT_TRANSCODE_CONFIG.preset).toBe("medium");
    expect(DEFAULT_TRANSCODE_CONFIG.packetCount).toBe(1200);
  });

  test("should be a readonly object", () => {
    expect(Object.isFrozen(DEFAULT_TRANSCODE_CONFIG)).toBe(true);
  });

  test("should have all required properties", () => {
    expect(DEFAULT_TRANSCODE_CONFIG).toHaveProperty("format");
    expect(DEFAULT_TRANSCODE_CONFIG).toHaveProperty("fps");
    expect(DEFAULT_TRANSCODE_CONFIG).toHaveProperty("width");
    expect(DEFAULT_TRANSCODE_CONFIG).toHaveProperty("height");
    expect(DEFAULT_TRANSCODE_CONFIG).toHaveProperty("bitrate");
    expect(DEFAULT_TRANSCODE_CONFIG).toHaveProperty("audioCodec");
    expect(DEFAULT_TRANSCODE_CONFIG).toHaveProperty("preset");
    expect(DEFAULT_TRANSCODE_CONFIG).toHaveProperty("packetCount");
  });
});
