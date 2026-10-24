import * as assert from 'assert';
import * as vscode from 'vscode';
import { StructMapService } from '../../core';
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
