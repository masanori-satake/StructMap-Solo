import * as vscode from 'vscode';
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

    if (
      fileName.endsWith('.json') ||
      langId === 'json' ||
      langId === 'jsonc' ||
      fileName.endsWith('.schema.json') ||
      node.path.some((p) => p.includes('[Definitions]') || p.includes('[Ref:'))
    ) {
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

    if (fileName.endsWith('.xml') || langId === 'xml') {
      return this.findXmlPosition(text, node);
    }

    // Default fallback try markdown then json then yaml then xml
    return (
      this.findMarkdownPosition(text, node) ||
      this.findJsonPosition(document, text, node) ||
      this.findYamlPosition(text, node) ||
      this.findXmlPosition(text, node)
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
      let frontmatterEndLine = -1;
      for (let i = 1; i < lines.length; i++) {
        if (/^(---|Calculated:|\.\.\.)[ \t]*$/.test(lines[i]) || /^(---|\.\.\.)[ \t]*$/.test(lines[i])) {
          if (/^(---|\.\.\.)[ \t]*$/.test(lines[i])) {
            frontmatterEndLine = i;
            break;
          }
        }
      }

      if (frontmatterEndLine > 1) {
        const fmText = lines.slice(1, frontmatterEndLine).join('\n');
        const fmIndex = node.path.indexOf('Frontmatter (YAML)');
        const fmNode: StructNode = {
          ...node,
          path: [node.path[0], ...node.path.slice(fmIndex + 1)]
        };
        const fmPos = this.findYamlPosition(fmText, fmNode);
        if (fmPos) {
          return new vscode.Position(fmPos.line + 1, fmPos.character);
        }
      }

      // Fallback search within frontmatter block for key regex
      const keyRegex = new RegExp(`^\\s*['"]?${this.escapeRegExp(node.name)}['"]?\\s*:`);
      for (let i = 1; i < lines.length; i++) {
        if (/^(---|Calculated:|\.\.\.)[ \t]*$/.test(lines[i]) || /^(---|\.\.\.)[ \t]*$/.test(lines[i])) {
          break; // end of frontmatter
        }
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

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Fast path: ATX headings permit 0..3 leading spaces followed by '#'
      let startIdx = 0;
      const lineLen = line.length;
      while (
        startIdx < lineLen &&
        startIdx < 4 &&
        (line.charCodeAt(startIdx) === 32 || line.charCodeAt(startIdx) === 9)
      ) {
        startIdx++;
      }
      if (startIdx >= lineLen || line.charCodeAt(startIdx) !== 35) {
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
      headingStack.push({ level, title: rawTitle, line: i, col: Math.max(0, hashCol) });

      const currentPath = headingStack.map((h) => h.title);
      if (this.arraysEqual(currentPath, targetHeadingPath)) {
        return new vscode.Position(i, headingStack[headingStack.length - 1].col);
      }
    }

    // Fallback: search for last heading matching node.name
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      let startIdx = 0;
      const lineLen = line.length;
      while (
        startIdx < lineLen &&
        startIdx < 4 &&
        (line.charCodeAt(startIdx) === 32 || line.charCodeAt(startIdx) === 9)
      ) {
        startIdx++;
      }
      if (startIdx >= lineLen || line.charCodeAt(startIdx) !== 35) {
        continue;
      }

      const match = line.match(/^ {0,3}(#{1,6})(?:\s+(.*?))?$/);
      if (match) {
        let rawTitle = match[2] ?? '';
        rawTitle = rawTitle.replace(/(?:\s+#+)+$/, '').trim();
        if (rawTitle === node.name) {
          const hashCol = lines[i].indexOf('#');
          return new vscode.Position(i, Math.max(0, hashCol));
        }
      }
    }

    return undefined;
  }

  /**
   * Finds position in a JSON document.
   */
  private findJsonPosition(
    document: vscode.TextDocument,
    text: string,
    node: StructNode
  ): vscode.Position | undefined {
    const rawKeys = node.path.slice(1);
    if (rawKeys.length === 0) {
      return new vscode.Position(0, 0);
    }

    const targetKeys: string[] = [];
    for (let i = 0; i < rawKeys.length; i++) {
      let keyItem = rawKeys[i];
      if (keyItem === '[Definitions]') {
        // May match 'definitions' or '$defs' in text
        keyItem = text.includes('"$defs"') ? '$defs' : 'definitions';
      }
      // Remove any ref badge: 'prop 🔗 [Ref: ...]' -> 'prop'
      keyItem = keyItem.replace(/\s*🔗\s*\[Ref:\s*[^\]]+\]/, '');
      const isRange = /^\[\d+\s*\.\.\s*\d+\]$/.test(keyItem);
      if (!isRange || i === rawKeys.length - 1) {
        targetKeys.push(keyItem);
      }
    }

    let cursor = 0;

    for (let k = 0; k < targetKeys.length; k++) {
      const key = targetKeys[k];

      const arrayMatch = key.match(/^\[(\d+)\]$/);
      const rangeMatch = key.match(/^\[(\d+)\s*\.\.\s*\d+\]$/);

      if (arrayMatch || rangeMatch) {
        // Array index like '[0]' or range like '[1 .. 999]'
        const idx = parseInt((arrayMatch || rangeMatch)![1], 10);
        const bracketPos = text.indexOf('[', cursor);
        if (bracketPos === -1) {
          return undefined;
        }

        let pos = bracketPos + 1;
        let elemCount = 0;

        while (pos < text.length && elemCount < idx) {
          pos = this.skipJsonValue(text, pos);
          // Skip whitespace/comma
          while (pos < text.length && /[\s,]/.test(text[pos])) {
            pos++;
          }
          elemCount++;
        }

        if (pos >= text.length) {
          return undefined;
        }

        // Skip leading whitespace
        while (pos < text.length && /\s/.test(text[pos])) {
          pos++;
        }
        cursor = pos;
      } else {
        // Property key
        const keyPattern = `"${this.escapeRegExp(key)}"`;
        const keyPos = text.indexOf(keyPattern, cursor);
        if (keyPos === -1) {
          return undefined;
        }
        cursor = keyPos;
      }
    }

    return document.positionAt(cursor);
  }

  /**
   * Helper to skip past a JSON value (string, object, array, primitive) in text starting from offset.
   */
  private skipJsonValue(text: string, start: number): number {
    let pos = start;
    while (pos < text.length && /[\s,]/.test(text[pos])) {
      pos++;
    }
    if (pos >= text.length) {
      return pos;
    }

    const char = text[pos];
    if (char === '{' || char === '[') {
      const closeChar = char === '{' ? '}' : ']';
      let depth = 1;
      pos++;
      let inString = false;

      while (pos < text.length && depth > 0) {
        const c = text[pos];
        if (c === '"' && text[pos - 1] !== '\\') {
          inString = !inString;
        } else if (!inString) {
          if (c === char) depth++;
          else if (c === closeChar) depth--;
        }
        pos++;
      }
      return pos;
    }

    if (char === '"') {
      pos++;
      while (pos < text.length) {
        if (text[pos] === '"' && text[pos - 1] !== '\\') {
          pos++;
          break;
        }
        pos++;
      }
      return pos;
    }

    // Primitive value (number, boolean, null)
    while (pos < text.length && !/[\s,}\]]/.test(text[pos])) {
      pos++;
    }
    return pos;
  }

  /**
   * Finds position in a YAML document.
   */
  private findYamlPosition(
    text: string,
    node: StructNode
  ): vscode.Position | undefined {
    const rawKeys = node.path.slice(1);
    if (rawKeys.length === 0) {
      return new vscode.Position(0, 0);
    }

    const targetKeys: string[] = [];
    for (let i = 0; i < rawKeys.length; i++) {
      const isRange = /^\[\d+\s*\.\.\s*\d+\]$/.test(rawKeys[i]);
      if (!isRange || i === rawKeys.length - 1) {
        targetKeys.push(rawKeys[i]);
      }
    }

    const lines = text.split(/\r?\n/);
    let currentLine = 0;
    let minIndent = -1;

    for (let k = 0; k < targetKeys.length; k++) {
      const key = targetKeys[k];

      const arrayMatch = key.match(/^\[(\d+)\]$/);
      const rangeMatch = key.match(/^\[(\d+)\s*\.\.\s*\d+\]$/);

      if (arrayMatch || rangeMatch) {
        // Array index like '[0]' or range like '[1 .. 999]'
        const targetIdx = parseInt((arrayMatch || rangeMatch)![1], 10);
        let foundIdx = -1;
        let foundLine = -1;
        let targetIndent = -1;

        for (let i = currentLine; i < lines.length; i++) {
          const line = lines[i];
          // Fast-path: Skip blank or comment lines without regex overhead
          let idx = 0;
          const lineLen = line.length;
          while (
            idx < lineLen &&
            (line.charCodeAt(idx) === 32 || line.charCodeAt(idx) === 9)
          ) {
            idx++;
          }
          if (idx >= lineLen || line.charCodeAt(idx) === 35) {
            continue;
          }
          const indent = this.getIndent(line);
          if (i > currentLine && minIndent !== -1 && indent < minIndent) {
            break; // left parent scope
          }

          const arrayItemMatch = line.match(/^(\s*)-\s+/);
          if (arrayItemMatch) {
            const itemIndent = arrayItemMatch[1].length;
            if (minIndent === -1 || itemIndent >= minIndent - 1) {
              if (targetIndent === -1) {
                targetIndent = itemIndent;
              }
              if (itemIndent === targetIndent) {
                foundIdx++;
                if (foundIdx === targetIdx) {
                  foundLine = i;
                  break;
                }
              }
            }
          } else if (i > currentLine && targetIndent !== -1 && indent <= targetIndent) {
            // Sibling property key at parent/same indent level terminates array search
            break;
          }
        }

        if (foundLine === -1) {
          return undefined;
        }

        currentLine = foundLine;
        minIndent = this.getIndent(lines[foundLine]) + 1;
      } else {
        // Property key
        let foundLine = -1;
        const keyRegex = new RegExp(`^(\\s*)-?\\s*['"]?${this.escapeRegExp(key)}['"]?\\s*:`);

        for (let i = currentLine; i < lines.length; i++) {
          const line = lines[i];
          // Fast-path: Skip blank or comment lines without regex overhead
          let idx = 0;
          const lineLen = line.length;
          while (
            idx < lineLen &&
            (line.charCodeAt(idx) === 32 || line.charCodeAt(idx) === 9)
          ) {
            idx++;
          }
          if (idx >= lineLen || line.charCodeAt(idx) === 35) {
            continue;
          }
          const indent = this.getIndent(line);
          if (i > currentLine && minIndent !== -1 && indent < minIndent) {
            break; // left parent scope
          }

          if (keyRegex.test(line)) {
            foundLine = i;
            break;
          }
        }

        if (foundLine === -1) {
          return undefined;
        }

        currentLine = foundLine;
        minIndent = this.getIndent(lines[foundLine]) + 1;
      }
    }

    const lineText = lines[currentLine];
    const keyCol = Math.max(0, lineText.indexOf(node.name));
    return new vscode.Position(currentLine, keyCol);
  }

  /**
   * Finds position in an XML document.
   */
  private findXmlPosition(
    text: string,
    node: StructNode
  ): vscode.Position | undefined {
    const rawKeys = node.path.slice(1);
    if (rawKeys.length === 0) {
      return new vscode.Position(0, 0);
    }

    const lines = text.split(/\r?\n/);
    let currentLine = 0;

    for (let k = 0; k < rawKeys.length; k++) {
      const key = rawKeys[k];

      if (key.startsWith('@')) {
        // Attribute name: @attr within the start tag of current element
        const attrName = key.slice(1);
        const attrRegex = new RegExp(`(?<![a-zA-Z0-9_:-])${this.escapeRegExp(attrName)}\\s*=`);
        let inTag = true;

        for (let i = currentLine; i < lines.length && inTag; i++) {
          const line = lines[i];
          const match = line.match(attrRegex);
          if (match && match.index !== undefined) {
            return new vscode.Position(i, match.index);
          }
          if (line.includes('>')) {
            inTag = false;
          }
        }
        return undefined;
      }

      if (key === '#text') {
        // Text node - search for decoded value or XML escaped value on or after currentLine
        if (node.value !== undefined) {
          const valStr = String(node.value).trim();
          const escapedVal = this.escapeXmlEntities(valStr);

          for (let i = currentLine; i < lines.length; i++) {
            const line = lines[i];
            const textOnlyLine = line.replace(/<[^>]+>/g, ' ');

            // Try raw text or XML-escaped text
            let idx = line.indexOf(valStr);
            if (idx !== -1 && textOnlyLine.includes(valStr)) {
              return new vscode.Position(i, idx);
            }

            idx = line.indexOf(escapedVal);
            if (idx !== -1) {
              return new vscode.Position(i, idx);
            }
          }
        }
        return new vscode.Position(currentLine, 0);
      }

      // Tag name
      const tagRegex = new RegExp(`<${this.escapeRegExp(key)}(\\s|>|/)`);
      let foundLine = -1;
      let foundCol = 0;

      for (let i = currentLine; i < lines.length; i++) {
        const match = lines[i].match(tagRegex);
        if (match && match.index !== undefined) {
          foundLine = i;
          foundCol = match.index;
          break;
        }
      }

      if (foundLine === -1) {
        return undefined;
      }

      currentLine = foundLine;
      if (k === rawKeys.length - 1) {
        return new vscode.Position(foundLine, foundCol);
      }
    }

    return new vscode.Position(currentLine, 0);
  }

  private escapeXmlEntities(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private getIndent(line: string): number {
    let i = 0;
    const len = line.length;
    while (i < len && (line.charCodeAt(i) === 32 || line.charCodeAt(i) === 9)) {
      i++;
    }
    return i;
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
