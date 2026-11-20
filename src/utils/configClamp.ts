/**
 * Clamping for numeric `structMap.*` settings.
 *
 * These values are read with the document URI scope, so a cloned repository's
 * `.vscode/settings.json` can supply them. Out-of-range values must never
 * weaken the built-in protections (e.g. `maxFileSizeMB <= 0` previously
 * disabled the file-size limit entirely), so every read site and the service
 * entry point clamp to the same ranges declared in package.json.
 */

export const MAX_FILE_SIZE_MB_MIN = 0.1;
export const MAX_FILE_SIZE_MB_MAX = 50;
export const MAX_FILE_SIZE_MB_DEFAULT = 5;

export const MAX_ARRAY_ITEMS_MIN = 1;
export const MAX_ARRAY_ITEMS_MAX = 1000;
export const MAX_ARRAY_ITEMS_DEFAULT = 50;

export const DEBOUNCE_MS_MIN = 0;
export const DEBOUNCE_MS_MAX = 5000;
export const DEBOUNCE_MS_DEFAULT = 500;

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, value));
}

/**
 * Clamps `structMap.maxFileSizeMB`. Non-positive or non-numeric values fall
 * back to the default (5MB) instead of disabling the size limit.
 */
export function clampMaxFileSizeMB(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return MAX_FILE_SIZE_MB_DEFAULT;
  }
  return clampNumber(value, MAX_FILE_SIZE_MB_MIN, MAX_FILE_SIZE_MB_MAX, MAX_FILE_SIZE_MB_DEFAULT);
}

/** Clamps `structMap.maxArrayItems` to an integer in [1, 1000]. */
export function clampMaxArrayItems(value: unknown): number {
  const clamped = clampNumber(
    value,
    MAX_ARRAY_ITEMS_MIN,
    MAX_ARRAY_ITEMS_MAX,
    MAX_ARRAY_ITEMS_DEFAULT
  );
  return Math.floor(clamped);
}

/** Clamps `structMap.debounceMs` to [0, 5000]. */
export function clampDebounceMs(value: unknown): number {
  return clampNumber(value, DEBOUNCE_MS_MIN, DEBOUNCE_MS_MAX, DEBOUNCE_MS_DEFAULT);
}
