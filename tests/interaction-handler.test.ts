import { describe, expect, test } from "bun:test";
import type { ChatInputCommandInteraction } from "discord.js";
import { handleChatInputCommand } from "../src/interaction-handler";

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
});
