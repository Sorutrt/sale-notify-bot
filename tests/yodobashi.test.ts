import { describe, expect, test } from "bun:test";
import { fetchPrice, parseYodobashiPrice } from "../src/pricing";

describe("parseYodobashiPrice", () => {
  test("parses JSON-LD offer prices", () => {
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "Product",
              "name": "Example Camera",
              "offers": {
                "@type": "Offer",
                "priceCurrency": "JPY",
                "price": "54,321"
              }
            }
          </script>
        </head>
        <body>
          <span class="productPrice">￥99,999</span>
        </body>
      </html>
    `;

    expect(parseYodobashiPrice(html)).toBe(54321);
  });

  test("falls back to visible price text", () => {
    const html = `
      <html>
        <body>
          <div class="productPrice">
            <span>販売価格</span>
            <span>￥12,345（税込）</span>
          </div>
        </body>
      </html>
    `;

    expect(parseYodobashiPrice(html)).toBe(12345);
  });
});

describe("fetchPrice", () => {
  test("fetches and parses Yodobashi URLs", async () => {
    const fetchMock = (async () =>
      new Response('<span class="productPrice">9,876円</span>', {
        status: 200,
      })) as unknown as typeof fetch;

    await expect(
      fetchPrice("https://www.yodobashi.com/product/100000001234567890/", {
        fetch: fetchMock,
      }),
    ).resolves.toEqual({
      price: 9876,
      currency: "JPY",
      source: "www.yodobashi.com",
    });
  });

  test("rejects unsupported hosts with a clear error", async () => {
    await expect(fetchPrice("https://example.com/product/1")).rejects.toThrow(
      "Unsupported price source host: example.com",
    );
  });
});
