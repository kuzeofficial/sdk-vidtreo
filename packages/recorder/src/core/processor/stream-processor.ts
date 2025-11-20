import {
  CanvasSource,
  MediaStreamAudioTrackSource,
  Mp4OutputFormat,
  Output,
  StreamTarget,
  type StreamTargetChunk,
} from "mediabunny";
import type { StreamProcessorResult, TranscodeConfig } from "./types";

export class StreamProcessor {
  private output: Output | null = null;
  private canvasSource: CanvasSource | null = null;
  private audioSource: MediaStreamAudioTrackSource | null = null;
  private offscreenCanvas: OffscreenCanvas | null = null;
  private videoElement: HTMLVideoElement | null = null;
  private clonedAudioTrack: MediaStreamTrack | null = null;
  private timeoutId: number | null = null;
  private isActive = false;
  private startTime = 0;
  private frameCount = 0;
  private chunks: Array<{ data: Uint8Array; position: number }> = [];
  private totalSize = 0;
  private isMuted = false;
  private currentVideoStream: MediaStream | null = null;
  private audioTrack: MediaStreamTrack | null = null;
  private onMuteStateChange?: (muted: boolean) => void;
  private onSourceChange?: (stream: MediaStream) => void;
  private canvasContext: OffscreenCanvasRenderingContext2D | null = null;

  async startProcessing(
    stream: MediaStream,
    config: TranscodeConfig
  ): Promise<void> {
    // Create OffscreenCanvas at target resolution
    this.offscreenCanvas = new OffscreenCanvas(config.width, config.height);

    const ctx = this.offscreenCanvas.getContext("2d", {
      alpha: false, // No transparency needed for video
      desynchronized: true, // Better performance
      willReadFrequently: false, // We're not reading, just encoding
    });

    if (!ctx) {
      throw new Error("Failed to get OffscreenCanvas context");
    }

    // Store context for later use in frame capture
    this.canvasContext = ctx;

    // Setup video element for the stream
    this.videoElement = document.createElement("video");
    this.videoElement.srcObject = stream;
    this.videoElement.autoplay = true;
    this.videoElement.playsInline = true;
    this.videoElement.muted = true; // Mute to avoid feedback

    // Ensure video continues playing even when tab is inactive
    // This prevents the video from pausing when switching tabs
    this.videoElement.addEventListener("pause", () => {
      if (this.isActive && this.videoElement) {
        this.videoElement.play().catch((error) => {
          console.warn("Failed to resume video playback:", error);
        });
      }
    });

    // Wait for video to be ready
    await new Promise<void>((resolve, reject) => {
      if (!this.videoElement) {
        reject(new Error("Video element not created"));
        return;
      }

      this.videoElement.onloadedmetadata = () => {
        this.videoElement?.play().then(resolve).catch(reject);
      };
      this.videoElement.onerror = reject;
    });

    // Store current stream
    this.currentVideoStream = stream;

    // Create Output with fragmented MP4
    const chunks: Array<{ data: Uint8Array; position: number }> = [];

    const writable = new WritableStream<StreamTargetChunk>({
      write: (chunk) => {
        chunks.push({
          data: chunk.data,
          position: chunk.position,
        });
        this.totalSize = Math.max(
          this.totalSize,
          chunk.position + chunk.data.length
        );
      },
    });

    this.output = new Output({
      format: new Mp4OutputFormat({
        fastStart: "fragmented", // Key for progressive writing
      }),
      target: new StreamTarget(writable, {
        chunked: true,
        chunkSize: 16 * 1024 * 1024, // 16 MB chunks
      }),
    });

    // Create CanvasSource for encoding
    const actualFrameRate = config.fps || 30;

    if (!this.offscreenCanvas) {
      throw new Error("OffscreenCanvas not initialized");
    }

    this.canvasSource = new CanvasSource(
      this.offscreenCanvas as unknown as HTMLCanvasElement, // Type assertion needed for OffscreenCanvas
      {
        codec: "avc", // H.264
        bitrate: config.bitrate,
        keyFrameInterval: 5, // seconds
        latencyMode: "realtime", // Low latency
      }
    );

    // Note: CanvasSource doesn't have errorPromise like MediaStreamVideoTrackSource
    // Errors will be caught in the frame capture loop

    this.output.addVideoTrack(this.canvasSource);

    // Add audio track
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      this.clonedAudioTrack = audioTrack.clone();
      this.audioTrack = this.clonedAudioTrack;
      const audioBitrate = config.audioBitrate || 128_000;

      this.audioSource = new MediaStreamAudioTrackSource(
        this.clonedAudioTrack as MediaStreamAudioTrack,
        {
          codec: config.audioCodec || "aac",
          bitrate: audioBitrate,
        }
      );

      // Handle errors
      this.audioSource.errorPromise.catch((error) => {
        console.error("Audio encoding error:", error);
      });

      this.output.addAudioTrack(this.audioSource);
    }

    // Start output
    await this.output.start();

    // Start frame capture loop
    this.isActive = true;
    this.startTime = Date.now();
    this.frameCount = 0;
    this.chunks = chunks;
    this.captureFrame(actualFrameRate);
  }

  private captureFrame(frameRate: number): void {
    if (
      !(
        this.isActive &&
        this.videoElement &&
        this.canvasSource &&
        this.canvasContext
      )
    ) {
      return;
    }

    // Check if video is ready - need at least HAVE_CURRENT_DATA (2)
    if (this.videoElement.readyState < 2) {
      // Video not ready yet, try again after a short delay
      const frameInterval = 1000 / frameRate;
      this.timeoutId = window.setTimeout(
        () => this.captureFrame(frameRate),
        frameInterval
      );
      return;
    }

    // Check if video element has valid dimensions
    if (
      this.videoElement.videoWidth === 0 ||
      this.videoElement.videoHeight === 0
    ) {
      // Video dimensions not available yet, wait a bit
      const frameInterval = 1000 / frameRate;
      this.timeoutId = window.setTimeout(
        () => this.captureFrame(frameRate),
        frameInterval
      );
      return;
    }

    try {
      this.frameCount += 1;
      const elapsed = (Date.now() - this.startTime) / 1000;
      const frameDuration = 1 / frameRate;

      // Clear canvas
      this.canvasContext.clearRect(
        0,
        0,
        this.canvasContext.canvas.width,
        this.canvasContext.canvas.height
      );

      // Draw video frame to canvas maintaining aspect ratio
      // Only draw if video has valid dimensions
      if (
        this.videoElement.videoWidth > 0 &&
        this.videoElement.videoHeight > 0
      ) {
        const videoAspectRatio =
          this.videoElement.videoWidth / this.videoElement.videoHeight;
        const canvasAspectRatio =
          this.canvasContext.canvas.width / this.canvasContext.canvas.height;

        let drawWidth: number;
        let drawHeight: number;
        let drawX: number;
        let drawY: number;

        // Calculate dimensions to maintain aspect ratio (like object-fit: contain)
        if (videoAspectRatio > canvasAspectRatio) {
          // Video is wider - fit to width, center vertically
          drawWidth = this.canvasContext.canvas.width;
          drawHeight = this.canvasContext.canvas.width / videoAspectRatio;
          drawX = 0;
          drawY = (this.canvasContext.canvas.height - drawHeight) / 2;
        } else {
          // Video is taller - fit to height, center horizontally
          drawHeight = this.canvasContext.canvas.height;
          drawWidth = this.canvasContext.canvas.height * videoAspectRatio;
          drawX = (this.canvasContext.canvas.width - drawWidth) / 2;
          drawY = 0;
        }

        // Draw with black background (letterboxing/pillarboxing)
        this.canvasContext.fillStyle = "#000000";
        this.canvasContext.fillRect(
          0,
          0,
          this.canvasContext.canvas.width,
          this.canvasContext.canvas.height
        );

        // Draw video frame maintaining aspect ratio
        this.canvasContext.drawImage(
          this.videoElement,
          drawX,
          drawY,
          drawWidth,
          drawHeight
        );
      }

      // Add frame to encoder
      // First frame should be a keyframe
      const isKeyFrame = this.frameCount === 1;

      this.canvasSource
        .add(
          elapsed,
          frameDuration,
          isKeyFrame ? { keyFrame: true } : undefined
        )
        .catch((error) => {
          // Handle backpressure - encoder might be busy
          console.warn("Frame encoding backpressure:", error);
        });

      // Schedule next frame using setTimeout (works even when tab is inactive)
      const frameInterval = 1000 / frameRate; // milliseconds per frame
      this.timeoutId = window.setTimeout(
        () => this.captureFrame(frameRate),
        frameInterval
      );
    } catch (error) {
      console.error("Frame capture error:", error);
      // Continue anyway
      const frameInterval = 1000 / frameRate;
      this.timeoutId = window.setTimeout(
        () => this.captureFrame(frameRate),
        frameInterval
      );
    }
  }

  async finalize(): Promise<StreamProcessorResult> {
    if (!this.output) {
      throw new Error("Processor not started");
    }

    // Stop frame capture
    this.isActive = false;
    if (this.timeoutId !== null) {
      window.clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    // Cleanup video element
    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }

    // Cleanup audio track
    if (this.clonedAudioTrack) {
      this.clonedAudioTrack.stop();
      this.clonedAudioTrack = null;
    }

    // Close canvas source
    if (this.canvasSource) {
      this.canvasSource.close();
      this.canvasSource = null;
    }

    // Finalize output
    await this.output.finalize();

    // Reconstruct Blob from chunks
    // Sort chunks by position to ensure correct order
    const sortedChunks = [...this.chunks].sort(
      (a, b) => a.position - b.position
    );

    // Create a single ArrayBuffer with all data
    const totalSize = this.totalSize;
    const buffer = new ArrayBuffer(totalSize);
    const view = new Uint8Array(buffer);

    for (const chunk of sortedChunks) {
      view.set(chunk.data, chunk.position);
    }

    const blob = new Blob([buffer], { type: "video/mp4" });

    return {
      blob,
      totalSize,
    };
  }

  toggleMute(): void {
    if (!this.audioTrack) {
      return;
    }

    this.isMuted = !this.isMuted;
    this.audioTrack.enabled = !this.isMuted;

    // Emit event for UI updates
    if (this.onMuteStateChange) {
      this.onMuteStateChange(this.isMuted);
    }
  }

  isMutedState(): boolean {
    return this.isMuted;
  }

  async switchVideoSource(newStream: MediaStream): Promise<void> {
    if (!this.videoElement) {
      throw new Error("Video element not initialized");
    }

    // Switch the video element source
    this.videoElement.srcObject = newStream;

    // Wait for video to be ready before continuing
    await new Promise<void>((resolve, reject) => {
      if (!this.videoElement) {
        reject(new Error("Video element not available"));
        return;
      }

      const onLoadedMetadata = () => {
        this.videoElement?.removeEventListener(
          "loadedmetadata",
          onLoadedMetadata
        );
        this.videoElement?.removeEventListener("error", onError);
        resolve();
      };

      const onError = (_error: Event) => {
        this.videoElement?.removeEventListener(
          "loadedmetadata",
          onLoadedMetadata
        );
        this.videoElement?.removeEventListener("error", onError);
        reject(new Error("Failed to load video metadata"));
      };

      // If already loaded, resolve immediately
      if (this.videoElement.readyState >= 2) {
        resolve();
        return;
      }

      this.videoElement.addEventListener("loadedmetadata", onLoadedMetadata);
      this.videoElement.addEventListener("error", onError);

      // Start playing to trigger loading
      this.videoElement.play().catch(reject);

      // Timeout after 5 seconds
      setTimeout(() => {
        this.videoElement?.removeEventListener(
          "loadedmetadata",
          onLoadedMetadata
        );
        this.videoElement?.removeEventListener("error", onError);
        reject(new Error("Timeout waiting for video to load"));
      }, 5000);
    });

    // Ensure video is playing
    await this.videoElement.play();

    this.currentVideoStream = newStream;

    // Emit event
    if (this.onSourceChange) {
      this.onSourceChange(newStream);
    }
  }

  getCurrentVideoSource(): MediaStream | null {
    return this.currentVideoStream;
  }

  getBufferSize(): number {
    return this.totalSize;
  }

  setOnMuteStateChange(callback: (muted: boolean) => void): void {
    this.onMuteStateChange = callback;
  }

  setOnSourceChange(callback: (stream: MediaStream) => void): void {
    this.onSourceChange = callback;
  }

  async cancel(): Promise<void> {
    this.isActive = false;
    if (this.timeoutId !== null) {
      window.clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.output) {
      await this.output.cancel();
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
      this.videoElement = null;
    }
    if (this.clonedAudioTrack) {
      this.clonedAudioTrack.stop();
      this.clonedAudioTrack = null;
    }
    if (this.canvasSource) {
      this.canvasSource.close();
      this.canvasSource = null;
    }
  }
}
