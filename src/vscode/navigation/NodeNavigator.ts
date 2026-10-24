import * as vscode from 'vscode';
import { Node, parseTree } from 'jsonc-parser';
import { StructNode } from '../../core';

/**
 * Service responsible for locating and navigating to document positions corresponding to StructNodes.
 */
export class NodeNavigator {
  /**
   * Jumps to the document location corresponding to the specified StructNode in the given editor.
   *
   * @param editor The active text editor.
   * @param node The StructNode to jump to.
   * @returns true if jump succeeded, false if position could not be found or jump failed.
   */
  public jumpToNode(editor: vscode.TextEditor, node: StructNode): boolean {
    try {
      if (!editor || !editor.document || !node) {
        return false;
      }

      const position = this.findNodePosition(editor.document, node);
      if (!position) {
        return false;
      }

      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(
        new vscode.Range(position, position),
        vscode.TextEditorRevealType.InCenter
      );
      return true;
    } catch {
      // Ensure failure never crashes extension or breaks TreeView
      return false;
    }
  }

  /**
   * Finds the line and column position of a StructNode within a TextDocument.
   */
  public findNodePosition(
    document: vscode.TextDocument,
    node: StructNode
  ): vscode.Position | undefined {
    const text = document.getText();
    const fileName = document.fileName.toLowerCase();
    const langId = document.languageId.toLowerCase();

    if (fileName.endsWith('.json') || langId === 'json' || langId === 'jsonc') {
      return this.findJsonPosition(document, text, node);
    }

    if (
      fileName.endsWith('.yaml') ||
      fileName.endsWith('.yml') ||
      langId === 'yaml'
    ) {
      return this.findYamlPosition(text, node);
    }

    if (
      fileName.endsWith('.md') ||
      fileName.endsWith('.markdown') ||
      langId === 'markdown'
    ) {
      return this.findMarkdownPosition(text, node);
    }

    // Default fallback try markdown then json then yaml
    return (
      this.findMarkdownPosition(text, node) ||
      this.findJsonPosition(document, text, node) ||
      this.findYamlPosition(text, node)
    );
  }

  /**
   * Finds position in a Markdown document.
   */
  private findMarkdownPosition(
    text: string,
    node: StructNode
  ): vscode.Position | undefined {
    const path = node.path;
    if (!path || path.length === 0) {
      return undefined;
    }

    // Root node
    if (path.length === 1) {
      return new vscode.Position(0, 0);
    }

    const lines = text.split(/\r?\n/);

    // Frontmatter check
    if (path.includes('Frontmatter (YAML)')) {
      if (node.name === 'Frontmatter (YAML)') {
        return new vscode.Position(0, 0);
      }
      // Search within frontmatter block
      for (let i = 1; i < lines.length; i++) {
        if (/^(---|\.\.\.)[ \t]*$/.test(lines[i])) {
          break; // end of frontmatter
        }
        const keyRegex = new RegExp(`^\\s*['"]?${this.escapeRegExp(node.name)}['"]?\\s*:`);
        if (keyRegex.test(lines[i])) {
          const col = lines[i].indexOf(node.name);
          return new vscode.Position(i, Math.max(0, col));
        }
      }
      return undefined;
    }

    // Heading search
    // Extract heading hierarchy (filter out file name and 'Content (Markdown)')
    const targetHeadingPath = path.slice(1).filter(
      (p) => p !== 'Content (Markdown)' && p !== 'Frontmatter (YAML)'
    );

    if (targetHeadingPath.length === 0) {
      return new vscode.Position(0, 0);
    }

    const headingStack: { level: number; title: string; line: number; col: number }[] = [];
    let codeFence: string | undefined;
    let fallbackPosition: vscode.Position | undefined;
    let inFrontmatter = /^---[ \t]*$/.test(lines[0]);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (inFrontmatter) {
        if (i > 0 && /^(---|\.\.\.)[ \t]*$/.test(line)) {
          inFrontmatter = false;
        }
        continue;
      }
      const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
      // Match MarkdownParser's opening and closing fence rules.
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

      const match = line.match(/^ {0,3}(#{1,6})(?:\s+(.*?))?$/);
      if (!match) {
        continue;
      }

      const level = match[1].length;
      let rawTitle = match[2] ?? '';
      rawTitle = rawTitle.replace(/(?:\s+#+)+$/, '').trim();

      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }

      const hashCol = line.indexOf('#');
      // Retain a fallback only from headings outside code fences.
      if (rawTitle === node.name && !fallbackPosition) {
        fallbackPosition = new vscode.Position(i, Math.max(0, hashCol));
      }
      headingStack.push({ level, title: rawTitle, line: i, col: Math.max(0, hashCol) });

      const currentPath = headingStack.map((h) => h.title);
      if (this.arraysEqual(currentPath, targetHeadingPath)) {
        return new vscode.Position(i, headingStack[headingStack.length - 1].col);
      }
    }

    return fallbackPosition;
  }

  /**
   * Finds position in a JSON document.
   */
  private findJsonPosition(
    document: vscode.TextDocument,
    text: string,
    node: StructNode
  ): vscode.Position | undefined {
    const targetKeys = node.path.slice(1);
    if (targetKeys.length === 0) {
      return new vscode.Position(0, 0);
    }

    let current: Node | undefined = parseTree(text);
    let offset = 0;
    for (const key of targetKeys) {
      if (current?.type === 'object') {
        // JSON.parse keeps the last occurrence of duplicate property names.
        const property: Node | undefined = current.children
          ?.filter(property => property.children?.[0].value === key).pop();
        const keyNode = property?.children?.[0];
        current = property?.children?.[1];
        if (!keyNode || !current) {
          return undefined;
        }
        offset = keyNode.offset;
      } else if (current?.type === 'array' && /^\[\d+\]$/.test(key)) {
        current = current.children?.[Number(key.slice(1, -1))];
        if (!current) {
          return undefined;
        }
        offset = current.offset;
      } else {
        return undefined;
      }
    }

    return document.positionAt(offset);
  }

  /**
   * Finds position in a YAML document.
   */
  private findYamlPosition(
    text: string,
    node: StructNode
  ): vscode.Position | undefined {
    const targetKeys = node.path.slice(1);
    if (targetKeys.length === 0) {
      return new vscode.Position(0, 0);
    }

    const lines = text.split(/\r?\n/);
    let currentLine = -1;
    let currentCol = 0;
    let parentIndent = -1;
    let parentIsArrayItem = false;
    let inlineColumn: number | undefined;

    for (const key of targetKeys) {
      const isArrayIndex = /^\[\d+\]$/.test(key);
      const targetIndex = isArrayIndex ? Number(key.slice(1, -1)) : -1;
      const keyRegex = new RegExp(`^['"]?${this.escapeRegExp(key)}['"]?\\s*:`);
      let childIndent: number | undefined;
      let itemIndex = -1;
      let foundLine = -1;
      let foundCol = 0;
      let nextInlineColumn: number | undefined;
      // Only an array item's inline content can be a child on the parent line.
      const startLine = inlineColumn === undefined ? currentLine + 1 : currentLine;

      for (let i = startLine; i < lines.length; i++) {
        const col = i === currentLine && inlineColumn !== undefined
          ? inlineColumn : this.getIndent(lines[i]);
        const content = lines[i].slice(col);
        if (!content.trim() || content.startsWith('#')) {
          continue;
        }
        const arrayItem = content.match(/^-(?:[ \t]+|$)/);
        if (i !== currentLine && (
          col < parentIndent ||
          (col === parentIndent && (parentIsArrayItem || !arrayItem))
        )) {
          break;
        }
        // The first child establishes the indentation of direct children.
        childIndent ??= col;
        if (col !== childIndent) {
          continue;
        }

        if (isArrayIndex) {
          if (!arrayItem || ++itemIndex !== targetIndex) {
            continue;
          }
          const contentColumn = col + arrayItem[0].length;
          if (/^[^#\s].*?:(?:[ \t]|$)/.test(lines[i].slice(contentColumn))) {
            nextInlineColumn = contentColumn;
          }
        } else if (arrayItem || !keyRegex.test(content)) {
          continue;
        }

        foundLine = i;
        foundCol = col;
        break;
      }

      if (foundLine === -1) {
        return undefined;
      }
      currentLine = foundLine;
      currentCol = foundCol;
      parentIndent = foundCol;
      parentIsArrayItem = isArrayIndex;
      inlineColumn = nextInlineColumn;
    }

    const keyCol = lines[currentLine].indexOf(node.name, currentCol);
    return new vscode.Position(currentLine, keyCol < 0 ? currentCol : keyCol);
  }

  private getIndent(line: string): number {
    const match = line.match(/^(\s*)/);
    return match ? match[1].length : 0;
  }

  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }
}
