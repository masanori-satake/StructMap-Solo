import * as assert from 'assert';
import { readFileSync } from 'fs';
import * as path from 'path';
import { runInNewContext } from 'vm';
import * as vscode from 'vscode';
import { StructMapService, StructNode } from '../../core';
import {
  NodeNavigator,
  registerCommands,
  StructMapTreeProvider,
  ViewStateManager,
} from '../../vscode';

class MockMemento implements vscode.Memento {
  private storage = new Map<string, unknown>();

  public get<T>(key: string): T | undefined;
  public get<T>(key: string, defaultValue: T): T;
  public get<T>(key: string, defaultValue?: T): T | undefined {
    if (this.storage.has(key)) {
      return this.storage.get(key) as T;
    }
    return defaultValue;
  }

  public update(key: string, value: unknown): Thenable<void> {
    if (value === undefined) {
      this.storage.delete(key);
    } else {
      this.storage.set(key, value);
    }
    return Promise.resolve();
  }

  public keys(): readonly string[] {
    return Array.from(this.storage.keys());
  }
}

suite('Commands & ViewState Integration Test Suite', () => {
  let memento: MockMemento;
  let viewStateManager: ViewStateManager;
  let structMapService: StructMapService;
  let nodeNavigator: NodeNavigator;
  let treeDataProvider: StructMapTreeProvider;

  setup(() => {
    memento = new MockMemento();
    viewStateManager = new ViewStateManager(memento);
    structMapService = new StructMapService();
    nodeNavigator = new NodeNavigator();
    treeDataProvider = new StructMapTreeProvider(
      structMapService,
      () => undefined,
      viewStateManager
    );
  });

  test('AC-5 & AC-6 & AC-7: TreeProvider reflects ViewState options', () => {
    const mockEditor = {
      document: {
        fileName: 'config.json',
        getText: () => '{"name": "test"}',
      } as vscode.TextDocument,
    } as vscode.TextEditor;

    const provider = new StructMapTreeProvider(
      structMapService,
      () => mockEditor,
      viewStateManager
    );

    // Default ViewState: showRoot = true, showTypes = true
    let rootItems = provider.getChildren() as vscode.TreeItem[];
    assert.strictEqual(rootItems.length, 1);
    assert.strictEqual(rootItems[0].label, 'config.json');

    // Toggle Root OFF
    viewStateManager.setShowRoot(false);
    rootItems = provider.getChildren() as vscode.TreeItem[];
    assert.strictEqual(rootItems.length, 1);
    assert.strictEqual(rootItems[0].label, 'name : string');

    // Toggle Types OFF
    viewStateManager.setShowTypes(false);
    rootItems = provider.getChildren() as vscode.TreeItem[];
    assert.strictEqual(rootItems.length, 1);
    assert.strictEqual(rootItems[0].label, 'name');
  });


  test('Jump command accepts only nodes belonging to the active document', () => {
    const document = { fileName: '/workspace/current.md' };
    const editor = { document } as vscode.TextEditor;
    const window: { activeTextEditor: vscode.TextEditor | undefined } = { activeTextEditor: editor };
    const callbacks = new Map<string, (node?: StructNode) => void>();
    const exports = {} as { registerCommands: typeof registerCommands };
    runInNewContext(readFileSync(path.join(__dirname, '../../vscode/commands/index.js'), 'utf8'), {
      exports,
      require: (id: string) => {
        if (id === 'vscode') {
          return {
            window,
            commands: {
              registerCommand: (name: string, callback: (node?: StructNode) => void) => {
                callbacks.set(name, callback);
                return new vscode.Disposable(() => {});
              }
            }
          };
        }
        if (id === '../../core') return {};
        throw new Error(`Unexpected import: ${id}`);
      }
    });
    const calls: { editor: vscode.TextEditor; node: StructNode }[] = [];
    nodeNavigator.jumpToNode = (editor, node) => { calls.push({ editor, node }); return true; };
    exports.registerCommands(
      { subscriptions: [] } as unknown as vscode.ExtensionContext,
      treeDataProvider, viewStateManager, structMapService, nodeNavigator
    );
    const jump = callbacks.get('structmap-solo.jumpToNode');
    assert.ok(jump);
    const node: StructNode = {
      id: 'heading', name: 'Heading', path: [document.fileName, 'Heading'],
      nodeType: 'section', children: []
    };
    jump({ ...node, path: ['/workspace/previous.md', 'Heading'] });
    jump({ ...node, path: [] });
    jump();
    assert.strictEqual(calls.length, 0);
    jump(node);
    assert.deepStrictEqual(calls, [{ editor, node }]);
    window.activeTextEditor = undefined;
    jump(node);
    assert.strictEqual(calls.length, 1);
  });

  test('Command registration registers commands in subscriptions', () => {
    const subscriptions: vscode.Disposable[] = [];
    const context = { subscriptions } as unknown as vscode.ExtensionContext;

    registerCommands(
      context,
      treeDataProvider,
      viewStateManager,
      structMapService,
      nodeNavigator
    );

    assert.strictEqual(subscriptions.length, 6);
  });
});
