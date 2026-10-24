import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  ViewStateManager,
  DEFAULT_VIEW_STATE,
  VIEW_STATE_KEY,
  ViewState,
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

  public setRaw(key: string, value: unknown): void {
    this.storage.set(key, value);
  }
}

suite('ViewStateManager Test Suite', () => {
  let memento: MockMemento;
  let manager: ViewStateManager;

  setup(() => {
    memento = new MockMemento();
    manager = new ViewStateManager(memento);
  });

  test('Should return DEFAULT_VIEW_STATE on initial setup', () => {
    const state = manager.getState();
    assert.deepStrictEqual(state, DEFAULT_VIEW_STATE);
  });

  test('Should accept ExtensionContext and use globalState', () => {
    const mockContext = {
      globalState: memento,
    } as unknown as vscode.ExtensionContext;
    const ctxManager = new ViewStateManager(mockContext);
    assert.deepStrictEqual(ctxManager.getState(), DEFAULT_VIEW_STATE);
  });

  test('Should update showTypes and persist to memento', async () => {
    await manager.setShowTypes(false);
    assert.strictEqual(manager.getState().showTypes, false);
    assert.strictEqual(manager.getState().showRoot, true);
    assert.strictEqual(manager.getState().treeStyle, 'unicode');

    const rawStored = memento.get<ViewState>(VIEW_STATE_KEY);
    assert.strictEqual(rawStored?.showTypes, false);
  });

  test('Should update showRoot and persist to memento', async () => {
    await manager.setShowRoot(false);
    assert.strictEqual(manager.getState().showRoot, false);

    const rawStored = memento.get<ViewState>(VIEW_STATE_KEY);
    assert.strictEqual(rawStored?.showRoot, false);
  });

  test('Should update treeStyle and persist to memento', async () => {
    await manager.setTreeStyle('ascii');
    assert.strictEqual(manager.getState().treeStyle, 'ascii');

    const rawStored = memento.get<ViewState>(VIEW_STATE_KEY);
    assert.strictEqual(rawStored?.treeStyle, 'ascii');
  });

  test('Should restore state when a new ViewStateManager is instantiated with existing memento', async () => {
    await manager.setShowTypes(false);
    await manager.setShowRoot(false);
    await manager.setTreeStyle('ascii');

    // Simulate VSCode restart by instantiating new manager with same persistent storage
    const restoredManager = new ViewStateManager(memento);
    const state = restoredManager.getState();

    assert.strictEqual(state.showTypes, false);
    assert.strictEqual(state.showRoot, false);
    assert.strictEqual(state.treeStyle, 'ascii');
  });

  test('Should handle partial or invalid data in memento gracefully', () => {
    memento.setRaw(VIEW_STATE_KEY, {
      showTypes: 'invalid_type', // should fallback to default true
      treeStyle: 'invalid_style', // should fallback to default unicode
      // showRoot omitted -> fallback to default true
    });

    const state = manager.getState();
    assert.strictEqual(state.showTypes, true);
    assert.strictEqual(state.showRoot, true);
    assert.strictEqual(state.treeStyle, 'unicode');
  });

  test('Should reset state to default', async () => {
    await manager.setShowTypes(false);
    await manager.setTreeStyle('ascii');

    await manager.resetState();

    assert.deepStrictEqual(manager.getState(), DEFAULT_VIEW_STATE);
    assert.strictEqual(memento.get(VIEW_STATE_KEY), undefined);
  });
});
