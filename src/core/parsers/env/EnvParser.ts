import {
  createParseSuccess,
  ParseResult
} from '../../errors';
import { StructNode, StructTree, ValueType } from '../../model';

interface EnvEntry {
  rawKey: string;
  keySegments: string[];
  rawValue: string;
  parsedValue: string | number | boolean | null;
  valueType: ValueType;
  lineNum: number;
}

/**
 * Strips quotes and unescapes standard escape sequences from an env value string.
 */
function unescapeEnvValue(val: string): string {
  val = val.trim();
  if (
    (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
    (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
  ) {
    const quote = val[0];
    const inner = val.slice(1, -1);
    if (quote === "'") {
      // Single quotes: raw content without escape processing
      return inner;
    }
    // Double quotes: single-pass unescape of \n, \r, \t, \", \\
    return inner.replace(/\\([nrt"\\])/g, (_, esc) => {
      switch (esc) {
        case 'n': return '\n';
        case 'r': return '\r';
        case 't': return '\t';
        case '"': return '"';
        case '\\': return '\\';
        default: return esc;
      }
    });
  }
  return val;
}

/**
 * Strips inline comments while respecting quotes.
 */
function stripInlineComment(val: string): string {
  const trimmed = val.trim();
  if (!trimmed) {
    return '';
  }

  // Quoted value
  if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
    const quote = trimmed[0];
    let endQuoteIdx = -1;
    for (let i = 1; i < trimmed.length; i++) {
      if (trimmed[i] === '\\' && quote === '"') {
        i++; // Skip escaped character
        continue;
      }
      if (trimmed[i] === quote) {
        endQuoteIdx = i;
        break;
      }
    }

    if (endQuoteIdx !== -1) {
      const quotedPart = trimmed.slice(0, endQuoteIdx + 1);
      // Remainder after closing quote may contain comment
      return quotedPart;
    }
  }

  // Unquoted value: remove trailing whitespace + # comment
  const commentMatch = trimmed.match(/^([^#]*?)(?:\s+#.*)?$/);
  return commentMatch ? commentMatch[1].trim() : trimmed;
}

/**
 * Infers primitive type for unquoted or quoted env values.
 */
function inferEnvValue(rawValue: string): {
  parsedValue: string | number | boolean | null;
  valueType: ValueType;
} {
  const cleanValue = stripInlineComment(rawValue);
  const trimmed = cleanValue.trim();

  // If originally quoted, treat as string
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    return {
      parsedValue: unescapeEnvValue(trimmed),
      valueType: 'string'
    };
  }

  // Boolean
  const lower = trimmed.toLowerCase();
  if (lower === 'true') {
    return { parsedValue: true, valueType: 'boolean' };
  }
  if (lower === 'false') {
    return { parsedValue: false, valueType: 'boolean' };
  }

  // Null
  if (lower === 'null') {
    return { parsedValue: null, valueType: 'null' };
  }

  // Number (integer or float, but avoid empty string or non-numeric strings)
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed);
    if (!isNaN(num)) {
      return { parsedValue: num, valueType: 'number' };
    }
  }

  // Fallback to string
  return {
    parsedValue: trimmed,
    valueType: 'string'
  };
}

/**
 * Parser that converts .env file content into a StructTree structure or ParseError.
 */
export class EnvParser {
  /**
   * Parses Env text content into a ParseResult representation.
   *
   * @param content Raw .env string.
   * @param fileName File name to be set as the root node name.
   * @param _maxArrayItems Unused for Env files.
   * @returns Generated ParseResult (ParseSuccess containing StructTree or ParseError).
   */
  public parse(
    content: string,
    fileName: string = '.env',
    _maxArrayItems?: number
  ): ParseResult {
    void _maxArrayItems;
    let idCounter = 0;
    const createId = () => `node-${idCounter++}`;
    const rootPath = [fileName];

    const rootNode: StructNode = {
      id: createId(),
      name: fileName,
      path: rootPath,
      nodeType: 'root',
      children: []
    };

    const lines = content.split(/\r?\n/);
    const entries: EnvEntry[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineNum = i + 1;

      // Skip empty lines or comment lines starting with #
      if (!line || line.startsWith('#')) {
        continue;
      }

      const eqIdx = line.indexOf('=');
      if (eqIdx === -1) {
        // Line without '=': could be export KEY or just a bare flag
        continue;
      }

      let rawKey = line.slice(0, eqIdx).trim();
      if (rawKey.startsWith('export ') || rawKey.startsWith('export\t')) {
        rawKey = rawKey.slice(6).trim();
      }

      const rawVal = line.slice(eqIdx + 1);
      const { parsedValue, valueType } = inferEnvValue(rawVal);

      // Split key by dot (.) or underscore (_)
      // To support nested groups: DB_HOST -> ['DB', 'HOST']
      // app.server.port -> ['app', 'server', 'port']
      const keySegments = rawKey.split(/[._]/).filter(Boolean);

      entries.push({
        rawKey,
        keySegments: keySegments.length > 0 ? keySegments : [rawKey],
        rawValue: rawVal,
        parsedValue,
        valueType,
        lineNum
      });
    }

    // Build hierarchical tree
    // Intermediate groups are 'object', leaves are 'value'
    for (const entry of entries) {
      this.insertEntry(rootNode, entry, rootPath, createId);
    }

    const tree: StructTree = {
      sourceFormat: 'env',
      root: rootNode
    };

    return createParseSuccess(tree);
  }

  private insertEntry(
    parent: StructNode,
    entry: EnvEntry,
    currentPath: string[],
    createId: () => string
  ): void {
    const { keySegments, parsedValue, valueType } = entry;
    let curr = parent;
    let path = currentPath;

    for (let i = 0; i < keySegments.length; i++) {
      const segment = keySegments[i];
      const isLeaf = i === keySegments.length - 1;
      const nextPath = [...path, segment];

      let existingChild = curr.children.find((c) => c.name === segment);

      if (isLeaf) {
        if (existingChild) {
          // Overwrite / update existing child if duplicate key
          existingChild.nodeType = 'value';
          existingChild.value = parsedValue;
          existingChild.valueType = valueType;
        } else {
          const leafNode: StructNode = {
            id: createId(),
            name: segment,
            path: nextPath,
            nodeType: 'value',
            valueType,
            value: parsedValue,
            children: []
          };
          curr.children.push(leafNode);
        }
      } else {
        if (!existingChild) {
          existingChild = {
            id: createId(),
            name: segment,
            path: nextPath,
            nodeType: 'object',
            children: []
          };
          curr.children.push(existingChild);
        } else if (existingChild.nodeType === 'value') {
          // If a value node exists at intermediate position, convert to object while retaining value
          existingChild.nodeType = 'object';
        }
        curr = existingChild;
        path = nextPath;
      }
    }
  }
}
