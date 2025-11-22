import { ALL_FORMATS, BlobSource, Input } from "mediabunny";

export async function extractVideoDuration(blob: Blob): Promise<number> {
  try {
    const source = new BlobSource(blob);
    const input = new Input({
      formats: ALL_FORMATS,
      source,
    });

    if (typeof input.computeDuration !== "function") {
      throw new Error("computeDuration method is not available");
    }

    const duration = await input.computeDuration();
    if (!duration) {
      throw new Error("Duration is missing from computeDuration");
    }
    if (duration <= 0) {
      throw new Error("Invalid duration: must be greater than 0");
    }

    return duration;
  } catch {
    return extractDurationWithVideoElement(blob);
  }
}

function extractDurationWithVideoElement(blob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(blob);

    const cleanup = () => {
      URL.revokeObjectURL(url);
    };

    video.addEventListener("loadedmetadata", () => {
      cleanup();
      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= 0) {
        reject(new Error("Invalid video duration"));
        return;
      }
      resolve(duration);
    });

    video.addEventListener("error", () => {
      cleanup();
      reject(new Error("Failed to load video metadata"));
    });

    video.src = url;
    video.load();
  });
}
