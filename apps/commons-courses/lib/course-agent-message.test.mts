import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ts from "typescript";
const require = createRequire(import.meta.url);
const source = readFileSync(
  new URL(
    "../components/course-agents/course-agent-message.tsx",
    import.meta.url,
  ),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    esModuleInterop: true,
  },
}).outputText;
const module = { exports: {} as Record<string, any> };
runInNewContext("(function(require,module,exports){" + compiled + "\n})")(
  (id: string) =>
    id === "react-markdown"
      ? ReactMarkdown
      : id === "remark-gfm"
        ? remarkGfm
        : require(id),
  module,
  module.exports,
);
const render = (content: string) =>
  renderToStaticMarkup(module.exports.CourseAgentMessageContent({ content }));

test("copilot replies render paragraphs, emphasis, lists, code and comparison tables", () => {
  const html = render(
    "**Start here**\n\nUse your own files.\n\n- Open Claude\n- Check access\n\n1. Review\n2. Verify\n\n```txt\nmy prompt\n```\n\n| Step | Check |\n| --- | --- |\n| Setup | Ready |",
  );
  for (const tag of [
    "strong",
    "p",
    "ul",
    "ol",
    "pre",
    "code",
    "table",
    "th",
    "td",
  ])
    assert.match(html, new RegExp("<" + tag + "(?: |>)"));
  assert.doesNotMatch(html, /\*\*Start here\*\*/);
});
test("copilot Markdown cannot execute HTML or unsafe links or load remote images", () => {
  const html = render(
    "<script>alert(1)</script>\n\n[bad](javascript:alert%281%29)\n\n![tracker](https://example.com/tracker.png)\n\n[Source](/api/course-materials/deck/slides/8)",
  );
  assert.doesNotMatch(html, /<script|javascript:|<img|onerror=/);
  assert.match(html, /href="\/api\/course-materials\/deck\/slides\/8"/);
  assert.match(html, /rel="noopener noreferrer"/);
});
