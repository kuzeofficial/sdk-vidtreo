import type { StreamProcessor } from "../processor/stream-processor";
import type { TranscodeConfig } from "../processor/types";
import { DEFAULT_RECORDING_OPTIONS, DEFAULT_STREAM_CONFIG } from "./config";
import type {
  RecordingOptions,
  StreamConfig,
  StreamEventListener,
  StreamEventMap,
  StreamState,
} from "./types";

const FILE_SIZE_UNITS = ["Bytes", "KB", "MB", "GB"] as const;
const FILE_SIZE_BASE = 1024;
const TIMER_INTERVAL = 1000;
const SECONDS_PER_MINUTE = 60;
const MILLISECONDS_PER_SECOND = 1000;

export class CameraStreamManager {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordedMimeType: string | null = null;
  private state: StreamState = "idle";
  private recordingStartTime = 0;
  private recordingTimer: number | null = null;
  private readonly eventListeners: Map<
    keyof StreamEventMap,
    Set<(data: unknown) => void>
  > = new Map();
  private readonly streamConfig: StreamConfig;
  private readonly recordingOptions: RecordingOptions;
  private streamProcessor: StreamProcessor | null = null;
  private bufferSizeUpdateInterval: number | null = null;

  constructor(
    streamConfig: Partial<StreamConfig> = {},
    recordingOptions: Partial<RecordingOptions> = {}
  ) {
    this.streamConfig = { ...DEFAULT_STREAM_CONFIG, ...streamConfig };
    this.recordingOptions = {
      ...DEFAULT_RECORDING_OPTIONS,
      ...recordingOptions,
    };
  }

  getState(): StreamState {
    return this.state;
  }

  getStream(): MediaStream | null {
    return this.mediaStream;
  }

  getRecorder(): MediaRecorder | null {
    return this.mediaRecorder;
  }

  isRecording(): boolean {
    return this.state === "recording";
  }

  isActive(): boolean {
    return this.state === "active" || this.state === "recording";
  }

  on<T extends keyof StreamEventMap>(
    event: T,
    listener: StreamEventListener<T>
  ): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.add(listener as (data: unknown) => void);
    }

    return () => {
      this.off(event, listener);
    };
  }

  off<T extends keyof StreamEventMap>(
    event: T,
    listener: StreamEventListener<T>
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(listener as (data: unknown) => void);
    }
  }

  once<T extends keyof StreamEventMap>(
    event: T,
    listener: StreamEventListener<T>
  ): () => void {
    const wrappedListener = ((data: StreamEventMap[T]) => {
      listener(data);
      this.off(event, wrappedListener);
    }) as StreamEventListener<T>;

    return this.on(event, wrappedListener);
  }

  private emit<T extends keyof StreamEventMap>(
    event: T,
    data: StreamEventMap[T]
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          (listener as StreamEventListener<T>)(data);
        } catch {
          // Ignore errors in event listeners
        }
      }
    }
  }

  private setState(newState: StreamState): void {
    if (this.state === newState) {
      return;
    }
    const previousState = this.state;
    this.state = newState;
    this.emit("statechange", { state: newState, previousState });
  }

  async startStream(): Promise<MediaStream> {
    if (this.mediaStream) {
      return this.mediaStream;
    }

    this.setState("starting");

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia(
        this.streamConfig
      );

      this.setState("active");
      this.emit("streamstart", { stream: this.mediaStream });

      return this.mediaStream;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.setState("error");
      this.emit("error", { error: err });
      throw err;
    }
  }

  stopStream(): void {
    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        track.stop();
      }
      this.mediaStream = null;
    }

    if (this.state !== "idle") {
      this.setState("idle");
      this.emit("streamstop", undefined);
    }
  }

  startRecording(): void {
    if (!this.mediaStream) {
      throw new Error("Stream must be started before recording");
    }

    if (this.isRecording()) {
      return;
    }

    this.recordedChunks = [];
    this.recordedMimeType = null;

    try {
      this.mediaRecorder = new MediaRecorder(
        this.mediaStream,
        this.recordingOptions
      );
    } catch {
      this.mediaRecorder = new MediaRecorder(this.mediaStream);
    }

    this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        this.recordedChunks.push(event.data);
        this.emit("recordingdata", { data: event.data });
      }
    };

    this.mediaRecorder.onstop = () => {
      if (!this.mediaRecorder) {
        throw new Error("MediaRecorder is missing in onstop handler");
      }

      const mimeType = this.mediaRecorder.mimeType;
      if (!mimeType) {
        throw new Error("MediaRecorder mimeType is missing");
      }

      this.recordedMimeType = mimeType;

      const blob = new Blob(this.recordedChunks, {
        type: mimeType,
      });

      this.setState("active");
      this.emit("recordingstop", {
        blob,
        mimeType,
      });

      this.mediaRecorder = null;
      this.recordedChunks = [];
    };

    this.mediaRecorder.start();
    this.recordingStartTime = Date.now();
    this.setState("recording");

    this.emit("recordingstart", { recorder: this.mediaRecorder });

    this.startRecordingTimer();
  }

  stopRecording(): void {
    if (!(this.mediaRecorder && this.isRecording())) {
      return;
    }

    this.setState("stopping");
    this.clearRecordingTimer();
    this.mediaRecorder.stop();
  }

  async startRecordingWithMediabunny(
    processor: StreamProcessor,
    config: TranscodeConfig
  ): Promise<void> {
    if (!this.mediaStream) {
      throw new Error("Stream must be started before recording");
    }

    if (this.isRecording()) {
      return;
    }

    this.streamProcessor = processor;

    await processor.startProcessing(this.mediaStream, config);

    this.bufferSizeUpdateInterval = window.setInterval(() => {
      if (!this.streamProcessor) {
        return;
      }
      const size = this.streamProcessor.getBufferSize();
      const formatted = this.formatFileSize(size);
      this.emit("recordingbufferupdate", { size, formatted });
    }, TIMER_INTERVAL);

    processor.setOnMuteStateChange((muted: boolean) => {
      this.emit("audiomutetoggle", { muted });
    });

    processor.setOnSourceChange((stream: MediaStream) => {
      this.emit("videosourcechange", { stream });
    });

    this.recordingStartTime = Date.now();
    this.setState("recording");

    this.emit("recordingstart", { recorder: null });

    this.startRecordingTimer();
  }

  async stopRecordingWithMediabunny(): Promise<Blob> {
    if (!(this.streamProcessor && this.isRecording())) {
      throw new Error("Not recording with mediabunny");
    }

    this.setState("stopping");

    this.clearRecordingTimer();
    this.clearBufferSizeInterval();

    const result = await this.streamProcessor.finalize();

    this.setState("active");
    this.emit("recordingstop", {
      blob: result.blob,
      mimeType: "video/mp4",
    });

    this.streamProcessor = null;
    return result.blob;
  }

  toggleMute(): void {
    if (!this.streamProcessor) {
      throw new Error("StreamProcessor is required to toggle mute");
    }
    this.streamProcessor.toggleMute();
  }

  isMuted(): boolean {
    if (!this.streamProcessor) {
      throw new Error("StreamProcessor is required to check mute state");
    }
    return this.streamProcessor.isMutedState();
  }

  async switchVideoSource(newStream: MediaStream): Promise<void> {
    if (!this.streamProcessor) {
      throw new Error("StreamProcessor is required to switch video source");
    }
    await this.streamProcessor.switchVideoSource(newStream);
  }

  setMediaStream(stream: MediaStream): void {
    this.mediaStream = stream;
  }

  getCurrentVideoSource(): MediaStream {
    if (!this.streamProcessor) {
      throw new Error(
        "StreamProcessor is required to get current video source"
      );
    }
    const source = this.streamProcessor.getCurrentVideoSource();
    if (!source) {
      throw new Error("Current video source is not available");
    }
    return source;
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) {
      return "0 Bytes";
    }
    const index = Math.floor(Math.log(bytes) / Math.log(FILE_SIZE_BASE));
    const size = Math.round((bytes / FILE_SIZE_BASE ** index) * 100) / 100;
    return `${size} ${FILE_SIZE_UNITS[index]}`;
  }

  private formatTimeElapsed(elapsedSeconds: number): string {
    const mins = Math.floor(elapsedSeconds / SECONDS_PER_MINUTE);
    const secs = Math.floor(elapsedSeconds % SECONDS_PER_MINUTE);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }

  private startRecordingTimer(): void {
    this.recordingTimer = window.setInterval(() => {
      const elapsed =
        (Date.now() - this.recordingStartTime) / MILLISECONDS_PER_SECOND;
      const formatted = this.formatTimeElapsed(elapsed);
      this.emit("recordingtimeupdate", { elapsed, formatted });
    }, TIMER_INTERVAL);
  }

  private clearRecordingTimer(): void {
    if (this.recordingTimer !== null) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }
  }

  private clearBufferSizeInterval(): void {
    if (this.bufferSizeUpdateInterval !== null) {
      clearInterval(this.bufferSizeUpdateInterval);
      this.bufferSizeUpdateInterval = null;
    }
  }

  getRecordedBlob(): Blob {
    if (this.recordedChunks.length === 0) {
      throw new Error("No recorded chunks available");
    }

    if (!this.recordedMimeType) {
      throw new Error("Recorded mimeType is missing");
    }

    return new Blob(this.recordedChunks, {
      type: this.recordedMimeType,
    });
  }

  destroy(): void {
    this.stopRecording();
    if (this.streamProcessor) {
      this.streamProcessor.cancel().catch(() => {
        // Ignore errors during cleanup
      });
      this.streamProcessor = null;
    }
    this.stopStream();

    this.clearRecordingTimer();
    this.clearBufferSizeInterval();

    this.eventListeners.clear();
    this.setState("idle");
  }
}
