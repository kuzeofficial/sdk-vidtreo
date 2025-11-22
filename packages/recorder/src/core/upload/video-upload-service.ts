export type VideoUploadOptions = {
  apiKey: string;
  backendUrl: string;
  filename?: string;
  metadata?: Record<string, unknown>;
  userMetadata?: Record<string, unknown>;
  duration?: number;
  onProgress?: (progress: number) => void;
};

export type VideoUploadInitResponse = {
  videoId: string;
  uploadUrl: string;
};

export type VideoUploadResult = {
  videoId: string;
  status: string;
  uploadUrl: string;
};

export class VideoUploadService {
  async uploadVideo(
    blob: Blob,
    options: VideoUploadOptions
  ): Promise<VideoUploadResult> {
    if (!options.filename) {
      throw new Error("Filename is required");
    }
    if (!blob.type) {
      throw new Error("Blob type is required");
    }

    const initResponse = await this.initVideoUpload({
      apiKey: options.apiKey,
      backendUrl: options.backendUrl,
      filename: options.filename,
      fileSize: blob.size,
      mimeType: blob.type,
      metadata: options.metadata,
      userMetadata: options.userMetadata,
    });

    return this.uploadVideoFile(blob, initResponse.uploadUrl, {
      apiKey: options.apiKey,
      duration: options.duration,
      onProgress: options.onProgress,
    });
  }

  private async initVideoUpload(data: {
    apiKey: string;
    backendUrl: string;
    filename: string;
    fileSize: number;
    mimeType: string;
    metadata?: Record<string, unknown>;
    userMetadata?: Record<string, unknown>;
  }): Promise<VideoUploadInitResponse> {
    const url = `${data.backendUrl}/api/v1/videos/init`;

    const body: {
      filename: string;
      fileSize: number;
      mimeType: string;
      preProcessed: boolean;
      metadata?: Record<string, unknown>;
      userMetadata?: Record<string, unknown>;
    } = {
      filename: data.filename,
      fileSize: data.fileSize,
      mimeType: data.mimeType,
      preProcessed: true,
    };

    if (data.metadata) {
      body.metadata = data.metadata;
    }

    if (data.userMetadata) {
      body.userMetadata = data.userMetadata;
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${data.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      let errorMessage = `Failed to initialize video upload: ${response.status} ${response.statusText}`;
      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = errorData.error;
        }
      } catch {
        // Use default error message
      }
      throw new Error(errorMessage);
    }

    return (await response.json()) as VideoUploadInitResponse;
  }

  private uploadVideoFile(
    blob: Blob,
    uploadUrl: string,
    options: {
      apiKey: string;
      duration?: number;
      onProgress?: (progress: number) => void;
    }
  ): Promise<VideoUploadResult> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();

      if (options.onProgress) {
        const onProgress = options.onProgress;
        xhr.upload.addEventListener("progress", (event) => {
          if (event.lengthComputable) {
            const progress = event.loaded / event.total;
            onProgress(progress);
          }
        });
      }

      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          this.parseSuccessResponse(xhr, resolve, reject);
        } else {
          this.parseErrorResponse(xhr, reject);
        }
      });

      xhr.addEventListener("error", () => {
        reject(new Error("Network error during upload"));
      });

      xhr.addEventListener("abort", () => {
        reject(new Error("Upload was aborted"));
      });

      xhr.open("PUT", uploadUrl);
      xhr.setRequestHeader("Authorization", `Bearer ${options.apiKey}`);
      xhr.setRequestHeader("Content-Type", blob.type);

      if (options.duration !== undefined) {
        xhr.setRequestHeader("X-Video-Duration", options.duration.toString());
      }

      xhr.send(blob);
    });
  }

  private parseSuccessResponse(
    xhr: XMLHttpRequest,
    resolve: (value: VideoUploadResult) => void,
    reject: (reason?: unknown) => void
  ): void {
    try {
      const result = JSON.parse(xhr.responseText) as VideoUploadResult;
      resolve(result);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      reject(new Error(`Failed to parse upload response: ${errorMessage}`));
    }
  }

  private parseErrorResponse(
    xhr: XMLHttpRequest,
    reject: (reason?: unknown) => void
  ): void {
    let errorMessage = `Upload failed: ${xhr.status} ${xhr.statusText}`;
    try {
      const errorData = JSON.parse(xhr.responseText);
      if (errorData.error) {
        errorMessage = errorData.error;
      }
    } catch {
      // Use default error message
    }
    reject(new Error(errorMessage));
  }
}
