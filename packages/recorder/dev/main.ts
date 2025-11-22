/// <reference types="vite/client" />
import "../src/components/vidtreo-recorder.wc";

function configureRecorder(): void {
  const recorder = document.querySelector("vidtreo-recorder");
  if (!recorder) {
    throw new Error("vidtreo-recorder element not found in DOM");
  }

  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  const apiKey = import.meta.env.VITE_API_KEY;

  if (backendUrl) {
    recorder.setAttribute("backend-url", backendUrl);
  }
  if (apiKey) {
    recorder.setAttribute("api-key", apiKey);
  }
}

configureRecorder();
