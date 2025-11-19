import { DEFAULT_TRANSCODE_CONFIG, transcodeVideo } from "@vidtreo/example";

const FILE_EXTENSION_REGEX = /\.[^/.]+$/;

type UIState = {
  selectedFile: File | null;
  processedBlob: Blob | null;
  isProcessing: boolean;
};

function getElementById(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Element with id "${id}" not found`);
  }
  return element;
}

function getElementByIdAs<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Element with id "${id}" not found`);
  }
  return element as T;
}

const elements = {
  uploadArea: getElementById("uploadArea"),
  fileInput: getElementByIdAs<HTMLInputElement>("fileInput"),
  fileInfo: getElementById("fileInfo"),
  fileName: getElementById("fileName"),
  fileSize: getElementById("fileSize"),
  processButton: getElementByIdAs<HTMLButtonElement>("processButton"),
  progress: getElementById("progress"),
  progressFill: getElementById("progressFill"),
  progressText: getElementById("progressText"),
  error: getElementById("error"),
  result: getElementById("result"),
  resultInfo: getElementById("resultInfo"),
  downloadButton: getElementByIdAs<HTMLButtonElement>("downloadButton"),
  playButton: getElementByIdAs<HTMLButtonElement>("playButton"),
};

const state: UIState = {
  selectedFile: null,
  processedBlob: null,
  isProcessing: false,
};

function formatFileSize(bytes: number): string {
  if (bytes === 0) {
    return "0 Bytes";
  }
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${Math.round((bytes / k ** i) * 100) / 100} ${sizes[i]}`;
}

function validateVideoFile(file: File): void {
  if (!file.type.startsWith("video/")) {
    throw new Error("Please select a valid video file");
  }
}

function showError(message: string): void {
  elements.error.textContent = message;
  elements.error.classList.add("active");
}

function hideError(): void {
  elements.error.classList.remove("active");
}

function showResult(originalSize: number, processedSize: number): void {
  elements.resultInfo.textContent = `Original: ${formatFileSize(originalSize)} → Processed: ${formatFileSize(processedSize)}`;
  elements.result.classList.add("active");
}

function hideResult(): void {
  elements.result.classList.remove("active");
}

function updateProgress(percentage: number, text?: string): void {
  const percentageValue = Math.round(percentage * 100);
  elements.progressFill.style.width = `${percentageValue}%`;
  if (text) {
    elements.progressText.textContent = text;
  } else {
    elements.progressText.textContent = `Transcoding... ${percentageValue}%`;
  }
}

function showProgress(): void {
  elements.progress.classList.add("active");
}

function hideProgress(): void {
  elements.progress.classList.remove("active");
}

function handleFileSelect(file: File): void {
  validateVideoFile(file);
  state.selectedFile = file;
  elements.fileName.textContent = file.name;
  elements.fileSize.textContent = formatFileSize(file.size);
  elements.fileInfo.classList.add("active");
  elements.processButton.disabled = false;
  hideError();
  hideResult();
}

function handleDragOver(e: DragEvent): void {
  e.preventDefault();
  elements.uploadArea.classList.add("dragover");
}

function handleDragLeave(): void {
  elements.uploadArea.classList.remove("dragover");
}

function handleDrop(e: DragEvent): void {
  e.preventDefault();
  elements.uploadArea.classList.remove("dragover");
  const file = e.dataTransfer?.files[0];
  if (!file) {
    showError("No file was dropped");
    return;
  }
  try {
    handleFileSelect(file);
  } catch (error) {
    showError(error instanceof Error ? error.message : "Invalid file");
  }
}

function handleFileInputChange(e: Event): void {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) {
    return;
  }
  try {
    handleFileSelect(file);
  } catch (error) {
    showError(error instanceof Error ? error.message : "Invalid file");
  }
}

async function processVideo(): Promise<void> {
  if (!state.selectedFile) {
    throw new Error("No file selected");
  }

  state.isProcessing = true;
  elements.processButton.disabled = true;
  hideError();
  hideResult();
  showProgress();
  updateProgress(0, "Starting transcoding...");

  try {
    const transcodeResult = await transcodeVideo(
      state.selectedFile,
      DEFAULT_TRANSCODE_CONFIG,
      (progress: number) => {
        updateProgress(progress);
      }
    );

    state.processedBlob = transcodeResult.blob;
    updateProgress(1, "Complete!");

    setTimeout(() => {
      hideProgress();
      if (!state.selectedFile) {
        throw new Error("Selected file is missing");
      }
      showResult(state.selectedFile.size, transcodeResult.blob.size);
      elements.processButton.disabled = false;
      state.isProcessing = false;
    }, 500);
  } catch (error) {
    hideProgress();
    showError(
      error instanceof Error
        ? error.message
        : "An error occurred during transcoding"
    );
    elements.processButton.disabled = false;
    state.isProcessing = false;
  }
}

function downloadVideo(): void {
  if (!state.processedBlob) {
    throw new Error("No processed video available");
  }
  if (!state.selectedFile) {
    throw new Error("Original file information is missing");
  }

  const url = URL.createObjectURL(state.processedBlob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${state.selectedFile.name.replace(FILE_EXTENSION_REGEX, "")}_transcoded.mp4`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function playVideo(): void {
  if (!state.processedBlob) {
    throw new Error("No processed video available");
  }

  const url = URL.createObjectURL(state.processedBlob);
  const newWindow = window.open();
  if (!newWindow) {
    throw new Error("Failed to open video player window");
  }

  newWindow.document.write(`
    <html>
      <head><title>Transcoded Video</title></head>
      <body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh;">
        <video controls autoplay style="max-width:100%;max-height:100vh;">
          <source src="${url}" type="video/mp4">
        </video>
      </body>
    </html>
  `);
}

elements.uploadArea.addEventListener("click", () => {
  elements.fileInput.click();
});

elements.fileInput.addEventListener("change", handleFileInputChange);
elements.uploadArea.addEventListener("dragover", handleDragOver);
elements.uploadArea.addEventListener("dragleave", handleDragLeave);
elements.uploadArea.addEventListener("drop", handleDrop);
elements.processButton.addEventListener("click", processVideo);

elements.downloadButton.addEventListener("click", () => {
  try {
    downloadVideo();
  } catch (error) {
    showError(
      error instanceof Error ? error.message : "Failed to download video"
    );
  }
});

elements.playButton.addEventListener("click", () => {
  try {
    playVideo();
  } catch (error) {
    showError(error instanceof Error ? error.message : "Failed to play video");
  }
});
