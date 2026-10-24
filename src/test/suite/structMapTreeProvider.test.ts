import * as assert from 'assert';
import * as vscode from 'vscode';
import { StructMapService } from '../../core';
import { StructMapTreeProvider, StructTreeItem } from '../../vscode/providers/StructMapTreeProvider';

suite('StructMapTreeProvider Test Suite', () => {
  const service = new StructMapService();

  function createMockEditor(fileName: string, content: string): vscode.TextEditor {
    return {
      document: {
        fileName,
        getText: () => content,
      } as vscode.TextDocument,
    } as vscode.TextEditor;
  }

  test('AC-10: No Active Editor displays error item', () => {
    const provider = new StructMapTreeProvider(service, () => undefined);
    const children = provider.getChildren() as StructTreeItem[];
    assert.strictEqual(children.length, 1);
    assert.strictEqual(children[0].label, 'No Active Editor');
    assert.strictEqual(children[0].isError, true);
  });

  test('AC-2: Markdown document returns StructTree root and children', () => {
    const mockEditor = createMockEditor(
      'sample.md',
      '# Title\n## Subtitle\nText body'
    );
    const provider = new StructMapTreeProvider(service, () => mockEditor);
    const rootItems = provider.getChildren() as StructTreeItem[];

    assert.strictEqual(rootItems.length, 1);
    const rootItem = rootItems[0];
    assert.strictEqual(rootItem.label, 'sample.md');
    assert.strictEqual(rootItem.collapsibleState, vscode.TreeItemCollapsibleState.Expanded);
    assert.strictEqual((rootItem.iconPath as vscode.ThemeIcon).id, 'file');

    const children = provider.getChildren(rootItem) as StructTreeItem[];
    assert.strictEqual(children.length, 1);
    assert.strictEqual(children[0].label, 'Title');
    assert.strictEqual((children[0].iconPath as vscode.ThemeIcon).id, 'symbol-key');
  });

  test('AC-3: JSON document returns StructTree root and JSON objects/arrays/values', () => {
    const mockEditor = createMockEditor(
      'config.json',
      '{"name": "test", "active": true, "items": [1]}'
    );
    const provider = new StructMapTreeProvider(service, () => mockEditor);
    const rootItems = provider.getChildren() as StructTreeItem[];

    assert.strictEqual(rootItems.length, 1);
    const rootItem = rootItems[0];
    assert.strictEqual(rootItem.label, 'config.json');

    const children = provider.getChildren(rootItem) as StructTreeItem[];
    assert.strictEqual(children.length, 3);

    const nameItem = children.find((c) => c.node?.name === 'name');
    assert.ok(nameItem);
    assert.strictEqual((nameItem.iconPath as vscode.ThemeIcon).id, 'symbol-field');
    assert.strictEqual(nameItem.description, 'test');

    const itemsItem = children.find((c) => c.node?.name === 'items');
    assert.ok(itemsItem);
    assert.strictEqual((itemsItem.iconPath as vscode.ThemeIcon).id, 'symbol-array');
  });

  test('AC-4: YAML document returns StructTree root and YAML objects/values', () => {
    const mockEditor = createMockEditor(
      'config.yaml',
      'server:\n  port: 8080\n'
    );
    const provider = new StructMapTreeProvider(service, () => mockEditor);
    const rootItems = provider.getChildren() as StructTreeItem[];

    assert.strictEqual(rootItems.length, 1);
    const rootItem = rootItems[0];
    assert.strictEqual(rootItem.label, 'config.yaml');

    const children = provider.getChildren(rootItem) as StructTreeItem[];
    assert.strictEqual(children.length, 1);

    const serverItem = children[0];
    assert.strictEqual(serverItem.node?.name, 'server');
    assert.strictEqual((serverItem.iconPath as vscode.ThemeIcon).id, 'symbol-object');

    const serverChildren = provider.getChildren(serverItem) as StructTreeItem[];
    assert.strictEqual(serverChildren.length, 1);
    assert.strictEqual(serverChildren[0].node?.name, 'port');
    assert.strictEqual(serverChildren[0].description, '8080');
    assert.strictEqual((serverChildren[0].iconPath as vscode.ThemeIcon).id, 'symbol-field');
  });

  test('AC-5: ThemeIcon mappings for root, section, object, array, value', () => {
    const mdEditor = createMockEditor('doc.md', '# Section');
    const mdProvider = new StructMapTreeProvider(service, () => mdEditor);
    const rootItem = (mdProvider.getChildren() as StructTreeItem[])[0];
    assert.strictEqual((rootItem.iconPath as vscode.ThemeIcon).id, 'file');

    const sectionItem = (mdProvider.getChildren(rootItem) as StructTreeItem[])[0];
    assert.strictEqual((sectionItem.iconPath as vscode.ThemeIcon).id, 'symbol-key');

    const jsonEditor = createMockEditor(
      'data.json',
      '{"obj": {"key": "val"}, "arr": [1]}'
    );
    const jsonProvider = new StructMapTreeProvider(service, () => jsonEditor);
    const jsonRoot = (jsonProvider.getChildren() as StructTreeItem[])[0];
    const jsonChildren = jsonProvider.getChildren(jsonRoot) as StructTreeItem[];

    const objItem = jsonChildren.find((c) => c.node?.name === 'obj')!;
    assert.ok(objItem);
    assert.strictEqual((objItem.iconPath as vscode.ThemeIcon).id, 'symbol-object');

    const arrItem = jsonChildren.find((c) => c.node?.name === 'arr')!;
    assert.ok(arrItem);
    assert.strictEqual((arrItem.iconPath as vscode.ThemeIcon).id, 'symbol-array');

    const objChildren = jsonProvider.getChildren(objItem) as StructTreeItem[];
    const valueItem = objChildren[0];
    assert.strictEqual((valueItem.iconPath as vscode.ThemeIcon).id, 'symbol-field');
  });

  test('AC-6: Root node is in initial expanded state', () => {
    const mockEditor = createMockEditor('data.json', '{"a": 1}');
    const provider = new StructMapTreeProvider(service, () => mockEditor);
    const rootItems = provider.getChildren() as StructTreeItem[];
    assert.strictEqual(
      rootItems[0].collapsibleState,
      vscode.TreeItemCollapsibleState.Expanded
    );
  });

  test('AC-7: Frontmatter node is in initial expanded state', () => {
    const mockEditor = createMockEditor(
      'doc.md',
      '---\ntitle: Test\n---\n# Heading'
    );
    const provider = new StructMapTreeProvider(service, () => mockEditor);
    const rootItems = provider.getChildren() as StructTreeItem[];
    const rootChildren = provider.getChildren(rootItems[0]) as StructTreeItem[];

    const fmItem = rootChildren.find((c) => c.node?.name === 'Frontmatter (YAML)');
    assert.ok(fmItem);
    assert.strictEqual(
      fmItem.collapsibleState,
      vscode.TreeItemCollapsibleState.Expanded
    );
  });

  test('AC-8: JSON Parse Error displays error item', () => {
    const mockEditor = createMockEditor('bad.json', '{ bad json }');
    const provider = new StructMapTreeProvider(service, () => mockEditor);
    const children = provider.getChildren() as StructTreeItem[];

    assert.strictEqual(children.length, 1);
    assert.strictEqual(children[0].label, 'JSON Parse Error');
    assert.strictEqual(children[0].isError, true);
  });

  test('AC-9: Unsupported Format displays error item', () => {
    const mockEditor = createMockEditor('image.png', 'binary data');
    const provider = new StructMapTreeProvider(service, () => mockEditor);
    const children = provider.getChildren() as StructTreeItem[];

    assert.strictEqual(children.length, 1);
    assert.strictEqual(children[0].label, 'Unsupported Format');
    assert.strictEqual(children[0].isError, true);
  });

  test('File Too Large displays error item with size details in tooltip', () => {
    const largeContent = '{\n"data": "' + 'x'.repeat(5 * 1024 * 1024 + 1024) + '"\n}';
    const mockEditor = createMockEditor('large.json', largeContent);
    const provider = new StructMapTreeProvider(service, () => mockEditor);
    const children = provider.getChildren() as StructTreeItem[];

    assert.strictEqual(children.length, 1);
    assert.strictEqual(children[0].label, 'File Too Large');
    assert.strictEqual(children[0].isError, true);
    assert.ok(typeof children[0].tooltip === 'string');
    assert.ok(children[0].tooltip.includes('Current:'));
    assert.ok(children[0].tooltip.includes('Limit: 5 MB'));
  });

  test('YAML Parse Error, Frontmatter Parse Error, Empty File display correct error items', () => {
    let mockEditor = createMockEditor('bad.yaml', 'key: : bad');
    let provider = new StructMapTreeProvider(service, () => mockEditor);
    let children = provider.getChildren() as StructTreeItem[];
    assert.strictEqual(children[0].label, 'YAML Parse Error');

    mockEditor = createMockEditor('fm.md', '---\nkey: : bad\n---');
    provider = new StructMapTreeProvider(service, () => mockEditor);
    children = provider.getChildren() as StructTreeItem[];
    assert.strictEqual(children[0].label, 'Frontmatter Parse Error');

    mockEditor = createMockEditor('empty.json', '   ');
    provider = new StructMapTreeProvider(service, () => mockEditor);
    children = provider.getChildren() as StructTreeItem[];
    assert.strictEqual(children[0].label, 'Empty File');
  });

  test('Error items return empty children on getChildren', () => {
    const mockEditor = createMockEditor('bad.json', '{ bad json }');
    const provider = new StructMapTreeProvider(service, () => mockEditor);
    const errItem = (provider.getChildren() as StructTreeItem[])[0];
    const children = provider.getChildren(errItem) as StructTreeItem[];
    assert.strictEqual(children.length, 0);
  });

  test('onDidChangeTreeData fires on refresh()', (done) => {
    const provider = new StructMapTreeProvider(service, () => undefined);
    provider.onDidChangeTreeData(() => {
      done();
    });
    provider.refresh();
  });
});
