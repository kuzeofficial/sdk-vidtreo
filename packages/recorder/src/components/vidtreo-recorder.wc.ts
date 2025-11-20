import { DEFAULT_TRANSCODE_CONFIG } from "../core/processor/config";
import { transcodeVideo } from "../core/processor/processor";
import { StreamProcessor } from "../core/processor/stream-processor";
import { DEFAULT_STREAM_CONFIG } from "../core/stream/config";
import { CameraStreamManager } from "../core/stream/stream";
import "../styles/tailwind.css";

export class VidtreoRecorder extends HTMLElement {
  private readonly streamManager: CameraStreamManager;
  private recordedBlob: Blob | null = null;
  private processedBlob: Blob | null = null;
  private isProcessing = false;
  private streamProcessor: StreamProcessor | null = null;
  private currentSourceType: "camera" | "screen" = "camera";
  private originalCameraStream: MediaStream | null = null;
  private screenShareTrackEndHandler: (() => void) | null = null;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.streamManager = new CameraStreamManager();
    // Setup event listeners
    this.streamManager.on("statechange", ({ state, previousState }) => {
      this.handleStateChange(state, previousState);
    });
    this.streamManager.on("streamstart", ({ stream }) => {
      this.handleStreamStart(stream);
    });
    this.streamManager.on("streamstop", () => {
      this.handleStreamStop();
    });
    this.streamManager.on("recordingstart", () => {
      this.handleRecordingStart();
    });
    this.streamManager.on("recordingstop", ({ blob }) => {
      this.handleRecordingStop(blob);
    });
    this.streamManager.on("recordingtimeupdate", ({ formatted }) => {
      this.updateRecordingTimer(formatted);
    });
    this.streamManager.on("recordingbufferupdate", ({ formatted }) => {
      this.updateBufferSize(formatted);
    });
    this.streamManager.on("audiomutetoggle", ({ muted }) => {
      this.updateMuteState(muted);
    });
    this.streamManager.on("videosourcechange", ({ stream }) => {
      // Update preview video element when source changes in real-time
      const videoPreview = this.shadow.querySelector(
        "#videoPreview"
      ) as HTMLVideoElement;
      if (videoPreview) {
        videoPreview.srcObject = stream;
        videoPreview.play().catch((error) => {
          console.warn("Failed to play preview video:", error);
        });
      }
    });
    this.streamManager.on("error", ({ error }) => {
      this.showError(error.message);
    });
    this.render();
    this.attachEventListeners();
  }

  connectedCallback(): void {
    // Automatically start camera when component is mounted
    this.startCamera().catch((error) => {
      this.showError(
        error instanceof Error ? error.message : "Failed to start camera"
      );
    });
  }

  disconnectedCallback(): void {
    this.streamManager.destroy();
  }

  private get shadow(): ShadowRoot {
    if (!this.shadowRoot) {
      throw new Error("Shadow root not initialized");
    }
    return this.shadowRoot;
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) {
      return "0 Bytes";
    }
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round((bytes / k ** i) * 100) / 100} ${sizes[i]}`;
  }

  private showError(message: string): void {
    const errorEl = this.shadow.querySelector("#error") as HTMLElement;
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add("active");
    }
  }

  private hideError(): void {
    const errorEl = this.shadow.querySelector("#error") as HTMLElement;
    if (errorEl) {
      errorEl.classList.remove("active");
    }
  }

  private showResult(originalSize: number, processedSize: number): void {
    const resultEl = this.shadow.querySelector("#result") as HTMLElement;
    const resultInfoEl = this.shadow.querySelector(
      "#resultInfo"
    ) as HTMLElement;
    if (resultEl && resultInfoEl) {
      resultInfoEl.textContent = `Original: ${this.formatFileSize(originalSize)} → Processed: ${this.formatFileSize(processedSize)}`;
      resultEl.classList.add("active");
    }
  }

  private hideResult(): void {
    const resultEl = this.shadow.querySelector("#result") as HTMLElement;
    if (resultEl) {
      resultEl.classList.remove("active");
    }
  }

  private updateProgress(percentage: number, text?: string): void {
    const percentageValue = Math.round(percentage * 100);
    const progressFillEl = this.shadow.querySelector(
      "#progressFill"
    ) as HTMLElement;
    const progressTextEl = this.shadow.querySelector(
      "#progressText"
    ) as HTMLElement;

    if (progressFillEl) {
      progressFillEl.style.width = `${percentageValue}%`;
    }
    if (progressTextEl) {
      progressTextEl.textContent = text || `Transcoding... ${percentageValue}%`;
    }
  }

  private showProgress(): void {
    const progressEl = this.shadow.querySelector("#progress") as HTMLElement;
    if (progressEl) {
      progressEl.classList.add("active");
    }
  }

  private hideProgress(): void {
    const progressEl = this.shadow.querySelector("#progress") as HTMLElement;
    if (progressEl) {
      progressEl.classList.remove("active");
    }
  }

  private updateRecordingTimer(formatted: string): void {
    const timerEl = this.shadow.querySelector("#recordingTimer") as HTMLElement;
    if (timerEl) {
      timerEl.textContent = formatted;
    }
  }

  private updateBufferSize(formatted: string): void {
    const recordingSize = this.shadow.querySelector(
      "#recordingSize"
    ) as HTMLElement;
    if (recordingSize) {
      recordingSize.textContent = `Size: ${formatted}`;
    }
  }

  private updateMuteState(muted: boolean): void {
    const muteButton = this.shadow.querySelector(
      "#muteButton"
    ) as HTMLButtonElement;
    if (muteButton) {
      muteButton.textContent = muted ? "🔇 Unmute" : "🔊 Mute";
      muteButton.classList.toggle("muted", muted);
    }
  }

  private handleStateChange(state: string, previousState: string): void {
    // Handle UI updates based on state changes
    if (state === "active" && previousState === "starting") {
      this.hideError();
    }
  }

  private handleStreamStart(stream: MediaStream): void {
    const videoPreview = this.shadow.querySelector(
      "#videoPreview"
    ) as HTMLVideoElement;
    if (videoPreview) {
      videoPreview.srcObject = stream;
      videoPreview.play();
    }

    const startButton = this.shadow.querySelector(
      "#startButton"
    ) as HTMLButtonElement;
    const stopButton = this.shadow.querySelector(
      "#stopButton"
    ) as HTMLButtonElement;
    const cameraArea = this.shadow.querySelector("#cameraArea") as HTMLElement;
    const startCameraArea = this.shadow.querySelector(
      "#startCameraArea"
    ) as HTMLElement;

    if (startButton) {
      startButton.disabled = false;
    }
    if (stopButton) {
      stopButton.disabled = true;
    }
    if (cameraArea) {
      cameraArea.classList.add("active");
    }
    if (startCameraArea) {
      startCameraArea.style.display = "none";
    }
  }

  private handleStreamStop(): void {
    const videoPreview = this.shadow.querySelector(
      "#videoPreview"
    ) as HTMLVideoElement;
    if (videoPreview) {
      videoPreview.srcObject = null;
    }

    const cameraArea = this.shadow.querySelector("#cameraArea") as HTMLElement;
    if (cameraArea) {
      cameraArea.classList.remove("active");
    }
  }

  private handleRecordingStart(): void {
    const startButton = this.shadow.querySelector(
      "#startButton"
    ) as HTMLButtonElement;
    const stopButton = this.shadow.querySelector(
      "#stopButton"
    ) as HTMLButtonElement;
    const recordingIndicator = this.shadow.querySelector(
      "#recordingIndicator"
    ) as HTMLElement;
    const recordingTimer = this.shadow.querySelector(
      "#recordingTimer"
    ) as HTMLElement;
    const recordingInfo = this.shadow.querySelector(
      "#recordingInfo"
    ) as HTMLElement;

    if (startButton) {
      startButton.disabled = true;
    }
    if (stopButton) {
      stopButton.disabled = false;
    }
    if (recordingIndicator) {
      recordingIndicator.classList.add("active");
    }
    if (recordingTimer) {
      recordingTimer.textContent = "00:00";
    }

    // Show recording info to display buffer size
    if (recordingInfo) {
      recordingInfo.classList.add("active");
    }

    // Show mute button when recording starts
    const muteButton = this.shadow.querySelector(
      "#muteButton"
    ) as HTMLButtonElement;
    if (muteButton) {
      muteButton.disabled = false;
      muteButton.style.display = "block";
    }

    // Show switch source button when recording starts
    const switchSourceButton = this.shadow.querySelector(
      "#switchSourceButton"
    ) as HTMLButtonElement;
    if (switchSourceButton) {
      switchSourceButton.disabled = false;
      switchSourceButton.style.display = "block";
    }

    this.hideError();
    this.hideResult();
  }

  private updateRecordingControlsAfterStop(): void {
    const startButton = this.shadow.querySelector(
      "#startButton"
    ) as HTMLButtonElement;
    const stopButton = this.shadow.querySelector(
      "#stopButton"
    ) as HTMLButtonElement;
    const recordingIndicator = this.shadow.querySelector(
      "#recordingIndicator"
    ) as HTMLElement;
    const processButton = this.shadow.querySelector(
      "#processButton"
    ) as HTMLButtonElement;
    const muteButton = this.shadow.querySelector(
      "#muteButton"
    ) as HTMLButtonElement;
    const switchSourceButton = this.shadow.querySelector(
      "#switchSourceButton"
    ) as HTMLButtonElement;

    if (startButton) {
      startButton.disabled = false;
    }
    if (stopButton) {
      stopButton.disabled = true;
    }
    if (recordingIndicator) {
      recordingIndicator.classList.remove("active");
    }
    if (processButton) {
      processButton.style.display = "none";
    }
    if (muteButton) {
      muteButton.disabled = true;
      muteButton.style.display = "none";
    }
    if (switchSourceButton) {
      switchSourceButton.disabled = true;
      switchSourceButton.style.display = "none";
    }
  }

  private handleScreenRecordingStop(): void {
    const currentStream = this.streamManager.getStream();
    if (currentStream) {
      this.stopStreamTracks(currentStream);
    }
    this.streamManager.startStream().catch((error) => {
      this.showError(
        error instanceof Error ? error.message : "Failed to restart camera"
      );
    });
  }

  private cleanupScreenShareTrackHandler(): void {
    if (!this.screenShareTrackEndHandler) {
      return;
    }

    const currentStream = this.streamManager.getStream();
    if (currentStream) {
      const videoTrack = currentStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.removeEventListener(
          "ended",
          this.screenShareTrackEndHandler
        );
      }
    }
    this.screenShareTrackEndHandler = null;
  }

  private handleRecordingStop(blob: Blob): void {
    this.recordedBlob = blob;
    this.updateRecordingControlsAfterStop();

    if (this.currentSourceType === "screen") {
      this.handleScreenRecordingStop();
    }

    this.currentSourceType = "camera";
    this.originalCameraStream = null;
    this.cleanupScreenShareTrackHandler();

    this.updateRecordingInfo();
    this.streamProcessor = null;
  }

  private async startCamera(): Promise<void> {
    // Show loading state
    const startCameraArea = this.shadow.querySelector(
      "#startCameraArea"
    ) as HTMLElement;
    if (startCameraArea) {
      startCameraArea.classList.add("loading");
    }

    try {
      await this.streamManager.startStream();
    } catch (_error) {
      // Show error and keep start camera area visible for retry
      const errorCameraArea = this.shadow.querySelector(
        "#startCameraArea"
      ) as HTMLElement;
      const startCameraButton = this.shadow.querySelector(
        "#startCameraButton"
      ) as HTMLButtonElement;
      const cameraText = errorCameraArea?.querySelector(
        ".camera-text"
      ) as HTMLElement;

      if (errorCameraArea) {
        errorCameraArea.classList.remove("loading");
        errorCameraArea.style.display = "block";
      }
      if (startCameraButton) {
        startCameraButton.style.display = "block";
      }
      if (cameraText) {
        cameraText.textContent = "Failed to start camera";
      }
      // Error is already shown via event listener
    }
  }

  private async startRecording(): Promise<void> {
    try {
      // Store reference to original camera stream
      const currentStream = this.streamManager.getStream();
      if (currentStream) {
        this.originalCameraStream = currentStream;
      }

      // Create StreamProcessor instance
      this.streamProcessor = new StreamProcessor();

      // Start recording with mediabunny
      await this.streamManager.startRecordingWithMediabunny(
        this.streamProcessor,
        DEFAULT_TRANSCODE_CONFIG
      );
    } catch (error) {
      this.showError(
        error instanceof Error ? error.message : "Failed to start recording"
      );
    }
  }

  private async stopRecording(): Promise<void> {
    try {
      // Stop mediabunny recording and get final blob
      const blob = await this.streamManager.stopRecordingWithMediabunny();

      // Blob is already processed! No need for separate processing step
      this.processedBlob = blob;
      this.recordedBlob = blob;

      // Show result immediately
      this.showResult(blob.size, blob.size);
    } catch (error) {
      this.showError(
        error instanceof Error ? error.message : "Failed to stop recording"
      );
    }
  }

  private updateRecordingInfo(): void {
    const blob = this.recordedBlob || this.streamManager.getRecordedBlob();
    if (!blob) {
      return;
    }

    const recordingInfo = this.shadow.querySelector(
      "#recordingInfo"
    ) as HTMLElement;
    const recordingSize = this.shadow.querySelector(
      "#recordingSize"
    ) as HTMLElement;

    if (recordingInfo) {
      recordingInfo.classList.add("active");
    }
    if (recordingSize) {
      recordingSize.textContent = `Size: ${this.formatFileSize(blob.size)}`;
    }
  }

  private async processVideo(): Promise<void> {
    if (!this.recordedBlob) {
      throw new Error("No recording available");
    }

    this.isProcessing = true;
    const processButton = this.shadow.querySelector(
      "#processButton"
    ) as HTMLButtonElement;
    if (processButton) {
      processButton.disabled = true;
    }

    this.hideError();
    this.hideResult();
    this.showProgress();
    this.updateProgress(0, "Starting transcoding...");

    try {
      const transcodeResult = await transcodeVideo(
        this.recordedBlob,
        DEFAULT_TRANSCODE_CONFIG,
        (progress: number) => {
          this.updateProgress(progress);
        }
      );

      this.processedBlob = transcodeResult.blob;
      this.updateProgress(1, "Complete!");

      setTimeout(() => {
        this.hideProgress();
        if (!this.recordedBlob) {
          throw new Error("Recorded blob is missing");
        }
        this.showResult(this.recordedBlob.size, transcodeResult.blob.size);
        if (processButton) {
          processButton.disabled = false;
        }
        this.isProcessing = false;
      }, 500);
    } catch (error) {
      this.hideProgress();
      this.showError(
        error instanceof Error
          ? error.message
          : "An error occurred during transcoding"
      );
      if (processButton) {
        processButton.disabled = false;
      }
      this.isProcessing = false;
    }
  }

  private downloadVideo(): void {
    if (!this.processedBlob) {
      throw new Error("No processed video available");
    }

    const url = URL.createObjectURL(this.processedBlob);
    const link = document.createElement("a");
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, -5);
    link.href = url;
    link.download = `vidtreo-recording-${timestamp}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private playVideo(): void {
    if (!this.processedBlob) {
      throw new Error("No processed video available");
    }

    const url = URL.createObjectURL(this.processedBlob);
    const newWindow = window.open();
    if (!newWindow) {
      throw new Error("Failed to open video player window");
    }

    newWindow.document.write(`
      <html>
        <head><title>Recorded Video</title></head>
        <body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh;">
          <video controls autoplay style="max-width:100%;max-height:100vh;">
            <source src="${url}" type="video/mp4">
          </video>
        </body>
      </html>
    `);
  }

  private stopStreamTracks(stream: MediaStream): void {
    for (const track of stream.getTracks()) {
      if (track.readyState === "live") {
        track.stop();
      }
    }
  }

  private async switchToScreenCapture(): Promise<MediaStream> {
    const currentStream = this.streamManager.getStream();
    if (currentStream) {
      this.originalCameraStream = currentStream;
    }

    this.showSourceTransition("Select screen to share...");

    const newStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });

    if (currentStream) {
      this.stopStreamTracks(currentStream);
    }

    this.hideSourceTransition();
    this.currentSourceType = "screen";

    return newStream;
  }

  private setupScreenShareTrackHandler(newStream: MediaStream): void {
    const videoTrack = newStream.getVideoTracks()[0];
    if (!videoTrack) {
      return;
    }

    // Remove previous handler if exists
    if (this.screenShareTrackEndHandler) {
      const oldStream = this.streamManager.getStream();
      if (oldStream) {
        const oldVideoTrack = oldStream.getVideoTracks()[0];
        if (oldVideoTrack) {
          oldVideoTrack.removeEventListener(
            "ended",
            this.screenShareTrackEndHandler
          );
        }
      }
    }

    // Create handler to switch back to camera when screen share ends
    this.screenShareTrackEndHandler = () => {
      if (
        this.streamManager.isRecording() &&
        this.currentSourceType === "screen"
      ) {
        this.switchToCamera().catch((error) => {
          console.error("Failed to switch back to camera:", error);
          this.showError(
            error instanceof Error
              ? error.message
              : "Failed to switch back to camera"
          );
        });
      }
    };

    videoTrack.addEventListener("ended", this.screenShareTrackEndHandler);
  }

  private async updatePreviewAfterSourceSwitch(
    newStream: MediaStream
  ): Promise<void> {
    const videoPreview = this.shadow.querySelector(
      "#videoPreview"
    ) as HTMLVideoElement;
    if (!videoPreview) {
      return;
    }

    videoPreview.srcObject = newStream;

    await new Promise<void>((resolve, reject) => {
      const onLoadedMetadata = () => {
        videoPreview.removeEventListener("loadedmetadata", onLoadedMetadata);
        videoPreview.removeEventListener("error", onError);
        videoPreview
          .play()
          .then(() => {
            this.hideSourceTransition();
            resolve();
          })
          .catch(reject);
      };
      const onError = () => {
        videoPreview.removeEventListener("loadedmetadata", onLoadedMetadata);
        videoPreview.removeEventListener("error", onError);
        this.hideSourceTransition();
        reject(new Error("Failed to load preview"));
      };

      if (videoPreview.readyState >= 2) {
        videoPreview
          .play()
          .then(() => {
            this.hideSourceTransition();
            resolve();
          })
          .catch(reject);
        return;
      }

      videoPreview.addEventListener("loadedmetadata", onLoadedMetadata);
      videoPreview.addEventListener("error", onError);
    });
  }

  private updateSwitchButtonText(): void {
    const switchButton = this.shadow.querySelector(
      "#switchSourceButton"
    ) as HTMLButtonElement;
    if (switchButton) {
      switchButton.textContent =
        this.currentSourceType === "camera"
          ? "🔄 Switch to Screen"
          : "🔄 Switch to Camera";
    }
  }

  /**
   * Toggle between camera and screen capture during recording
   */
  private async toggleSource(): Promise<void> {
    if (!this.streamManager.isRecording()) {
      return;
    }

    try {
      if (this.currentSourceType === "camera") {
        const newStream = await this.switchToScreenCapture();
        this.setupScreenShareTrackHandler(newStream);
        this.showSourceTransition("Switching to screen...");
        await this.streamManager.switchVideoSource(newStream);
        await this.updatePreviewAfterSourceSwitch(newStream);
        this.updateSwitchButtonText();
      } else {
        await this.switchToCamera();
      }
    } catch (error) {
      this.hideSourceTransition();
      if (this.currentSourceType === "camera" && this.originalCameraStream) {
        this.originalCameraStream = null;
      }
      this.showError(
        error instanceof Error ? error.message : "Failed to switch source"
      );
    }
  }

  private async getCameraStream(): Promise<MediaStream> {
    if (this.originalCameraStream) {
      const videoTrack = this.originalCameraStream.getVideoTracks()[0];
      const audioTrack = this.originalCameraStream.getAudioTracks()[0];

      if (
        videoTrack &&
        videoTrack.readyState === "live" &&
        audioTrack &&
        audioTrack.readyState === "live"
      ) {
        return this.originalCameraStream;
      }
    }

    const newStream = await navigator.mediaDevices.getUserMedia(
      DEFAULT_STREAM_CONFIG
    );
    this.originalCameraStream = newStream;
    return newStream;
  }

  private removeScreenShareTrackHandler(stream: MediaStream | null): void {
    if (!(this.screenShareTrackEndHandler && stream)) {
      return;
    }

    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.removeEventListener("ended", this.screenShareTrackEndHandler);
    }
    this.screenShareTrackEndHandler = null;
  }

  /**
   * Switch back to camera (used by both manual toggle and automatic switch)
   */
  private async switchToCamera(): Promise<void> {
    if (!this.streamManager.isRecording()) {
      return;
    }

    try {
      this.showSourceTransition("Switching to camera...");

      const currentStream = this.streamManager.getStream();
      if (currentStream) {
        this.stopStreamTracks(currentStream);
      }

      this.removeScreenShareTrackHandler(currentStream);

      const newStream = await this.getCameraStream();
      this.streamManager.setMediaStream(newStream);
      this.currentSourceType = "camera";

      await this.streamManager.switchVideoSource(newStream);
      await this.updatePreviewAfterSourceSwitch(newStream);
      this.updateSwitchButtonText();
    } catch (error) {
      this.hideSourceTransition();
      this.showError(
        error instanceof Error ? error.message : "Failed to switch to camera"
      );
    }
  }

  private showSourceTransition(message = "Switching source..."): void {
    const videoPreview = this.shadow.querySelector(
      "#videoPreview"
    ) as HTMLVideoElement;
    if (videoPreview) {
      videoPreview.classList.add("transitioning");
    }

    const transitionOverlay = this.shadow.querySelector(
      "#sourceTransitionOverlay"
    ) as HTMLElement;
    if (transitionOverlay) {
      transitionOverlay.classList.add("active");
      const messageEl = transitionOverlay.querySelector(".transition-message");
      if (messageEl) {
        messageEl.textContent = message;
      }
    }
  }

  private hideSourceTransition(): void {
    const videoPreview = this.shadow.querySelector(
      "#videoPreview"
    ) as HTMLVideoElement;
    if (videoPreview) {
      videoPreview.classList.remove("transitioning");
    }

    const transitionOverlay = this.shadow.querySelector(
      "#sourceTransitionOverlay"
    ) as HTMLElement;
    if (transitionOverlay) {
      transitionOverlay.classList.remove("active");
    }
  }

  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: Called in constructor
  private attachEventListeners(): void {
    const startCameraButton = this.shadow.querySelector("#startCameraButton");
    const startButton = this.shadow.querySelector("#startButton");
    const stopButton = this.shadow.querySelector("#stopButton");
    const processButton = this.shadow.querySelector("#processButton");
    const downloadButton = this.shadow.querySelector("#downloadButton");
    const playButton = this.shadow.querySelector("#playButton");

    // Allow manual retry if camera fails to start
    if (startCameraButton) {
      startCameraButton.addEventListener("click", () => {
        this.startCamera().catch((error) => {
          this.showError(
            error instanceof Error ? error.message : "Failed to start camera"
          );
        });
      });
    }

    if (startButton) {
      startButton.addEventListener("click", () => {
        this.startRecording().catch((error) => {
          this.showError(
            error instanceof Error ? error.message : "Failed to start recording"
          );
        });
      });
    }

    if (stopButton) {
      stopButton.addEventListener("click", () => {
        this.stopRecording().catch((error) => {
          this.showError(
            error instanceof Error ? error.message : "Failed to stop recording"
          );
        });
      });
    }

    // Process button is hidden when using mediabunny (processing happens during recording)
    // Keep it for fallback to old method if needed
    if (processButton) {
      (processButton as HTMLElement).style.display = "none";
      processButton.addEventListener("click", () => {
        this.processVideo().catch((error) => {
          this.showError(
            error instanceof Error ? error.message : "Failed to process video"
          );
        });
      });
    }

    // Mute button
    const muteButton = this.shadow.querySelector("#muteButton");
    if (muteButton) {
      muteButton.addEventListener("click", () => {
        this.streamManager.toggleMute();
      });
    }

    // Switch source button
    const switchSourceButton = this.shadow.querySelector("#switchSourceButton");
    if (switchSourceButton) {
      switchSourceButton.addEventListener("click", () => {
        this.toggleSource().catch((error) => {
          this.showError(
            error instanceof Error ? error.message : "Failed to switch source"
          );
        });
      });
    }

    if (downloadButton) {
      downloadButton.addEventListener("click", () => {
        try {
          this.downloadVideo();
        } catch (error) {
          this.showError(
            error instanceof Error ? error.message : "Failed to download video"
          );
        }
      });
    }

    if (playButton) {
      playButton.addEventListener("click", () => {
        try {
          this.playVideo();
        } catch (error) {
          this.showError(
            error instanceof Error ? error.message : "Failed to play video"
          );
        }
      });
    }
  }

  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: Called in constructor
  private render(): void {
    this.shadow.innerHTML = `
      <style>
        :host {
          display: block;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
        }

        .container {
          background: white;
          border-radius: 16px;
          padding: 40px;
          max-width: 600px;
          width: 100%;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        }

        h1 {
          color: #333;
          margin-bottom: 10px;
          font-size: 28px;
        }

        .subtitle {
          color: #666;
          margin-bottom: 30px;
          font-size: 14px;
        }

        .camera-area {
          border: 2px solid #667eea;
          border-radius: 12px;
          padding: 20px;
          background: #f8f9ff;
          margin-bottom: 20px;
          display: none;
          position: relative;
        }

        .source-transition-overlay {
          position: absolute;
          top: 20px;
          left: 20px;
          right: 20px;
          bottom: 20px;
          background: rgba(0, 0, 0, 0.7);
          display: none;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          border-radius: 8px;
          z-index: 10;
          backdrop-filter: blur(4px);
          transition: opacity 0.3s ease;
        }

        .source-transition-overlay.active {
          display: flex;
          animation: fadeIn 0.2s ease;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .transition-spinner {
          width: 40px;
          height: 40px;
          border: 4px solid rgba(255, 255, 255, 0.3);
          border-top-color: #667eea;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin-bottom: 12px;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .transition-message {
          color: white;
          font-size: 14px;
          font-weight: 500;
          text-align: center;
        }

        .camera-area.active {
          display: block;
        }

        .video-preview {
          width: 100%;
          border-radius: 8px;
          background: #000;
          display: block;
          margin-bottom: 16px;
          transition: opacity 0.3s ease, transform 0.3s ease;
          position: relative;
        }

        .video-preview.transitioning {
          opacity: 0.5;
          transform: scale(0.98);
        }

        .recording-controls {
          display: flex;
          gap: 12px;
          align-items: center;
          justify-content: center;
        }

        .recording-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #c33;
          font-weight: 600;
          display: none;
        }

        .recording-indicator.active {
          display: flex;
        }

        .recording-dot {
          width: 12px;
          height: 12px;
          background: #c33;
          border-radius: 50%;
          animation: pulse 1.5s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.3;
          }
        }

        .recording-timer {
          font-family: monospace;
          font-size: 18px;
          color: #333;
        }

        .start-camera-area {
          border: 2px dashed #667eea;
          border-radius: 12px;
          padding: 40px;
          text-align: center;
          background: #f8f9ff;
          transition: all 0.3s ease;
          cursor: pointer;
          margin-bottom: 20px;
        }

        .start-camera-area:hover:not(.loading) {
          border-color: #764ba2;
          background: #f0f2ff;
        }

        .start-camera-area.loading {
          cursor: wait;
          opacity: 0.7;
        }

        .start-camera-area.loading .camera-text {
          color: #999;
        }

        .camera-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .camera-text {
          color: #667eea;
          font-weight: 600;
          margin-bottom: 8px;
        }

        .camera-hint {
          color: #999;
          font-size: 12px;
        }

        .recording-info {
          margin-top: 20px;
          padding: 16px;
          background: #f5f5f5;
          border-radius: 8px;
          display: none;
        }

        .recording-info.active {
          display: block;
        }

        .recording-size {
          color: #666;
          font-size: 14px;
        }

        button {
          width: 100%;
          padding: 16px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          margin-top: 20px;
        }

        button:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
        }

        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .recording-controls button {
          flex: 1;
          margin-top: 0;
          padding: 12px;
          font-size: 14px;
        }

        .recording-controls button:first-child {
          background: linear-gradient(135deg, #48bb78 0%, #38a169 100%);
        }

        .recording-controls button:last-child {
          background: linear-gradient(135deg, #f56565 0%, #e53e3e 100%);
        }

        .recording-controls button.muted {
          background: linear-gradient(135deg, #a0a0a0 0%, #808080 100%);
        }

        .progress {
          margin-top: 20px;
          display: none;
        }

        .progress.active {
          display: block;
        }

        .progress-bar {
          width: 100%;
          height: 8px;
          background: #e0e0e0;
          border-radius: 4px;
          overflow: hidden;
          margin-bottom: 8px;
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
          width: 0%;
          transition: width 0.3s ease;
        }

        .progress-text {
          text-align: center;
          color: #666;
          font-size: 14px;
        }

        .result {
          margin-top: 20px;
          padding: 20px;
          background: #f0f9ff;
          border: 2px solid #667eea;
          border-radius: 8px;
          display: none;
        }

        .result.active {
          display: block;
        }

        .result-title {
          font-weight: 600;
          color: #333;
          margin-bottom: 12px;
        }

        .result-info {
          color: #666;
          font-size: 14px;
          margin-bottom: 12px;
        }

        .result-actions {
          display: flex;
          gap: 12px;
        }

        .result-actions button {
          flex: 1;
          margin-top: 0;
          padding: 12px;
          font-size: 14px;
        }

        .error {
          margin-top: 20px;
          padding: 16px;
          background: #fee;
          border: 2px solid #fcc;
          border-radius: 8px;
          color: #c33;
          display: none;
        }

        .error.active {
          display: block;
        }
      </style>
      <div class="container">
        <h1>Video Recorder</h1>
        <p class="subtitle">Record video from your camera and transcode it to MP4 format</p>

        <div class="start-camera-area" id="startCameraArea">
          <div class="camera-icon">📹</div>
          <div class="camera-text">Initializing camera...</div>
          <div class="camera-hint">Grant camera and microphone permissions when prompted</div>
          <button id="startCameraButton" style="display: none;">Retry Camera</button>
        </div>

        <div class="camera-area" id="cameraArea">
          <video id="videoPreview" class="video-preview" autoplay muted playsinline></video>
          <div class="source-transition-overlay" id="sourceTransitionOverlay">
            <div class="transition-spinner"></div>
            <div class="transition-message">Switching source...</div>
          </div>
          <div class="recording-controls">
            <button id="startButton" disabled>Start Recording</button>
            <button id="stopButton" disabled>Stop Recording</button>
            <button id="muteButton" disabled style="display: none;">🔊 Mute</button>
            <button id="switchSourceButton" disabled style="display: none;">🔄 Switch to Screen</button>
          </div>
          <div class="recording-indicator" id="recordingIndicator">
            <div class="recording-dot"></div>
            <span>Recording</span>
            <span class="recording-timer" id="recordingTimer">00:00</span>
          </div>
        </div>

        <div class="recording-info" id="recordingInfo">
          <div class="recording-size" id="recordingSize"></div>
        </div>

        <button id="processButton" disabled>Process Video</button>

        <div class="progress" id="progress">
          <div class="progress-bar">
            <div class="progress-fill" id="progressFill"></div>
          </div>
          <div class="progress-text" id="progressText">Processing...</div>
        </div>

        <div class="error" id="error"></div>

        <div class="result" id="result">
          <div class="result-title">✅ Processing Complete!</div>
          <div class="result-info" id="resultInfo"></div>
          <div class="result-actions">
            <button id="downloadButton">Download MP4</button>
            <button id="playButton">Play Video</button>
          </div>
        </div>
      </div>
    `;
  }
}

// Register the custom element
if (!customElements.get("vidtreo-recorder")) {
  customElements.define("vidtreo-recorder", VidtreoRecorder);
}
