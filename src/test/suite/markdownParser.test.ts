import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { MarkdownParser } from '../../core';

suite('MarkdownParser Test Suite', () => {
  const parser = new MarkdownParser();

  test('AC-1 見出し構造を解析できる (H1-H6 hierarchy)', () => {
    const markdown = `# Project
## Overview
## Design
### Database
#### Table
##### Column
###### Type`;

    const tree = parser.parse(markdown, 'README.md');

    assert.strictEqual(tree.sourceFormat, 'markdown');
    assert.strictEqual(tree.root.name, 'README.md');
    assert.strictEqual(tree.root.nodeType, 'root');
    assert.strictEqual(tree.root.children.length, 1);

    const projectNode = tree.root.children[0];
    assert.strictEqual(projectNode.name, 'Project');
    assert.strictEqual(projectNode.nodeType, 'section');
    assert.deepStrictEqual(projectNode.path, ['README.md', 'Project']);
    assert.strictEqual(projectNode.children.length, 2);

    const overviewNode = projectNode.children[0];
    assert.strictEqual(overviewNode.name, 'Overview');
    assert.deepStrictEqual(overviewNode.path, ['README.md', 'Project', 'Overview']);

    const designNode = projectNode.children[1];
    assert.strictEqual(designNode.name, 'Design');
    assert.deepStrictEqual(designNode.path, ['README.md', 'Project', 'Design']);
    assert.strictEqual(designNode.children.length, 1);

    const dbNode = designNode.children[0];
    assert.strictEqual(dbNode.name, 'Database');
    assert.strictEqual(dbNode.children.length, 1);

    const tableNode = dbNode.children[0];
    assert.strictEqual(tableNode.name, 'Table');
    assert.strictEqual(tableNode.children.length, 1);

    const colNode = tableNode.children[0];
    assert.strictEqual(colNode.name, 'Column');
    assert.strictEqual(colNode.children.length, 1);

    const typeNode = colNode.children[0];
    assert.strictEqual(typeNode.name, 'Type');
    assert.strictEqual(typeNode.children.length, 0);
  });

  test('AC-2 本文を無視する (Ignores body text and code blocks)', () => {
    const markdown = `# Project

Lorem ipsum dolor sit amet, consectetur adipiscing elit.

## Design

Some description text.

\`\`\`markdown
# Not A Heading
## Also Not A Heading
\`\`\`

~~~
### Still Not A Heading
~~~`;

    const tree = parser.parse(markdown, 'DOCUMENT.md');

    assert.strictEqual(tree.root.children.length, 1);
    const projectNode = tree.root.children[0];
    assert.strictEqual(projectNode.name, 'Project');
    assert.strictEqual(projectNode.children.length, 1);

    const designNode = projectNode.children[0];
    assert.strictEqual(designNode.name, 'Design');
    assert.strictEqual(designNode.children.length, 0);
  });

  test('AC-3 Unicode保持 (Preserves Japanese, Chinese, Emoji, etc.)', () => {
    const markdown = `# プロジェクト
## 数据库
## 🚀 Release`;

    const tree = parser.parse(markdown, 'README.md');

    const projectNode = tree.root.children[0];
    assert.strictEqual(projectNode.name, 'プロジェクト');
    assert.strictEqual(projectNode.children.length, 2);

    assert.strictEqual(projectNode.children[0].name, '数据库');
    assert.strictEqual(projectNode.children[1].name, '🚀 Release');
  });

  test('AC-4 見出し飛び級対応 (Handles skipped heading levels without throwing)', () => {
    assert.doesNotThrow(() => {
      const markdown = `# A
### B
###### C`;

      const tree = parser.parse(markdown, 'README.md');

      assert.strictEqual(tree.root.children.length, 1);
      const nodeA = tree.root.children[0];
      assert.strictEqual(nodeA.name, 'A');

      assert.strictEqual(nodeA.children.length, 1);
      const nodeB = nodeA.children[0];
      assert.strictEqual(nodeB.name, 'B');

      assert.strictEqual(nodeB.children.length, 1);
      const nodeC = nodeB.children[0];
      assert.strictEqual(nodeC.name, 'C');
    });
  });

  test('AC-5 Rootノード生成 (Sets root.name to specified fileName)', () => {
    const tree = parser.parse('# Heading', 'custom-filename.md');
    assert.strictEqual(tree.root.name, 'custom-filename.md');
    assert.strictEqual(tree.root.nodeType, 'root');
    assert.deepStrictEqual(tree.root.path, ['custom-filename.md']);
  });

  test('AC-6 VSCode API非依存 (MarkdownParser does not import vscode)', () => {
    const parserFilePath = path.resolve(__dirname, '../../../src/core/parsers/markdown/MarkdownParser.ts');
    const fileContent = fs.readFileSync(parserFilePath, 'utf8');

    assert.strictEqual(fileContent.includes("from 'vscode'"), false);
    assert.strictEqual(fileContent.includes('from "vscode"'), false);
    assert.strictEqual(fileContent.includes("require('vscode')"), false);
    assert.strictEqual(fileContent.includes('require("vscode")'), false);
  });

  test('Duplicate heading names (同名見出し)', () => {
    const markdown = `# API
## User
## User`;

    const tree = parser.parse(markdown, 'API.md');

    const apiNode = tree.root.children[0];
    assert.strictEqual(apiNode.name, 'API');
    assert.strictEqual(apiNode.children.length, 2);

    assert.strictEqual(apiNode.children[0].name, 'User');
    assert.strictEqual(apiNode.children[1].name, 'User');
  });

  test('Trailing hashes handling', () => {
    const markdown = `# Title #
## Subtitle ###`;

    const tree = parser.parse(markdown, 'doc.md');

    const titleNode = tree.root.children[0];
    assert.strictEqual(titleNode.name, 'Title');
    assert.strictEqual(titleNode.children[0].name, 'Subtitle');
  });
});
