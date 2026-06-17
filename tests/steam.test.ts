import { describe, expect, test } from "bun:test";
import {
  buildSteamPriceApiUrl,
  extractSteamAppId,
  fetchPrice,
  parseSteamPrice,
} from "../src/pricing";

describe("extractSteamAppId", () => {
  test("extracts app ids from Steam app URLs", () => {
    expect(
      extractSteamAppId(
        new URL("https://store.steampowered.com/app/570/Dota_2/"),
      ),
    ).toBe("570");
  });

  test("rejects non-app Steam URLs", () => {
    expect(
      extractSteamAppId(new URL("https://store.steampowered.com/sub/123/")),
    ).toBeNull();
  });
});

describe("parseSteamPrice", () => {
  test("parses JPY final prices", () => {
    const body = JSON.stringify({
      "570": {
        success: true,
        data: {
          is_free: false,
          price_overview: {
            currency: "JPY",
            final: 1234,
          },
        },
      },
    });

    expect(parseSteamPrice("570", body)).toBe(1234);
  });

  test("returns zero for free games", () => {
    const body = JSON.stringify({
      "570": {
        success: true,
        data: {
          is_free: true,
        },
      },
    });

    expect(parseSteamPrice("570", body)).toBe(0);
  });
});

describe("fetchPrice", () => {
  test("fetches Steam appdetails and parses Steam URLs", async () => {
    const requestedUrls: string[] = [];
    const fetchMock = (async (input: URL | RequestInfo) => {
      requestedUrls.push(String(input));
      return new Response(
        JSON.stringify({
          "570": {
            success: true,
            data: {
              price_overview: {
                currency: "JPY",
                final: 9876,
              },
            },
          },
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    await expect(
      fetchPrice("https://store.steampowered.com/app/570/Dota_2/", {
        fetch: fetchMock,
      }),
    ).resolves.toEqual({
      price: 9876,
      currency: "JPY",
      source: "store.steampowered.com",
    });

    expect(requestedUrls).toEqual([String(buildSteamPriceApiUrl("570"))]);
  });

  test("rejects unsupported hosts with a clear error", async () => {
    await expect(fetchPrice("https://example.com/product/1")).rejects.toThrow(
      "Unsupported price source host: example.com",
    );
  });
});
