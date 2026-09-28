/**
 * office-text.ts
 *
 * Dependency-free text extraction for Office Open XML documents (.docx, .pptx,
 * .xlsx). These formats are zip archives of XML parts, so a small central
 * directory reader plus Node's built-in raw inflate is enough to read them on
 * every platform. macOS `textutil` remains a fallback for legacy formats.
 */

import { inflateRawSync } from 'zlib';

type ZipEntry = { name: string; method: number; compressedSize: number; offset: number };

const MAX_ENTRY_BYTES = 40_000_000;

function readEntries(buffer: Buffer): ZipEntry[] {
  // The end-of-central-directory record sits within the last 64 KB + 22 bytes.
  const floor = Math.max(0, buffer.length - 65_557);
  let end = -1;
  for (let index = buffer.length - 22; index >= floor; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      end = index;
      break;
    }
  }
  if (end < 0) throw new Error('Not a zip archive');
  const count = buffer.readUInt16LE(end + 10);
  let cursor = buffer.readUInt32LE(end + 16);
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count && cursor + 46 <= buffer.length; index += 1) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) break;
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const offset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    entries.push({ name, method, compressedSize, offset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readEntry(buffer: Buffer, entry: ZipEntry): string {
  if (buffer.readUInt32LE(entry.offset) !== 0x04034b50) throw new Error('Corrupt zip entry');
  const nameLength = buffer.readUInt16LE(entry.offset + 26);
  const extraLength = buffer.readUInt16LE(entry.offset + 28);
  const start = entry.offset + 30 + nameLength + extraLength;
  const data = buffer.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return data.toString('utf8');
  if (entry.method === 8) {
    return inflateRawSync(data, { maxOutputLength: MAX_ENTRY_BYTES }).toString('utf8');
  }
  throw new Error(`Unsupported zip compression method ${entry.method}`);
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&');
}

/** Word paragraphs become lines; heading styles become Markdown headings. */
function docxText(xml: string) {
  const paragraphs = xml.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) ?? [];
  const lines = paragraphs.map((paragraph) => {
    const style = /<w:pStyle w:val="([^"]+)"/.exec(paragraph)?.[1] ?? '';
    const heading = /^(?:Heading|heading)\s?(\d)$/.exec(style)?.[1] ?? (style === 'Title' ? '1' : '');
    const listItem = /<w:numPr>/.test(paragraph);
    const text = paragraph
      .replace(/<w:tab\/>/g, '\t')
      .replace(/<w:(?:br|cr)\/>/g, '\n')
      .match(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>|\t|\n/g)
      ?.map((part) => (part === '\t' || part === '\n' ? part : decodeXml(part.replace(/<[^>]+>/g, ''))))
      .join('') ?? '';
    if (!text.trim()) return '';
    if (heading) return `${'#'.repeat(Math.min(6, Number(heading)))} ${text.trim()}`;
    return listItem ? `- ${text.trim()}` : text;
  });
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function drawingText(xml: string) {
  const paragraphs = xml.match(/<a:p[\s>][\s\S]*?<\/a:p>/g) ?? [];
  return paragraphs
    .map((paragraph) =>
      (paragraph.match(/<a:t>[\s\S]*?<\/a:t>/g) ?? [])
        .map((part) => decodeXml(part.replace(/<[^>]+>/g, '')))
        .join(''),
    )
    .filter((line) => line.trim())
    .join('\n');
}

function slideNumber(name: string) {
  return Number(/(\d+)\.xml$/.exec(name)?.[1] ?? 0);
}

/**
 * Extracts readable text from an Office Open XML file. Returns null when the
 * file is not a supported archive so callers can try another extractor.
 */
export function extractOfficeOpenXmlText(buffer: Buffer, extension: string): string | null {
  let entries: ZipEntry[];
  try {
    entries = readEntries(buffer);
  } catch {
    return null;
  }
  const find = (name: string) => entries.find((entry) => entry.name === name);
  try {
    if (extension === '.docx') {
      const document = find('word/document.xml');
      return document ? docxText(readEntry(buffer, document)) : null;
    }
    if (extension === '.pptx') {
      const slides = entries
        .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/.test(entry.name))
        .sort((left, right) => slideNumber(left.name) - slideNumber(right.name));
      if (!slides.length) return null;
      return slides
        .map((slide) => `## Slide ${slideNumber(slide.name)}\n${drawingText(readEntry(buffer, slide))}`)
        .join('\n\n')
        .trim();
    }
    if (extension === '.xlsx') {
      const shared = find('xl/sharedStrings.xml');
      const strings = shared
        ? (readEntry(buffer, shared).match(/<si>[\s\S]*?<\/si>/g) ?? []).map((item) =>
            (item.match(/<t(?:\s[^>]*)?>[\s\S]*?<\/t>/g) ?? [])
              .map((part) => decodeXml(part.replace(/<[^>]+>/g, '')))
              .join(''),
          )
        : [];
      const sheets = entries
        .filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry.name))
        .sort((left, right) => slideNumber(left.name) - slideNumber(right.name));
      if (!sheets.length) return null;
      return sheets
        .map((sheet) => {
          const rows = (readEntry(buffer, sheet).match(/<row[\s\S]*?<\/row>/g) ?? []).slice(0, 2_000).map((row) =>
            (row.match(/<c[\s\S]*?<\/c>|<c[^>]*\/>/g) ?? [])
              .map((cell) => {
                const value = /<v>([\s\S]*?)<\/v>/.exec(cell)?.[1]
                  ?? /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/.exec(cell)?.[1]
                  ?? '';
                return /\bt="s"/.test(cell) ? strings[Number(value)] ?? '' : decodeXml(value);
              })
              .join('\t'),
          );
          return `## Sheet ${slideNumber(sheet.name)}\n${rows.join('\n')}`;
        })
        .join('\n\n')
        .trim();
    }
  } catch {
    return null;
  }
  return null;
}
