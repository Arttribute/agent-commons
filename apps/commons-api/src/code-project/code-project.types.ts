export type CodeProjectFileInput = {
  path: string;
  content: string;
};

export type BrowserCheckAction =
  | { type: 'click'; selector?: string; text?: string }
  | { type: 'fill'; selector: string; value: string }
  | { type: 'press'; selector?: string; key: string }
  | { type: 'expectText'; text: string };

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
