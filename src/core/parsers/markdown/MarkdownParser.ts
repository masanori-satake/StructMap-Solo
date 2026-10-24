import { StructNode, StructTree } from '../../model';
import { FrontmatterParser } from './FrontmatterParser';

/**
 * Options for parsing Markdown content.
 */
export interface MarkdownParseOptions {
  /** Optional custom file name for the root node. Defaults to 'root'. */
  fileName?: string;
}

/**
 * Extracts YAML frontmatter content and body lines from raw markdown lines if frontmatter is present.
 */
function extractFrontmatter(lines: string[]): { yamlContent: string; bodyLines: string[] } | null {
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
    return null;
  }

  const yamlContent = lines.slice(1, closingIndex).join('\n');
  const bodyLines = lines.slice(closingIndex + 1);

  return { yamlContent, bodyLines };
}

/**
 * Parser that converts Markdown heading hierarchy (and optional YAML Frontmatter) into a StructTree structure.
 */
export class MarkdownParser {
  private frontmatterParser = new FrontmatterParser();

  /**
   * Parses Markdown source text and returns a StructTree representation of heading hierarchy and frontmatter.
   *
   * @param content Markdown text content.
   * @param fileName File name to be set as the root node name.
   * @returns Generated StructTree containing document sections.
   */
  public parse(content: string, fileName: string = 'root'): StructTree {
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

    let bodyLines = lines;
    const stack: { node: StructNode; level: number }[] = [];

    if (frontmatterResult) {
      const frontmatterPath = [...rootNode.path, 'Frontmatter (YAML)'];
      const frontmatterChildren = this.frontmatterParser.parse(
        frontmatterResult.yamlContent,
        frontmatterPath,
        () => `node-${idCounter++}`
      );

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
      const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);

      if (codeFence) {
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

    return {
      sourceFormat: 'markdown',
      root: rootNode
    };
  }
}
