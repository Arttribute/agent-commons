import { Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import sharp from 'sharp';
import { DatabaseService } from '~/modules/database/database.service';
import { FilesService } from '~/files';
import { CanvasService } from './canvas.service';
import type { CanvasContextRequest } from './canvas-context';
import { MediaEditService } from './media-edit.service';
import type { MediaPrincipal } from './media.types';

type Box = { x: number; y: number; width?: number; height?: number };

export type CanvasVisual = { label: string; url: string };

const MAX_EDGE = 1024;

/**
 * Pictures of exactly what attached notes mark, for vision-capable agents:
 * the image or frame with the area outlined, and a close-up when the area is
 * small. Text and element notes are precise enough without a picture.
 */
@Injectable()
export class CanvasVisualsService {
  private readonly logger = new Logger(CanvasVisualsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly files: FilesService,
    private readonly canvas: CanvasService,
    private readonly mediaEdit: MediaEditService,
  ) {}

  async build(
    request: CanvasContextRequest,
    principal: MediaPrincipal,
    limit = 4,
  ): Promise<CanvasVisual[]> {
    if (!request.annotationIds.length) return [];
    const project = await this.canvas.requireProject(request.projectId, principal, 'read');
    const notes = await this.db.query.canvasAnnotation.findMany({
      where: (table) =>
        and(
          eq(table.projectId, project.projectId),
          inArray(table.annotationId, request.annotationIds),
          isNull(table.deletedAt),
        ),
    });
    if (!notes.length) return [];
    const revisions = await this.db.query.canvasRevision.findMany({
      where: (table) => eq(table.projectId, project.projectId),
    });
    const owner = {
      ownerId: principal.principalId,
      workspaceId: principal.workspaceId ?? undefined,
    };
    const originals = new Map<string, Promise<{ buffer: Buffer; mimeType: string } | null>>();
    const original = (itemId: string) => {
      if (!originals.has(itemId)) {
        originals.set(
          itemId,
          this.files
            .loadOriginalForProcessing({ fileId: itemId, ownerId: owner.ownerId, workspaceId: principal.workspaceId })
            .then((file) => ({ buffer: file.buffer, mimeType: file.mimeType }))
            .catch(() => null),
        );
      }
      return originals.get(itemId)!;
    };

    const visuals: CanvasVisual[] = [];
    const ordered = request.annotationIds
      .map((id) => notes.find((note) => note.annotationId === id))
      .filter((note): note is (typeof notes)[number] => Boolean(note));
    for (const note of ordered) {
      if (visuals.length >= limit) break;
      const itemId = revisions.find((revision) => revision.revisionId === note.revisionId)?.itemId ?? project.activeItemId;
      const target = (note.metadata as { target?: Record<string, any> } | null)?.target ?? {};
      const box = boxFor(note.geometry as Box | null, target);
      try {
        const file = await original(itemId);
        if (!file) continue;
        const label = `Note ${note.annotationId}`;
        if (file.mimeType.startsWith('image/')) {
          if (!box) continue;
          visuals.push(...(await this.outlined(file.buffer, box, label)));
        } else if (file.mimeType.startsWith('video/')) {
          const at = typeof target.frameTimeMs === 'number' ? target.frameTimeMs : note.startMs;
          if (typeof at !== 'number') continue;
          if (box) {
            const frame = await this.mediaEdit.frame({ buffer: file.buffer, mimeType: file.mimeType, atMs: at });
            visuals.push(...(await this.outlined(frame, box, `${label}, frame at ${at} ms`)));
          } else if (typeof note.endMs === 'number' && note.endMs > at + 200) {
            const times = [at, Math.round((at + note.endMs) / 2), note.endMs - 40];
            const frames = await Promise.all(
              times.map((atMs) => this.mediaEdit.frame({ buffer: file.buffer, mimeType: file.mimeType, atMs })),
            );
            visuals.push({
              label: `${label}, frames at ${times.join(', ')} ms`,
              url: await strip(frames),
            });
          } else {
            const frame = await this.mediaEdit.frame({ buffer: file.buffer, mimeType: file.mimeType, atMs: at });
            visuals.push({ label: `${label}, frame at ${at} ms`, url: await jpeg(sharp(frame)) });
          }
        } else if (typeof target.page === 'number' && box) {
          const page = await this.pageImage(itemId, target.page, owner);
          if (page) visuals.push(...(await this.outlined(page, box, `${label}, ${target.pageLabel ?? 'page'} ${target.page}`)));
        }
      } catch (error) {
        this.logger.warn(`Note picture skipped: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return visuals.slice(0, limit);
  }

  private async pageImage(itemId: string, page: number, owner: { ownerId: string; workspaceId?: string }) {
    const read = await this.files.readFileForAgent({
      fileId: itemId,
      ...owner,
      pageNumber: page,
      includeImageUrls: true,
      maxChars: 1,
    });
    const url = read.artifacts.find(
      (artifact) =>
        artifact.url && ['pdf_page_image', 'presentation_slide_image'].includes(artifact.kind),
    )?.url;
    if (!url) return null;
    const response = await fetch(url);
    return response.ok ? Buffer.from(await response.arrayBuffer()) : null;
  }

  /** The picture with the area outlined, plus a close-up when it is small. */
  private async outlined(buffer: Buffer, box: Box, label: string): Promise<CanvasVisual[]> {
    const image = sharp(buffer).rotate();
    const meta = await image.metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (!width || !height) return [];
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const w = Math.round(width * scale);
    const h = Math.round(height * scale);
    const isRegion = typeof box.width === 'number' && typeof box.height === 'number';
    const stroke = Math.max(3, Math.round(Math.max(w, h) / 220));
    const shape = isRegion
      ? `<rect x="${box.x * w}" y="${box.y * h}" width="${box.width! * w}" height="${box.height! * h}" fill="none" stroke="#f59e0b" stroke-width="${stroke}"/>`
      : `<circle cx="${box.x * w}" cy="${box.y * h}" r="${stroke * 5}" fill="none" stroke="#f59e0b" stroke-width="${stroke}"/>`;
    const overlay = Buffer.from(`<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${shape}</svg>`);
    const visuals: CanvasVisual[] = [
      {
        label: `${label}: whole view, marked area outlined`,
        url: await jpeg(sharp(buffer).rotate().resize(w, h).composite([{ input: overlay }])),
      },
    ];
    const area = isRegion ? box.width! * box.height! : 0;
    if (isRegion && area < 0.2) {
      const pad = 0.04;
      const left = Math.max(0, Math.floor((box.x - pad) * width));
      const top = Math.max(0, Math.floor((box.y - pad) * height));
      const cropWidth = Math.min(width - left, Math.ceil((box.width! + pad * 2) * width));
      const cropHeight = Math.min(height - top, Math.ceil((box.height! + pad * 2) * height));
      if (cropWidth > 8 && cropHeight > 8) {
        visuals.push({
          label: `${label}: close-up of the marked area`,
          url: await jpeg(
            sharp(buffer)
              .rotate()
              .extract({ left, top, width: cropWidth, height: cropHeight })
              .resize({ width: Math.min(MAX_EDGE, Math.max(cropWidth, 512)), withoutEnlargement: false }),
          ),
        });
      }
    }
    return visuals;
  }
}

function boxFor(geometry: Box | null, target: Record<string, any>): Box | null {
  if (geometry && typeof geometry.x === 'number' && typeof geometry.y === 'number') return geometry;
  const rects = Array.isArray(target.rects) ? target.rects : [];
  if (!rects.length) return null;
  const left = Math.min(...rects.map((rect: Box) => rect.x));
  const top = Math.min(...rects.map((rect: Box) => rect.y));
  const right = Math.max(...rects.map((rect: Box) => rect.x + (rect.width ?? 0)));
  const bottom = Math.max(...rects.map((rect: Box) => rect.y + (rect.height ?? 0)));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

async function jpeg(image: sharp.Sharp) {
  const buffer = await image.jpeg({ quality: 82 }).toBuffer();
  return `data:image/jpeg;base64,${buffer.toString('base64')}`;
}

/** Frames side by side, for a moment in time. */
async function strip(frames: Buffer[]) {
  const height = 360;
  const resized = await Promise.all(
    frames.map((frame) => sharp(frame).resize({ height }).toBuffer({ resolveWithObject: true })),
  );
  const width = resized.reduce((total, frame) => total + frame.info.width, 0) + (resized.length - 1) * 8;
  let left = 0;
  const composite = resized.map((frame) => {
    const placed = { input: frame.data, left, top: 0 };
    left += frame.info.width + 8;
    return placed;
  });
  return jpeg(
    sharp({ create: { width, height, channels: 3, background: '#ffffff' } }).composite(composite),
  );
}
