import {
  createParseSuccess,
  ParseResult
} from '../../errors';
import { StructNode, StructTree, ValueType } from '../../model';

interface KeySegment {
  name: string;
  delimiter: '.' | '_' | '';
}

interface EnvEntry {
  rawKey: string;
  segments: KeySegment[];
  rawValue: string;
  parsedValue: string | number | boolean | null;
  valueType: ValueType;
  lineNum: number;
}

/**
 * Safely extracts a properly closed quoted value, taking escape sequences into account.
 * Returns null if the value is not quoted or if the quote is unclosed/escaped at the end.
 */
function extractQuotedString(val: string): string | null {
  const trimmed = val.trim();
  if ((trimmed.startsWith('"') || trimmed.startsWith("'")) && trimmed.length >= 2) {
    const quote = trimmed[0];
    for (let i = 1; i < trimmed.length; i++) {
      if (trimmed[i] === '\\' && quote === '"') {
        i++; // Skip escaped character safely
        continue;
      }
      if (trimmed[i] === quote) {
        return trimmed.slice(0, i + 1);
      }
    }
  }
  return null;
}

/**
 * Strips quotes and unescapes standard escape sequences from a quoted env value string.
 */
function unescapeEnvValue(val: string): string {
  const quoted = extractQuotedString(val);
  if (quoted) {
    const quote = quoted[0];
    const inner = quoted.slice(1, -1);
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
  return val.trim();
}

/**
 * Strips inline comments while respecting quotes.
 */
function stripInlineComment(val: string): string {
  const trimmed = val.trim();
  if (!trimmed) {
    return '';
  }

  // Quoted value check: protect quoted contents from inline comment trimming
  const quoted = extractQuotedString(trimmed);
  if (quoted !== null) {
    return quoted;
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

  // If properly quoted, treat as string safely
  const quoted = extractQuotedString(trimmed);
  if (quoted !== null && quoted === trimmed) {
    return {
      parsedValue: unescapeEnvValue(quoted),
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

      // Parse key into segments with their trailing/preceding delimiters
      const segments: KeySegment[] = [];
      const regex = /([^._]+)([._]?)/g;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(rawKey)) !== null) {
        if (match[1]) {
          segments.push({
            name: match[1],
            delimiter: (match[2] as '.' | '_') || ''
          });
        }
      }

      if (segments.length === 0) {
        segments.push({ name: rawKey, delimiter: '' });
      }

      entries.push({
        rawKey,
        segments,
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
    const { segments, parsedValue, valueType } = entry;
    let curr = parent;
    let path = currentPath;

    for (let i = 0; i < segments.length; i++) {
      const { name: segmentName, delimiter } = segments[i];
      const isLeaf = i === segments.length - 1;
      const nextPath = [...path, segmentName];

      // Match child with same name AND delimiter to distinguish DB_HOST vs DB.HOST
      let existingChild = curr.children.find((c) => {
        if (c.name !== segmentName) return false;
        const attrDelim = c.attributes?.delimiter ?? '';
        // If existing is an object (intermediate) and delimiter matches or either is intermediate
        if (isLeaf) {
          return attrDelim === delimiter;
        } else {
          // For intermediate segment, match node with same name and delimiter or leaf that is being promoted
          return attrDelim === delimiter || (attrDelim === '' && c.nodeType === 'value');
        }
      });

      if (isLeaf) {
        if (existingChild) {
          // Overwrite / update existing child if duplicate key with same delimiter
          if (existingChild.nodeType !== 'object') {
            existingChild.nodeType = 'value';
          }
          existingChild.value = parsedValue;
          existingChild.valueType = valueType;
        } else {
          const leafNode: StructNode = {
            id: createId(),
            name: segmentName,
            path: nextPath,
            nodeType: 'value',
            valueType,
            value: parsedValue,
            children: [],
            attributes: delimiter ? { delimiter } : undefined
          };
          curr.children.push(leafNode);
        }
      } else {
        if (!existingChild) {
          existingChild = {
            id: createId(),
            name: segmentName,
            path: nextPath,
            nodeType: 'object',
            children: [],
            attributes: delimiter ? { delimiter } : undefined
          };
          curr.children.push(existingChild);
        } else if (existingChild.nodeType === 'value') {
          // If a value node exists at intermediate position, convert to object while retaining value
          existingChild.nodeType = 'object';
          if (delimiter) {
            existingChild.attributes = { ...(existingChild.attributes || {}), delimiter };
          }
        }
        curr = existingChild;
        path = nextPath;
      }
    }
  }
}
