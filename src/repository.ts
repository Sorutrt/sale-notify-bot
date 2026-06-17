import type { Database } from "bun:sqlite";
import type { ProductSummary, ProductUrl, ProductUrlWithProduct } from "./types";

type ProductUrlRow = {
  id: number;
  product_id: number;
  url: string;
  base_price: number;
  threshold_percent: number;
  last_price: number | null;
  last_notified_price: number | null;
  enabled: number;
  created_at: string;
};

type ProductUrlWithProductRow = ProductUrlRow & {
  product_name: string;
};

type ProductSummaryRow = {
  id: number;
  name: string;
  url_count: number;
  min_base_price: number | null;
  max_base_price: number | null;
  first_base_price: number | null;
};

export type UpsertProductUrlInput = {
  name: string;
  url: string;
  basePrice: number;
  thresholdPercent?: number;
};

export type RecordPriceCheckResult = {
  productUrl: ProductUrl;
  shouldNotify: boolean;
  discountPercent: number;
};

function mapProductUrl(row: ProductUrlRow): ProductUrl {
  return {
    id: row.id,
    productId: row.product_id,
    url: row.url,
    basePrice: row.base_price,
    thresholdPercent: row.threshold_percent,
    lastPrice: row.last_price,
    lastNotifiedPrice: row.last_notified_price,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
  };
}

function mapProductUrlWithProduct(row: ProductUrlWithProductRow): ProductUrlWithProduct {
  return {
    ...mapProductUrl(row),
    productName: row.product_name,
  };
}

function mapProductSummary(row: ProductSummaryRow): ProductSummary {
  return {
    id: row.id,
    name: row.name,
    urlCount: row.url_count,
    minBasePrice: row.min_base_price,
    maxBasePrice: row.max_base_price,
    firstBasePrice: row.first_base_price,
  };
}

function requireProductUrl(db: Database, name: string, url: string): ProductUrl {
  const productUrl = findProductUrlByNameAndUrl(db, name, url);
  if (!productUrl) {
    throw new Error(`Product URL not found: ${name} ${url}`);
  }
  return productUrl;
}

export function upsertProductUrl(db: Database, input: UpsertProductUrlInput): ProductUrl {
  const thresholdPercent = input.thresholdPercent ?? 10;

  return db.transaction(() => {
    db.query("INSERT OR IGNORE INTO products (name) VALUES ($name)").run({
      $name: input.name,
    });

    const product = db
      .query<{ id: number }, { $name: string }>("SELECT id FROM products WHERE name = $name")
      .get({ $name: input.name });

    if (!product) {
      throw new Error(`Unable to create product: ${input.name}`);
    }

    db.query(`
      INSERT INTO product_urls (
        product_id,
        url,
        base_price,
        threshold_percent,
        last_price,
        last_notified_price,
        enabled
      )
      VALUES ($productId, $url, $basePrice, $thresholdPercent, $basePrice, NULL, 1)
      ON CONFLICT(product_id, url) DO UPDATE SET
        base_price = excluded.base_price,
        threshold_percent = excluded.threshold_percent,
        last_price = excluded.last_price,
        last_notified_price = NULL,
        enabled = 1
    `).run({
      $productId: product.id,
      $url: input.url,
      $basePrice: input.basePrice,
      $thresholdPercent: thresholdPercent,
    });

    return requireProductUrl(db, input.name, input.url);
  })();
}

export function listProductSummaries(db: Database): ProductSummary[] {
  const rows = db
    .query<ProductSummaryRow, null>(`
      SELECT
        p.id,
        p.name,
        COUNT(pu.id) AS url_count,
        MIN(pu.base_price) AS min_base_price,
        MAX(pu.base_price) AS max_base_price,
        (
          SELECT first_pu.base_price
          FROM product_urls AS first_pu
          WHERE first_pu.product_id = p.id
          ORDER BY first_pu.id ASC
          LIMIT 1
        ) AS first_base_price
      FROM products AS p
      JOIN product_urls AS pu ON pu.product_id = p.id
      GROUP BY p.id, p.name
      ORDER BY p.name ASC
    `)
    .all(null);

  return rows.map(mapProductSummary);
}

export function listProductUrlsByName(db: Database, name: string): ProductUrl[] {
  const rows = db
    .query<ProductUrlRow, { $name: string }>(`
      SELECT pu.*
      FROM product_urls AS pu
      JOIN products AS p ON p.id = pu.product_id
      WHERE p.name = $name
      ORDER BY pu.id ASC
    `)
    .all({ $name: name });

  return rows.map(mapProductUrl);
}

export function findProductUrlByNameAndUrl(
  db: Database,
  name: string,
  url: string,
): ProductUrl | null {
  const row = db
    .query<ProductUrlRow, { $name: string; $url: string }>(`
      SELECT pu.*
      FROM product_urls AS pu
      JOIN products AS p ON p.id = pu.product_id
      WHERE p.name = $name AND pu.url = $url
    `)
    .get({ $name: name, $url: url });

  return row ? mapProductUrl(row) : null;
}

export function updateBasePrice(
  db: Database,
  name: string,
  url: string,
  basePrice: number,
): ProductUrl {
  return db.transaction(() => {
    const productUrl = requireProductUrl(db, name, url);
    db.query("UPDATE product_urls SET base_price = $basePrice WHERE id = $id").run({
      $basePrice: basePrice,
      $id: productUrl.id,
    });
    return requireProductUrl(db, name, url);
  })();
}

export function updateThresholdPercent(
  db: Database,
  name: string,
  url: string,
  thresholdPercent: number,
): ProductUrl {
  return db.transaction(() => {
    const productUrl = requireProductUrl(db, name, url);
    db.query("UPDATE product_urls SET threshold_percent = $thresholdPercent WHERE id = $id").run({
      $thresholdPercent: thresholdPercent,
      $id: productUrl.id,
    });
    return requireProductUrl(db, name, url);
  })();
}

export function deleteProductUrl(db: Database, name: string, url: string): boolean {
  return db.transaction(() => {
    const productUrl = findProductUrlByNameAndUrl(db, name, url);
    if (!productUrl) {
      return false;
    }

    db.query("DELETE FROM product_urls WHERE id = $id").run({ $id: productUrl.id });
    db.query(`
      DELETE FROM products
      WHERE id = $productId
        AND NOT EXISTS (
          SELECT 1 FROM product_urls WHERE product_id = $productId
        )
    `).run({ $productId: productUrl.productId });

    return true;
  })();
}

export function listEnabledProductUrls(db: Database): ProductUrlWithProduct[] {
  const rows = db
    .query<ProductUrlWithProductRow, null>(`
      SELECT
        pu.*,
        p.name AS product_name
      FROM product_urls AS pu
      JOIN products AS p ON p.id = pu.product_id
      WHERE pu.enabled = 1
      ORDER BY p.name ASC, pu.id ASC
    `)
    .all(null);

  return rows.map(mapProductUrlWithProduct);
}

export function recordPriceCheck(
  db: Database,
  productUrlId: number,
  price: number,
): RecordPriceCheckResult {
  return db.transaction(() => {
    const row = db
      .query<ProductUrlRow, { $id: number }>("SELECT * FROM product_urls WHERE id = $id")
      .get({ $id: productUrlId });

    if (!row) {
      throw new Error(`Product URL not found: ${productUrlId}`);
    }

    const discountPercent =
      row.base_price === 0 ? 0 : ((row.base_price - price) / row.base_price) * 100;
    const shouldNotify = discountPercent >= row.threshold_percent && row.last_notified_price !== price;

    db.query("INSERT INTO price_history (url_id, price) VALUES ($urlId, $price)").run({
      $urlId: productUrlId,
      $price: price,
    });

    db.query(`
      UPDATE product_urls
      SET
        last_price = $price,
        last_notified_price = CASE
          WHEN $shouldNotify = 1 THEN $price
          ELSE last_notified_price
        END
      WHERE id = $id
    `).run({
      $price: price,
      $shouldNotify: shouldNotify ? 1 : 0,
      $id: productUrlId,
    });

    const updatedRow = db
      .query<ProductUrlRow, { $id: number }>("SELECT * FROM product_urls WHERE id = $id")
      .get({ $id: productUrlId });

    if (!updatedRow) {
      throw new Error(`Product URL not found after update: ${productUrlId}`);
    }

    return {
      productUrl: mapProductUrl(updatedRow),
      shouldNotify,
      discountPercent,
    };
  })();
}

export class ProductRepository {
  constructor(private readonly db: Database) {}

  upsertProductUrl(input: UpsertProductUrlInput): ProductUrl {
    return upsertProductUrl(this.db, input);
  }

  listProductSummaries(): ProductSummary[] {
    return listProductSummaries(this.db);
  }

  listProductUrlsByName(name: string): ProductUrl[] {
    return listProductUrlsByName(this.db, name);
  }

  findProductUrlByNameAndUrl(name: string, url: string): ProductUrl | null {
    return findProductUrlByNameAndUrl(this.db, name, url);
  }

  updateBasePrice(name: string, url: string, basePrice: number): ProductUrl {
    return updateBasePrice(this.db, name, url, basePrice);
  }

  updateThresholdPercent(name: string, url: string, thresholdPercent: number): ProductUrl {
    return updateThresholdPercent(this.db, name, url, thresholdPercent);
  }

  async deleteProductUrl(
    nameOrInput: string | { name: string; url: string },
    url?: string,
  ): Promise<boolean> {
    if (typeof nameOrInput === "string") {
      if (!url) {
        throw new Error("URL is required when deleting by name");
      }
      return deleteProductUrl(this.db, nameOrInput, url);
    }

    return deleteProductUrl(this.db, nameOrInput.name, nameOrInput.url);
  }

  listEnabledProductUrls(): ProductUrlWithProduct[] {
    return listEnabledProductUrls(this.db);
  }

  recordPriceCheck(productUrlId: number, price: number): RecordPriceCheckResult {
    return recordPriceCheck(this.db, productUrlId, price);
  }

  async registerProduct(input: UpsertProductUrlInput & { lastPrice?: number }): Promise<ProductUrl> {
    return this.upsertProductUrl(input);
  }

  async listProducts(): Promise<ProductSummary[]> {
    return this.listProductSummaries();
  }

  async listProductUrls(name: string): Promise<ProductUrl[]> {
    return this.listProductUrlsByName(name);
  }

  async setBasePrice(input: {
    name: string;
    url: string;
    basePrice: number;
  }): Promise<ProductUrl | null> {
    return this.findProductUrlByNameAndUrl(input.name, input.url)
      ? this.updateBasePrice(input.name, input.url, input.basePrice)
      : null;
  }

  async setThresholdPercent(input: {
    name: string;
    url: string;
    thresholdPercent: number;
  }): Promise<ProductUrl | null> {
    return this.findProductUrlByNameAndUrl(input.name, input.url)
      ? this.updateThresholdPercent(input.name, input.url, input.thresholdPercent)
      : null;
  }

  async recordPriceHistory(input: {
    urlId: number;
    price: number;
    checkedAt?: Date;
  }): Promise<void> {
    const checkedAt = input.checkedAt?.toISOString();
    if (checkedAt) {
      this.db
        .query("INSERT INTO price_history (url_id, price, checked_at) VALUES ($urlId, $price, $checkedAt)")
        .run({ $urlId: input.urlId, $price: input.price, $checkedAt: checkedAt });
      return;
    }

    this.db
      .query("INSERT INTO price_history (url_id, price) VALUES ($urlId, $price)")
      .run({ $urlId: input.urlId, $price: input.price });
  }

  async updateLastPrice(input: { urlId: number; price: number }): Promise<void> {
    this.db
      .query("UPDATE product_urls SET last_price = $price WHERE id = $urlId")
      .run({ $price: input.price, $urlId: input.urlId });
  }

  async updateLastNotifiedPrice(input: { urlId: number; price: number }): Promise<void> {
    this.db
      .query("UPDATE product_urls SET last_notified_price = $price WHERE id = $urlId")
      .run({ $price: input.price, $urlId: input.urlId });
  }
}

export function createRepository(db: Database): ProductRepository {
  return new ProductRepository(db);
}
