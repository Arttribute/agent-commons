const GIB = 1024 ** 3;

/** Prefer the verified compact image checkpoint on ordinary laptops. */
export function recommendedImageModelId(ramBytes: number): string {
  return ramBytes >= 12 * GIB ? "tiny-sd.safetensors" : "tiny-sd-q4.gguf";
}

export function supportsImageStarter(ramBytes: number): boolean {
  return ramBytes >= 8 * GIB;
}
