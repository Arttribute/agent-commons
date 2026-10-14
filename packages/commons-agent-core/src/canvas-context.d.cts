/**
 * Agent context for an artifact open in the canvas.
 *
 * The canvas sends a small, untrusted hint (which canvas, which notes, what the
 * viewer shows). The service reloads everything it puts in front of the model,
 * so these helpers only shape data that has already passed an access check.
 */
export declare const CANVAS_MEDIA_KINDS: readonly ["image", "video", "audio", "music"];
export type CanvasMediaKind = (typeof CANVAS_MEDIA_KINDS)[number];
export type CanvasCreativeDefaults = Partial<Record<CanvasMediaKind, {
    modelKey?: string;
    settings?: Record<string, unknown>;
}>>;
export type CanvasViewerHint = {
    view?: 'preview' | 'source';
    page?: number;
    pageCount?: number;
    sheet?: string;
    timeMs?: number;
    durationMs?: number;
    sourceFile?: string;
};
export type CanvasContextRequest = {
    projectId: string;
    annotationIds: string[];
    revisionId?: string;
    viewer: CanvasViewerHint;
};
/** Read the canvas fields of a run's UI context. Returns null for other pages. */
export declare function canvasContextRequest(uiContext: unknown): CanvasContextRequest | null;
/** Keep only well-formed creative preferences, bounded in size. */
export declare function normalizeCreativeDefaults(value: unknown): CanvasCreativeDefaults;
export type ContextArtifact = {
    itemId: string;
    name: string;
    kind: string;
    mimeType: string;
    metadata?: Record<string, unknown> | null;
};
export type ContextRevision = {
    revisionId: string;
    itemId: string;
    operation: string;
    modelId?: string | null;
    createdByType: string;
    createdAt: Date | string;
};
export type ContextAnnotation = {
    annotationId: string;
    revisionId: string;
    kind: string;
    body: string;
    status: string;
    geometry?: Record<string, unknown> | null;
    startMs?: number | null;
    endMs?: number | null;
    metadata?: Record<string, unknown> | null;
};
export type CanvasContextInput = {
    projectId: string;
    artifact: ContextArtifact;
    activeRevision?: ContextRevision;
    revisions: ContextRevision[];
    annotations: ContextAnnotation[];
    attachedIds: string[];
    viewer: CanvasViewerHint;
    creativeDefaults: CanvasCreativeDefaults;
    local?: boolean;
    codeProject?: {
        projectId: string;
        entryFile: string;
        name: string;
    } | null;
};
/** The system-prompt block for an agent working on a canvas artifact. */
export declare function formatCanvasContext(input: CanvasContextInput): string;
/** A short, human-readable location for a note. */
export declare function noteLocation(note: ContextAnnotation): string;
