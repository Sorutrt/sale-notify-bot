import * as cheerio from "cheerio";

const PRICE_SELECTORS = [
  "[itemprop='price']",
  ".productPrice",
  ".price",
  ".salesInfo .price",
  ".js_productPrice",
  "#js_scl_unitPrice",
  "#js_scl_unitPrice .value",
  ".mainPrice",
  ".buyBox .price",
];

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

function normalizePrice(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const numeric = trimmed
    .replace(/[０-９]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0),
    )
    .replace(/[,，\s円￥¥税込税抜]/g, "");

  const match = numeric.match(/\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }

  const price = Number(match[0]);
  return Number.isFinite(price) ? Math.trunc(price) : null;
}

function pushPrice(value: unknown, prices: number[]): void {
  const price = normalizePrice(value);
  if (price !== null) {
    prices.push(price);
  }
}

function collectPriceFields(node: JsonValue, prices: number[]): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectPriceFields(item, prices);
    }
    return;
  }

  if (!node || typeof node !== "object") {
    return;
  }

  const record = node as { [key: string]: JsonValue };
  pushPrice(record.price, prices);
  pushPrice(record.lowPrice, prices);
  pushPrice(record.highPrice, prices);
}

function collectOfferPrices(node: JsonValue, prices: number[]): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectOfferPrices(item, prices);
    }
    return;
  }

  if (!node || typeof node !== "object") {
    return;
  }

  const record = node as { [key: string]: JsonValue };
  const type = record["@type"];
  const types = Array.isArray(type) ? type : [type];
  const isOffer = types.some(
    (item) => typeof item === "string" && item.toLowerCase() === "offer",
  );

  if (isOffer) {
    collectPriceFields(record, prices);
    const priceSpecification = record.priceSpecification;
    if (priceSpecification) {
      collectPriceFields(priceSpecification, prices);
    }
  }

  if (record.offers) {
    collectOfferPrices(record.offers, prices);
  }

  if (record["@graph"]) {
    collectOfferPrices(record["@graph"], prices);
  }
}

function parseJsonLdPrices($: cheerio.CheerioAPI): number[] {
  const prices: number[] = [];

  $("script[type='application/ld+json']").each((_, element) => {
    const contents = $(element).text();
    if (!contents.trim()) {
      return;
    }

    try {
      collectOfferPrices(JSON.parse(contents) as JsonValue, prices);
    } catch {
      // Ignore unrelated or malformed JSON-LD blocks.
    }
  });

  return prices;
}

function parseVisiblePriceText($: cheerio.CheerioAPI): number | null {
  for (const selector of PRICE_SELECTORS) {
    const candidates = $(selector)
      .map((_, element) => $(element).attr("content") || $(element).text())
      .get();

    for (const candidate of candidates) {
      const price = normalizePrice(candidate);
      if (price !== null) {
        return price;
      }
    }
  }

  const bodyText = $("body").text();
  const yenPattern =
    /(?:￥|¥)\s*([0-9０-９][0-9０-９,，\s]*)|([0-9０-９][0-9０-９,，\s]*)\s*円/g;
  let match: RegExpExecArray | null;

  while ((match = yenPattern.exec(bodyText)) !== null) {
    const price = normalizePrice(match[1] || match[2]);
    if (price !== null) {
      return price;
    }
  }

  return null;
}

export function parseYodobashiPrice(html: string): number {
  const $ = cheerio.load(html);
  const [jsonLdPrice] = parseJsonLdPrices($);
  if (jsonLdPrice !== undefined) {
    return jsonLdPrice;
  }

  const visiblePrice = parseVisiblePriceText($);
  if (visiblePrice !== null) {
    return visiblePrice;
  }

  throw new Error("Unable to parse Yodobashi price from HTML");
}
