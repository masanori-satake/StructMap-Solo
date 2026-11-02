import {
  createParseError,
  createParseSuccess,
  ParseErrorCode,
  ParseResult
} from '../../errors';
import { StructNode, StructTree } from '../../model';
import { convertObjectToStructTree } from '../common/objectConverter';

interface ParsedLine {
  lineNum: number;
  node: StructNode;
}

/**
 * Creates a range node representing a subset of line items [Line X .. Line Y].
 */
function createRangeNode(
  items: ParsedLine[],
  startIdx: number,
  endIdx: number,
  parentPath: string[],
  createId: () => string,
  maxArrayItems: number
): StructNode {
  const startLine = items[startIdx].lineNum;
  const endLine = items[endIdx].lineNum;
  const rangeName = `[Line ${startLine} .. Line ${endLine}]`;
  const currentPath = [...parentPath, rangeName];
  const count = endIdx - startIdx + 1;

  const children: StructNode[] = [];

  if (count <= maxArrayItems) {
    for (let i = startIdx; i <= endIdx; i++) {
      const itemNode = items[i].node;
      itemNode.path = [...currentPath, itemNode.name];
      updateChildPaths(itemNode, currentPath);
      children.push(itemNode);
    }
  } else {
    const step =
      maxArrayItems <= 1
        ? 1
        : Math.max(
            1,
            Math.pow(
              maxArrayItems,
              Math.max(1, Math.ceil(Math.log(count) / Math.log(maxArrayItems)) - 1)
            )
          );

    for (let s = startIdx; s <= endIdx; s += step) {
      const e = Math.min(s + step - 1, endIdx);
      if (s === e) {
        const itemNode = items[s].node;
        itemNode.path = [...currentPath, itemNode.name];
        updateChildPaths(itemNode, currentPath);
        children.push(itemNode);
      } else {
        children.push(
          createRangeNode(items, s, e, currentPath, createId, maxArrayItems)
        );
      }
    }
  }

  return {
    id: createId(),
    name: rangeName,
    path: currentPath,
    nodeType: 'array',
    children,
    isRange: true
  };
}

function updateChildPaths(node: StructNode, parentPath: string[]): void {
  const currentPath = [...parentPath, node.name];
  node.path = currentPath;
  for (const child of node.children) {
    updateChildPaths(child, currentPath);
  }
}

/**
 * Parser that converts NDJSON (Newline Delimited JSON) content into a StructTree structure or ParseError.
 */
export class NdjsonParser {
  /**
   * Parses NDJSON text content into a ParseResult representation.
   *
   * @param content Raw NDJSON string.
   * @param fileName File name to be set as the root node name.
   * @param maxArrayItems Maximum number of line items to display directly before chunking.
   * @returns Generated ParseResult (ParseSuccess containing StructTree or ParseError).
   */
  public parse(
    content: string,
    fileName: string = 'root',
    maxArrayItems: number = 50
  ): ParseResult {
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
    const parsedLines: ParsedLine[] = [];

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const trimmed = rawLine.trim();
      const lineNum = i + 1; // 1-based physical line number

      if (!trimmed) {
        continue; // Skip empty lines safely
      }

      let parsedObj: unknown;
      try {
        parsedObj = JSON.parse(trimmed);
      } catch (err) {
        const rawMessage = err instanceof Error ? err.message : String(err);
        return createParseError(
          ParseErrorCode.NDJSON_PARSE_ERROR,
          `NDJSON Parse Error at line ${lineNum}: ${rawMessage}`,
          lineNum
        );
      }

      // Convert the parsed line into a StructTree / StructNode
      const lineNodeName = `Line ${lineNum}`;
      const lineTree = convertObjectToStructTree(
        parsedObj,
        lineNodeName,
        'ndjson',
        maxArrayItems
      );

      // Adapt line root node
      const lineNode = lineTree.root;
      lineNode.id = createId();
      lineNode.path = [...rootPath, lineNodeName];
      lineNode.name = lineNodeName;
      if (parsedObj !== null && typeof parsedObj === 'object' && !Array.isArray(parsedObj)) {
        lineNode.nodeType = 'object';
      } else if (Array.isArray(parsedObj)) {
        lineNode.nodeType = 'array';
      } else {
        lineNode.nodeType = 'value';
      }

      updateChildPaths(lineNode, rootPath);
      parsedLines.push({ lineNum, node: lineNode });
    }

    const totalLines = parsedLines.length;
    if (totalLines > 0) {
      if (totalLines <= maxArrayItems) {
        for (const item of parsedLines) {
          rootNode.children.push(item.node);
        }
      } else {
        for (let i = 0; i < maxArrayItems; i++) {
          rootNode.children.push(parsedLines[i].node);
        }
        rootNode.children.push(
          createRangeNode(
            parsedLines,
            maxArrayItems,
            totalLines - 1,
            rootPath,
            createId,
            maxArrayItems
          )
        );
      }
    }

    const tree: StructTree = {
      sourceFormat: 'ndjson',
      root: rootNode
    };

    return createParseSuccess(tree);
  }
}
