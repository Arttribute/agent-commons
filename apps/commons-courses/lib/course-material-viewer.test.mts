import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { presentationSlides } from "./presentation-content.ts";

const require = createRequire(import.meta.url);

function renderMaterial(overrides: Record<string, unknown> = {}) {
  const material = {
    id: "deck", name: "Leadership slides", kind: "pdf",
    mimeType: "application/pdf", content: "Slide text",
    imageUrls: ["/api/course-materials/deck/slides/0", "/api/course-materials/deck/slides/1"],
    downloadUrl: "/api/course-materials/deck/download", embeddable: false,
    ...overrides,
  };
  let state = 0;
  const react = {
    useState: (initial: unknown) => [state++ === 0 ? material : initial, () => {}],
    useEffect: () => {},
    useMemo: (fn: () => unknown) => fn(),
    useCallback: (fn: unknown) => fn,
    useRef: (value: unknown) => ({ current: value }),
  };
  const source = readFileSync(new URL("../components/course-material-viewer.tsx", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} as Record<string, any> };
  runInNewContext("(function(require,module,exports){" + compiled + "\n})")(
    (id: string) => {
      if (id === "react") return react;
      if (id === "lucide-react") return new Proxy({}, { get: () => () => null });
      if (id === "@/lib/utils") return { cn: (...classes: unknown[]) => classes.filter(Boolean).join(" ") };
      if (id === "@/lib/presentation-progress") return { presentationProgressStorageKey: () => "deck" };
      if (id === "@/lib/presentation-content") return { presentationSlides };
      return require(id);
    }, module, module.exports,
  );
  return renderToStaticMarkup(module.exports.CourseMaterialViewer({ materialId: "deck" }));
}

test("PDF slide decks render images and navigation without loading the attachment URL", () => {
  const html = renderMaterial();
  assert.match(html, /<img[^>]+src="\/api\/course-materials\/deck\/slides\/0"/);
  assert.doesNotMatch(html, /<iframe/);
  assert.match(html, /Previous/);
  assert.match(html, /Next/);
  assert.match(html, /1 \/ 2/);
  assert.match(html, /<a href="\/api\/course-materials\/deck\/download"/);
});

test("non-embeddable PDFs never load an attachment in a frame, even without slide images", () => {
  const html = renderMaterial({ imageUrls: [] });
  assert.doesNotMatch(html, /<iframe/);
  assert.match(html, /<a href="\/api\/course-materials\/deck\/download"/);
});

test("PowerPoint decks retain rendered slides and presentation controls", () => {
  const html = renderMaterial({ kind: "presentation" });
  assert.match(html, /<img/);
  assert.doesNotMatch(html, /<iframe/);
  assert.match(html, /Presenter window/);
});

test("embeddable PDFs without rendered slides retain inline viewing", () => {
  assert.match(renderMaterial({ imageUrls: [], embeddable: true }), /<iframe/);
});
