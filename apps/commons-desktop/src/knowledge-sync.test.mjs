import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { deflateRawSync } from "node:zlib";
import { chunkFile, extractLinks, extractTags, gitInfo, indexFolders, searchChunks, setDocumentExtractor } from "./knowledge.ts";
import { KnowledgeWatcher } from "./knowledge-watcher.ts";
import { extractOfficeOpenXmlText } from "../../../packages/agc-cli/src/office-text.ts";
import { approvalTitle } from "./approval-summary.ts";

function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name);
    const data = deflateRawSync(Buffer.from(text));
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(Buffer.byteLength(text), 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(Buffer.byteLength(text), 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

test("reads Word and PowerPoint text on every platform", () => {
  const docx = zip({
    "word/document.xml": '<w:document><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Market brief</w:t></w:r></w:p><w:p><w:r><w:t xml:space="preserve">Revenue grew &amp; churn fell.</w:t></w:r></w:p></w:body></w:document>',
  });
  assert.equal(extractOfficeOpenXmlText(docx, ".docx"), "# Market brief\nRevenue grew & churn fell.");
  const pptx = zip({
    "ppt/slides/slide2.xml": "<p:sld><a:p><a:r><a:t>Second</a:t></a:r></a:p></p:sld>",
    "ppt/slides/slide1.xml": "<p:sld><a:p><a:r><a:t>First</a:t></a:r></a:p></p:sld>",
  });
  assert.equal(extractOfficeOpenXmlText(pptx, ".pptx"), "## Slide 1\nFirst\n\n## Slide 2\nSecond");
  assert.equal(extractOfficeOpenXmlText(Buffer.from("not a zip"), ".docx"), null);
});

test("search returns cited passages with file and line ranges", async () => {
  const root = mkdtempSync(join(tmpdir(), "commons-cite-"));
  try {
    mkdirSync(join(root, "research"));
    writeFileSync(join(root, "research", "interviews.md"), "# Interviews\n\nIntro line.\n\n## Pricing\nCustomers asked for annual billing and a lower seat price.\n");
    writeFileSync(join(root, "notes.md"), "# Notes\nUnrelated gardening ideas.\n");
    const space = { id: "s1", name: "Project", folders: [root], files: await indexFolders([root]) };
    const [top] = searchChunks([space], "annual billing seat price");
    assert.equal(top.source, "research/interviews.md");
    assert.equal(top.heading, "Pricing");
    assert.ok(top.startLine >= 5 && top.endLine >= top.startLine);
    assert.ok(chunkFile(space, space.files[0]).length >= 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("extracts note links and tags for the knowledge graph", () => {
  const content = "---\ntags: [strategy, launch]\n---\nSee [[Customer Research|research]] and [plan](./plans/q4.md) but not [site](https://example.com). #pricing";
  assert.deepEqual(extractLinks(content), ["Customer Research", "./plans/q4.md"]);
  assert.deepEqual(extractTags(content).sort(), ["launch", "pricing", "strategy"]);
});

test("reindexing reuses unchanged files and extracts documents through the injected reader", async () => {
  const root = mkdtempSync(join(tmpdir(), "commons-incremental-"));
  try {
    const note = join(root, "a.md");
    writeFileSync(note, "first");
    writeFileSync(join(root, "report.pdf"), "%PDF placeholder");
    let extracted = 0;
    setDocumentExtractor(async () => { extracted += 1; return "Quarterly revenue report"; });
    const first = await indexFolders([root]);
    assert.equal(first.find((file) => file.path.endsWith("report.pdf"))?.format, "pdf");
    assert.equal(extracted, 1);
    const second = await indexFolders([root], first);
    assert.equal(extracted, 1, "unchanged PDF is not extracted again");
    assert.equal(second.find((file) => file.path === note), first.find((file) => file.path === note));
    writeFileSync(note, "second version");
    const later = new Date(Date.now() + 5_000);
    utimesSync(note, later, later);
    const third = await indexFolders([root], second);
    assert.equal(third.find((file) => file.path === note)?.excerpt, "second version");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("detects the git branch and commit of a linked folder", () => {
  const root = mkdtempSync(join(tmpdir(), "commons-git-"));
  try {
    mkdirSync(join(root, ".git", "refs", "heads"), { recursive: true });
    writeFileSync(join(root, ".git", "HEAD"), "ref: refs/heads/main\n");
    writeFileSync(join(root, ".git", "refs", "heads", "main"), "0123456789abcdef0123456789abcdef01234567\n");
    mkdirSync(join(root, "docs"));
    assert.deepEqual(gitInfo(join(root, "docs")), { root, branch: "main", commit: "0123456789ab" });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("watcher reports edits made outside Commons once per burst", async () => {
  const root = mkdtempSync(join(tmpdir(), "commons-watch-"));
  const changes = [];
  const watcher = new KnowledgeWatcher((id) => changes.push(id), 150, 60_000);
  try {
    watcher.sync([{ id: "space", folders: [root] }]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    writeFileSync(join(root, "one.md"), "1");
    writeFileSync(join(root, "two.md"), "2");
    writeFileSync(join(root, "ignored.bin"), "x");
    await new Promise((resolve) => setTimeout(resolve, 700));
    assert.deepEqual(changes, ["space"]);
  } finally {
    watcher.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("approval titles fit on one line", () => {
  assert.equal(approvalTitle("Agent wants to run: \x1b[1mnpm install\x1b[0m\n  in: /tmp", "run_command"), "Run npm install");
  assert.equal(approvalTitle("Agent wants to write file: /tmp/a.md (12 chars)\n+ hello", "write_file"), "Write /tmp/a.md");
});
