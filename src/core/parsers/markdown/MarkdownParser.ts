import {
  createParseError,
  createParseSuccess,
  ParseErrorCode,
  ParseResult
} from '../../errors';
import { StructNode } from '../../model';
import { FrontmatterParser } from './FrontmatterParser';

/**
 * Options for parsing Markdown content.
 */
export interface MarkdownParseOptions {
  /** Optional custom file name for the root node. Defaults to 'root'. */
  fileName?: string;
}

type FrontmatterResult =
  | { type: 'found'; yamlContent: string; bodyLines: string[] }
  | { type: 'unclosed' }
  | null;

/**
 * Extracts YAML frontmatter content and body lines, or identifies an unclosed frontmatter block.
 */
function extractFrontmatter(lines: string[]): FrontmatterResult {
  if (lines.length === 0) {
    return null;
  }

  // Frontmatter must start on line 0 with '---'
  if (!/^---[ \t]*$/.test(lines[0])) {
    return null;
  }

  // Find closing delimiter '---' or '...' starting at line 1
  let closingIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (/^(---|Calculated:|\.\.\.)[ \t]*$/.test(lines[i]) || /^(---|\.\.\.)[ \t]*$/.test(lines[i])) {
      if (/^(---|\.\.\.)[ \t]*$/.test(lines[i])) {
        closingIndex = i;
        break;
      }
    }
  }

  if (closingIndex === -1) {
    return { type: 'unclosed' };
  }

  const yamlContent = lines.slice(1, closingIndex).join('\n');
  const bodyLines = lines.slice(closingIndex + 1);

  return { type: 'found', yamlContent, bodyLines };
}

/**
 * Extracts 1-based line and column number relative to the Markdown document for frontmatter errors.
 */
function extractFrontmatterErrorLocation(err: unknown): { line?: number; column?: number } {
  if (err && typeof err === 'object' && 'mark' in err && err.mark) {
    const mark = (err as { mark: { line?: unknown; column?: unknown } }).mark;
    const line = typeof mark.line === 'number' ? mark.line + 2 : undefined;
    const column = typeof mark.column === 'number' ? mark.column + 1 : undefined;
    return { line, column };
  }
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    const match = err.message.match(/\((\d+):(\d+)\)/);
    if (match) {
      const relativeLine = parseInt(match[1], 10);
      const relativeCol = parseInt(match[2], 10);
      return { line: relativeLine + 1, column: relativeCol };
    }
  }
  return {};
}

/**
 * Parser that converts Markdown heading hierarchy (and optional YAML Frontmatter) into a StructTree structure or ParseError.
 */
export class MarkdownParser {
  private frontmatterParser = new FrontmatterParser();

  /**
   * Parses Markdown source text and returns a ParseResult representation of heading hierarchy and frontmatter.
   *
   * @param content Markdown text content.
   * @param fileName File name to be set as the root node name.
   * @param maxArrayItems Maximum number of array items to display directly before chunking.
   * @returns Generated ParseResult (ParseSuccess containing StructTree or ParseError).
   */
  public parse(content: string, fileName: string = 'root', maxArrayItems: number = 50): ParseResult {
    try {
      let idCounter = 0;

      const rootNode: StructNode = {
        id: `node-${idCounter++}`,
        name: fileName,
        path: [fileName],
        nodeType: 'root',
        children: []
      };

      const lines = content.split(/\r?\n/);
      const frontmatterResult = extractFrontmatter(lines);

      if (frontmatterResult?.type === 'unclosed') {
        return createParseError(
          ParseErrorCode.FRONTMATTER_PARSE_ERROR,
          'Frontmatter Parse Error: Missing closing delimiter (--- or ...)',
          1,
          1
        );
      }

      let bodyLines = lines;
      const stack: { node: StructNode; level: number }[] = [];

      if (frontmatterResult) {
        let frontmatterChildren: StructNode[];
        const frontmatterPath = [...rootNode.path, 'Frontmatter (YAML)'];
        try {
          frontmatterChildren = this.frontmatterParser.parse(
            frontmatterResult.yamlContent,
            frontmatterPath,
            () => `node-${idCounter++}`,
            maxArrayItems
          );
        } catch (fmErr) {
          const location = extractFrontmatterErrorLocation(fmErr);
          const rawMsg = (fmErr as Error).message || '';
          const cleanMsg = rawMsg.replace(/^YAML frontmatter parse error:\s*/i, '');
          const message = cleanMsg ? `Frontmatter Parse Error: ${cleanMsg}` : 'Frontmatter Parse Error';
          return createParseError(
            ParseErrorCode.FRONTMATTER_PARSE_ERROR,
            message,
            location.line,
            location.column
          );
        }

        const frontmatterNode: StructNode = {
          id: `node-${idCounter++}`,
          name: 'Frontmatter (YAML)',
          path: frontmatterPath,
          nodeType: 'section',
          children: frontmatterChildren
        };

        const contentPath = [...rootNode.path, 'Content (Markdown)'];
        const contentNode: StructNode = {
          id: `node-${idCounter++}`,
          name: 'Content (Markdown)',
          path: contentPath,
          nodeType: 'section',
          children: []
        };

        rootNode.children.push(frontmatterNode, contentNode);
        stack.push({ node: contentNode, level: 0 });
        bodyLines = frontmatterResult.bodyLines;
      } else {
        stack.push({ node: rootNode, level: 0 });
      }

      let codeFence: string | undefined;

      for (const line of bodyLines) {
        // Fast-path: When outside a code fence, skip lines that cannot start a code fence or ATX heading.
        // ATX headings and code fences permit 0 to 3 leading spaces/tabs.
        if (codeFence) {
          const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
          if (
            fenceMatch &&
            fenceMatch[1][0] === codeFence[0] &&
            fenceMatch[1].length >= codeFence.length &&
            /^[ \t]*$/.test(line.slice(fenceMatch[0].length))
          ) {
            codeFence = undefined;
          }
          continue;
        }

        let startIdx = 0;
        const lineLen = line.length;
        while (
          startIdx < lineLen &&
          startIdx < 4 &&
          (line.charCodeAt(startIdx) === 32 || line.charCodeAt(startIdx) === 9)
        ) {
          startIdx++;
        }

        if (startIdx < lineLen) {
          const ch = line.charCodeAt(startIdx);
          // Character codes: '#' is 35, '`' is 96, '~' is 126
          if (ch !== 35 && ch !== 96 && ch !== 126) {
            continue;
          }
        }

        const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);

        if (
          fenceMatch &&
          (fenceMatch[1][0] !== '`' || !line.slice(fenceMatch[0].length).includes('`'))
        ) {
          codeFence = fenceMatch[1];
          continue;
        }

        // ATX heading regex: up to 3 leading spaces, 1-6 hashes, optional whitespace and title text
        const headingMatch = line.match(/^ {0,3}(#{1,6})(?:\s+(.*?))?$/);
        if (!headingMatch) {
          continue;
        }

        const hashes = headingMatch[1];
        const level = hashes.length;
        let rawTitle = headingMatch[2] ?? '';

        // Strip optional trailing # sequence preceded by whitespace (e.g., "## Title ##")
        rawTitle = rawTitle.replace(/(?:\s+#+)+$/, '').trim();

        // Pop stack to find parent heading level
        while (stack.length > 0 && stack[stack.length - 1].level >= level) {
          stack.pop();
        }

        const parent = stack[stack.length - 1].node;

        const newNode: StructNode = {
          id: `node-${idCounter++}`,
          name: rawTitle,
          path: [...parent.path, rawTitle],
          nodeType: 'section',
          children: []
        };

        parent.children.push(newNode);
        stack.push({ node: newNode, level });
      }

      return createParseSuccess({
        sourceFormat: 'markdown',
        root: rootNode
      });
    } catch (err) {
      const rawMsg = (err as Error).message || '';
      return createParseError(
        ParseErrorCode.PARSE_ERROR,
        rawMsg ? `Parse Error: ${rawMsg}` : 'Parse Error'
      );
    }
  }
}
