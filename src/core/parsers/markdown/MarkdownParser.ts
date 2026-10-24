import { StructNode, StructTree } from '../../model';

/**
 * Options for parsing Markdown content.
 */
export interface MarkdownParseOptions {
  /** Optional custom file name for the root node. Defaults to 'root'. */
  fileName?: string;
}

/**
 * Parser that converts Markdown heading hierarchy into a StructTree structure.
 */
export class MarkdownParser {
  /**
   * Parses Markdown source text and returns a StructTree representation of heading hierarchy.
   *
   * @param content Markdown text content.
   * @param fileName File name to be set as the root node name.
   * @returns Generated StructTree containing heading sections.
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

    const stack: { node: StructNode; level: number }[] = [
      { node: rootNode, level: 0 }
    ];

    const lines = content.split(/\r?\n/);
    let codeFence: string | undefined;

    for (const line of lines) {
      const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);

      if (codeFence) {
        if (fenceMatch && fenceMatch[1][0] === codeFence[0]
          && fenceMatch[1].length >= codeFence.length
          && /^[ \t]*$/.test(line.slice(fenceMatch[0].length))) {
          codeFence = undefined;
        }
        continue;
      }

      if (fenceMatch && (fenceMatch[1][0] !== '`'
        || !line.slice(fenceMatch[0].length).includes('`'))) {
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
