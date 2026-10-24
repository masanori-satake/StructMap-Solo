import * as assert from 'assert';
import * as vscode from 'vscode';
import { StructMapService } from '../../core';
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
