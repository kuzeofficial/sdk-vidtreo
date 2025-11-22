export type { ConfigServiceOptions } from "./core/config/config-service";
export { ConfigService } from "./core/config/config-service";
export { DEFAULT_TRANSCODE_CONFIG } from "./core/config/default-config";
export type {
  BackendConfigResponse,
  BackendPreset,
} from "./core/config/preset-mapper";
export { mapPresetToConfig } from "./core/config/preset-mapper";
export { transcodeVideo } from "./core/processor/processor";
export { StreamProcessor } from "./core/processor/stream-processor";
export type {
  StreamProcessorOptions,
  StreamProcessorResult,
  TranscodeConfig,
  TranscodeInput,
  TranscodeResult,
} from "./core/processor/types";
export {
  DEFAULT_CAMERA_CONSTRAINTS,
  DEFAULT_RECORDING_OPTIONS,
  DEFAULT_STREAM_CONFIG,
} from "./core/stream/config";
export { CameraStreamManager } from "./core/stream/stream";
export type {
  CameraConstraints,
  RecordingOptions,
  StreamConfig,
  StreamEventListener,
  StreamEventMap,
  StreamState,
} from "./core/stream/types";
export { extractVideoDuration } from "./core/upload/duration-extractor";
export type {
  VideoUploadInitResponse,
  VideoUploadOptions,
  VideoUploadResult,
} from "./core/upload/video-upload-service";
export { VideoUploadService } from "./core/upload/video-upload-service";
