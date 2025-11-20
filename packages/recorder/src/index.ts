export { DEFAULT_TRANSCODE_CONFIG } from "./core/processor/config";
export { transcodeVideo } from "./core/processor/processor";
export type {
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
