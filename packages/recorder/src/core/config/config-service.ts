import type { TranscodeConfig } from "../processor/types";
import { DEFAULT_TRANSCODE_CONFIG } from "./default-config";
import { type BackendConfigResponse, mapPresetToConfig } from "./preset-mapper";

const DEFAULT_CACHE_TIMEOUT = 5 * 60 * 1000;
const CONFIG_API_PATH = "/api/v1/videos/config";

export type ConfigServiceOptions = {
  apiKey: string;
  backendUrl: string;
  cacheTimeout?: number;
};

export class ConfigService {
  private cachedConfig: TranscodeConfig | null = null;
  private cacheTimestamp = 0;
  private readonly cacheTimeout: number;
  private fetchPromise: Promise<TranscodeConfig> | null = null;
  private readonly options: ConfigServiceOptions;

  constructor(options: ConfigServiceOptions) {
    this.options = options;
    if (options.cacheTimeout !== undefined) {
      if (
        typeof options.cacheTimeout !== "number" ||
        options.cacheTimeout <= 0
      ) {
        throw new Error("cacheTimeout must be a positive number");
      }
      this.cacheTimeout = options.cacheTimeout;
    } else {
      this.cacheTimeout = DEFAULT_CACHE_TIMEOUT;
    }
  }

  async fetchConfig(): Promise<TranscodeConfig> {
    const now = Date.now();
    if (this.cachedConfig && now - this.cacheTimestamp < this.cacheTimeout) {
      return this.cachedConfig;
    }

    if (this.fetchPromise) {
      return this.fetchPromise;
    }

    this.fetchPromise = this.fetchConfigFromBackend();

    try {
      const config = await this.fetchPromise;
      this.cachedConfig = config;
      this.cacheTimestamp = now;
      return config;
    } catch {
      return DEFAULT_TRANSCODE_CONFIG;
    } finally {
      this.fetchPromise = null;
    }
  }

  clearCache(): void {
    this.cachedConfig = null;
    this.cacheTimestamp = 0;
  }

  getCurrentConfig(): TranscodeConfig {
    if (!this.cachedConfig) {
      throw new Error("No cached config available. Call fetchConfig() first.");
    }
    return this.cachedConfig;
  }

  private async fetchConfigFromBackend(): Promise<TranscodeConfig> {
    const url = `${this.options.backendUrl}${CONFIG_API_PATH}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch config: ${response.status} ${response.statusText}`
      );
    }

    const data = (await response.json()) as BackendConfigResponse;

    if (
      !data.presetEncoding ||
      typeof data.max_width !== "number" ||
      typeof data.max_height !== "number"
    ) {
      throw new Error("Invalid config response from backend");
    }

    return mapPresetToConfig(
      data.presetEncoding,
      data.max_width,
      data.max_height
    );
  }
}
