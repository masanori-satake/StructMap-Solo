import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { MarkdownParser, ParseErrorCode, ParseResult, ParseSuccess, StructTree } from '../../core';

suite('MarkdownParser Test Suite', () => {
  const parser = new MarkdownParser();

  function getTree(result: ParseResult): StructTree {
    assert.strictEqual(result.type, 'success');
    return (result as ParseSuccess).tree;
  }

  test('AC-1 見出し構造を解析できる (H1-H6 hierarchy)', () => {
    const markdown = `# Project
## Overview
## Design
### Database
#### Table
##### Column
###### Type`;

    const tree = getTree(parser.parse(markdown, 'README.md'));

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

    const tree = getTree(parser.parse(markdown, 'DOCUMENT.md'));

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

    const tree = getTree(parser.parse(markdown, 'README.md'));

    const projectNode = tree.root.children[0];
    assert.strictEqual(projectNode.name, 'プロジェクト');
    assert.strictEqual(projectNode.children.length, 2);

    assert.strictEqual(projectNode.children[0].name, '数据库');
    assert.strictEqual(projectNode.children[1].name, '🚀 Release');
  });

  test('Rejects backtick opening fences with backticks in the info string', () => {
    for (const opener of ['```lang`', '```markdown `example`', '   ````lang\\`x']) {
      const markdown = [
        opener, '# Visible', '```markdown', '# Hidden', '```', '# After'
      ].join('\n');
      const tree = getTree(parser.parse(markdown));

      assert.deepStrictEqual(tree.root.children.map(node => node.name),
        ['Visible', 'After'], JSON.stringify(opener));
    }
  });

  test('Accepts tilde opening fences with backticks in the info string', () => {
    const markdown = [
      '~~~markdown `example`', '# Hidden', '~~~', '# After'
    ].join('\n');
    const tree = getTree(parser.parse(markdown));

    assert.deepStrictEqual(tree.root.children.map(node => node.name), ['After']);
  });

  for (const marker of ['`', '~']) {
    test(`Ignores invalid closing fences for ${marker} code blocks`, () => {
      const fence = marker.repeat(4);
      const invalidClosers = [
        (marker === '`' ? '~' : '`').repeat(4),
        marker.repeat(3),
        `${fence} text`,
        `    ${fence}`,
        `\t${fence}`,
        ` \t${fence}`
      ];

      for (const closer of invalidClosers) {
        const markdown = [
          '# Before', `${fence}markdown`, '# Hidden', closer,
          '# Still hidden', fence, '# After'
        ].join('\n');
        const tree = getTree(parser.parse(markdown));

        assert.deepStrictEqual(tree.root.children.map(node => node.name),
          ['Before', 'After'], JSON.stringify(closer));
      }
    });

    test(`Accepts matching or longer ${marker} closing fences with trailing spaces and tabs`, () => {
      for (const length of [3, 4]) {
        const markdown = [
          `   ${marker.repeat(3)}markdown`, '# Hidden',
          `   ${marker.repeat(length)} \t`, '# After'
        ].join('\r\n');
        const tree = getTree(parser.parse(markdown));

        assert.deepStrictEqual(tree.root.children.map(node => node.name), ['After']);
      }
    });

    test(`Restricts ${marker} opening fence indentation to at most three spaces`, () => {
      for (const indent of ['', ' ', '  ', '   ', '    ', '\t', ' \t']) {
        const markdown = [
          '# Before', `${indent}${marker.repeat(3)}markdown`, '# Visible unless fenced'
        ].join('\n');
        const tree = getTree(parser.parse(markdown));
        const expectedNames = indent.length <= 3 && !indent.includes('\t')
          ? ['Before'] : ['Before', 'Visible unless fenced'];

        assert.deepStrictEqual(tree.root.children.map(node => node.name),
          expectedNames, JSON.stringify(indent));
      }
    });
  }

  test('Restricts heading indentation to at most three spaces and rejects tabs', () => {
    const indents = ['', ' ', '  ', '   ', '    ', '\t', ' \t', '\t '];
    const markdown = indents.map((indent, index) => `${indent}# Heading ${index}`).join('\n');
    const tree = getTree(parser.parse(markdown));

    assert.deepStrictEqual(tree.root.children.map(node => node.name),
      ['Heading 0', 'Heading 1', 'Heading 2', 'Heading 3']);
  });

  test('AC-4 見出し飛び級対応 (Handles skipped heading levels without throwing)', () => {
    assert.doesNotThrow(() => {
      const markdown = `# A
### B
###### C`;

      const tree = getTree(parser.parse(markdown, 'README.md'));

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
    const tree = getTree(parser.parse('# Heading', 'custom-filename.md'));
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

    const tree = getTree(parser.parse(markdown, 'API.md'));

    const apiNode = tree.root.children[0];
    assert.strictEqual(apiNode.name, 'API');
    assert.strictEqual(apiNode.children.length, 2);

    assert.strictEqual(apiNode.children[0].name, 'User');
    assert.strictEqual(apiNode.children[1].name, 'User');
  });

  test('Trailing hashes handling', () => {
    const markdown = `# Title #
## Subtitle ###`;

    const tree = getTree(parser.parse(markdown, 'doc.md'));

    const titleNode = tree.root.children[0];
    assert.strictEqual(titleNode.name, 'Title');
    assert.strictEqual(titleNode.children[0].name, 'Subtitle');
  });

  /* -------------------------------------------------------------------------- */
  /* Frontmatter Parsing Test Suite (AC-1 to AC-6)                              */
  /* -------------------------------------------------------------------------- */

  test('Frontmatter AC-1 & AC-2 & AC-3: YAML Frontmatter and Markdown Content parsing with correct section names', () => {
    const markdown = `---
title: StructMap
tags:
  - vscode
  - markdown
---

# Overview
## Design`;

    const tree = getTree(parser.parse(markdown, 'README.md'));

    assert.strictEqual(tree.sourceFormat, 'markdown');
    assert.strictEqual(tree.root.name, 'README.md');
    assert.strictEqual(tree.root.nodeType, 'root');
    assert.strictEqual(tree.root.children.length, 2);

    // Section 1: Frontmatter (YAML)
    const fmNode = tree.root.children[0];
    assert.strictEqual(fmNode.name, 'Frontmatter (YAML)');
    assert.strictEqual(fmNode.nodeType, 'section');
    assert.deepStrictEqual(fmNode.path, ['README.md', 'Frontmatter (YAML)']);
    assert.strictEqual(fmNode.children.length, 2);

    // title value node
    const titleNode = fmNode.children[0];
    assert.strictEqual(titleNode.name, 'title');
    assert.strictEqual(titleNode.nodeType, 'value');
    assert.strictEqual(titleNode.valueType, 'string');
    assert.deepStrictEqual(titleNode.path, ['README.md', 'Frontmatter (YAML)', 'title']);

    // tags array node
    const tagsNode = fmNode.children[1];
    assert.strictEqual(tagsNode.name, 'tags');
    assert.strictEqual(tagsNode.nodeType, 'array');
    assert.deepStrictEqual(tagsNode.path, ['README.md', 'Frontmatter (YAML)', 'tags']);
    assert.strictEqual(tagsNode.children.length, 2);
    assert.strictEqual(tagsNode.children[0].name, '[0]');
    assert.strictEqual(tagsNode.children[0].valueType, 'string');
    assert.strictEqual(tagsNode.children[1].name, '[1]');
    assert.strictEqual(tagsNode.children[1].valueType, 'string');

    // Section 2: Content (Markdown)
    const contentNode = tree.root.children[1];
    assert.strictEqual(contentNode.name, 'Content (Markdown)');
    assert.strictEqual(contentNode.nodeType, 'section');
    assert.deepStrictEqual(contentNode.path, ['README.md', 'Content (Markdown)']);
    assert.strictEqual(contentNode.children.length, 1);

    // Overview heading node
    const overviewNode = contentNode.children[0];
    assert.strictEqual(overviewNode.name, 'Overview');
    assert.strictEqual(overviewNode.nodeType, 'section');
    assert.deepStrictEqual(overviewNode.path, ['README.md', 'Content (Markdown)', 'Overview']);
    assert.strictEqual(overviewNode.children.length, 1);

    // Design heading node
    const designNode = overviewNode.children[0];
    assert.strictEqual(designNode.name, 'Design');
    assert.strictEqual(designNode.nodeType, 'section');
    assert.deepStrictEqual(designNode.path, ['README.md', 'Content (Markdown)', 'Overview', 'Design']);
  });

  test('Frontmatter AC-4: Documents without frontmatter maintain original root structure', () => {
    const markdown = `# Overview
## Design`;

    const tree = getTree(parser.parse(markdown, 'README.md'));

    assert.strictEqual(tree.root.children.length, 1);
    const overviewNode = tree.root.children[0];
    assert.strictEqual(overviewNode.name, 'Overview');
    assert.deepStrictEqual(overviewNode.path, ['README.md', 'Overview']);
  });

  test('Unclosed frontmatter returns FRONTMATTER_PARSE_ERROR', () => {
    for (const markdown of [
      '---',
      '---\n',
      '---\ntitle: StructMap\n# Overview',
      '--- \t\r\ntitle: StructMap\r\n# Overview',
      '---\ntitle: StructMap\n--- trailing text\n ...\n# Overview'
    ]) {
      const result = parser.parse(markdown, 'UNCLOSED.md');

      assert.strictEqual(result.type, 'error', JSON.stringify(markdown));
      if (result.type === 'error') {
        assert.strictEqual(result.code, ParseErrorCode.FRONTMATTER_PARSE_ERROR);
        assert.match(result.message, /Frontmatter Parse Error:.*closing delimiter/i);
        assert.strictEqual(result.line, 1);
        assert.strictEqual(result.column, 1);
      }
    }
  });

  test('Closed frontmatter preserves YAML values and Markdown sections', () => {
    for (const delimiter of ['---', '...']) {
      for (const newline of ['\n', '\r\n']) {
        const markdown = ['--- \t', 'title: StructMap', `${delimiter} \t`, '# Overview']
          .join(newline);
        const tree = getTree(parser.parse(markdown, 'README.md'));

        assert.deepStrictEqual(tree.root.children.map(node => node.name),
          ['Frontmatter (YAML)', 'Content (Markdown)']);
        assert.strictEqual(tree.root.children[0].children[0].value, 'StructMap');
        assert.strictEqual(tree.root.children[1].children[0].name, 'Overview');

        const emptyTree = getTree(parser.parse(['---', delimiter, '# Overview'].join(newline)));
        assert.deepStrictEqual(emptyTree.root.children[0].children, []);
        assert.strictEqual(emptyTree.root.children[1].children[0].name, 'Overview');
      }
    }
  });

  test('Only an opening delimiter on the first line starts frontmatter', () => {
    for (const markdown of ['', '\n---\n# Overview', ' ---\n# Overview', '...\n# Overview']) {
      const tree = getTree(parser.parse(markdown));

      assert.deepStrictEqual(tree.root.children.map(node => node.name),
        markdown === '' ? [] : ['Overview']);
    }
  });

  test('Frontmatter AC-3 & AC-4 & AC-5: Invalid YAML syntax in frontmatter returns ParseError without crashing', () => {
    const markdown = '---\ntitle: [unclosed array\ninvalid: : :\n---\n\n# Overview';

    const result = parser.parse(markdown, 'INVALID.md');

    assert.strictEqual(result.type, 'error');
    if (result.type === 'error') {
      assert.strictEqual(result.code, ParseErrorCode.FRONTMATTER_PARSE_ERROR);
      assert.ok(result.message.includes('Frontmatter Parse Error'));
      assert.strictEqual(typeof result.line, 'number');
      assert.strictEqual(typeof result.column, 'number');
      assert.strictEqual(result.line, 3);
    }
  });

  test('Frontmatter AC-6: Unicode characters in frontmatter keys and values are preserved', () => {
    const markdown = `---
タイトル: StructMap 🚀
タグ:
  - 開発
  - ビジュアル
---

# 概要`;

    const tree = getTree(parser.parse(markdown, 'DOC.md'));

    const fmNode = tree.root.children[0];
    assert.strictEqual(fmNode.name, 'Frontmatter (YAML)');

    const titleNode = fmNode.children[0];
    assert.strictEqual(titleNode.name, 'タイトル');
    assert.strictEqual(titleNode.value, 'StructMap 🚀');

    const tagsNode = fmNode.children[1];
    assert.strictEqual(tagsNode.name, 'タグ');
    assert.strictEqual(tagsNode.children[0].name, '[0]');
    assert.strictEqual(tagsNode.children[0].value, '開発');
    assert.strictEqual(tagsNode.children[1].value, 'ビジュアル');

    const contentNode = tree.root.children[1];
    assert.strictEqual(contentNode.children[0].name, '概要');
  });

  test('FrontmatterParser does not import vscode', () => {
    const parserFilePath = path.resolve(__dirname, '../../../src/core/parsers/markdown/FrontmatterParser.ts');
    const fileContent = fs.readFileSync(parserFilePath, 'utf8');

    assert.strictEqual(fileContent.includes("from 'vscode'"), false);
    assert.strictEqual(fileContent.includes('from "vscode"'), false);
    assert.strictEqual(fileContent.includes("require('vscode')"), false);
    assert.strictEqual(fileContent.includes('require("vscode")'), false);
  });
});
