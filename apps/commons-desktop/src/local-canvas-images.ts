import { randomUUID } from 'node:crypto';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { CanvasAnnotation, LocalLibraryItem } from '@agent-commons/desktop-contract';
import type { PythonRuntime } from './python-runtime';

/** Trusted preview conversion. Source files and Library records are never edited. */
export async function renderCanvasImages(python: PythonRuntime, cache: string, items: LocalLibraryItem[], notes: CanvasAnnotation[]) {
  const directory = join(cache, randomUUID());
  const inputs = Object.fromEntries(items.map((item) => [item.id, item.path]));
  const selections = items.map((item) => ({ itemId: item.id, notes: notes.filter((note) => note.geometry && note.revisionId).map((note) => ({ annotationId: note.annotationId, geometry: note.geometry })) }));
  // Match a note's exact source item, including notes attached from older versions.
  // The runtime captured the referenced items; the annotation's binding is added below.
  for (const selection of selections) selection.notes = selection.notes.filter((note) => {
    const bound = notes.find((entry) => entry.annotationId === note.annotationId)?.metadata?.canvasItemId;
    return bound === selection.itemId;
  });
  const data = JSON.stringify(selections);
  try {
    const result = await python.run(`import json\nfrom PIL import Image, ImageDraw\nImage.MAX_IMAGE_PIXELS = 40000000\nselections = json.loads(${JSON.stringify(data)})\nmanifest = []\nfor selection in selections:\n    image = Image.open(INPUT_FILES[selection['itemId']]).convert('RGB')\n    width, height = image.size\n    marked = image.copy()\n    labels = []\n    crops = []\n    for note in selection['notes'][:2]:\n        g = note['geometry']\n        if not isinstance(g.get('x'), (int, float)) or not isinstance(g.get('y'), (int, float)):\n            continue\n        x, y = g['x'], g['y']\n        w, h = g.get('width'), g.get('height')\n        if isinstance(w, (int, float)) and isinstance(h, (int, float)) and w > 0 and h > 0:\n            box = (max(0, min(width-1, round(x*width))), max(0, min(height-1, round(y*height))), min(width, round((x+w)*width)), min(height, round((y+h)*height)))\n        else:\n            box = (max(0, round((x-.05)*width)), max(0, round((y-.05)*height)), min(width, round((x+.05)*width)), min(height, round((y+.05)*height)))\n        if box[2] <= box[0] or box[3] <= box[1]:\n            continue\n        ImageDraw.Draw(marked).rectangle(box, outline=(255,100,0), width=max(2, round(max(width,height)/200)))\n        crop = image.crop(box)\n        crop.thumbnail((768,768))\n        crops.append((note['annotationId'], crop))\n        labels.append(note['annotationId'])\n    marked.thumbnail((1024,1024))\n    filename = str(len(manifest)) + '.png'\n    marked.save(OUTPUT_DIR / filename)\n    manifest.append({'file': filename, 'label': 'Library fileId ' + selection['itemId'] + ', whole image' + (', orange outlines mark notes ' + ', '.join(labels) if labels else '')})\n    for note_id, crop in crops:\n        if len(manifest) >= 4:\n            break\n        filename = str(len(manifest)) + '.png'\n        crop.save(OUTPUT_DIR / filename)\n        manifest.append({'file': filename, 'label': 'Exact selected region for note ' + note_id + ', Library fileId ' + selection['itemId']})\n    if len(manifest) >= 4:\n        break\n(OUTPUT_DIR / 'manifest.json').write_text(json.dumps(manifest))\n`, directory, inputs, undefined, 30);
    if (result.exitCode) throw new Error(`Canvas image preview failed: ${result.stderr.slice(-300)}`);
    const manifest = JSON.parse(readFileSync(join(directory, 'outputs', 'manifest.json'), 'utf8')) as Array<{ file: string; label: string }>;
    return { images: manifest.map((entry) => readFileSync(join(directory, 'outputs', entry.file)).toString('base64')), note: `Canvas images supplied in this exact order:\n${manifest.map((entry, index) => `${index + 1}. ${entry.label}`).join('\n')}\nThe pictures are already supplied to your vision input. Use them directly for visual descriptions; Python is only needed for requested computation or editing. Use the note's selected-region picture to interpret its location. Never substitute another side or version.` };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
