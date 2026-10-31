/**
 * Converts a simple glob pattern into a regular expression.
 * Supports `*` (any characters except directory separators, or any characters in simple filename globs),
 * `**` (any path characters), and `?` (single character).
 *
 * @param pattern The glob pattern string (e.g. `*.xlf`, `*_config.json`).
 * @returns RegExp for matching file paths/names.
 */
function globToRegExp(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, '/');
  let regexStr = '^';

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];

    if (char === '*') {
      if (normalized[i + 1] === '*') {
        // Double star (**)
        regexStr += '.*';
        i++;
      } else {
        // Single star (*)
        // In base filenames or simple globs, matches anything except /
        regexStr += '[^/]*';
      }
    } else if (char === '?') {
      regexStr += '[^/]';
    } else if (['.', '+', '^', '$', '{', '}', '(', ')', '|', '[', ']', '\\'].includes(char)) {
      regexStr += `\\${char}`;
    } else {
      regexStr += char;
    }
  }

  regexStr += '$';
  return new RegExp(regexStr, 'i');
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

  for (const [pattern, format] of Object.entries(customMappings)) {
    if (!pattern || !format) {
      continue;
    }

    try {
      const regex = globToRegExp(pattern);
      // Match against full normalized path or just the file name
      if (regex.test(baseName) || regex.test(normalizedPath)) {
        return format;
      }
    } catch {
      // Ignore invalid regex patterns safely
    }
  }

  return undefined;
}
