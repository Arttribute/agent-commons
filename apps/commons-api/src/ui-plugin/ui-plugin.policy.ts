type UiPluginSurfacePolicy = {
  type: 'page' | 'widget';
  width?: number;
  height?: number;
};

type UiPluginCapabilityPolicy = {
  name: string;
};

type UiPluginManifestPolicy = {
  surfaces: UiPluginSurfacePolicy[];
  capabilities?: UiPluginCapabilityPolicy[];
};

type JsonRecord = Record<string, unknown>;

/**
 * Returns whether a browser-verification result exercised every surface and
 * capability requested by a plugin manifest. Capability resource IDs are not
 * considered here: verification exercises the bridge contract, while the
 * runtime host enforces the manifest's resource scope.
 *
 * This is total over persisted JSON so malformed legacy rows fail closed
 * instead of crashing activation or deployment verification.
 */
export function verificationCoversManifest(
  verification: unknown,
  manifest: unknown,
): boolean {
  if (!isRecord(verification) || !isManifest(manifest)) return false;

  const verifiedSurfaces = verification.verifiedSurfaces;
  if (!Array.isArray(verifiedSurfaces)) return false;

  const surfacesCovered = manifest.surfaces.every((surface) =>
    verifiedSurfaces.some((candidate) =>
      verifiedSurfaceCovers(candidate, surface),
    ),
  );
  if (!surfacesCovered) return false;

  const verifiedCapabilities = new Set(
    Array.isArray(verification.verifiedCapabilities)
      ? verification.verifiedCapabilities.filter(
          (name): name is string => typeof name === 'string',
        )
      : [],
  );
  return (manifest.capabilities ?? []).every((grant) =>
    verifiedCapabilities.has(grant.name),
  );
}

function verifiedSurfaceCovers(
  candidate: unknown,
  requested: UiPluginSurfacePolicy,
) {
  if (!isRecord(candidate) || candidate.type !== requested.type) return false;
  if (requested.type === 'page') return true;
  if (
    !isOptionalFiniteNumber(candidate.width) ||
    !isOptionalFiniteNumber(candidate.height)
  ) {
    return false;
  }
  return (
    widgetWidth(candidate.width) === widgetWidth(requested.width) &&
    widgetHeight(candidate.height) === widgetHeight(requested.height)
  );
}

function isManifest(value: unknown): value is UiPluginManifestPolicy {
  if (!isRecord(value) || !Array.isArray(value.surfaces)) return false;
  if (!value.surfaces.length || !value.surfaces.every(isSurface)) return false;
  return (
    value.capabilities === undefined ||
    (Array.isArray(value.capabilities) &&
      value.capabilities.every(isCapability))
  );
}

function isSurface(value: unknown): value is UiPluginSurfacePolicy {
  if (!isRecord(value) || (value.type !== 'page' && value.type !== 'widget')) {
    return false;
  }
  return (
    value.type === 'page' ||
    (isOptionalFiniteNumber(value.width) &&
      isOptionalFiniteNumber(value.height))
  );
}

function isCapability(value: unknown): value is UiPluginCapabilityPolicy {
  return isRecord(value) && typeof value.name === 'string' && value.name !== '';
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalFiniteNumber(value: unknown): value is number | undefined {
  return (
    value === undefined || (typeof value === 'number' && Number.isFinite(value))
  );
}

function widgetWidth(value: unknown) {
  return clampDimension(value, 280, 520, 380);
}

function widgetHeight(value: unknown) {
  return clampDimension(value, 240, 720, 480);
}

function clampDimension(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}
