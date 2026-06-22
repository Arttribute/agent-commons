const allowedTags = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "em",
  "h2",
  "h3",
  "h4",
  "i",
  "li",
  "mark",
  "ol",
  "p",
  "strong",
  "u",
  "ul",
]);

const allowedAttributes: Record<string, Set<string>> = {
  a: new Set(["href", "target", "rel"]),
};

export function isRichText(value?: string | null) {
  return Boolean(value && /<\/?[a-z][\s\S]*>/i.test(value));
}

export function sanitizeRichTextHtml(value?: string | null) {
  if (!value) return "";

  return value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/<div(\s[^>]*)?>/gi, "<p>")
    .replace(/<\/div>/gi, "</p>")
    .replace(/<\/?([a-z][a-z0-9]*)([^>]*)>/gi, (match, rawTag, rawAttrs) => {
      const tag = String(rawTag).toLowerCase();
      const closing = match.startsWith("</");

      if (!allowedTags.has(tag)) return "";
      if (closing) return `</${tag}>`;
      if (tag === "br") return "<br>";

      const attrs = sanitizeAttributes(tag, String(rawAttrs || ""));
      return `<${tag}${attrs}>`;
    })
    .trim();
}

export function stripRichTextHtml(value?: string | null) {
  if (!value) return "";
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|h2|h3|h4|li|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeAttributes(tag: string, rawAttrs: string) {
  const allowed = allowedAttributes[tag];
  if (!allowed) return "";

  const attrs: string[] = [];
  rawAttrs.replace(
    /\s+([a-zA-Z:-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g,
    (_match, rawName, doubleQuoted, singleQuoted, unquoted) => {
      const name = String(rawName).toLowerCase();
      const value = String(doubleQuoted || singleQuoted || unquoted || "");
      if (!allowed.has(name)) return "";
      if (name === "href" && !isSafeHref(value)) return "";
      attrs.push(` ${name}="${escapeAttribute(value)}"`);
      return "";
    }
  );

  if (tag === "a") {
    if (!attrs.some((attr) => attr.startsWith(" target="))) {
      attrs.push(' target="_blank"');
    }
    if (!attrs.some((attr) => attr.startsWith(" rel="))) {
      attrs.push(' rel="noreferrer"');
    }
  }

  return attrs.join("");
}

function isSafeHref(value: string) {
  return /^(https?:|mailto:|\/)/i.test(value.trim());
}

function escapeAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
