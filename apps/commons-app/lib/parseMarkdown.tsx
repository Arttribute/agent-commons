// lib/parseMarkdown.ts

export function parseCustomMarkdown(markdown: string): string {
  // Step 1: Convert any special characters into HTML entities if desired.
  // (Omitted for brevity; you might do it for security.)

  // Step 2: Replace bold (naive)
  let html = markdown.replace(/\*\*(.*?)\*\*/g, (_match, p1) => {
    return `<strong>${p1}</strong>`;
  });

  // Step 3: Replace italics (naive)
  html = html.replace(/\_(.*?)\_/g, (_match, p1) => {
    return `<em>${p1}</em>`;
  });

  // Step 4: Replace links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, url) => {
    return `<a href="${url}" target="_blank" class="text-blue-600 underline">${text}</a>`;
  });

  // Step 5: Handle bullet & numbered lists:
  //   We'll split on line breaks and look for lines that match
  //   bullet or number patterns, then wrap them in <li>.
  const lines = html.split(/\r?\n/);
  const bulletItems: string[] = [];
  const numberedItems: string[] = [];
  let finalHtml = "";
  let inBulletList = false;
  let inNumberList = false;

  const flushBulletList = () => {
    if (bulletItems.length > 0) {
      finalHtml += "<ul class='list-disc list-inside mb-2'>";
      bulletItems.forEach((item) => {
        finalHtml += `<li>${item}</li>`;
      });
      finalHtml += "</ul>";
      bulletItems.length = 0;
    }
    inBulletList = false;
  };

  const flushNumberList = () => {
    if (numberedItems.length > 0) {
      finalHtml += "<ol class='list-decimal list-inside mb-2'>";
      numberedItems.forEach((item) => {
        finalHtml += `<li>${item}</li>`;
      });
      finalHtml += "</ol>";
      numberedItems.length = 0;
    }
    inNumberList = false;
  };

  lines.forEach((line) => {
    const trimmed = line.trim();

    // bullet line if starts with "-" or "*"
    if (/^[-*]\s+/.test(trimmed)) {
      // if we are in a numbered list, end it
      if (inNumberList) flushNumberList();
      inBulletList = true;
      bulletItems.push(trimmed.replace(/^[-*]\s+/, ""));
    }
    // numbered line if starts with "digit. "
    else if (/^\d+\.\s+/.test(trimmed)) {
      // if we are in a bullet list, end it
      if (inBulletList) flushBulletList();
      inNumberList = true;
      numberedItems.push(trimmed.replace(/^\d+\.\s+/, ""));
    }
    // empty line => flush lists & add a <br> or <p>
    else if (trimmed === "") {
      flushBulletList();
      flushNumberList();
      // We can just add a line break or a paragraph separation
      finalHtml += "<br />";
    }
    // normal text
    else {
      // flush any existing lists
      if (inBulletList) flushBulletList();
      if (inNumberList) flushNumberList();
      // just add as paragraph
      finalHtml += `<p class='mb-2'>${trimmed}</p>`;
    }
  });

  // flush any leftover items
  if (inBulletList) flushBulletList();
  if (inNumberList) flushNumberList();

  return finalHtml;
}
