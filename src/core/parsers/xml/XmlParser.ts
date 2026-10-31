import {
  createParseError,
  createParseSuccess,
  ParseErrorCode,
  ParseResult
} from '../../errors';
import { StructNode, StructTree, ValueType } from '../../model';

interface XmlElement {
  tag: string;
  attributes: Record<string, string>;
  children: (XmlElement | XmlText)[];
  offset: number;
}

interface XmlParseInternalError extends Error {
  line?: number;
  column?: number;
}

interface XmlText {
  text: string;
}

function isXmlElement(node: XmlElement | XmlText): node is XmlElement {
  return 'tag' in node;
}

/**
 * Calculates 1-based line and column numbers from character offset.
 */
function getLineAndColFromOffset(
  content: string,
  offset: number
): { line: number; column: number } {
  const safeIdx = Math.max(0, Math.min(offset, content.length));
  const textBefore = content.slice(0, safeIdx);
  const lines = textBefore.split('\n');
  const line = lines.length;
  const column = lines[lines.length - 1].length + 1;
  return { line, column };
}

/**
 * Parses XML attributes from a string like: id="1" name="foo" bar='baz'
 */
function parseAttributes(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  // XML Name: [^\s=/>]+ supporting dots, colons, hyphens, and non-ASCII Unicode characters
  const attrRegex = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gu;
  let match: RegExpExecArray | null;
  while ((match = attrRegex.exec(attrString)) !== null) {
    const key = match[1];
    const val = match[2] ?? match[3] ?? match[4] ?? '';
    attrs[key] = decodeXmlEntities(val);
  }
  return attrs;
}

/**
 * Decodes standard XML entities.
 */
function decodeXmlEntities(str: string): string {
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Checks if a trimmed string represents a finite number whose string form matches exactly.
 */
function isExactNumeric(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed === '') return false;
  const num = Number(trimmed);
  return Number.isFinite(num) && String(num) === trimmed;
}

/**
 * Infers ValueType from text content for showTypes.
 */
function inferValueType(text: string): ValueType {
  const trimmed = text.trim();
  if (trimmed === 'true' || trimmed === 'false') {
    return 'boolean';
  }
  if (isExactNumeric(trimmed)) {
    return 'number';
  }
  return 'string';
}

/**
 * Formats primitive value from text content.
 */
function formatValue(text: string): string | number | boolean {
  const trimmed = text.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (isExactNumeric(trimmed)) {
    return Number(trimmed);
  }
  return text;
}

/**
 * Lightweight, zero-dependency Vanilla JS XML Parser for StructMap-Solo.
 */
export class XmlParser {
  /**
   * Parses XML content string into a StructTree or ParseError.
   *
   * @param content Raw XML string.
   * @param fileName File name for the root node.
   * @param _maxArrayItems Array chunking parameter (unused for pure XML hierarchies).
   * @returns ParseResult with StructTree on success, or ParseError on failure.
   */
  public parse(
    content: string,
    fileName: string = 'root',
    _maxArrayItems: number = 50
  ): ParseResult {
    void _maxArrayItems;
    try {
      const rootElements = this.tokenizeAndBuildTree(content);
      if (rootElements.length === 0) {
        return createParseError(
          ParseErrorCode.XML_PARSE_ERROR,
          'XML Parse Error: No root element found'
        );
      }

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

      for (const el of rootElements) {
        const node = this.convertElementToStructNode(el, rootPath, createId);
        rootNode.children.push(node);
      }

      const tree: StructTree = {
        sourceFormat: 'xml',
        root: rootNode
      };

      return createParseSuccess(tree);
    } catch (err) {
      const parseErr = err as XmlParseInternalError;
      return createParseError(
        ParseErrorCode.XML_PARSE_ERROR,
        parseErr.message || 'XML Parse Error',
        parseErr.line,
        parseErr.column
      );
    }
  }

  /**
   * Tokenizes XML and constructs an AST of elements and text.
   */
  private tokenizeAndBuildTree(content: string): XmlElement[] {
    const rootNodes: XmlElement[] = [];
    const stack: XmlElement[] = [];

    let cursor = 0;
    const len = content.length;

    while (cursor < len) {
      const nextLt = content.indexOf('<', cursor);

      if (nextLt === -1) {
        // Trailing text
        const text = content.slice(cursor).trim();
        if (text && stack.length > 0) {
          stack[stack.length - 1].children.push({
            text: decodeXmlEntities(text)
          });
        }
        break;
      }

      if (nextLt > cursor) {
        // Text between tags
        const text = content.slice(cursor, nextLt).trim();
        if (text && stack.length > 0) {
          stack[stack.length - 1].children.push({
            text: decodeXmlEntities(text)
          });
        }
      }

      cursor = nextLt;

      // Check for XML processing instructions (<?xml ... ?>)
      if (content.startsWith('<?', cursor)) {
        const closeIdx = content.indexOf('?>', cursor);
        if (closeIdx === -1) {
          const { line, column } = getLineAndColFromOffset(content, cursor);
          const err = new Error('Unclosed XML declaration or processing instruction') as XmlParseInternalError;
          err.line = line;
          err.column = column;
          throw err;
        }
        cursor = closeIdx + 2;
        continue;
      }

      // Check for XML comments (<!-- ... -->)
      if (content.startsWith('<!--', cursor)) {
        const closeIdx = content.indexOf('-->', cursor);
        if (closeIdx === -1) {
          const { line, column } = getLineAndColFromOffset(content, cursor);
          const err = new Error('Unclosed XML comment') as XmlParseInternalError;
          err.line = line;
          err.column = column;
          throw err;
        }
        cursor = closeIdx + 3;
        continue;
      }

      // Check for CDATA (<![CDATA[ ... ]]>)
      if (content.startsWith('<![CDATA[', cursor)) {
        const closeIdx = content.indexOf(']]>', cursor);
        if (closeIdx === -1) {
          const { line, column } = getLineAndColFromOffset(content, cursor);
          const err = new Error('Unclosed CDATA section') as XmlParseInternalError;
          err.line = line;
          err.column = column;
          throw err;
        }
        const cdataText = content.slice(cursor + 9, closeIdx);
        if (stack.length > 0) {
          stack[stack.length - 1].children.push({
            text: cdataText
          });
        }
        cursor = closeIdx + 3;
        continue;
      }

      // Check for DOCTYPE or other <! declarations
      if (content.startsWith('<!', cursor)) {
        const closeIdx = this.findTagClosingBracket(content, cursor);
        if (closeIdx === -1) {
          const { line, column } = getLineAndColFromOffset(content, cursor);
          const err = new Error('Unclosed XML declaration') as XmlParseInternalError;
          err.line = line;
          err.column = column;
          throw err;
        }
        cursor = closeIdx + 1;
        continue;
      }

      // Closing tag: </tag>
      if (content.startsWith('</', cursor)) {
        const closeIdx = content.indexOf('>', cursor);
        if (closeIdx === -1) {
          const { line, column } = getLineAndColFromOffset(content, cursor);
          const err = new Error('Malformed closing tag') as XmlParseInternalError;
          err.line = line;
          err.column = column;
          throw err;
        }
        const closingTagName = content.slice(cursor + 2, closeIdx).trim();
        if (stack.length === 0) {
          const { line, column } = getLineAndColFromOffset(content, cursor);
          const err = new Error(`Unexpected closing tag: </${closingTagName}>`) as XmlParseInternalError;
          err.line = line;
          err.column = column;
          throw err;
        }
        const top = stack.pop()!;
        if (top.tag !== closingTagName) {
          const { line, column } = getLineAndColFromOffset(content, cursor);
          const err = new Error(
            `Mismatched closing tag: expected </${top.tag}>, found </${closingTagName}>`
          ) as XmlParseInternalError;
          err.line = line;
          err.column = column;
          throw err;
        }
        cursor = closeIdx + 1;
        continue;
      }

      // Opening or self-closing tag: <tag attr="val"> or <tag attr="val" />
      // Ensure we ignore '>' inside attribute quotes
      const closeIdx = this.findTagClosingBracket(content, cursor);
      if (closeIdx === -1) {
        const { line, column } = getLineAndColFromOffset(content, cursor);
        const err = new Error('Unclosed tag') as XmlParseInternalError;
        err.line = line;
        err.column = column;
        throw err;
      }

      const tagContent = content.slice(cursor + 1, closeIdx).trim();
      const isSelfClosing = tagContent.endsWith('/');
      const cleanTagContent = isSelfClosing
        ? tagContent.slice(0, -1).trim()
        : tagContent;

      const spaceIdx = cleanTagContent.search(/\s/);
      const tagName = spaceIdx === -1
        ? cleanTagContent
        : cleanTagContent.slice(0, spaceIdx);
      const attrStr = spaceIdx === -1
        ? ''
        : cleanTagContent.slice(spaceIdx + 1);

      if (!tagName || !/^[^\s/<>=\0]+$/u.test(tagName)) {
        const { line, column } = getLineAndColFromOffset(content, cursor);
        const err = new Error(`Invalid tag name: <${tagName}>`) as XmlParseInternalError;
        err.line = line;
        err.column = column;
        throw err;
      }

      const element: XmlElement = {
        tag: tagName,
        attributes: parseAttributes(attrStr),
        children: [],
        offset: cursor
      };

      if (stack.length > 0) {
        stack[stack.length - 1].children.push(element);
      } else {
        rootNodes.push(element);
      }

      if (!isSelfClosing) {
        stack.push(element);
      }

      cursor = closeIdx + 1;
    }

    if (stack.length > 0) {
      const unclosed = stack[stack.length - 1];
      const { line, column } = getLineAndColFromOffset(content, unclosed.offset);
      const err = new Error(`Unclosed tag: <${unclosed.tag}>`) as XmlParseInternalError;
      err.line = line;
      err.column = column;
      throw err;
    }

    return rootNodes;
  }

  /**
   * Finds the closing bracket '>' of an XML tag, ignoring '>' inside quotes.
   */
  private findTagClosingBracket(content: string, startIdx: number): number {
    let inQuote: string | null = null;
    const len = content.length;
    for (let i = startIdx; i < len; i++) {
      const ch = content[i];
      if (inQuote !== null) {
        if (ch === inQuote) {
          inQuote = null;
        }
      } else {
        if (ch === '"' || ch === "'") {
          inQuote = ch;
        } else if (ch === '>') {
          return i;
        }
      }
    }
    return -1;
  }

  /**
   * Converts an XmlElement AST node to a StructNode.
   */
  private convertElementToStructNode(
    element: XmlElement,
    parentPath: string[],
    createId: () => string
  ): StructNode {
    const currentPath = [...parentPath, element.tag];
    const attributeKeys = Object.keys(element.attributes);
    const hasAttributes = attributeKeys.length > 0;

    const childElements = element.children.filter(isXmlElement);
    const childTexts = element.children.filter((c): c is XmlText => !isXmlElement(c));

    // Case 1: Pure text element (no child elements, no attributes, exactly one or contiguous text)
    if (!hasAttributes && childElements.length === 0 && childTexts.length > 0) {
      const fullText = childTexts.map((t) => t.text).join(' ').trim();
      return {
        id: createId(),
        name: element.tag,
        path: currentPath,
        nodeType: 'value',
        valueType: inferValueType(fullText),
        value: formatValue(fullText),
        children: [],
        attributes: {}
      };
    }

    // Case 2: Element with attributes, child elements, and/or mixed text
    const children: StructNode[] = [];

    // Add attributes as virtual nodes: @attrName
    for (const attrKey of attributeKeys) {
      const attrVal = element.attributes[attrKey];
      children.push({
        id: createId(),
        name: `@${attrKey}`,
        path: [...currentPath, `@${attrKey}`],
        nodeType: 'value',
        valueType: inferValueType(attrVal),
        value: formatValue(attrVal),
        children: []
      });
    }

    // Process children deterministically in order of appearance
    for (const child of element.children) {
      if (isXmlElement(child)) {
        children.push(this.convertElementToStructNode(child, currentPath, createId));
      } else {
        const textVal = child.text.trim();
        if (textVal) {
          children.push({
            id: createId(),
            name: '#text',
            path: [...currentPath, '#text'],
            nodeType: 'value',
            valueType: inferValueType(textVal),
            value: formatValue(textVal),
            children: []
          });
        }
      }
    }

    return {
      id: createId(),
      name: element.tag,
      path: currentPath,
      nodeType: 'object',
      children,
      attributes: element.attributes
    };
  }
}
