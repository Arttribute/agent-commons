export function parseCustomMarkdown(markdown: string): string {
  // Step 1: Replace bold syntax: **bold**
  let html = markdown.replace(/\*\*(.*?)\*\*/g, (_match, p1) => {
    return `<strong>${p1}</strong>`;
  });

  // Step 2: Replace italics syntax: _italic_
  html = html.replace(/\_(.*?)\_/g, (_match, p1) => {
    return `<em>${p1}</em>`;
  });

  // Step 3: Replace inline links [text](url)
  // If the URL ends with a common image extension, render it as an image.
  // If the URL might be an image (e.g. an IPFS link without an extension),
  // render an <img> that falls back to a link if loading fails.
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, url) => {
    if (/\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(url)) {
      // URL ends with an image extension.
      return `<img src="${url}" alt="${text}" class="my-2 max-w-[250px] rounded shadow" />`;
    } else if (url.includes("/ipfs/")) {
      // The URL might be an image even though it lacks an extension.
      // Use the onerror event: if the image fails to load,
      // replace it with a clickable link.
      return `<img src="${url}" alt="${text}" class="my-2 max-w-[250px] rounded shadow" onerror="this.outerHTML='<a href=\''+this.src+'\' target=\'_blank\' class=\'text-blue-600 underline\'>Image link: '+this.src+'</a>'" />`;
    } else {
      // For all other cases, display a normal hyperlink.
      return `<a href="${url}" target="_blank" class="text-blue-600 underline">${text}</a>`;
    }
  });

  // Step 4: Replace inline images ![alt](url)
  // This explicitly declares an image and is rendered directly.
  html = html.replace(/\!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, url) => {
    return `<img src="${url}" alt="${alt}" class="my-2 max-w-[250px] rounded shadow" />`;
  });

  // Step 5: Split lines to handle lists and paragraphs
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Check for bullet list: "- " or "* "
    if (/^[-*]\s+/.test(trimmed)) {
      if (inNumberList) flushNumberList();
      inBulletList = true;
      bulletItems.push(trimmed.replace(/^[-*]\s+/, ""));
    }
    // Check for numbered list: "1. "
    else if (/^\d+\.\s+/.test(trimmed)) {
      if (inBulletList) flushBulletList();
      inNumberList = true;
      numberedItems.push(trimmed.replace(/^\d+\.\s+/, ""));
    }
    // Empty line: flush lists & add a break
    else if (trimmed === "") {
      flushBulletList();
      flushNumberList();
      finalHtml += "<br />";
    } else {
      if (inBulletList) flushBulletList();
      if (inNumberList) flushNumberList();
      // Treat as a paragraph.
      finalHtml += `<p class='mb-2'>${trimmed}</p>`;
    }
  }

  // Flush any leftover list items.
  if (inBulletList) flushBulletList();
  if (inNumberList) flushNumberList();

  return finalHtml;
}
