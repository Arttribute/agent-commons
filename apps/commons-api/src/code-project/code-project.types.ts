export type CodeProjectFileInput = {
  path: string;
  content: string;
};

export type BrowserCheckAction =
  | { type: 'click'; selector?: string; text?: string }
  | { type: 'fill'; selector: string; value: string }
  | { type: 'press'; selector?: string; key: string }
  | { type: 'expectText'; text: string };

export type BrowserCheckSurface =
  | { type: 'page' }
  | { type: 'widget'; width?: number; height?: number };

export type BrowserCheckCapabilityName =
  | 'agents.read'
  | 'tasks.read'
  | 'tasks.write'
  | 'workflows.read'
  | 'workflows.execute'
  | 'library.read'
  | 'tools.read'
  | 'copilot.prompt';

/**
 * Browser verification accepts the short capability name used by the host
 * context as well as the manifest grant shape used by registerUiPlugin.
 * Resource scoping is enforced by the real host; the verifier only needs the
 * declared names to expose the matching, side-effect-free fixture methods.
 */
export type BrowserCheckCapability =
  | BrowserCheckCapabilityName
  | { name: BrowserCheckCapabilityName; resourceIds?: string[] };

export type BuiltAsset = {
  path: string;
  content: Uint8Array | string;
  contentType: string;
  cacheControl: string;
};

export type BuildResult = {
  assets: BuiltAsset[];
  bytes: number;
  warnings: Array<{ message: string; file?: string; line?: number }>;
};
