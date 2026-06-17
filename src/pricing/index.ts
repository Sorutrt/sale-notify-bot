import type { PriceFetchResult } from "../types";
import { parseYodobashiPrice } from "./yodobashi";

export type FetchPriceOptions = {
  fetch?: typeof fetch;
  headers?: HeadersInit;
  userAgent?: string;
};

const YODOBASHI_HOSTS = new Set(["www.yodobashi.com", "yodobashi.com"]);

function isYodobashiHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    YODOBASHI_HOSTS.has(normalized) || normalized.endsWith(".yodobashi.com")
  );
}

function getSupportedParser(url: URL): (html: string) => number {
  if (isYodobashiHost(url.hostname)) {
    return parseYodobashiPrice;
  }

  throw new Error(`Unsupported price source host: ${url.hostname}`);
}

export async function fetchPrice(
  url: string,
  options: FetchPriceOptions = {},
): Promise<PriceFetchResult> {
  const parsedUrl = new URL(url);
  const parser = getSupportedParser(parsedUrl);
  const fetchImpl = options.fetch ?? fetch;
  const headers = new Headers(options.headers);

  if (options.userAgent && !headers.has("user-agent")) {
    headers.set("user-agent", options.userAgent);
  }

  const response = await fetchImpl(parsedUrl, { headers });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch price from ${parsedUrl.hostname}: HTTP ${response.status}`,
    );
  }

  return {
    price: parser(await response.text()),
    currency: "JPY",
    source: parsedUrl.hostname,
  };
}

export { parseYodobashiPrice };
