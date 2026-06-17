import type { PriceFetchResult } from "../types";
import {
  buildSteamPriceApiUrl,
  extractSteamAppId,
  parseSteamPrice,
} from "./steam";

export type FetchPriceOptions = {
  fetch?: typeof fetch;
  headers?: HeadersInit;
  timeoutMs?: number;
  userAgent?: string;
};

const defaultFetchTimeoutMs = 15_000;

type PriceSource = {
  requestUrl: URL;
  parse(body: string): number;
  source: string;
};

function getSupportedSource(url: URL): PriceSource {
  const steamAppId = extractSteamAppId(url);
  if (steamAppId) {
    return {
      requestUrl: buildSteamPriceApiUrl(steamAppId),
      parse: (body) => parseSteamPrice(steamAppId, body),
      source: url.hostname,
    };
  }

  throw new Error(`Unsupported price source host: ${url.hostname}`);
}

export async function fetchPrice(
  url: string,
  options: FetchPriceOptions = {},
): Promise<PriceFetchResult> {
  const parsedUrl = new URL(url);
  const source = getSupportedSource(parsedUrl);
  const fetchImpl = options.fetch ?? fetch;
  const headers = new Headers(options.headers);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? defaultFetchTimeoutMs,
  );

  if (options.userAgent && !headers.has("user-agent")) {
    headers.set("user-agent", options.userAgent);
  }

  try {
    const response = await fetchImpl(source.requestUrl, {
      headers,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch price from ${parsedUrl.hostname}: HTTP ${response.status}`,
      );
    }

    return {
      price: source.parse(await response.text()),
      currency: "JPY",
      source: source.source,
    };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        `Timed out fetching price from ${parsedUrl.hostname} after ${
          options.timeoutMs ?? defaultFetchTimeoutMs
        }ms`,
        { cause: error },
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export { buildSteamPriceApiUrl, extractSteamAppId, parseSteamPrice };
