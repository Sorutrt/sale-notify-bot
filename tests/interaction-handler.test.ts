import { describe, expect, test } from "bun:test";
import type { AutocompleteInteraction, ChatInputCommandInteraction } from "discord.js";
import {
  handleAutocompleteInteraction,
  handleChatInputCommand,
} from "../src/interaction-handler";

function createRegisterInteraction(input: {
  url: string;
  name: string;
  threshold?: number;
}): ChatInputCommandInteraction & {
  calls: string[];
  replies: string[];
} {
  const calls: string[] = [];
  const replies: string[] = [];
  const interaction = {
    commandName: "register",
    deferred: false,
    replied: false,
    calls,
    replies,
    options: {
      getString(name: string) {
        return name === "url" ? input.url : input.name;
      },
      getNumber(name: string) {
        return name === "threshold" ? input.threshold ?? null : null;
      },
    },
    async deferReply() {
      calls.push("deferReply");
      interaction.deferred = true;
    },
    async editReply({ content }: { content: string }) {
      calls.push("editReply");
      replies.push(content);
      interaction.replied = true;
    },
    async reply({ content }: { content: string }) {
      calls.push("reply");
      replies.push(content);
      interaction.replied = true;
    },
    async followUp({ content }: { content: string }) {
      calls.push("followUp");
      replies.push(content);
    },
  };

  return interaction as unknown as ChatInputCommandInteraction & {
    calls: string[];
    replies: string[];
  };
}

function createDeleteInteraction(input: {
  name: string;
  url: string;
}): ChatInputCommandInteraction & {
  replies: string[];
} {
  const replies: string[] = [];
  const interaction = {
    commandName: "delete",
    deferred: false,
    replied: false,
    replies,
    options: {
      getString(name: string) {
        return name === "url" ? input.url : input.name;
      },
    },
    async reply({ content }: { content: string }) {
      replies.push(content);
      interaction.replied = true;
    },
  };

  return interaction as unknown as ChatInputCommandInteraction & {
    replies: string[];
  };
}

function createAutocompleteInteraction(input: {
  commandName: string;
  focusedName: string;
  focusedValue: string;
  name?: string;
}): AutocompleteInteraction & {
  responses: Array<Array<{ name: string; value: string }>>;
} {
  const responses: Array<Array<{ name: string; value: string }>> = [];
  const interaction = {
    commandName: input.commandName,
    responses,
    options: {
      getFocused() {
        return {
          name: input.focusedName,
          value: input.focusedValue,
        };
      },
      getString(name: string) {
        return name === "name" ? input.name ?? null : null;
      },
    },
    async respond(choices: Array<{ name: string; value: string }>) {
      responses.push(choices);
    },
  };

  return interaction as unknown as AutocompleteInteraction & {
    responses: Array<Array<{ name: string; value: string }>>;
  };
}

describe("handleChatInputCommand", () => {
  test("defers register commands before fetching the price", async () => {
    const interaction = createRegisterInteraction({
      url: "https://store.steampowered.com/app/570/Dota_2/",
      name: "テスト商品",
    });

    await handleChatInputCommand(interaction, {
      repository: {
        async registerProduct() {},
        async listProducts() {
          return [];
        },
        async listProductUrls() {
          return [];
        },
        async deleteProductUrl() {
          return false;
        },
        async deleteProductUrlsByName() {
          return 0;
        },
        async setBasePrice() {
          return null;
        },
        async setThresholdPercent() {
          return null;
        },
      },
      pricing: {
        async fetchPrice() {
          expect(interaction.calls).toEqual(["deferReply"]);
          return {
            price: 12_345,
            currency: "JPY",
            source: "store.steampowered.com",
          };
        },
      },
    });

    expect(interaction.calls).toEqual(["deferReply", "editReply"]);
    expect(interaction.replies[0]).toContain("登録しました: テスト商品");
  });

  test("returns a registration failure message when price fetch fails", async () => {
    const interaction = createRegisterInteraction({
      url: "https://store.steampowered.com/app/570/Dota_2/",
      name: "テスト商品",
    });
    const errors: unknown[] = [];

    await handleChatInputCommand(interaction, {
      repository: {
        async registerProduct() {
          throw new Error("should not register without a price");
        },
        async listProducts() {
          return [];
        },
        async listProductUrls() {
          return [];
        },
        async deleteProductUrl() {
          return false;
        },
        async deleteProductUrlsByName() {
          return 0;
        },
        async setBasePrice() {
          return null;
        },
        async setThresholdPercent() {
          return null;
        },
      },
      pricing: {
        async fetchPrice() {
          throw new Error("fetch failed");
        },
      },
      logger: {
        error(...args: unknown[]) {
          errors.push(args);
        },
      },
    });

    expect(interaction.calls).toEqual(["deferReply", "editReply"]);
    expect(interaction.replies[0]).toBe(
      "価格を取得できなかったため登録できませんでした。\nhttps://store.steampowered.com/app/570/Dota_2/",
    );
    expect(errors).toHaveLength(1);
  });

  test("deletes all URLs for a product when delete url is all", async () => {
    const interaction = createDeleteInteraction({
      name: "Keyboard",
      url: "all",
    });
    const deletedNames: string[] = [];

    await handleChatInputCommand(interaction, {
      repository: {
        async registerProduct() {},
        async listProducts() {
          return [];
        },
        async listProductUrls() {
          return [];
        },
        async deleteProductUrl() {
          throw new Error("should delete by product name");
        },
        async deleteProductUrlsByName(name: string) {
          deletedNames.push(name);
          return 2;
        },
        async setBasePrice() {
          return null;
        },
        async setThresholdPercent() {
          return null;
        },
      },
      pricing: {
        async fetchPrice() {
          return null;
        },
      },
    });

    expect(deletedNames).toEqual(["Keyboard"]);
    expect(interaction.replies[0]).toBe("削除しました: Keyboard\n2件");
  });

  test("responds with product name autocomplete choices for list", async () => {
    const interaction = createAutocompleteInteraction({
      commandName: "list",
      focusedName: "name",
      focusedValue: "key",
    });

    await handleAutocompleteInteraction(interaction, {
      repository: {
        async registerProduct() {},
        async listProducts() {
          return [
            {
              id: 1,
              name: "Keyboard",
              urlCount: 2,
              minBasePrice: 1000,
              maxBasePrice: 2000,
              firstBasePrice: 1000,
            },
            {
              id: 2,
              name: "Mouse",
              urlCount: 1,
              minBasePrice: 500,
              maxBasePrice: 500,
              firstBasePrice: 500,
            },
          ];
        },
        async listProductUrls() {
          return [];
        },
        async deleteProductUrl() {
          return false;
        },
        async deleteProductUrlsByName() {
          return 0;
        },
        async setBasePrice() {
          return null;
        },
        async setThresholdPercent() {
          return null;
        },
      },
      pricing: {
        async fetchPrice() {
          return null;
        },
      },
    });

    expect(interaction.responses[0]).toEqual([
      {
        name: "Keyboard",
        value: "Keyboard",
      },
    ]);
  });

  test("responds with product URL autocomplete choices for delete", async () => {
    const interaction = createAutocompleteInteraction({
      commandName: "delete",
      focusedName: "url",
      focusedValue: "shop-b",
      name: "Keyboard",
    });

    await handleAutocompleteInteraction(interaction, {
      repository: {
        async registerProduct() {},
        async listProducts() {
          return [];
        },
        async listProductUrls(name: string) {
          expect(name).toBe("Keyboard");
          return [
            {
              id: 1,
              productId: 1,
              url: "https://shop-a.example/keyboard",
              basePrice: 1000,
              thresholdPercent: 10,
              lastPrice: 1000,
              lastNotifiedPrice: null,
              enabled: true,
              createdAt: "2026-01-01T00:00:00.000Z",
            },
            {
              id: 2,
              productId: 1,
              url: "https://shop-b.example/keyboard",
              basePrice: 2000,
              thresholdPercent: 10,
              lastPrice: 2000,
              lastNotifiedPrice: null,
              enabled: true,
              createdAt: "2026-01-01T00:00:00.000Z",
            },
          ];
        },
        async deleteProductUrl() {
          return false;
        },
        async deleteProductUrlsByName() {
          return 0;
        },
        async setBasePrice() {
          return null;
        },
        async setThresholdPercent() {
          return null;
        },
      },
      pricing: {
        async fetchPrice() {
          return null;
        },
      },
    });

    expect(interaction.responses[0]).toEqual([
      {
        name: "https://shop-b.example/keyboard",
        value: "https://shop-b.example/keyboard",
      },
    ]);
  });
});
