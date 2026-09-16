/** The subset of the Common Arcade game document this platform authors. */
export type ArcadeGameFile = { path: string; content: string };

export type ArcadeSeats = { min: number; max: number; default: number };

export type ArcadePlay = {
  mode?: 'turn-based' | 'simultaneous' | 'realtime' | 'hybrid';
  seats?: ArcadeSeats;
  maxDecisionsPerSecond?: number;
};

export type ArcadeRuntime = {
  kind?: 'sandboxed-script';
  entryFile: string;
  tickRate?: number;
  memoryMiB?: number;
  timeoutMs?: number;
};

export type ArcadeGameDocument = {
  kind: 'browser';
  title: string;
  description: string;
  thumbnail?: string;
  entryFile: string;
  dependencies?: Record<string, string>;
  play?: ArcadePlay;
  runtime?: ArcadeRuntime;
  files: ArcadeGameFile[];
  [extra: string]: unknown;
};

export type ArcadeProject = {
  id: string;
  ownerId: string;
  revision: number;
  digest: string;
  document: ArcadeGameDocument;
  annotations?: unknown[];
  releaseId?: string;
  createdAt: string;
  updatedAt: string;
};

export type ArcadeRelease = {
  id: string;
  projectId: string;
  revision: number;
  digest: string;
  publishedAt: string;
};

export type ArcadeGameWrite = {
  title?: string;
  description?: string;
  entryFile?: string;
  thumbnail?: string;
  files?: ArcadeGameFile[];
  replaceFiles?: boolean;
  play?: ArcadePlay;
  runtime?: ArcadeRuntime;
  dependencies?: { name: string; version: string }[];
};
