import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { initDb } from "../src/db";
import {
  ProductRepository,
  deleteProductUrlsByName,
  deleteProductUrl,
  findProductUrlByNameAndUrl,
  listEnabledProductUrls,
  listProductSummaries,
  listProductUrlsByName,
  recordPriceCheck,
  updateBasePrice,
  updateThresholdPercent,
  upsertProductUrl,
} from "../src/repository";

let db: Database;

beforeEach(() => {
  db = initDb(":memory:");
});

afterEach(() => {
  db.close();
});

describe("repository", () => {
  test("upserts product URLs and maps rows to camelCase", () => {
    const created = upsertProductUrl(db, {
      name: "Keyboard",
      url: "https://example.com/keyboard",
      basePrice: 12000,
    });

    expect(created).toMatchObject({
      productId: 1,
      url: "https://example.com/keyboard",
      basePrice: 12000,
      thresholdPercent: 10,
      lastPrice: 12000,
      lastNotifiedPrice: null,
      enabled: true,
    });
    expect(created.createdAt).toBeString();

    const updated = upsertProductUrl(db, {
      name: "Keyboard",
      url: "https://example.com/keyboard",
      basePrice: 9500,
      thresholdPercent: 15,
    });

    expect(updated.id).toBe(created.id);
    expect(updated.basePrice).toBe(9500);
    expect(updated.thresholdPercent).toBe(15);
    expect(updated.lastPrice).toBe(9500);
    expect(updated.lastNotifiedPrice).toBeNull();
  });

  test("lists product summaries and URLs by name", () => {
    upsertProductUrl(db, {
      name: "Keyboard",
      url: "https://shop-a.example/keyboard",
      basePrice: 12000,
    });
    upsertProductUrl(db, {
      name: "Keyboard",
      url: "https://shop-b.example/keyboard",
      basePrice: 10000,
    });
    upsertProductUrl(db, {
      name: "Mouse",
      url: "https://shop.example/mouse",
      basePrice: 5000,
    });

    expect(listProductSummaries(db)).toEqual([
      {
        id: 1,
        name: "Keyboard",
        urlCount: 2,
        minBasePrice: 10000,
        maxBasePrice: 12000,
        firstBasePrice: 12000,
      },
      {
        id: expect.any(Number),
        name: "Mouse",
        urlCount: 1,
        minBasePrice: 5000,
        maxBasePrice: 5000,
        firstBasePrice: 5000,
      },
    ]);

    const keyboardUrls = listProductUrlsByName(db, "Keyboard");
    expect(keyboardUrls.map((entry) => entry.url)).toEqual([
      "https://shop-a.example/keyboard",
      "https://shop-b.example/keyboard",
    ]);
  });

  test("finds and updates a product URL by product name and URL", () => {
    upsertProductUrl(db, {
      name: "Keyboard",
      url: "https://example.com/keyboard",
      basePrice: 12000,
    });

    const found = findProductUrlByNameAndUrl(db, "Keyboard", "https://example.com/keyboard");
    expect(found?.basePrice).toBe(12000);

    expect(updateBasePrice(db, "Keyboard", "https://example.com/keyboard", 11000).basePrice).toBe(
      11000,
    );
    expect(
      updateThresholdPercent(db, "Keyboard", "https://example.com/keyboard", 20)
        .thresholdPercent,
    ).toBe(20);
  });

  test("deletes product URLs and removes orphan products", () => {
    upsertProductUrl(db, {
      name: "Keyboard",
      url: "https://shop-a.example/keyboard",
      basePrice: 12000,
    });
    upsertProductUrl(db, {
      name: "Keyboard",
      url: "https://shop-b.example/keyboard",
      basePrice: 10000,
    });

    expect(deleteProductUrl(db, "Keyboard", "https://shop-a.example/keyboard")).toBe(true);
    expect(listProductSummaries(db)[0]?.urlCount).toBe(1);
    expect(deleteProductUrl(db, "Keyboard", "https://shop-b.example/keyboard")).toBe(true);
    expect(listProductSummaries(db)).toEqual([]);
    expect(deleteProductUrl(db, "Keyboard", "https://shop-b.example/keyboard")).toBe(false);
  });

  test("deletes all product URLs by product name", () => {
    upsertProductUrl(db, {
      name: "Keyboard",
      url: "https://shop-a.example/keyboard",
      basePrice: 12000,
    });
    upsertProductUrl(db, {
      name: "Keyboard",
      url: "https://shop-b.example/keyboard",
      basePrice: 10000,
    });
    upsertProductUrl(db, {
      name: "Mouse",
      url: "https://shop.example/mouse",
      basePrice: 5000,
    });

    expect(deleteProductUrlsByName(db, "Keyboard")).toBe(2);
    expect(listProductUrlsByName(db, "Keyboard")).toEqual([]);
    expect(listProductSummaries(db).map((product) => product.name)).toEqual(["Mouse"]);
    expect(deleteProductUrlsByName(db, "Keyboard")).toBe(0);
  });

  test("lists enabled product URLs with product names", () => {
    const first = upsertProductUrl(db, {
      name: "Keyboard",
      url: "https://shop-a.example/keyboard",
      basePrice: 12000,
    });
    upsertProductUrl(db, {
      name: "Mouse",
      url: "https://shop.example/mouse",
      basePrice: 5000,
    });

    db.query("UPDATE product_urls SET enabled = 0 WHERE id = $id").run({ $id: first.id });

    expect(listEnabledProductUrls(db)).toMatchObject([
      {
        productName: "Mouse",
        url: "https://shop.example/mouse",
        enabled: true,
      },
    ]);
  });

  test("records price history and notification state transactionally", () => {
    const productUrl = upsertProductUrl(db, {
      name: "Keyboard",
      url: "https://example.com/keyboard",
      basePrice: 10000,
      thresholdPercent: 10,
    });

    const firstCheck = recordPriceCheck(db, productUrl.id, 9500);
    expect(firstCheck.shouldNotify).toBe(false);
    expect(firstCheck.productUrl.lastPrice).toBe(9500);
    expect(firstCheck.productUrl.lastNotifiedPrice).toBeNull();

    const secondCheck = recordPriceCheck(db, productUrl.id, 9000);
    expect(secondCheck.shouldNotify).toBe(true);
    expect(secondCheck.discountPercent).toBe(10);
    expect(secondCheck.productUrl.lastPrice).toBe(9000);
    expect(secondCheck.productUrl.lastNotifiedPrice).toBe(9000);

    const duplicateCheck = recordPriceCheck(db, productUrl.id, 9000);
    expect(duplicateCheck.shouldNotify).toBe(false);
    expect(duplicateCheck.productUrl.lastNotifiedPrice).toBe(9000);

    const historyCount = db
      .query<{ count: number }, null>("SELECT COUNT(*) AS count FROM price_history")
      .get(null);
    expect(historyCount?.count).toBe(3);
  });

  test("ProductRepository wraps the standalone APIs", () => {
    const repository = new ProductRepository(db);

    const productUrl = repository.upsertProductUrl({
      name: "Keyboard",
      url: "https://example.com/keyboard",
      basePrice: 10000,
    });

    expect(repository.listProductSummaries()).toHaveLength(1);
    expect(repository.listProductUrlsByName("Keyboard")).toHaveLength(1);
    expect(
      repository.findProductUrlByNameAndUrl("Keyboard", "https://example.com/keyboard")?.id,
    ).toBe(productUrl.id);
    expect(repository.recordPriceCheck(productUrl.id, 8000).shouldNotify).toBe(true);
  });
});
