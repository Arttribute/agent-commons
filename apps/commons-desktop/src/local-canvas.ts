import { randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import type { CanvasAnnotation, CanvasProjectBundle, LocalState } from '@agent-commons/desktop-contract';
import { formatCanvasContext, normalizeCreativeDefaults, type CanvasContextRequest } from '@agent-commons/agent-core';
import { libraryKind } from './local-library-api';

/** Uses the same app-owned, atomic state persistence as chats and Library items. */
export class LocalCanvasRepository {
  constructor(private readonly state: () => LocalState, private readonly update: (mutator: (state: LocalState) => void) => unknown) {}

  private artifact(state: LocalState, itemId: string) {
    const item = state.library?.find((entry) => entry.id === itemId);
    if (!item) throw new Error('Local Library artifact not found');
    return { itemId, name: item.name, kind: libraryKind(item), mimeType: item.mimeType, sizeBytes: existsSync(item.path) ? statSync(item.path).size : 0,
      source: item.source, status: existsSync(item.path) ? 'ready' : 'missing', createdAt: item.createdAt };
  }

  open(itemId: string): CanvasProjectBundle {
    const state = this.state();
    const existing = state.canvases?.find((entry) => entry.revisions.some((revision) => revision.itemId === itemId));
    if (existing) return this.get(existing.project.projectId);
    const artifact = this.artifact(state, itemId);
    const timestamp = new Date().toISOString();
    const projectId = randomUUID();
    const bundle: CanvasProjectBundle = {
      project: { projectId, ownerUserId: 'local-user', name: artifact.name, rootItemId: itemId, activeItemId: itemId, settings: {}, createdAt: timestamp, updatedAt: timestamp },
      revisions: [{ revisionId: randomUUID(), projectId, itemId, operation: 'import', createdByType: 'human', createdAt: timestamp }],
      annotations: [], jobs: [], assets: [],
    };
    this.update((draft) => (draft.canvases ??= []).push(bundle));
    return this.get(projectId);
  }

  get(projectId: string): CanvasProjectBundle {
    const state = this.state();
    const bundle = state.canvases?.find((entry) => entry.project.projectId === projectId);
    if (!bundle) throw new Error('Local Canvas project not found');
    return structuredClone({ ...bundle, revisions: bundle.revisions.map((revision) => ({ ...revision, artifact: this.artifact(state, revision.itemId) })) });
  }

  private mutate(projectId: string, operation: (bundle: CanvasProjectBundle, state: LocalState) => void) {
    this.get(projectId);
    this.update((state) => {
      const bundle = state.canvases!.find((entry) => entry.project.projectId === projectId)!;
      operation(bundle, state);
      bundle.project.updatedAt = new Date().toISOString();
    });
  }

  patch(projectId: string, body: Record<string, unknown>) {
    this.mutate(projectId, (bundle) => {
      if (body.activeRevisionId !== undefined) {
        const revision = bundle.revisions.find((entry) => entry.revisionId === body.activeRevisionId);
        if (!revision) throw new Error('Revision does not belong to this canvas');
        bundle.project.activeItemId = revision.itemId;
      }
      if (typeof body.name === 'string') bundle.project.name = body.name.trim().slice(0, 180);
      if (body.settings !== undefined) bundle.project.settings = { ...bundle.project.settings, ...object(body.settings, 32_000) };
    });
    return this.get(projectId).project;
  }

  createNote(projectId: string, body: Record<string, unknown>): CanvasAnnotation {
    const bundle = this.get(projectId);
    if (!bundle.revisions.some((entry) => entry.revisionId === body.revisionId)) throw new Error('Revision does not belong to this canvas');
    if (!['comment', 'point', 'region', 'time_range', 'transcript', 'freehand'].includes(String(body.kind))) throw new Error('Unsupported annotation kind');
    const text = typeof body.body === 'string' ? body.body.trim() : '';
    if (!text || text.length > 8000) throw new Error('Note text must contain 1–8,000 characters');
    const geometry = body.geometry == null ? undefined : object(body.geometry, 16_000);
    if (['point', 'region', 'freehand'].includes(String(body.kind))) {
      if (!geometry || Object.keys(geometry).length === 0) throw new Error('Spatial notes require geometry');
      const validate = (value: unknown): void => {
        if (typeof value === 'number' && (!Number.isFinite(value) || value < 0 || value > 1)) throw new Error('Coordinates must be normalized between 0 and 1');
        if (Array.isArray(value)) value.forEach(validate);
        else if (value && typeof value === 'object') Object.values(value).forEach(validate);
      };
      validate(geometry);
    }
    for (const field of ['startMs', 'endMs']) if (body[field] != null && (!Number.isSafeInteger(body[field]) || Number(body[field]) < 0)) throw new Error('Times must be nonnegative integer milliseconds');
    if (body.endMs != null && Number(body.endMs) < Number(body.startMs ?? 0)) throw new Error('End time precedes start time');
    if (body.parentAnnotationId && !bundle.annotations.some((entry) => entry.annotationId === body.parentAnnotationId)) throw new Error('Parent note does not belong to this canvas');
    const timestamp = new Date().toISOString();
    const note: CanvasAnnotation = { annotationId: randomUUID(), projectId, revisionId: String(body.revisionId), kind: body.kind as CanvasAnnotation['kind'], body: text,
      geometry, startMs: body.startMs as number | undefined, endMs: body.endMs as number | undefined,
      metadata: body.metadata == null ? {} : object(body.metadata, 32_000), parentAnnotationId: body.parentAnnotationId as string | undefined,
      status: 'open', authorType: 'human', authorId: 'local-user', createdAt: timestamp, updatedAt: timestamp };
    this.mutate(projectId, (current) => current.annotations.push(note));
    return structuredClone(note);
  }

  updateNote(projectId: string, annotationId: string, body: Record<string, unknown>) {
    const note = this.get(projectId).annotations.find((entry) => entry.annotationId === annotationId);
    if (!note) throw new Error('Note does not belong to this canvas');
    if (body.status !== undefined && !['open', 'resolved'].includes(String(body.status))) throw new Error('Invalid note status');
    if (body.body !== undefined && (typeof body.body !== 'string' || !body.body.trim() || body.body.length > 8000)) throw new Error('Note text must contain 1–8,000 characters');
    const updated = { ...note, ...(typeof body.body === 'string' ? { body: body.body.trim() } : {}), ...(body.status ? { status: body.status as CanvasAnnotation['status'] } : {}), updatedAt: new Date().toISOString() };
    this.mutate(projectId, (bundle) => { bundle.annotations = body.deleted === true ? bundle.annotations.filter((entry) => entry.annotationId !== annotationId) : bundle.annotations.map((entry) => entry.annotationId === annotationId ? updated : entry); });
    return updated;
  }

  addVersion(projectId: string, itemId: string, summary?: string) {
    this.artifact(this.state(), itemId);
    this.mutate(projectId, (bundle) => {
      const other = this.state().canvases?.find((entry) => entry.project.projectId !== projectId && entry.revisions.some((revision) => revision.itemId === itemId));
      if (other) throw new Error('This file already belongs to another canvas');
      if (!bundle.revisions.some((entry) => entry.itemId === itemId)) bundle.revisions.push({ revisionId: randomUUID(), projectId, itemId,
        parentRevisionId: bundle.revisions.find((entry) => entry.itemId === bundle.project.activeItemId)?.revisionId,
        operation: summary?.trim().slice(0, 200) || 'edit', createdByType: 'agent', createdAt: new Date().toISOString() });
      bundle.project.activeItemId = itemId;
    });
    return this.get(projectId);
  }

  context(request: CanvasContextRequest) {
    const bundle = this.get(request.projectId);
    const revision = request.revisionId ? bundle.revisions.find((entry) => entry.revisionId === request.revisionId) : bundle.revisions.find((entry) => entry.itemId === bundle.project.activeItemId);
    if (!revision?.artifact) throw new Error('Viewed revision does not belong to this canvas');
    if (request.annotationIds.some((id) => !bundle.annotations.some((note) => note.annotationId === id))) throw new Error('An attached note no longer belongs to this canvas');
    const attached = request.annotationIds.map((id) => {
      const note = bundle.annotations.find((entry) => entry.annotationId === id)!;
      const source = bundle.revisions.find((entry) => entry.revisionId === note.revisionId);
      return { ...note, metadata: { ...note.metadata, canvasItemId: source?.itemId } };
    });
    const itemIds = [...new Set([revision.itemId, ...attached.flatMap((note) => { const source = bundle.revisions.find((entry) => entry.revisionId === note.revisionId); return source ? [source.itemId] : []; })])];
    const defaults = normalizeCreativeDefaults(bundle.project.settings?.creativeDefaults);
    const image = defaults.image?.modelKey;
    const voice = defaults.audio?.modelKey;
    const mediaModels = { ...(image?.startsWith('local:image:') ? { imageModel: image.slice('local:image:'.length) } : {}), ...(voice?.startsWith('local:voice:') ? { voiceModel: voice.slice('local:voice:'.length) } : {}) };
    return { mediaModels, annotations: attached, itemIds, text: formatCanvasContext({ projectId: request.projectId, artifact: revision.artifact, activeRevision: revision, revisions: bundle.revisions, annotations: bundle.annotations,
      attachedIds: request.annotationIds, viewer: request.viewer, creativeDefaults: normalizeCreativeDefaults(bundle.project.settings?.creativeDefaults), local: true }), itemId: revision.itemId };
  }
}

function object(value: unknown, max: number): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(value).length > max) throw new Error('Invalid or oversized canvas data');
  return JSON.parse(JSON.stringify(value));
}
