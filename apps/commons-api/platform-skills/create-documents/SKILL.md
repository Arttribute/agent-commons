---
name: create-documents
description: Create and revise professional Word documents (.docx) with clear structure, appropriate styling, source-aware editing, and output validation. Use for reports, briefs, letters, proposals, DOCX files, or requests to turn uploaded material into an editable document.
---

# Create Documents

Produce the requested editable document and preserve source intent.

## Workflow

1. Read every relevant uploaded source before drafting.
2. Identify audience, purpose, required sections, facts, and any existing hierarchy or tone.
3. Build a document structure that fits the genre. Use headings, short paragraphs, and bullets only where they improve comprehension.
4. When revising a DOCX, pass `sourceFileId` and preserve useful organization instead of presenting the revision as an unrelated file.
5. Call `createDocumentFile` with the exact requested filename and complete content.
6. Read the created document and verify its title, section order, key facts, and ready status.

## Quality rules

- Do not substitute PDF, Markdown, or chat prose for a requested DOCX.
- Avoid generic filler and repeated conclusions.
- Preserve names, dates, figures, citations, and requirements from the source.
- Match formality and density to the audience.
- Report any formatting limitation honestly; never claim visual preservation that was not verified.
