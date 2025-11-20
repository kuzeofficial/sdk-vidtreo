import { DEFAULT_TRANSCODE_CONFIG } from "../processor/config";
import type {
  CameraConstraints,
  RecordingOptions,
  StreamConfig,
} from "./types";

export const DEFAULT_CAMERA_CONSTRAINTS: Readonly<CameraConstraints> =
  Object.freeze({
    width: { ideal: DEFAULT_TRANSCODE_CONFIG.width },
    height: { ideal: DEFAULT_TRANSCODE_CONFIG.height },
    frameRate: { ideal: DEFAULT_TRANSCODE_CONFIG.fps },
  });

export const DEFAULT_STREAM_CONFIG: Readonly<StreamConfig> = Object.freeze({
  video: DEFAULT_CAMERA_CONSTRAINTS,
  audio: true,
});

export const DEFAULT_RECORDING_OPTIONS: Readonly<RecordingOptions> =
  Object.freeze({
    mimeType: "video/webm;codecs=vp9,opus",
  });
