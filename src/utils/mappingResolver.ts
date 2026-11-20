/**
 * Glob matching for custom mappings.
 *
 * Patterns come from settings (including workspace settings of a cloned
 * repository), so matching must never exhibit catastrophic backtracking.
 * Instead of converting globs to RegExp, patterns are compiled to tokens and
 * matched with a dynamic-programming matcher whose cost is bounded by
 * O(tokens x target length). Pattern length, wildcard count, the number of
 * mappings, and the compiled-pattern cache are all capped.
 */

/** Maximum accepted glob pattern length (longer patterns are ignored). */
export const MAX_PATTERN_LENGTH = 512;

/** Maximum number of `*` wildcards accepted in a single pattern. */
export const MAX_WILDCARDS = 16;

/** Maximum number of mapping entries evaluated per resolution. */
export const MAX_MAPPINGS = 256;

type GlobToken =
  | { kind: 'literal'; char: string }
  | { kind: 'star' }
  | { kind: 'doubleStar' }
  | { kind: 'question' };

const compiledPatternCache = new Map<string, GlobToken[] | null>();
const MAX_CACHE_ENTRIES = 256;

/**
 * Compiles a glob pattern into tokens, or returns null when the pattern
 * exceeds the safety limits (length / wildcard count).
 * Supports `*` (any characters except directory separators),
 * `**` (any path characters), and `?` (single character except separator).
 */
function compileGlobPattern(pattern: string): GlobToken[] | null {
  const normalized = pattern.replace(/\\/g, '/');
  if (normalized.length > MAX_PATTERN_LENGTH) {
    return null;
  }

  const tokens: GlobToken[] = [];
  let wildcards = 0;

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];

    if (char === '*') {
      wildcards++;
      if (normalized[i + 1] === '*') {
        // '**' counts as two wildcard characters.
        wildcards++;
        if (wildcards > MAX_WILDCARDS) {
          return null;
        }
        tokens.push({ kind: 'doubleStar' });
        i++;
      } else {
        if (wildcards > MAX_WILDCARDS) {
          return null;
        }
        tokens.push({ kind: 'star' });
      }
    } else if (char === '?') {
      tokens.push({ kind: 'question' });
    } else {
      tokens.push({ kind: 'literal', char: char.toLowerCase() });
    }
  }

  return tokens;
}

function getCompiledPattern(pattern: string): GlobToken[] | null {
  const cached = compiledPatternCache.get(pattern);
  if (cached !== undefined) {
    return cached;
  }
  const compiled = compileGlobPattern(pattern);
  if (compiledPatternCache.size >= MAX_CACHE_ENTRIES) {
    compiledPatternCache.clear();
  }
  compiledPatternCache.set(pattern, compiled);
  return compiled;
}

/**
 * Matches tokens against a target string with dynamic programming.
 * `star` consumes zero or more non-separator characters, `doubleStar`
 * consumes zero or more of any characters, `question` consumes exactly one
 * non-separator character. Matching is case-insensitive (the target must be
 * pre-lowercased and literal tokens are stored lowercased).
 */
function matchGlobTokens(tokens: GlobToken[], target: string): boolean {
  const targetLength = target.length;
  // prev[j] === true when the tokens processed so far match target[0..j).
  let prev = new Array<boolean>(targetLength + 1).fill(false);
  prev[0] = true;

  for (const token of tokens) {
    const curr = new Array<boolean>(targetLength + 1).fill(false);
    if (token.kind === 'star' || token.kind === 'doubleStar') {
      const crossesSeparator = token.kind === 'doubleStar';
      curr[0] = prev[0];
      for (let j = 1; j <= targetLength; j++) {
        curr[j] = prev[j] || (curr[j - 1] && (crossesSeparator || target[j - 1] !== '/'));
      }
    } else if (token.kind === 'question') {
      for (let j = 1; j <= targetLength; j++) {
        curr[j] = prev[j - 1] && target[j - 1] !== '/';
      }
    } else {
      for (let j = 1; j <= targetLength; j++) {
        curr[j] = prev[j - 1] && target[j - 1] === token.char;
      }
    }
    prev = curr;
  }

  return prev[targetLength];
}

/**
 * Resolves parser format name (e.g. 'json', 'yaml', 'xml', 'markdown', 'jsonSchema')
 * for a given file path based on custom mapping rules.
 *
 * @param filePath The file name or path to test.
 * @param customMappings Key-value mapping of glob patterns to parser format names.
 * @returns Resolved format name or undefined if no custom mapping matches.
 */
export function resolveParserByCustomMappings(
  filePath: string,
  customMappings?: Record<string, string>
): string | undefined {
  if (!filePath || !customMappings) {
    return undefined;
  }

  const normalizedPath = filePath.replace(/\\/g, '/');
  const baseName = normalizedPath.split('/').pop() || normalizedPath;
  const lowerPath = normalizedPath.toLowerCase();
  const lowerBaseName = baseName.toLowerCase();

  let evaluated = 0;
  for (const [pattern, format] of Object.entries(customMappings)) {
    if (!pattern || !format) {
      continue;
    }
    if (++evaluated > MAX_MAPPINGS) {
      break;
    }

    const tokens = getCompiledPattern(pattern);
    if (!tokens) {
      // Pattern exceeds safety limits; ignore it.
      continue;
    }

    // Match against full normalized path or just the file name
    if (matchGlobTokens(tokens, lowerBaseName) || matchGlobTokens(tokens, lowerPath)) {
      return format;
    }
  }

  return undefined;
}
