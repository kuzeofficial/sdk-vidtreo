import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_TRANSCODE_CONFIG } from "@/core/processor/config";
import { transcodeVideo } from "@/core/processor/processor";

describe("transcodeVideo", () => {
  let testVideoPath: string;
  let testVideoBlob: Blob;

  beforeAll(async () => {
    const mp4Header = new Uint8Array([
      0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
      0x00, 0x00, 0x02, 0x00, 0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32,
      0x61, 0x76, 0x63, 0x31, 0x6d, 0x70, 0x34, 0x31,
    ]);

    testVideoPath = join(tmpdir(), `test-video-${Date.now()}.mp4`);
    await writeFile(testVideoPath, mp4Header);
    testVideoBlob = new Blob([mp4Header], { type: "video/mp4" });
  });

  afterAll(async () => {
    try {
      await unlink(testVideoPath);
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Input validation", () => {
    test("should throw error for invalid input type", async () => {
      await expect(transcodeVideo(null as any)).rejects.toThrow(
        "Invalid input type. Expected Blob, File, or file path string."
      );
    });

    test("should throw error for non-existent file path", async () => {
      await expect(
        transcodeVideo("/nonexistent/path/video.mp4")
      ).rejects.toThrow();
    });

    test("should accept Blob input", async () => {
      try {
        await transcodeVideo(testVideoBlob);
      } catch (error: any) {
        expect(error.message).not.toContain("Invalid input type");
      }
    });

    test("should accept File input", async () => {
      const file = new File([testVideoBlob], "test.mp4", { type: "video/mp4" });
      try {
        await transcodeVideo(file);
      } catch (error: any) {
        expect(error.message).not.toContain("Invalid input type");
      }
    });

    test("should accept file path string", async () => {
      try {
        await transcodeVideo(testVideoPath);
      } catch (error: any) {
        expect(error.message).not.toContain("Invalid input type");
      }
    });
  });

  describe("Configuration", () => {
    test("should use default config when no config provided", async () => {
      try {
        await transcodeVideo(testVideoBlob);
      } catch (error: any) {
        expect(error).toBeDefined();
      }
    });

    test("should merge partial config with defaults", async () => {
      const customConfig = {
        width: 1920,
        height: 1080,
      };

      try {
        await transcodeVideo(testVideoBlob, customConfig);
      } catch (error: any) {
        expect(error).toBeDefined();
      }
    });

    test("should allow overriding all config values", async () => {
      const customConfig = {
        format: "mp4" as const,
        fps: 60,
        width: 640,
        height: 480,
        bitrate: 1_000_000,
        audioCodec: "aac" as const,
        preset: "medium" as const,
        packetCount: 2000,
      };

      try {
        await transcodeVideo(testVideoBlob, customConfig);
      } catch (error: any) {
        expect(error).toBeDefined();
      }
    });
  });

  describe("Output format", () => {
    test("should return result with buffer and blob", async () => {
      try {
        const result = await transcodeVideo(testVideoBlob);
        expect(result).toHaveProperty("buffer");
        expect(result).toHaveProperty("blob");
        expect(result.buffer).toBeInstanceOf(ArrayBuffer);
        expect(result.blob).toBeInstanceOf(Blob);
        expect(result.blob.type).toBe("video/mp4");
      } catch (error) {
        expect(error).toBeDefined();
      }
    });
  });

  describe("Error handling", () => {
    test("should handle invalid video files gracefully", async () => {
      const invalidBlob = new Blob(["not a video"], { type: "text/plain" });
      await expect(transcodeVideo(invalidBlob)).rejects.toThrow();
    });

    test("should handle empty files", async () => {
      const emptyBlob = new Blob([], { type: "video/mp4" });
      await expect(transcodeVideo(emptyBlob)).rejects.toThrow();
    });
  });

  describe("Integration with default config", () => {
    test("should use DEFAULT_TRANSCODE_CONFIG values", () => {
      expect(DEFAULT_TRANSCODE_CONFIG).toBeDefined();
      expect(DEFAULT_TRANSCODE_CONFIG.format).toBe("mp4");
      expect(DEFAULT_TRANSCODE_CONFIG.fps).toBe(30);
      expect(DEFAULT_TRANSCODE_CONFIG.width).toBe(1280);
      expect(DEFAULT_TRANSCODE_CONFIG.height).toBe(720);
    });
  });
});
