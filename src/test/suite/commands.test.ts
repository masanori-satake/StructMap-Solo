import * as assert from 'assert';
import * as vscode from 'vscode';
import { StructMapService } from '../../core';
import {
  NodeNavigator,
  registerCommands,
  StructMapTreeProvider,
  StructTreeItem,
  updateTypesSupportedContext,
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
  let subscriptions: vscode.Disposable[];

  setup(() => {
    subscriptions = [];
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

  teardown(() => {
    subscriptions.forEach((d) => d.dispose());
    subscriptions = [];
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
    const context = { subscriptions } as unknown as vscode.ExtensionContext;

    registerCommands(
      context,
      treeDataProvider,
      viewStateManager,
      structMapService,
      nodeNavigator
    );

    assert.strictEqual(subscriptions.length, 9);
  });

  test('expandAll expands non-range nodes and skips range nodes', async () => {
    let expandAllHandler: (() => Promise<void>) | undefined;

    const originalRegister = vscode.commands.registerCommand;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (vscode.commands as any).registerCommand = (command: string, callback: (...args: any[]) => any) => {
      if (command === 'structmap-solo.expandAll') {
        expandAllHandler = callback;
      }
      return { dispose: () => {} };
    };

    const revealedItems: string[] = [];
    const mockTreeView = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reveal: async (item: any) => {
        if (item && item.node) {
          revealedItems.push(item.node.name);
        }
      },
    } as unknown as vscode.TreeView<StructTreeItem>;

    try {
      // Create document with array containing > 50 items so range node is created
      const itemsArray = Array.from({ length: 60 }, (_, i) => ({ id: i, nested: { val: i } }));
      const mockEditor = {
        document: {
          fileName: 'data.json',
          getText: () => JSON.stringify({ items: itemsArray, obj: { prop: 1 } }),
        } as vscode.TextDocument,
      } as vscode.TextEditor;

      const provider = new StructMapTreeProvider(
        structMapService,
        () => mockEditor,
        viewStateManager
      );

      const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
      registerCommands(
        context,
        provider,
        viewStateManager,
        structMapService,
        nodeNavigator,
        mockTreeView
      );

      assert.ok(expandAllHandler, 'expandAll command should be registered');
      await expandAllHandler();

      // Root node, items, obj, and items [0]..[49] should be revealed
      assert.ok(revealedItems.includes('data.json'));
      assert.ok(revealedItems.includes('items'));
      assert.ok(revealedItems.includes('obj'));
      assert.ok(revealedItems.includes('[0]'));

      // Range node [50 .. 59] must NOT be revealed or expanded
      assert.strictEqual(revealedItems.includes('[50 .. 59]'), false);
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.commands as any).registerCommand = originalRegister;
    }
  });

  test('collapseAll executes workbench collapseAll command', async () => {
    let collapseAllHandler: (() => Promise<void>) | undefined;
    let executedCommand = '';

    const originalRegister = vscode.commands.registerCommand;
    const originalExecuteCommand = vscode.commands.executeCommand;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (vscode.commands as any).registerCommand = (command: string, callback: (...args: any[]) => any) => {
      if (command === 'structmap-solo.collapseAll') {
        collapseAllHandler = callback;
      }
      return { dispose: () => {} };
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (vscode.commands as any).executeCommand = async (command: string, ...args: any[]) => {
      executedCommand = command;
      return originalExecuteCommand.call(vscode.commands, command, ...args);
    };

    try {
      const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
      registerCommands(
        context,
        treeDataProvider,
        viewStateManager,
        structMapService,
        nodeNavigator
      );

      assert.ok(collapseAllHandler, 'collapseAll command should be registered');
      await collapseAllHandler();

      assert.strictEqual(
        executedCommand,
        'workbench.actions.treeView.structmap-solo.view.collapseAll'
      );
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.commands as any).registerCommand = originalRegister;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.commands as any).executeCommand = originalExecuteCommand;
    }
  });

  test('updateTypesSupportedContext sets structmap-solo.typesSupported context', async () => {
    let contextKey = '';
    let contextValue: unknown = undefined;

    const originalExecuteCommand = vscode.commands.executeCommand;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (vscode.commands as any).executeCommand = async (command: string, ...args: any[]) => {
      if (command === 'setContext') {
        contextKey = args[0];
        contextValue = args[1];
      }
      return originalExecuteCommand.call(vscode.commands, command, ...args);
    };

    try {
      // JSON editor -> typesSupported = true
      const jsonEditor = {
        document: { fileName: 'data.json' } as vscode.TextDocument,
      } as vscode.TextEditor;
      await updateTypesSupportedContext(jsonEditor, structMapService);
      assert.strictEqual(contextKey, 'structmap-solo.typesSupported');
      assert.strictEqual(contextValue, true);

      // YAML editor -> typesSupported = true
      const yamlEditor = {
        document: { fileName: 'config.yaml' } as vscode.TextDocument,
      } as vscode.TextEditor;
      await updateTypesSupportedContext(yamlEditor, structMapService);
      assert.strictEqual(contextKey, 'structmap-solo.typesSupported');
      assert.strictEqual(contextValue, true);

      // Markdown editor -> typesSupported = false
      const mdEditor = {
        document: { fileName: 'README.md' } as vscode.TextDocument,
      } as vscode.TextEditor;
      await updateTypesSupportedContext(mdEditor, structMapService);
      assert.strictEqual(contextKey, 'structmap-solo.typesSupported');
      assert.strictEqual(contextValue, false);

      // undefined editor -> typesSupported = false
      await updateTypesSupportedContext(undefined, structMapService);
      assert.strictEqual(contextKey, 'structmap-solo.typesSupported');
      assert.strictEqual(contextValue, false);
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.commands as any).executeCommand = originalExecuteCommand;
    }
  });

  test('toggleTreeStyle command updates ViewState and tree style description without refreshing treeDataProvider', async () => {
    let toggleTreeStyleHandler: (() => Promise<void>) | undefined;

    const originalRegister = vscode.commands.registerCommand;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (vscode.commands as any).registerCommand = (command: string, callback: (...args: any[]) => any) => {
      if (command === 'structmap-solo.toggleTreeStyle') {
        toggleTreeStyleHandler = callback;
      }
      return { dispose: () => {} };
    };

    let refreshed = false;
    const mockTreeDataProvider = {
      refresh: () => {
        refreshed = true;
      },
    } as unknown as StructMapTreeProvider;

    const mockTreeView = {
      description: undefined,
    } as unknown as vscode.TreeView<StructTreeItem>;

    // Set mock treeView
    const { setStructMapTreeView } = await import('../../vscode/view/StructMapView');
    setStructMapTreeView(mockTreeView as unknown as vscode.TreeView<vscode.TreeItem>);

    try {
      const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
      registerCommands(
        context,
        mockTreeDataProvider,
        viewStateManager,
        structMapService,
        nodeNavigator
      );

      assert.ok(toggleTreeStyleHandler, 'toggleTreeStyle command should be registered');

      // Initial treeStyle is 'unicode'
      assert.strictEqual(viewStateManager.getState().treeStyle, 'unicode');

      await toggleTreeStyleHandler();

      // ViewState updated to 'ascii'
      assert.strictEqual(viewStateManager.getState().treeStyle, 'ascii');
      // treeStyle description on TreeView updated to 'ascii'
      assert.strictEqual(mockTreeView.description, 'ascii');
      // treeDataProvider.refresh() must NOT be called to avoid view flickering
      assert.strictEqual(refreshed, false);
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.commands as any).registerCommand = originalRegister;
      setStructMapTreeView(undefined as unknown as vscode.TreeView<vscode.TreeItem>);
    }
  });

  test('toggleTypes command ignores non-types-supported active editor', async () => {
    let toggleHandler: (() => Promise<void>) | undefined;

    const originalRegister = vscode.commands.registerCommand;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (vscode.commands as any).registerCommand = (command: string, callback: (...args: any[]) => any) => {
      if (command === 'structmap-solo.toggleTypes') {
        toggleHandler = callback;
      }
      return { dispose: () => {} };
    };

    try {
      const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
      registerCommands(
        context,
        treeDataProvider,
        viewStateManager,
        structMapService,
        nodeNavigator
      );

      assert.ok(toggleHandler, 'toggleTypes command should be registered');

      // State is initially showTypes = true
      assert.strictEqual(viewStateManager.getState().showTypes, true);

      // If activeTextEditor is undefined, toggleTypes does not change state
      await toggleHandler();
      assert.strictEqual(viewStateManager.getState().showTypes, true);

      // Mock activeTextEditor with Markdown document
      const originalActiveTextEditorDescriptor = Object.getOwnPropertyDescriptor(
        vscode.window,
        'activeTextEditor'
      );
      Object.defineProperty(vscode.window, 'activeTextEditor', {
        value: {
          document: { fileName: 'sample.md' } as vscode.TextDocument,
        } as vscode.TextEditor,
        configurable: true,
      });

      try {
        await toggleHandler();
        // showTypes remains true (not toggled) because Markdown does not support types
        assert.strictEqual(viewStateManager.getState().showTypes, true);

        // Mock activeTextEditor with JSON document
        Object.defineProperty(vscode.window, 'activeTextEditor', {
          value: {
            document: { fileName: 'data.json' } as vscode.TextDocument,
          } as vscode.TextEditor,
          configurable: true,
        });

        await toggleHandler();
        // showTypes toggles to false for JSON
        assert.strictEqual(viewStateManager.getState().showTypes, false);
      } finally {
        if (originalActiveTextEditorDescriptor) {
          Object.defineProperty(vscode.window, 'activeTextEditor', originalActiveTextEditorDescriptor);
        } else {
          Reflect.deleteProperty(vscode.window, 'activeTextEditor');
        }
      }
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (vscode.commands as any).registerCommand = originalRegister;
    }
  });
});
