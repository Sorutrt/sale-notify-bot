export function extractSteamAppId(url: URL): string | null {
  if (url.hostname.toLowerCase() !== "store.steampowered.com") {
    return null;
  }

  const match = url.pathname.match(/^\/app\/(\d+)(?:\/|$)/);
  return match?.[1] ?? null;
}

export function buildSteamPriceApiUrl(appId: string): URL {
  const apiUrl = new URL("https://store.steampowered.com/api/appdetails");
  apiUrl.searchParams.set("appids", appId);
  apiUrl.searchParams.set("cc", "jp");
  apiUrl.searchParams.set("l", "japanese");
  apiUrl.searchParams.set("filters", "price_overview");
  return apiUrl;
}

type SteamAppDetails = {
  success?: boolean;
  data?: {
    is_free?: boolean;
    price_overview?: {
      currency?: string;
      final?: number;
    };
  };
};

export function parseSteamPrice(appId: string, body: string): number {
  const parsed = JSON.parse(body) as Record<string, SteamAppDetails>;
  const details = parsed[appId];

  if (!details?.success) {
    throw new Error(`Steam appdetails did not return a successful response for app ${appId}`);
  }

  if (details.data?.is_free) {
    return 0;
  }

  const priceOverview = details.data?.price_overview;
  if (priceOverview?.currency !== "JPY") {
    throw new Error(`Steam app ${appId} did not return a JPY price`);
  }

  const price = priceOverview.final;
  if (typeof price === "number" && Number.isFinite(price) && price >= 0) {
    return Math.trunc(price / 100);
  }

  throw new Error(`Unable to parse Steam price for app ${appId}`);
}
