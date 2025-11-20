export type CameraConstraints = {
  width?: number | { ideal?: number; min?: number; max?: number };
  height?: number | { ideal?: number; min?: number; max?: number };
  frameRate?: number | { ideal?: number; min?: number; max?: number };
};

export type StreamConfig = {
  video: boolean | CameraConstraints;
  audio: boolean | MediaTrackConstraints;
};

export type RecordingOptions = {
  mimeType?: string;
  videoBitsPerSecond?: number;
  audioBitsPerSecond?: number;
  bitsPerSecond?: number;
};

export type StreamState =
  | "idle"
  | "starting"
  | "active"
  | "recording"
  | "stopping"
  | "error";

export type StreamEventMap = {
  statechange: { state: StreamState; previousState: StreamState };
  streamstart: { stream: MediaStream };
  streamstop: undefined;
  recordingstart: { recorder: MediaRecorder | null };
  recordingstop: { blob: Blob; mimeType: string };
  recordingdata: { data: Blob };
  error: { error: Error };
  recordingtimeupdate: { elapsed: number; formatted: string };
  recordingbufferupdate: { size: number; formatted: string };
  audiomutetoggle: { muted: boolean };
  videosourcechange: { stream: MediaStream };
};

export type StreamEventListener<T extends keyof StreamEventMap> = (
  data: StreamEventMap[T]
) => void;
