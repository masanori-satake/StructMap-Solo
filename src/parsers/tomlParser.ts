/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  createParseError,
  createParseSuccess,
  ParseErrorCode,
  ParseResult,
} from '../core/errors';
import { StructNode, StructTree, ValueType } from '../core/model';

/**
 * Represents an entry in TOML AST.
 */
type TomlValue =
  | string
  | number
  | boolean
  | Date
  | TomlValue[]
  | { [key: string]: TomlValue };

/**
 * Strips comments from a line outside of quoted strings.
 */
function stripLineComment(line: string): string {
  let inDouble = false;
  let inSingle = false;
  let escaped = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inDouble) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inDouble = false;
      }
    } else if (inSingle) {
      if (ch === "'") {
        inSingle = false;
      }
    } else {
      if (ch === '"') {
        inDouble = true;
      } else if (ch === "'") {
        inSingle = true;
      } else if (ch === '#') {
        return line.slice(0, i);
      }
    }
  }
  return line;
}

/**
 * Parses bare, single-quoted, or double-quoted key tokens.
 * Supports dotted keys like `a.b."c.d"`.
 */
function parseKeyPath(rawKey: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inDouble = false;
  let inSingle = false;
  let escaped = false;

  const trimmed = rawKey.trim();
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];

    if (inDouble) {
      if (escaped) {
        current += ch;
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inDouble = false;
      } else {
        current += ch;
      }
    } else if (inSingle) {
      if (ch === "'") {
        inSingle = false;
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inDouble = true;
      } else if (ch === "'") {
        inSingle = true;
      } else if (ch === '.') {
        parts.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }

  if (current.trim().length > 0 || parts.length > 0) {
    parts.push(current.trim());
  }

  // Sanitize parts to prevent prototype pollution
  return parts.filter((p) => p !== '__proto__' && p !== 'prototype' && p !== 'constructor');
}

/**
 * Parses a single TOML primitive value, inline array, or inline table.
 */
function parseTomlValue(rawVal: string): TomlValue {
  const trimmed = rawVal.trim();
  if (trimmed === '') {
    return '';
  }

  // Boolean
  if (trimmed === 'true') {
    return true;
  }
  if (trimmed === 'false') {
    return false;
  }

  // Strings: Multi-line / Basic strings ("""...""", "...", '''...''', '...')
  if (trimmed.startsWith('"""') && trimmed.endsWith('"""') && trimmed.length >= 6) {
    return trimmed.slice(3, -3);
  }
  if (trimmed.startsWith("'''") && trimmed.endsWith("'''") && trimmed.length >= 6) {
    return trimmed.slice(3, -3);
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }

  // Inline array: [ ... ]
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) {
      return [];
    }
    const elements = splitInlineArrayOrTable(inner, ',');
    return elements.map((elem) => parseTomlValue(elem));
  }

  // Inline table: { ... }
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const inner = trimmed.slice(1, -1).trim();
    const result: { [key: string]: TomlValue } = Object.create(null);
    if (!inner) {
      return result;
    }
    const pairs = splitInlineArrayOrTable(inner, ',');
    for (const pair of pairs) {
      const eqIdx = findUnquotedEquals(pair);
      if (eqIdx !== -1) {
        const k = pair.slice(0, eqIdx).trim();
        const v = pair.slice(eqIdx + 1).trim();
        const keyParts = parseKeyPath(k);
        if (keyParts.length > 0) {
          result[keyParts[0]] = parseTomlValue(v);
        }
      }
    }
    return result;
  }

  // Numbers: integers, floats, hex, oct, bin
  const cleanNum = trimmed.replace(/_/g, '');
  if (/^[+-]?(0x[0-9a-fA-F]+)$/.test(cleanNum)) {
    return parseInt(cleanNum, 16);
  }
  if (/^[+-]?(0o[0-7]+)$/.test(cleanNum)) {
    return parseInt(cleanNum.replace('0o', ''), 8);
  }
  if (/^[+-]?(0b[01]+)$/.test(cleanNum)) {
    return parseInt(cleanNum.replace('0b', ''), 2);
  }
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(cleanNum)) {
    const num = Number(cleanNum);
    if (!Number.isNaN(num)) {
      return num;
    }
  }

  // Date / Time ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    return trimmed;
  }

  // Default fallback string
  return trimmed;
}

/**
 * Splits comma-separated items inside inline arrays or tables, respecting quotes and nested brackets.
 */
function splitInlineArrayOrTable(content: string, separator: string): string[] {
  const items: string[] = [];
  let current = '';
  let inDouble = false;
  let inSingle = false;
  let escaped = false;
  let bracketDepth = 0;
  let braceDepth = 0;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];

    if (inDouble) {
      current += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inDouble = false;
      }
    } else if (inSingle) {
      current += ch;
      if (ch === "'") {
        inSingle = false;
      }
    } else {
      if (ch === '"') {
        inDouble = true;
        current += ch;
      } else if (ch === "'") {
        inSingle = true;
        current += ch;
      } else if (ch === '[') {
        bracketDepth++;
        current += ch;
      } else if (ch === ']') {
        bracketDepth--;
        current += ch;
      } else if (ch === '{') {
        braceDepth++;
        current += ch;
      } else if (ch === '}') {
        braceDepth--;
        current += ch;
      } else if (ch === separator && bracketDepth === 0 && braceDepth === 0) {
        if (current.trim().length > 0) {
          items.push(current.trim());
        }
        current = '';
      } else {
        current += ch;
      }
    }
  }

  if (current.trim().length > 0) {
    items.push(current.trim());
  }

  return items;
}

/**
 * Finds index of '=' not inside quotes.
 */
function findUnquotedEquals(line: string): number {
  let inDouble = false;
  let inSingle = false;
  let escaped = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inDouble) {
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inDouble = false;
      }
    } else if (inSingle) {
      if (ch === "'") {
        inSingle = false;
      }
    } else {
      if (ch === '"') {
        inDouble = true;
      } else if (ch === "'") {
        inSingle = true;
      } else if (ch === '=') {
        return i;
      }
    }
  }
  return -1;
}

/**
 * Parses raw TOML content into a nested JavaScript object structure deterministically.
 */
export function parseTomlToObject(content: string): { [key: string]: any } {
  const root: { [key: string]: any } = Object.create(null);
  const lines = content.split(/\r?\n/);

  let currentTarget: { [key: string]: any } = root;
  let multilineBuffer = '';
  let inMultiline = false;
  let multilineKey = '';

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const rawLine = lines[lineIdx];

    // Handle multiline array / value continuation
    if (inMultiline) {
      const stripped = stripLineComment(rawLine).trim();
      multilineBuffer += ' ' + stripped;
      const bracketCount = (multilineBuffer.match(/\[/g) || []).length;
      const closeBracketCount = (multilineBuffer.match(/\]/g) || []).length;
      if (bracketCount <= closeBracketCount) {
        inMultiline = false;
        const keyParts = parseKeyPath(multilineKey);
        assignKeyPath(currentTarget, keyParts, parseTomlValue(multilineBuffer));
        multilineBuffer = '';
        multilineKey = '';
      }
      continue;
    }

    const line = stripLineComment(rawLine).trim();
    if (!line) {
      continue;
    }

    // 1. Array of Tables: [[table.name]]
    if (line.startsWith('[[') && line.endsWith(']]')) {
      const tablePathStr = line.slice(2, -2).trim();
      const pathParts = parseKeyPath(tablePathStr);
      if (pathParts.length === 0) {
        continue;
      }

      let cur = root;
      for (let i = 0; i < pathParts.length - 1; i++) {
        const part = pathParts[i];
        if (!cur[part] || typeof cur[part] !== 'object') {
          cur[part] = Object.create(null);
        }
        cur = cur[part];
      }

      const lastPart = pathParts[pathParts.length - 1];
      if (!Array.isArray(cur[lastPart])) {
        cur[lastPart] = [];
      }

      const newTableItem = Object.create(null);
      cur[lastPart].push(newTableItem);
      currentTarget = newTableItem;
      continue;
    }

    // 2. Standard Table: [table.name]
    if (line.startsWith('[') && line.endsWith(']')) {
      const tablePathStr = line.slice(1, -1).trim();
      const pathParts = parseKeyPath(tablePathStr);
      if (pathParts.length === 0) {
        continue;
      }

      let cur = root;
      for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        if (!cur[part] || typeof cur[part] !== 'object' || Array.isArray(cur[part])) {
          cur[part] = Object.create(null);
        }
        cur = cur[part];
      }
      currentTarget = cur;
      continue;
    }

    // 3. Key-Value Pair: key = value
    const eqIdx = findUnquotedEquals(line);
    if (eqIdx !== -1) {
      const rawKey = line.slice(0, eqIdx).trim();
      const rawVal = line.slice(eqIdx + 1).trim();

      // Check if multiline array opening without matching close
      if (rawVal.startsWith('[') && !rawVal.endsWith(']')) {
        inMultiline = true;
        multilineKey = rawKey;
        multilineBuffer = rawVal;
        continue;
      }

      const keyParts = parseKeyPath(rawKey);
      if (keyParts.length > 0) {
        assignKeyPath(currentTarget, keyParts, parseTomlValue(rawVal));
      }
    }
  }

  return root;
}

/**
 * Assigns a value at dotted key path in an object.
 */
function assignKeyPath(target: Record<string, any>, pathParts: string[], value: any): void {
  let cur = target;
  for (let i = 0; i < pathParts.length - 1; i++) {
    const part = pathParts[i];
    if (!cur[part] || typeof cur[part] !== 'object' || Array.isArray(cur[part])) {
      cur[part] = Object.create(null);
    }
    cur = cur[part];
  }
  cur[pathParts[pathParts.length - 1]] = value;
}

/**
 * Infers ValueType for scalar primitives.
 */
function inferValueType(val: unknown): ValueType {
  if (val === null || val === undefined) {
    return 'null';
  }
  const t = typeof val;
  if (t === 'string') return 'string';
  if (t === 'number') return 'number';
  if (t === 'boolean') return 'boolean';
  return 'string';
}

/**
 * Converts a parsed TOML object or value to StructNode hierarchy deterministically.
 */
export function convertTomlValueToNode(
  val: any,
  name: string,
  parentPath: string[],
  createId: () => string,
  maxArrayItems: number = 50
): StructNode {
  const currentPath = [...parentPath, name];

  if (val === null || val === undefined || (typeof val !== 'object' && !Array.isArray(val))) {
    return {
      id: createId(),
      name,
      path: currentPath,
      nodeType: 'value',
      valueType: inferValueType(val),
      value: val as any,
      children: [],
    };
  }

  if (Array.isArray(val)) {
    const children: StructNode[] = [];
    const len = val.length;

    if (len <= maxArrayItems) {
      for (let i = 0; i < len; i++) {
        children.push(
          convertTomlValueToNode(val[i], `[${i}]`, currentPath, createId, maxArrayItems)
        );
      }
    } else {
      for (let i = 0; i < maxArrayItems; i++) {
        children.push(
          convertTomlValueToNode(val[i], `[${i}]`, currentPath, createId, maxArrayItems)
        );
      }
      const rangeName = `[${maxArrayItems} .. ${len - 1}]`;
      const rangePath = [...currentPath, rangeName];
      const rangeChildren: StructNode[] = [];
      for (let i = maxArrayItems; i < len; i++) {
        rangeChildren.push(
          convertTomlValueToNode(val[i], `[${i}]`, rangePath, createId, maxArrayItems)
        );
      }
      children.push({
        id: createId(),
        name: rangeName,
        path: rangePath,
        nodeType: 'array',
        children: rangeChildren,
        isRange: true,
      });
    }

    return {
      id: createId(),
      name,
      path: currentPath,
      nodeType: 'array',
      children,
    };
  }

  // Object / Table
  const children: StructNode[] = [];
  const entries = Object.entries(val);
  for (const [childKey, childVal] of entries) {
    children.push(
      convertTomlValueToNode(childVal, childKey, currentPath, createId, maxArrayItems)
    );
  }

  return {
    id: createId(),
    name,
    path: currentPath,
    nodeType: 'object',
    children,
  };
}

/**
 * Parses raw TOML text directly into a StructNode root representation.
 *
 * @param content Raw TOML text content.
 * @param fileName Display name for root node (default: 'root').
 * @param maxArrayItems Maximum array items before chunking.
 * @returns StructNode root node.
 */
export function parseTomlToStructNode(
  content: string,
  fileName: string = 'root',
  maxArrayItems: number = 50
): StructNode {
  let idCounter = 0;
  const createId = () => `node-${idCounter++}`;
  const rootPath = [fileName];

  const parsedObj = parseTomlToObject(content);
  const rootNode: StructNode = {
    id: createId(),
    name: fileName,
    path: rootPath,
    nodeType: 'root',
    children: [],
  };

  for (const [key, val] of Object.entries(parsedObj)) {
    rootNode.children.push(
      convertTomlValueToNode(val, key, rootPath, createId, maxArrayItems)
    );
  }

  return rootNode;
}

/**
 * TomlParser implements the Core parser interface for TOML documents.
 */
export class TomlParser {
  /**
   * Parses TOML string content into ParseResult (ParseSuccess or ParseError).
   *
   * @param content Raw TOML string.
   * @param fileName File name for the root node.
   * @param maxArrayItems Maximum array items to render directly.
   * @returns ParseResult with StructTree on success, or ParseError on failure.
   */
  public parse(
    content: string,
    fileName: string = 'root',
    maxArrayItems: number = 50
  ): ParseResult {
    try {
      const rootNode = parseTomlToStructNode(content, fileName, maxArrayItems);
      const tree: StructTree = {
        sourceFormat: 'toml',
        root: rootNode,
      };
      return createParseSuccess(tree);
    } catch (err: any) {
      return createParseError(
        ParseErrorCode.TOML_PARSE_ERROR,
        `TOML Parse Error: ${err.message || String(err)}`
      );
    }
  }
}
