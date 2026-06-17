import { describe, expect, test } from "bun:test";
import { runPriceCheck, type PriceCheckRepository } from "../src/price-checker";
import type { NotificationPayload, ProductUrlWithProduct } from "../src/types";

function createEntry(
  overrides: Partial<ProductUrlWithProduct> = {},
): ProductUrlWithProduct {
  return {
    id: 1,
    productId: 1,
    productName: "テスト商品",
    url: "https://example.com/item",
    basePrice: 1000,
    thresholdPercent: 10,
    lastPrice: 1000,
    lastNotifiedPrice: null,
    enabled: true,
    createdAt: "2026-06-17T00:00:00.000Z",
    ...overrides,
  };
}

function createRepository(entry: ProductUrlWithProduct): {
  repository: PriceCheckRepository;
  history: Array<{ urlId: number; price: number; checkedAt: Date }>;
} {
  const history: Array<{ urlId: number; price: number; checkedAt: Date }> = [];

  return {
    history,
    repository: {
      listEnabledProductUrls() {
        return entry.enabled ? [entry] : [];
      },
      recordPriceHistory(input) {
        history.push(input);
      },
      updateLastPrice({ price }) {
        entry.lastPrice = price;
      },
      updateLastNotifiedPrice({ price }) {
        entry.lastNotifiedPrice = price;
      },
    },
  };
}

describe("runPriceCheck", () => {
  test("notifies only once for the same discounted price", async () => {
    const entry = createEntry();
    const { repository, history } = createRepository(entry);
    const notifications: NotificationPayload[] = [];

    const first = await runPriceCheck({
      repository,
      fetchPrice: () => 900,
      notify: (payload) => {
        notifications.push(payload);
      },
      now: () => new Date("2026-06-17T00:00:00.000Z"),
    });
    const second = await runPriceCheck({
      repository,
      fetchPrice: () => 900,
      notify: (payload) => {
        notifications.push(payload);
      },
      now: () => new Date("2026-06-17T00:10:00.000Z"),
    });

    expect(first).toEqual({ checked: 1, skipped: 0, notified: 1 });
    expect(second).toEqual({ checked: 1, skipped: 0, notified: 0 });
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      productName: "テスト商品",
      currentPrice: 900,
      basePrice: 1000,
      discountPercent: 10,
    });
    expect(entry.lastPrice).toBe(900);
    expect(entry.lastNotifiedPrice).toBe(900);
    expect(history.map((item) => item.price)).toEqual([900, 900]);
  });

  test("notifies again when the discount gets deeper", async () => {
    const entry = createEntry();
    const { repository } = createRepository(entry);
    const notifications: NotificationPayload[] = [];
    const prices = [900, 800];

    await runPriceCheck({
      repository,
      fetchPrice: () => prices.shift(),
      notify: (payload) => {
        notifications.push(payload);
      },
    });
    const result = await runPriceCheck({
      repository,
      fetchPrice: () => prices.shift(),
      notify: (payload) => {
        notifications.push(payload);
      },
    });

    expect(result).toEqual({ checked: 1, skipped: 0, notified: 1 });
    expect(notifications.map((payload) => payload.currentPrice)).toEqual([
      900,
      800,
    ]);
    expect(notifications.at(1)?.discountPercent).toBe(20);
    expect(entry.lastPrice).toBe(800);
    expect(entry.lastNotifiedPrice).toBe(800);
  });
});
