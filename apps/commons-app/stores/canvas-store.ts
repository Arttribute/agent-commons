"use client";

import { create } from "zustand";

/** What the canvas viewer is showing, sent to agents as a hint. */
export type CanvasViewerState = {
  view?: "preview" | "source";
  page?: number;
  pageCount?: number;
  sheet?: string;
  timeMs?: number;
  durationMs?: number;
  sourceFile?: string;
};

export type CanvasChatContext = {
  /** Canvas record id, persisted in the active local or cloud workspace. */
  projectId?: string;
  revisionId?: string;
  artifact: { itemId: string; name: string; kind: string; mimeType: string };
  viewer: CanvasViewerState;
};

export type CanvasNoteRef = {
  annotationId: string;
  /** Position in the notes list, for a stable "Note 2" label. */
  number: number;
  body: string;
};

export type CanvasPrompt = { id: string; text: string; mode: "send" | "draft" };

export type KnownArtifact = { name: string; mimeType: string; kind?: string };

type CanvasState = {
  agentId: string;
  setAgentId: (agentId: string) => void;
  /** Names and types seen in lists, so a canvas can show its file type at once. */
  known: Record<string, KnownArtifact>;
  remember: (items: Array<KnownArtifact & { itemId: string }>) => void;

  context: CanvasChatContext | null;
  setContext: (context: CanvasChatContext | null) => void;
  setViewer: (viewer: Partial<CanvasViewerState>) => void;

  /** Notes the person chose to send with their next message. */
  attached: CanvasNoteRef[];
  attachNotes: (notes: CanvasNoteRef[]) => void;
  detachNote: (annotationId: string) => void;
  clearAttached: () => void;

  /** A prompt from a canvas control, picked up by the chat composer. */
  prompt: CanvasPrompt | null;
  sendPrompt: (text: string, mode?: CanvasPrompt["mode"]) => void;

  /** Width the chat panel takes from the right edge, 0 when closed. */
  chatInset: number;
  setChatInset: (width: number) => void;
  /** Width the docked composer covers at the bottom right. */
  dockInset: number;
  setDockInset: (width: number) => void;

  /** Bumped when an agent may have changed the artifact. */
  revision: number;
  bumpRevision: () => void;
};

export const useCanvasStore = create<CanvasState>((set) => ({
  agentId: "",
  setAgentId: (agentId) => set({ agentId }),
  known: {},
  remember: (items) =>
    set((state) => {
      const known = { ...state.known };
      for (const { itemId, name, mimeType, kind } of items) known[itemId] = { name, mimeType, kind };
      return { known };
    }),

  context: null,
  setContext: (context) => set((state) => ({ context: context && state.context?.artifact.itemId === context.artifact.itemId
    ? { ...context, viewer: { ...state.context.viewer, ...context.viewer } } : context })),
  setViewer: (viewer) =>
    set((state) =>
      state.context
        ? { context: { ...state.context, viewer: { ...state.context.viewer, ...viewer } } }
        : state,
    ),

  attached: [],
  attachNotes: (notes) =>
    set((state) => {
      const next = [...state.attached];
      for (const note of notes) {
        if (!next.some((entry) => entry.annotationId === note.annotationId)) next.push(note);
      }
      return { attached: next.slice(0, 20) };
    }),
  detachNote: (annotationId) =>
    set((state) => ({ attached: state.attached.filter((note) => note.annotationId !== annotationId) })),
  clearAttached: () => set({ attached: [] }),

  prompt: null,
  sendPrompt: (text, mode = "draft") =>
    set({ prompt: { id: `canvas:${Date.now()}`, text, mode } }),

  chatInset: 0,
  setChatInset: (chatInset) => set({ chatInset }),
  dockInset: 0,
  setDockInset: (dockInset) => set({ dockInset }),

  revision: 0,
  bumpRevision: () => set((state) => ({ revision: state.revision + 1 })),
}));
