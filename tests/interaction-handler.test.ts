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

describe("handleChatInputCommand", () => {
  test("defers register commands before fetching the price", async () => {
    const interaction = createRegisterInteraction({
      url: "https://www.yodobashi.com/product/100000001008988438/",
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
          return { price: 12_345, currency: "JPY", source: "www.yodobashi.com" };
        },
      },
    });

    expect(interaction.calls).toEqual(["deferReply", "editReply"]);
    expect(interaction.replies[0]).toContain("登録しました: テスト商品");
  });

  test("returns a registration failure message when price fetch fails", async () => {
    const interaction = createRegisterInteraction({
      url: "https://www.yodobashi.com/product/100000001008988438/",
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
      "価格を取得できなかったため登録できませんでした。\nhttps://www.yodobashi.com/product/100000001008988438/",
    );
    expect(errors).toHaveLength(1);
  });
});
