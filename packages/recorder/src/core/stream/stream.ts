import { DEFAULT_RECORDING_OPTIONS, DEFAULT_STREAM_CONFIG } from "./config";
import type {
  RecordingOptions,
  StreamConfig,
  StreamEventListener,
  StreamEventMap,
  StreamState,
} from "./types";

export class CameraStreamManager {
  private mediaStream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private state: StreamState = "idle";
  private recordingStartTime = 0;
  private recordingTimer: number | null = null;
  private readonly eventListeners: Map<
    keyof StreamEventMap,
    Set<(data: unknown) => void>
  > = new Map();
  private readonly streamConfig: StreamConfig;
  private readonly recordingOptions: RecordingOptions;

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

  /**
   * Get the current state of the stream manager
   */
  getState(): StreamState {
    return this.state;
  }

  /**
   * Get the current media stream
   */
  getStream(): MediaStream | null {
    return this.mediaStream;
  }

  /**
   * Get the current media recorder
   */
  getRecorder(): MediaRecorder | null {
    return this.mediaRecorder;
  }

  /**
   * Check if currently recording
   */
  isRecording(): boolean {
    return this.state === "recording";
  }

  /**
   * Check if stream is active
   */
  isActive(): boolean {
    return this.state === "active" || this.state === "recording";
  }

  /**
   * Subscribe to an event
   */
  on<T extends keyof StreamEventMap>(
    event: T,
    listener: StreamEventListener<T>
  ): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      // Type assertion is safe here because we know the listener matches the event type
      listeners.add(listener as (data: unknown) => void);
    }

    // Return unsubscribe function
    return () => {
      this.off(event, listener);
    };
  }

  /**
   * Unsubscribe from an event
   */
  off<T extends keyof StreamEventMap>(
    event: T,
    listener: StreamEventListener<T>
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      // Type assertion needed because Set stores (data: unknown) => void
      listeners.delete(listener as (data: unknown) => void);
    }
  }

  /**
   * Subscribe to an event once
   */
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

  /**
   * Emit an event to all listeners
   */
  private emit<T extends keyof StreamEventMap>(
    event: T,
    data: StreamEventMap[T]
  ): void {
    const listeners = this.eventListeners.get(event);
    if (listeners) {
      for (const listener of listeners) {
        try {
          (listener as StreamEventListener<T>)(data);
        } catch (error) {
          console.error(`Error in event listener for ${String(event)}:`, error);
        }
      }
    }
  }

  /**
   * Update state and emit statechange event
   */
  private setState(newState: StreamState): void {
    if (this.state === newState) {
      return;
    }
    const previousState = this.state;
    this.state = newState;
    this.emit("statechange", { state: newState, previousState });
  }

  /**
   * Start the camera stream
   */
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

  /**
   * Stop the camera stream
   */
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

  /**
   * Start recording
   */
  startRecording(): void {
    if (!this.mediaStream) {
      throw new Error("Stream must be started before recording");
    }

    if (this.isRecording()) {
      return;
    }

    this.recordedChunks = [];

    try {
      this.mediaRecorder = new MediaRecorder(
        this.mediaStream,
        this.recordingOptions
      );
    } catch (_error) {
      // Fallback to default mimeType if the preferred one is not supported
      this.mediaRecorder = new MediaRecorder(this.mediaStream);
    }

    this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) {
        this.recordedChunks.push(event.data);
        this.emit("recordingdata", { data: event.data });
      }
    };

    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.recordedChunks, {
        type: this.mediaRecorder?.mimeType || "video/webm",
      });

      this.setState("active");
      this.emit("recordingstop", {
        blob,
        mimeType: this.mediaRecorder?.mimeType || "video/webm",
      });

      this.mediaRecorder = null;
      this.recordedChunks = [];
    };

    this.mediaRecorder.start();
    this.recordingStartTime = Date.now();
    this.setState("recording");

    this.emit("recordingstart", { recorder: this.mediaRecorder });

    // Start timer for recording time updates
    this.recordingTimer = window.setInterval(() => {
      const elapsed = (Date.now() - this.recordingStartTime) / 1000;
      const mins = Math.floor(elapsed / 60);
      const secs = Math.floor(elapsed % 60);
      const formatted = `${mins.toString().padStart(2, "0")}:${secs
        .toString()
        .padStart(2, "0")}`;

      this.emit("recordingtimeupdate", { elapsed, formatted });
    }, 1000);
  }

  /**
   * Stop recording
   */
  stopRecording(): void {
    if (!(this.mediaRecorder && this.isRecording())) {
      return;
    }

    this.setState("stopping");

    if (this.recordingTimer !== null) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }

    this.mediaRecorder.stop();
  }

  /**
   * Get the recorded blob (available after stopRecording)
   */
  getRecordedBlob(): Blob | null {
    if (this.recordedChunks.length === 0) {
      return null;
    }
    return new Blob(this.recordedChunks, {
      type: this.mediaRecorder?.mimeType || "video/webm",
    });
  }

  /**
   * Cleanup all resources
   */
  destroy(): void {
    this.stopRecording();
    this.stopStream();

    if (this.recordingTimer !== null) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }

    // Clear all event listeners
    this.eventListeners.clear();
    this.setState("idle");
  }
}
