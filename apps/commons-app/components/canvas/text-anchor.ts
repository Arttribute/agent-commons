/**
 * Text anchoring for highlights: a selection is stored as the quoted text
 * plus a little context on either side (like a W3C TextQuoteSelector), and
 * re-found in the rendered text later. Highlights are painted with the CSS
 * Custom Highlight API so the document DOM is never rewritten.
 */

const CONTEXT_CHARS = 48;

type TextIndex = {
  text: string;
  nodes: Array<{ node: Text; start: number }>;
};

function indexText(root: Node): TextIndex {
  const nodes: TextIndex["nodes"] = [];
  let text = "";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (parent?.closest("[data-anchor-ignore]")) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    nodes.push({ node: node as Text, start: text.length });
    text += (node as Text).data;
  }
  return { text, nodes };
}

function offsetOf(index: TextIndex, container: Node, offset: number) {
  if (container.nodeType === Node.TEXT_NODE) {
    const entry = index.nodes.find((item) => item.node === container);
    return entry ? entry.start + offset : null;
  }
  // Element boundary: count the text before the child at `offset`.
  const child = container.childNodes[offset];
  if (!child) {
    const last = [...index.nodes].reverse().find((item) => container.contains(item.node));
    return last ? last.start + last.node.data.length : null;
  }
  const first = index.nodes.find(
    (item) => child === item.node || child.contains(item.node) ||
      (child.compareDocumentPosition(item.node) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0,
  );
  return first ? first.start : null;
}

function rangeAt(index: TextIndex, start: number, end: number) {
  const locate = (position: number, preferEnd: boolean) => {
    for (let i = 0; i < index.nodes.length; i += 1) {
      const { node, start: nodeStart } = index.nodes[i];
      const nodeEnd = nodeStart + node.data.length;
      if (position < nodeEnd || (preferEnd && position === nodeEnd)) {
        return { node, offset: Math.max(0, position - nodeStart) };
      }
    }
    const last = index.nodes.at(-1);
    return last ? { node: last.node, offset: last.node.data.length } : null;
  };
  const from = locate(start, false);
  const to = locate(end, true);
  if (!from || !to) return null;
  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  return range;
}

export type TextQuote = {
  quote: string;
  prefix: string;
  suffix: string;
  start: number;
  end: number;
};

/** Describe a DOM range inside `root` as a re-findable quote. */
export function quoteForRange(root: Node, range: Range): TextQuote | null {
  if (!root.contains(range.commonAncestorContainer)) return null;
  const index = indexText(root);
  const start = offsetOf(index, range.startContainer, range.startOffset);
  const end = offsetOf(index, range.endContainer, range.endOffset);
  if (start === null || end === null || end <= start) return null;
  const quote = index.text.slice(start, end);
  if (!quote.trim()) return null;
  return {
    quote,
    prefix: index.text.slice(Math.max(0, start - CONTEXT_CHARS), start),
    suffix: index.text.slice(end, end + CONTEXT_CHARS),
    start,
    end,
  };
}

/** Find a stored quote again. Prefers the original offset, then context. */
export function rangeForQuote(
  root: Node,
  target: { quote: string; prefix?: string; suffix?: string; start?: number },
) {
  if (!target.quote) return null;
  const index = indexText(root);
  const matches: number[] = [];
  for (
    let position = index.text.indexOf(target.quote);
    position !== -1 && matches.length < 200;
    position = index.text.indexOf(target.quote, position + 1)
  ) {
    matches.push(position);
  }
  if (!matches.length) return null;
  const score = (position: number) => {
    let value = 0;
    const before = index.text.slice(Math.max(0, position - CONTEXT_CHARS), position);
    const after = index.text.slice(
      position + target.quote.length,
      position + target.quote.length + CONTEXT_CHARS,
    );
    if (target.prefix) value += commonSuffix(before, target.prefix);
    if (target.suffix) value += commonPrefix(after, target.suffix);
    if (typeof target.start === "number") value -= Math.min(40, Math.abs(position - target.start) / 50);
    return value;
  };
  const best = matches.reduce((winner, position) =>
    score(position) > score(winner) ? position : winner,
  );
  return rangeAt(index, best, best + target.quote.length);
}

function commonPrefix(left: string, right: string) {
  let count = 0;
  while (count < left.length && count < right.length && left[count] === right[count]) count += 1;
  return count;
}

function commonSuffix(left: string, right: string) {
  let count = 0;
  while (
    count < left.length &&
    count < right.length &&
    left[left.length - 1 - count] === right[right.length - 1 - count]
  ) {
    count += 1;
  }
  return count;
}

/** Normalized rectangles of a range relative to an element (e.g. a page). */
export function rangeRects(range: Range, frame: Element) {
  const box = frame.getBoundingClientRect();
  if (!box.width || !box.height) return [];
  return [...range.getClientRects()]
    .filter((rect) => rect.width > 0.5 && rect.height > 0.5)
    .map((rect) => ({
      x: (rect.left - box.left) / box.width,
      y: (rect.top - box.top) / box.height,
      width: rect.width / box.width,
      height: rect.height / box.height,
    }));
}

export function boundingRect(
  rects: Array<{ x: number; y: number; width: number; height: number }>,
) {
  if (!rects.length) return undefined;
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  return {
    x: clamp(left),
    y: clamp(top),
    width: clamp(right) - clamp(left),
    height: clamp(bottom) - clamp(top),
  };
}

type HighlightRegistry = {
  set: (name: string, highlight: unknown) => void;
  delete: (name: string) => void;
};

function registry(): HighlightRegistry | null {
  const css = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS;
  const Highlight = (globalThis as { Highlight?: unknown }).Highlight;
  return css?.highlights && Highlight ? css.highlights : null;
}

/** Paint ranges under a named highlight. A no-op where unsupported. */
export function paintHighlight(name: string, ranges: Range[]) {
  const highlights = registry();
  if (!highlights) return;
  if (!ranges.length) {
    highlights.delete(name);
    return;
  }
  const Highlight = (globalThis as unknown as { Highlight: new (...ranges: Range[]) => unknown }).Highlight;
  highlights.set(name, new Highlight(...ranges));
}

export function clearHighlight(name: string) {
  registry()?.delete(name);
}

/** Line numbers (1-based) covered by [start, end) in `text`. */
export function linesFor(text: string, start: number, end: number) {
  const before = text.slice(0, start);
  const lineStart = before.split("\n").length;
  const lineEnd = lineStart + text.slice(start, Math.max(start, end - 1)).split("\n").length - 1;
  return { lineStart, lineEnd };
}
