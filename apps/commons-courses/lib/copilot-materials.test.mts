import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import { extractMaterial, guessMimeType } from "./copilot-materials.ts";

test("extractMaterial reads DOCX paragraphs and table cells", async () => {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<w:document><w:body><w:p><w:r><w:t>Harness canvas</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Trigger</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>New request</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>`,
  );
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const file = new File([bytes], "workbook.docx", {
    type: guessMimeType("workbook.docx"),
  });

  const result = await extractMaterial(file);

  assert.match(result.text, /Harness canvas/);
  assert.match(result.text, /Trigger/);
  assert.match(result.text, /New request/);
});

test("extractMaterial reads PPTX slides in numeric order", async () => {
  const zip = new JSZip();
  zip.file("ppt/slides/slide10.xml", `<p:sld><a:p><a:r><a:t>Ten</a:t></a:r></a:p></p:sld>`);
  zip.file("ppt/slides/slide2.xml", `<p:sld><a:p><a:r><a:t>Two &amp; safe</a:t></a:r></a:p></p:sld>`);
  zip.file("ppt/slides/slide1.xml", `<p:sld><a:p><a:r><a:t>One</a:t></a:r></a:p></p:sld>`);
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const file = new File([bytes], "slides.pptx", {
    type: guessMimeType("slides.pptx"),
  });

  const result = await extractMaterial(file);

  assert.equal(
    result.text,
    "--- Slide 1 ---\nOne\n\n--- Slide 2 ---\nTwo & safe\n\n--- Slide 3 ---\nTen",
  );
});
