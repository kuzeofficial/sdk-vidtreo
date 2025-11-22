import { ConfigService } from "../core/config/config-service";
import { DEFAULT_TRANSCODE_CONFIG } from "../core/config/default-config";
import { transcodeVideo } from "../core/processor/processor";
import { StreamProcessor } from "../core/processor/stream-processor";
import type { TranscodeConfig } from "../core/processor/types";
import { DEFAULT_STREAM_CONFIG } from "../core/stream/config";
import { CameraStreamManager } from "../core/stream/stream";
import { extractVideoDuration } from "../core/upload/duration-extractor";
import { VideoUploadService } from "../core/upload/video-upload-service";
import "../styles/tailwind.css";

const FILE_SIZE_UNITS = ["Bytes", "KB", "MB", "GB"] as const;
const FILE_SIZE_BASE = 1024;
const TIMESTAMP_REGEX = /[:.]/g;

export class VidtreoRecorder extends HTMLElement {
  static observedAttributes = ["api-key", "backend-url"];

  private readonly streamManager: CameraStreamManager;
  private recordedBlob: Blob | null = null;
  private processedBlob: Blob | null = null;
  private isProcessing = false;
  private streamProcessor: StreamProcessor | null = null;
  private currentSourceType: "camera" | "screen" = "camera";
  private originalCameraStream: MediaStream | null = null;
  private screenShareTrackEndHandler: (() => void) | null = null;
  private configService: ConfigService | null = null;
  private currentConfig: TranscodeConfig = DEFAULT_TRANSCODE_CONFIG;
  private configFetchPromise: Promise<TranscodeConfig> | null = null;
  private uploadService: VideoUploadService | null = null;
  private uploadProgress = 0;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.streamManager = new CameraStreamManager();
    this.setupEventListeners();
    this.render();
    this.attachEventListeners();
  }

  connectedCallback(): void {
    this.initializeConfigService();
    this.startCamera().catch((error) => {
      this.showError(this.extractErrorMessage(error));
    });
  }

  attributeChangedCallback(
    name: string,
    oldValue: string | null,
    newValue: string | null
  ): void {
    if (oldValue === newValue) {
      return;
    }

    if (name === "api-key" || name === "backend-url") {
      this.initializeConfigService();
      if (this.configService) {
        this.configService.clearCache();
        this.fetchConfig();
      }
    }
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

  private queryElement<T extends HTMLElement>(selector: string): T {
    const element = this.shadow.querySelector<T>(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }
    return element;
  }

  private extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) {
      return "0 Bytes";
    }
    const index = Math.floor(Math.log(bytes) / Math.log(FILE_SIZE_BASE));
    const size = Math.round((bytes / FILE_SIZE_BASE ** index) * 100) / 100;
    return `${size} ${FILE_SIZE_UNITS[index]}`;
  }

  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: Called in constructor
  private setupEventListeners(): void {
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
      const videoPreview = this.queryElement<HTMLVideoElement>("#videoPreview");
      videoPreview.srcObject = stream;
      videoPreview.play().catch(() => {
        this.showError("Failed to play preview video");
      });
    });
    this.streamManager.on("error", ({ error }) => {
      this.showError(error.message);
    });
  }

  private initializeConfigService(): void {
    const apiKey = this.getAttribute("api-key");
    const backendUrl = this.getAttribute("backend-url");

    if (apiKey && backendUrl) {
      this.configService = new ConfigService({
        apiKey,
        backendUrl,
      });
      this.uploadService = new VideoUploadService();
      this.fetchConfig();
    } else {
      this.configService = null;
      this.uploadService = null;
      this.currentConfig = DEFAULT_TRANSCODE_CONFIG;
    }
  }

  private async fetchConfig(): Promise<void> {
    if (!this.configService) {
      return;
    }

    if (this.configFetchPromise) {
      try {
        this.currentConfig = await this.configFetchPromise;
      } catch {
        this.currentConfig = DEFAULT_TRANSCODE_CONFIG;
      }
      return;
    }

    this.configFetchPromise = this.configService.fetchConfig();
    try {
      this.currentConfig = await this.configFetchPromise;
    } catch {
      this.currentConfig = DEFAULT_TRANSCODE_CONFIG;
    } finally {
      this.configFetchPromise = null;
    }
  }

  private async getConfig(): Promise<TranscodeConfig> {
    if (this.configService && !this.configFetchPromise) {
      await this.fetchConfig();
    }
    return this.currentConfig;
  }

  private showError(message: string): void {
    const errorEl = this.queryElement<HTMLElement>("#error");
    errorEl.textContent = message;
    errorEl.classList.add("active");
  }

  private hideError(): void {
    const errorEl = this.queryElement<HTMLElement>("#error");
    errorEl.classList.remove("active");
  }

  private showResult(originalSize: number, processedSize: number): void {
    const resultEl = this.queryElement<HTMLElement>("#result");
    const resultInfoEl = this.queryElement<HTMLElement>("#resultInfo");
    resultInfoEl.textContent = `Original: ${this.formatFileSize(originalSize)} → Processed: ${this.formatFileSize(processedSize)}`;
    resultEl.classList.add("active");
  }

  private hideResult(): void {
    const resultEl = this.queryElement<HTMLElement>("#result");
    resultEl.classList.remove("active");
  }

  private updateProgress(percentage: number, text: string): void {
    const percentageValue = Math.round(percentage * 100);
    const progressFillEl = this.queryElement<HTMLElement>("#progressFill");
    const progressTextEl = this.queryElement<HTMLElement>("#progressText");
    progressFillEl.style.width = `${percentageValue}%`;
    progressTextEl.textContent = text;
  }

  private showProgress(): void {
    const progressEl = this.queryElement<HTMLElement>("#progress");
    progressEl.classList.add("active");
  }

  private hideProgress(): void {
    const progressEl = this.queryElement<HTMLElement>("#progress");
    progressEl.classList.remove("active");
  }

  private updateRecordingTimer(formatted: string): void {
    const timerEl = this.queryElement<HTMLElement>("#recordingTimer");
    timerEl.textContent = formatted;
  }

  private updateBufferSize(formatted: string): void {
    const recordingSize = this.queryElement<HTMLElement>("#recordingSize");
    recordingSize.textContent = `Size: ${formatted}`;
  }

  private updateMuteState(muted: boolean): void {
    const muteButton = this.queryElement<HTMLButtonElement>("#muteButton");
    muteButton.textContent = muted ? "🔇 Unmute" : "🔊 Mute";
    muteButton.classList.toggle("muted", muted);
  }

  private handleStateChange(state: string, previousState: string): void {
    if (state === "active" && previousState === "starting") {
      this.hideError();
    }
  }

  private handleStreamStart(stream: MediaStream): void {
    const videoPreview = this.queryElement<HTMLVideoElement>("#videoPreview");
    videoPreview.srcObject = stream;
    videoPreview.play();

    const startButton = this.queryElement<HTMLButtonElement>("#startButton");
    const stopButton = this.queryElement<HTMLButtonElement>("#stopButton");
    const cameraArea = this.queryElement<HTMLElement>("#cameraArea");
    const startCameraArea = this.queryElement<HTMLElement>("#startCameraArea");

    startButton.disabled = false;
    stopButton.disabled = true;
    cameraArea.classList.add("active");
    startCameraArea.style.display = "none";
  }

  private handleStreamStop(): void {
    const videoPreview = this.queryElement<HTMLVideoElement>("#videoPreview");
    videoPreview.srcObject = null;
    const cameraArea = this.queryElement<HTMLElement>("#cameraArea");
    cameraArea.classList.remove("active");
  }

  private handleRecordingStart(): void {
    const startButton = this.queryElement<HTMLButtonElement>("#startButton");
    const stopButton = this.queryElement<HTMLButtonElement>("#stopButton");
    const recordingIndicator = this.queryElement<HTMLElement>(
      "#recordingIndicator"
    );
    const recordingTimer = this.queryElement<HTMLElement>("#recordingTimer");
    const recordingInfo = this.queryElement<HTMLElement>("#recordingInfo");
    const muteButton = this.queryElement<HTMLButtonElement>("#muteButton");
    const switchSourceButton = this.queryElement<HTMLButtonElement>(
      "#switchSourceButton"
    );

    startButton.disabled = true;
    stopButton.disabled = false;
    recordingIndicator.classList.add("active");
    recordingTimer.textContent = "00:00";
    recordingInfo.classList.add("active");
    muteButton.disabled = false;
    muteButton.style.display = "block";
    switchSourceButton.disabled = false;
    switchSourceButton.style.display = "block";

    this.hideError();
    this.hideResult();
  }

  private updateRecordingControlsAfterStop(): void {
    const startButton = this.queryElement<HTMLButtonElement>("#startButton");
    const stopButton = this.queryElement<HTMLButtonElement>("#stopButton");
    const recordingIndicator = this.queryElement<HTMLElement>(
      "#recordingIndicator"
    );
    const processButton =
      this.queryElement<HTMLButtonElement>("#processButton");
    const muteButton = this.queryElement<HTMLButtonElement>("#muteButton");
    const switchSourceButton = this.queryElement<HTMLButtonElement>(
      "#switchSourceButton"
    );

    startButton.disabled = false;
    stopButton.disabled = true;
    recordingIndicator.classList.remove("active");
    processButton.style.display = "none";
    muteButton.disabled = true;
    muteButton.style.display = "none";
    switchSourceButton.disabled = true;
    switchSourceButton.style.display = "none";
  }

  private handleScreenRecordingStop(): void {
    const currentStream = this.streamManager.getStream();
    if (currentStream) {
      this.stopStreamTracks(currentStream);
    }
    this.streamManager.startStream().catch((error) => {
      this.showError(this.extractErrorMessage(error));
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
    const startCameraArea = this.queryElement<HTMLElement>("#startCameraArea");
    startCameraArea.classList.add("loading");

    try {
      await this.streamManager.startStream();
    } catch {
      const errorCameraArea =
        this.queryElement<HTMLElement>("#startCameraArea");
      const startCameraButton =
        this.queryElement<HTMLButtonElement>("#startCameraButton");
      const cameraText =
        errorCameraArea.querySelector<HTMLElement>(".camera-text");

      if (!cameraText) {
        throw new Error("Camera text element not found");
      }

      errorCameraArea.classList.remove("loading");
      errorCameraArea.style.display = "block";
      startCameraButton.style.display = "block";
      cameraText.textContent = "Failed to start camera";
    }
  }

  private async startRecording(): Promise<void> {
    try {
      this.clearUploadStatus();

      const currentStream = this.streamManager.getStream();
      if (currentStream) {
        this.originalCameraStream = currentStream;
      }

      this.streamProcessor = new StreamProcessor();
      const config = await this.getConfig();

      await this.streamManager.startRecordingWithMediabunny(
        this.streamProcessor,
        config
      );
    } catch (error) {
      this.showError(this.extractErrorMessage(error));
    }
  }

  private async stopRecording(): Promise<void> {
    try {
      const blob = await this.streamManager.stopRecordingWithMediabunny();

      this.processedBlob = blob;
      this.recordedBlob = blob;

      this.showResult(blob.size, blob.size);

      await this.uploadVideoIfConfigured(blob);
    } catch (error) {
      this.showError(this.extractErrorMessage(error));
    }
  }

  private async uploadVideoIfConfigured(blob: Blob): Promise<void> {
    const apiKey = this.getAttribute("api-key");
    const backendUrl = this.getAttribute("backend-url");

    if (!(apiKey && backendUrl && this.uploadService)) {
      return;
    }

    try {
      this.uploadProgress = 0;
      this.showUploadProgress();

      const duration = await extractVideoDuration(blob);

      const result = await this.uploadService.uploadVideo(blob, {
        apiKey,
        backendUrl,
        filename: `recording-${Date.now()}.mp4`,
        duration,
        onProgress: (progress) => {
          this.uploadProgress = progress;
          this.updateUploadProgress(progress);
        },
      });

      this.hideUploadProgress();
      this.showUploadSuccess(result);
    } catch (error) {
      this.hideUploadProgress();
      this.showUploadError(this.extractErrorMessage(error));
    } finally {
      this.uploadProgress = 0;
    }
  }

  private showUploadProgress(): void {
    const uploadEl = this.queryElement<HTMLElement>("#uploadProgress");
    uploadEl.classList.add("active");
    this.updateUploadProgress(0);
  }

  private updateUploadProgress(progress: number): void {
    const progressFillEl = this.queryElement<HTMLElement>(
      "#uploadProgressFill"
    );
    const progressTextEl = this.queryElement<HTMLElement>(
      "#uploadProgressText"
    );
    progressFillEl.style.width = `${Math.round(progress * 100)}%`;
    progressTextEl.textContent = `Uploading... ${Math.round(progress * 100)}%`;
  }

  private hideUploadProgress(): void {
    const uploadEl = this.queryElement<HTMLElement>("#uploadProgress");
    uploadEl.classList.remove("active");
  }

  private showUploadSuccess(result: {
    videoId: string;
    uploadUrl: string;
  }): void {
    const uploadStatusEl = this.queryElement<HTMLElement>("#uploadStatus");
    const uploadStatusTextEl =
      this.queryElement<HTMLElement>("#uploadStatusText");
    uploadStatusEl.classList.add("active", "success");
    uploadStatusEl.classList.remove("error");
    uploadStatusTextEl.textContent = `✅ Video uploaded successfully! Video ID: ${result.videoId}`;
  }

  private showUploadError(message: string): void {
    const uploadStatusEl = this.queryElement<HTMLElement>("#uploadStatus");
    const uploadStatusTextEl =
      this.queryElement<HTMLElement>("#uploadStatusText");
    uploadStatusEl.classList.add("active", "error");
    uploadStatusEl.classList.remove("success");
    uploadStatusTextEl.textContent = `❌ Upload failed: ${message}`;
  }

  private clearUploadStatus(): void {
    const uploadStatusEl = this.queryElement<HTMLElement>("#uploadStatus");
    uploadStatusEl.classList.remove("active", "success", "error");
    this.hideUploadProgress();
  }

  private updateRecordingInfo(): void {
    const recordedBlob = this.recordedBlob;
    if (!recordedBlob) {
      try {
        const managerBlob = this.streamManager.getRecordedBlob();
        const recordingInfo = this.queryElement<HTMLElement>("#recordingInfo");
        const recordingSize = this.queryElement<HTMLElement>("#recordingSize");
        recordingInfo.classList.add("active");
        recordingSize.textContent = `Size: ${this.formatFileSize(managerBlob.size)}`;
      } catch {
        return;
      }
      return;
    }

    const recordingInfo = this.queryElement<HTMLElement>("#recordingInfo");
    const recordingSize = this.queryElement<HTMLElement>("#recordingSize");
    recordingInfo.classList.add("active");
    recordingSize.textContent = `Size: ${this.formatFileSize(recordedBlob.size)}`;
  }

  private async processVideo(): Promise<void> {
    if (!this.recordedBlob) {
      throw new Error("No recording available");
    }

    this.isProcessing = true;
    const processButton =
      this.queryElement<HTMLButtonElement>("#processButton");
    processButton.disabled = true;

    this.hideError();
    this.hideResult();
    this.showProgress();
    this.updateProgress(0, "Starting transcoding...");

    try {
      const config = await this.getConfig();

      const transcodeResult = await transcodeVideo(
        this.recordedBlob,
        config,
        (progress: number) => {
          this.updateProgress(
            progress,
            `Transcoding... ${Math.round(progress * 100)}%`
          );
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
        processButton.disabled = false;
        this.isProcessing = false;
      }, 500);
    } catch (error) {
      this.hideProgress();
      this.showError(this.extractErrorMessage(error));
      processButton.disabled = false;
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
      .replace(TIMESTAMP_REGEX, "-")
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

    this.screenShareTrackEndHandler = () => {
      if (
        this.streamManager.isRecording() &&
        this.currentSourceType === "screen"
      ) {
        this.switchToCamera().catch((error) => {
          this.showError(this.extractErrorMessage(error));
        });
      }
    };

    videoTrack.addEventListener("ended", this.screenShareTrackEndHandler);
  }

  private async updatePreviewAfterSourceSwitch(
    newStream: MediaStream
  ): Promise<void> {
    const videoPreview = this.queryElement<HTMLVideoElement>("#videoPreview");
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
    const switchButton = this.queryElement<HTMLButtonElement>(
      "#switchSourceButton"
    );
    switchButton.textContent =
      this.currentSourceType === "camera"
        ? "🔄 Switch to Screen"
        : "🔄 Switch to Camera";
  }

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
      this.showError(this.extractErrorMessage(error));
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
      this.showError(this.extractErrorMessage(error));
    }
  }

  private showSourceTransition(message: string): void {
    const videoPreview = this.queryElement<HTMLVideoElement>("#videoPreview");
    videoPreview.classList.add("transitioning");

    const transitionOverlay = this.queryElement<HTMLElement>(
      "#sourceTransitionOverlay"
    );
    transitionOverlay.classList.add("active");
    const messageEl = transitionOverlay.querySelector<HTMLElement>(
      ".transition-message"
    );
    if (!messageEl) {
      throw new Error("Transition message element not found");
    }
    messageEl.textContent = message;
  }

  private hideSourceTransition(): void {
    const videoPreview = this.queryElement<HTMLVideoElement>("#videoPreview");
    videoPreview.classList.remove("transitioning");

    const transitionOverlay = this.queryElement<HTMLElement>(
      "#sourceTransitionOverlay"
    );
    transitionOverlay.classList.remove("active");
  }

  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: Called in constructor
  private attachEventListeners(): void {
    const startCameraButton =
      this.queryElement<HTMLButtonElement>("#startCameraButton");
    const startButton = this.queryElement<HTMLButtonElement>("#startButton");
    const stopButton = this.queryElement<HTMLButtonElement>("#stopButton");
    const processButton =
      this.queryElement<HTMLButtonElement>("#processButton");
    const downloadButton =
      this.queryElement<HTMLButtonElement>("#downloadButton");
    const playButton = this.queryElement<HTMLButtonElement>("#playButton");
    const muteButton = this.queryElement<HTMLButtonElement>("#muteButton");
    const switchSourceButton = this.queryElement<HTMLButtonElement>(
      "#switchSourceButton"
    );

    startCameraButton.addEventListener("click", () => {
      this.startCamera().catch((error) => {
        this.showError(this.extractErrorMessage(error));
      });
    });

    startButton.addEventListener("click", () => {
      this.startRecording().catch((error) => {
        this.showError(this.extractErrorMessage(error));
      });
    });

    stopButton.addEventListener("click", () => {
      this.stopRecording().catch((error) => {
        this.showError(this.extractErrorMessage(error));
      });
    });

    processButton.style.display = "none";
    processButton.addEventListener("click", () => {
      this.processVideo().catch((error) => {
        this.showError(this.extractErrorMessage(error));
      });
    });

    muteButton.addEventListener("click", () => {
      this.streamManager.toggleMute();
    });

    switchSourceButton.addEventListener("click", () => {
      this.toggleSource().catch((error) => {
        this.showError(this.extractErrorMessage(error));
      });
    });

    downloadButton.addEventListener("click", () => {
      try {
        this.downloadVideo();
      } catch (error) {
        this.showError(this.extractErrorMessage(error));
      }
    });

    playButton.addEventListener("click", () => {
      try {
        this.playVideo();
      } catch (error) {
        this.showError(this.extractErrorMessage(error));
      }
    });
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

        .upload-progress {
          margin-top: 20px;
          display: none;
        }

        .upload-progress.active {
          display: block;
        }

        .upload-status {
          margin-top: 20px;
          padding: 16px;
          border-radius: 8px;
          display: none;
        }

        .upload-status.active {
          display: block;
        }

        .upload-status.success {
          background: #f0f9ff;
          border: 2px solid #48bb78;
          color: #22543d;
        }

        .upload-status.error {
          background: #fee;
          border: 2px solid #fcc;
          color: #c33;
        }

        .upload-status-text {
          font-size: 14px;
          font-weight: 500;
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

        <div class="upload-progress" id="uploadProgress">
          <div class="progress-bar">
            <div class="progress-fill" id="uploadProgressFill"></div>
          </div>
          <div class="progress-text" id="uploadProgressText">Uploading... 0%</div>
        </div>

        <div class="upload-status" id="uploadStatus">
          <div class="upload-status-text" id="uploadStatusText"></div>
        </div>
      </div>
    `;
  }
}

if (!customElements.get("vidtreo-recorder")) {
  customElements.define("vidtreo-recorder", VidtreoRecorder);
}
