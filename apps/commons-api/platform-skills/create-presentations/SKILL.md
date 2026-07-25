---
name: create-presentations
description: Create, revise, and quality-check PowerPoint presentations (.pptx) with coherent storytelling, supplied images, matching visual design, speaker notes, and requested-format fidelity. Use for slide decks, presentations, PowerPoint files, PPTX edits, or turning uploaded visual assets and source documents into slides.
---

# Create Presentations

Produce the requested `.pptx`; do not substitute a PDF, document, or prose answer.

## Workflow

1. Inventory every supplied file by name and fileId. Read source documents and existing decks. Inspect every supplied image, its aspect ratio, visible text, palette, and likely sequence.
2. Decide the story before authoring. Give each slide one job and order slides so they teach or persuade rather than merely repeat filenames.
3. Preserve complete designed slides. When an uploaded image is already a finished 16:9 slide, use `full-bleed-image` with its `imageFileId`; do not crop, restyle, or cover it.
4. Add meaningful content in the source visual language. For a group of finished lesson slides, normally add a concise overview and key-takeaways slide plus useful speaker notes. Sample the visible palette and typography instead of applying an unrelated default theme.
5. Call `createPresentationFile` with the exact output filename, ordered slides, image fileIds, layouts, theme, and notes.
6. Check the returned quality report. Confirm PPTX MIME type, ready status, slide count, notes, and that every intended imageFileId was embedded. Read the created file to verify slide text and notes.
7. Retry a corrected PPTX call when validation or generation fails. Never silently switch formats. Report a blocker only after a changed retry still cannot produce the requested file.

## Composition rules

- Prefer a 16:9 deck unless the source presentation establishes another size.
- Keep text slides scannable: short title, one clear message, restrained supporting copy.
- Use `image-left` or `image-right` for a real image-and-text composition. Use `full-bleed-image` for complete slide artwork.
- Avoid repetitive title-and-bullet slides. Use section, comparison, overview, recap, and visual slides intentionally.
- Add speaker notes that explain the teaching or speaking point without duplicating the slide verbatim.
- Preserve source order when it is obvious; otherwise infer and state a coherent order from the content.
- Mention baked-in source-image typos or defects rather than pretending they were corrected.

## Completion gate

Do not say the presentation is done unless:

- the artifact is a `.pptx`;
- all requested source assets are present or explicitly accounted for;
- the deck has a coherent sequence and useful text content;
- image treatment preserves aspect ratio;
- the file is valid, non-empty, and returned with ready status;
- the result was inspected through its extracted slide text, notes, and quality report.
