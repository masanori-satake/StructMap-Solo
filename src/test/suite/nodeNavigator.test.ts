import * as assert from 'assert';
import * as vscode from 'vscode';
import { StructMapService, StructNode } from '../../core';
import { NodeNavigator } from '../../vscode';

suite('NodeNavigator Test Suite', () => {
  const service = new StructMapService();
  const navigator = new NodeNavigator();

  function createMockDocument(fileName: string, content: string, languageId: string): vscode.TextDocument {
    const lines = content.split(/\r?\n/);
    return {
      fileName,
      languageId,
      getText: () => content,
      positionAt: (offset: number) => {
        let currentOffset = 0;
        for (let i = 0; i < lines.length; i++) {
          const lineLen = lines[i].length + 1; // including newline
          if (currentOffset + lineLen > offset) {
            return new vscode.Position(i, offset - currentOffset);
          }
          currentOffset += lineLen;
        }
        return new vscode.Position(lines.length - 1, lines[lines.length - 1].length);
      },
    } as unknown as vscode.TextDocument;
  }


  function getNode(fileName: string, content: string, path: string[]): StructNode {
    const result = service.build(fileName, content);
    assert.strictEqual(result.type, 'success');
    if (result.type !== 'success') {
      throw new Error('Expected valid fixture');
    }
    let node = result.tree.root;
    for (const key of path) {
      const child = node.children.find(child => child.name === key);
      assert.ok(child, `Missing fixture node: ${key}`);
      node = child;
    }
    return node;
  }

  test('Frontmatter keys named Calculated do not terminate navigation', () => {
    for (const delimiter of ['---', '...']) {
      const content = ['---', 'Calculated:', 'title: Example', delimiter, 'outside: body'].join('\n');
      const doc = createMockDocument('sample.md', content, 'markdown');
      for (const [key, line] of [['Calculated', 1], ['title', 2]] as const) {
        const node = getNode('sample.md', content, ['Frontmatter (YAML)', key]);
        assert.deepStrictEqual(navigator.findNodePosition(doc, node), new vscode.Position(line, 0));
      }
      const missing = getNode('sample.md', content, ['Frontmatter (YAML)', 'title']);
      assert.strictEqual(navigator.findNodePosition(doc, {
        ...missing, name: 'outside', path: ['sample.md', 'Frontmatter (YAML)', 'outside']
      }), undefined);
    }
  });

  for (const marker of ['`', '~']) {
    test(`Markdown navigation skips ${marker} fenced headings in normal and fallback searches`, () => {
      const fence = marker.repeat(4);
      for (const invalidCloser of [
        marker.repeat(3), `${fence} text`, `    ${fence}`, `\t${fence}`,
        (marker === '`' ? '~' : '`').repeat(4)
      ]) {
        const content = [
          '# Project', `   ${fence}markdown`, '# install', invalidCloser,
          '# install', `   ${fence}${marker} \t`, '## install'
        ].join('\n');
        const doc = createMockDocument('sample.md', content, 'markdown');
        const node = getNode('sample.md', content, ['Project', 'install']);
        assert.deepStrictEqual(navigator.findNodePosition(doc, node), new vscode.Position(6, 0));
        const staleNode = { ...node, path: ['sample.md', 'Old parent', 'install'] };
        assert.deepStrictEqual(navigator.findNodePosition(doc, staleNode), new vscode.Position(6, 0));
      }
    });
  }

  test('Markdown navigation agrees with parser on invalid backtick fence info strings', () => {
    const content = ['```lang`', '# install', '```', '# hidden'].join('\n');
    const doc = createMockDocument('sample.md', content, 'markdown');
    const node = getNode('sample.md', content, ['install']);
    assert.deepStrictEqual(navigator.findNodePosition(doc, node), new vscode.Position(1, 0));
  });

  test('Markdown fence state starts after frontmatter', () => {
    const content = ['---', 'example: |', '  ```', '---', '# install'].join('\n');
    const doc = createMockDocument('sample.md', content, 'markdown');
    const node = getNode('sample.md', content, ['Content (Markdown)', 'install']);
    assert.deepStrictEqual(navigator.findNodePosition(doc, node), new vscode.Position(4, 0));
  });

  const jsonCases: { name: string; content: string; path: string[]; line: number; col: number }[] = [
    { name: 'string values before a key', content: '{\n  "label": "port",\n  "port": 8080\n}', path: ['port'], line: 2, col: 2 },
    { name: 'nested keys before a root key', content: '{\n  "nested": {"port": 80},\n  "port": 8080\n}', path: ['port'], line: 2, col: 2 },
    { name: 'a child with its parent name', content: '{"server": {\n  "server": 1\n}}', path: ['server', 'server'], line: 1, col: 2 },
    { name: 'punctuation in keys', content: '{\n  "a.b": 1\n}', path: ['a.b'], line: 1, col: 2 },
    { name: 'escaped quotes in keys', content: String.raw`{"a\"b": 1}`, path: ['a"b'], line: 0, col: 1 },
    { name: 'Unicode escapes in keys', content: String.raw`{"\u0070ort": 1}`, path: ['port'], line: 0, col: 1 },
    { name: 'escaped backslashes in keys', content: String.raw`{"a\\b": 1}`, path: [String.raw`a\b`], line: 0, col: 1 },
    { name: 'array-like object keys', content: '{"[0]": {"port": 1}}', path: ['[0]', 'port'], line: 0, col: 9 },
    { name: 'array object keys after a nested sibling', content: '{"items": [{"nested": {"port": 80},\n  "port": 8080}]}', path: ['items', '[0]', 'port'], line: 1, col: 2 },
    { name: 'nested array elements', content: '[\n  [\n    {"port": 1}\n  ]\n]', path: ['[0]', '[0]', 'port'], line: 2, col: 5 },
    { name: 'an array element itself', content: '{"items": [\n  {"port": 1}\n]}', path: ['items', '[0]'], line: 1, col: 2 },
    { name: 'duplicate keys following JSON.parse semantics', content: '{"port": 1,\n  "port": 2}', path: ['port'], line: 1, col: 2 }
  ];

  for (const { name, content, path, line, col } of jsonCases) {
    test(`JSON navigation locates ${name}`, () => {
      const doc = createMockDocument('data.json', content, 'json');
      const node = getNode('data.json', content, path);
      assert.deepStrictEqual(navigator.findNodePosition(doc, node), new vscode.Position(line, col));
    });
  }

  test('JSON navigation does not find keys outside the parent scope', () => {
    const content = '{"server": {}, "port": 8080}';
    const doc = createMockDocument('data.json', content, 'json');
    const node = getNode('data.json', content, ['port']);
    assert.strictEqual(navigator.findNodePosition(doc, {
      ...node, path: ['data.json', 'server', 'port']
    }), undefined);
  });

  const yamlCases: { name: string; content: string; path: string[]; line: number; col: number }[] = [
    { name: 'a child with its parent name', content: 'server:\n  server: 8080', path: ['server', 'server'], line: 1, col: 2 },
    { name: 'a root key after a nested key', content: 'server:\n  port: 80\nport: 8080', path: ['port'], line: 2, col: 0 },
    { name: 'a direct child after a nested key', content: 'server:\n  nested:\n    port: 80\n  port: 8080', path: ['server', 'port'], line: 3, col: 2 },
    { name: 'an inline array item key', content: 'users:\n  - name: Alice\n    port: 8080', path: ['users', '[0]', 'name'], line: 1, col: 4 },
    { name: 'a later array item key', content: 'users:\n  - name: Alice\n    nested:\n      port: 80\n    port: 8080', path: ['users', '[0]', 'port'], line: 4, col: 4 },
    { name: 'a key below a standalone array marker', content: 'users:\n  -\n    name: Alice', path: ['users', '[0]', 'name'], line: 2, col: 4 },
    { name: 'an indentless array item key', content: 'users:\n- name: Alice\n  port: 8080', path: ['users', '[0]', 'port'], line: 2, col: 2 },
    { name: 'an inline property with a child of the same name', content: 'users:\n  - name:\n      name: Alice', path: ['users', '[0]', 'name', 'name'], line: 2, col: 6 },
    { name: 'a child after blank lines and comments', content: 'server:\n\n  # settings\n  nested:\n    port: 80\n  port: 8080', path: ['server', 'port'], line: 5, col: 2 }
  ];

  for (const { name, content, path, line, col } of yamlCases) {
    test(`YAML navigation locates ${name}`, () => {
      const doc = createMockDocument('config.yaml', content, 'yaml');
      const node = getNode('config.yaml', content, path);
      assert.deepStrictEqual(navigator.findNodePosition(doc, node), new vscode.Position(line, col));
    });
  }

  test('YAML navigation counts only direct array items', () => {
    const content = 'users:\n  - name: Alice\n    tags:\n      - first\n      - second\n  - name: Bob';
    const doc = createMockDocument('config.yaml', content, 'yaml');
    const node = getNode('config.yaml', content, ['users', '[0]', 'name']);
    assert.deepStrictEqual(navigator.findNodePosition(doc, {
      ...node, path: ['config.yaml', 'users', '[1]', 'name']
    }), new vscode.Position(5, 4));
  });

  test('YAML navigation stops before sibling scopes', () => {
    const content = 'server:\n  name: local\nother:\n  port: 8080';
    const doc = createMockDocument('config.yaml', content, 'yaml');
    const node = getNode('config.yaml', content, ['other', 'port']);
    assert.strictEqual(navigator.findNodePosition(doc, {
      ...node, path: ['config.yaml', 'server', 'port']
    }), undefined);
  });

  test('AC-1: Markdown heading jump location finding', () => {
    const mdContent = '# Project\n\n## Design\n\n### Database\nDatabase info';
    const doc = createMockDocument('sample.md', mdContent, 'markdown');
    const parseResult = service.build('sample.md', mdContent);
    assert.strictEqual(parseResult.type, 'success');

    if (parseResult.type === 'success') {
      const root = parseResult.tree.root;
      // root -> Project -> Design -> Database
      const projectNode = root.children[0];
      const designNode = projectNode.children[0];
      const dbNode = designNode.children[0];

      const pos = navigator.findNodePosition(doc, dbNode);
      assert.ok(pos);
      assert.strictEqual(pos.line, 4);
    }
  });

  test('AC-2: JSON node location finding', () => {
    const jsonContent = '{\n  "title": "Test",\n  "users": [\n    {\n      "name": "Alice"\n    }\n  ]\n}';
    const doc = createMockDocument('data.json', jsonContent, 'json');
    const parseResult = service.build('data.json', jsonContent);
    assert.strictEqual(parseResult.type, 'success');

    if (parseResult.type === 'success') {
      const root = parseResult.tree.root;
      const usersNode = root.children.find((c) => c.name === 'users')!;
      assert.ok(usersNode);

      const posUsers = navigator.findNodePosition(doc, usersNode);
      assert.ok(posUsers);

      const arrayItemNode = usersNode.children[0]; // [0]
      const nameNode = arrayItemNode.children[0]; // name

      const posName = navigator.findNodePosition(doc, nameNode);
      assert.ok(posName);
      assert.strictEqual(posName.line, 4);
    }
  });

  test('AC-3: YAML node location finding', () => {
    const yamlContent = 'server:\n  port: 8080\nusers:\n  - name: Alice';
    const doc = createMockDocument('config.yaml', yamlContent, 'yaml');
    const parseResult = service.build('config.yaml', yamlContent);
    assert.strictEqual(parseResult.type, 'success');

    if (parseResult.type === 'success') {
      const root = parseResult.tree.root;
      const serverNode = root.children.find((c) => c.name === 'server')!;
      const portNode = serverNode.children[0];

      const posPort = navigator.findNodePosition(doc, portNode);
      assert.ok(posPort);
      assert.strictEqual(posPort.line, 1);
    }
  });

  test('Gracefully handle missing or invalid node location', () => {
    const doc = createMockDocument('test.md', 'Hello', 'markdown');
    const fakeNode = {
      id: '99',
      name: 'NonExistent',
      path: ['test.md', 'NonExistent'],
      nodeType: 'section' as const,
      children: [],
    };

    const pos = navigator.findNodePosition(doc, fakeNode);
    assert.strictEqual(pos, undefined);

    const mockEditor = {
      document: doc,
    } as vscode.TextEditor;

    const result = navigator.jumpToNode(mockEditor, fakeNode);
    assert.strictEqual(result, false);
  });
});
