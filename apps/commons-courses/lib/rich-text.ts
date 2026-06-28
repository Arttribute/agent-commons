const allowedTags = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "em",
  "h2",
  "h3",
  "h4",
  "i",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
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

export function markdownToRichTextHtml(value?: string | null) {
  if (!value) return "";
  const lines = value.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let list: "ul" | "ol" | null = null;

  const closeList = () => {
    if (!list) return;
    html.push(`</${list}>`);
    list = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }

    const heading = /^(#{2,4})\s+(.+)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      continue;
    }

    const unordered = /^[-*]\s+(.+)$/.exec(line);
    if (unordered) {
      if (list !== "ul") {
        closeList();
        html.push("<ul>");
        list = "ul";
      }
      html.push(`<li>${inlineMarkdown(unordered[1])}</li>`);
      continue;
    }

    const ordered = /^\d+[.)]\s+(.+)$/.exec(line);
    if (ordered) {
      if (list !== "ol") {
        closeList();
        html.push("<ol>");
        list = "ol";
      }
      html.push(`<li>${inlineMarkdown(ordered[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${inlineMarkdown(line)}</p>`);
  }

  closeList();
  return sanitizeRichTextHtml(html.join(""));
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

function inlineMarkdown(value: string) {
  const escaped = escapeHtml(value);
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/_([^_]+)_/g, "<em>$1</em>");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
