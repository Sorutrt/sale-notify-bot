const urlPattern = /^https?:\/\/\S+$/i;
const spacingPattern = /[ \u3000]+/u;

export type ParsedRegistrationMessage = {
  name: string;
  url: string;
};

export function parseRegistrationMessage(
  content: string,
): ParsedRegistrationMessage | null {
  const tokens = content.trim().split(spacingPattern).filter(Boolean);
  const urlIndex = tokens.findIndex((token) => urlPattern.test(token));

  if (urlIndex === -1) {
    return null;
  }

  const url = tokens[urlIndex];
  const name = [
    ...tokens.slice(0, urlIndex),
    ...tokens.slice(urlIndex + 1),
  ].join(" ");

  if (!url || !name) {
    return null;
  }

  return { name, url };
}
