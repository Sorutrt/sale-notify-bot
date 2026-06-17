import type {
  NotificationPayload,
  PriceFetchResult,
  ProductUrlWithProduct,
} from "./types";

export type PriceCheckRepository = {
  listEnabledProductUrls(): ProductUrlWithProduct[] | Promise<ProductUrlWithProduct[]>;
  recordPriceHistory(input: {
    urlId: number;
    price: number;
    checkedAt: Date;
  }): void | Promise<void>;
  updateLastPrice(input: {
    urlId: number;
    price: number;
  }): void | Promise<void>;
  updateLastNotifiedPrice(input: {
    urlId: number;
    price: number;
  }): void | Promise<void>;
};

export type FetchPrice = (
  url: string,
) => number | PriceFetchResult | null | undefined | Promise<number | PriceFetchResult | null | undefined>;

export type NotifyPriceDrop = (payload: NotificationPayload) => void | Promise<void>;

export type RunPriceCheckOptions = {
  repository: PriceCheckRepository;
  fetchPrice: FetchPrice;
  notify: NotifyPriceDrop;
  now?: () => Date;
};

export type PriceCheckResult = {
  checked: number;
  skipped: number;
  notified: number;
};

function normalizePrice(result: Awaited<ReturnType<FetchPrice>>): number | null {
  if (typeof result === "number") {
    return Number.isFinite(result) && result > 0 ? Math.round(result) : null;
  }

  if (result && Number.isFinite(result.price) && result.price > 0) {
    return Math.round(result.price);
  }

  return null;
}

function calculateDiscountPercent(basePrice: number, currentPrice: number): number {
  if (basePrice <= 0) {
    return 0;
  }

  return ((basePrice - currentPrice) / basePrice) * 100;
}

function shouldNotify(
  entry: ProductUrlWithProduct,
  currentPrice: number,
  discountPercent: number,
): boolean {
  return (
    discountPercent >= entry.thresholdPercent &&
    entry.lastNotifiedPrice !== currentPrice
  );
}

export async function runPriceCheck({
  repository,
  fetchPrice,
  notify,
  now = () => new Date(),
}: RunPriceCheckOptions): Promise<PriceCheckResult> {
  const entries = await repository.listEnabledProductUrls();
  const result: PriceCheckResult = {
    checked: 0,
    skipped: 0,
    notified: 0,
  };

  for (const entry of entries) {
    const currentPrice = normalizePrice(await fetchPrice(entry.url));

    if (currentPrice === null) {
      result.skipped += 1;
      continue;
    }

    result.checked += 1;

    await repository.recordPriceHistory({
      urlId: entry.id,
      price: currentPrice,
      checkedAt: now(),
    });
    await repository.updateLastPrice({
      urlId: entry.id,
      price: currentPrice,
    });

    const discountPercent = calculateDiscountPercent(
      entry.basePrice,
      currentPrice,
    );

    if (!shouldNotify(entry, currentPrice, discountPercent)) {
      continue;
    }

    await notify({
      productName: entry.productName,
      url: entry.url,
      currentPrice,
      basePrice: entry.basePrice,
      discountPercent,
    });
    await repository.updateLastNotifiedPrice({
      urlId: entry.id,
      price: currentPrice,
    });
    result.notified += 1;
  }

  return result;
}

