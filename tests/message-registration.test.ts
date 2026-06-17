import { describe, expect, test } from "bun:test";
import { parseRegistrationMessage } from "../src/message-registration";

describe("parseRegistrationMessage", () => {
  test("parses URL followed by product name with half-width spaces", () => {
    expect(
      parseRegistrationMessage("https://example.com/item Nintendo Switch"),
    ).toEqual({
      url: "https://example.com/item",
      name: "Nintendo Switch",
    });
  });

  test("parses product name followed by URL with full-width spaces", () => {
    expect(
      parseRegistrationMessage("Nintendo　Switch　https://example.com/item"),
    ).toEqual({
      url: "https://example.com/item",
      name: "Nintendo Switch",
    });
  });

  test("parses mixed full-width and half-width spacing", () => {
    expect(
      parseRegistrationMessage("  Nintendo　Switch https://example.com/item  "),
    ).toEqual({
      url: "https://example.com/item",
      name: "Nintendo Switch",
    });
  });

  test("returns null when no URL is present", () => {
    expect(parseRegistrationMessage("Nintendo Switch")).toBeNull();
  });

  test("returns null when no product name is present", () => {
    expect(parseRegistrationMessage("https://example.com/item")).toBeNull();
  });
});
