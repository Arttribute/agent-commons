---
name: edit-pdfs
description: Read, create, and meaningfully revise PDF artifacts while preserving original fonts, styling, spacing, page geometry, and visual hierarchy. Use for PDF editing, rewriting an uploaded PDF, creating a PDF deliverable, or validating PDF previews.
---

# Edit PDFs

Treat an uploaded PDF as a designed source artifact, not plain text to re-typeset.

## Revising an existing PDF

1. Read the source with `readUploadedFile` and inspect rendered pages when visuals matter.
2. Copy exact same-style passages from extracted text.
3. Call `createPdfFile` with `sourceFileId` and `replacements`; do not use `sections` for a revision.
4. Keep replacement copy concise enough for the original region.
5. Split edits that cross styles. Rephrase when a subset font lacks a glyph. Never rebuild the whole PDF with generic fonts unless the user explicitly asks for a redesign.
6. Verify ready status, PDF MIME type, revised extracted text, and page preview.

## Creating a new PDF

Use `sections` only for a new document. Organize content deliberately and confirm that PDF—not another format—is what the user requested.

## Completion gate

Do not claim success when the sidebar preview is incomplete, typography changed unexpectedly, the requested text is absent, or the output format is not PDF. Retry with corrected exact passages or report the precise constraint.
