import * as assert from 'assert';
import { readFileSync } from 'fs';
import * as path from 'path';
import { runInNewContext } from 'vm';
import * as vscode from 'vscode';

suite('Extension automatic refresh', () => {
  function createHarness() {
    const changes = new vscode.EventEmitter<{ document: object }>();
    const editors = new vscode.EventEmitter<void>();
    const document = { uri: vscode.Uri.parse('untitled:active.md') };
    const window = {
      activeTextEditor: { document },
      createTreeView: () => new vscode.Disposable(() => {}),
      onDidChangeActiveTextEditor: editors.event,
    };
    const settings = { autoRefresh: true, debounceMs: 100 };
    let refreshes = 0;
    let now = 0;
    let timerId = 0;
    const timers = new Map<number, { callback: () => void; due: number }>();
    const subscriptions: vscode.Disposable[] = [];
    const exports = {} as { activate: (context: { subscriptions: vscode.Disposable[] }) => void };
    runInNewContext(readFileSync(path.join(__dirname, '../../extension.js'), 'utf8'), {
      exports,
      require: (id: string) => {
        switch (id) {
          case 'vscode': return {
            ...vscode,
            window,
            workspace: {
              onDidChangeTextDocument: changes.event,
              getConfiguration: (section: string, uri: vscode.Uri) => {
                assert.strictEqual(section, 'structMap');
                assert.strictEqual(uri, document.uri);
                return { get: (key: keyof typeof settings) => settings[key] };
              },
            },
          };
          case './core': return { StructMapService: class {} };
          case './vscode/providers/StructMapTreeProvider': return {
            StructMapTreeProvider: class { refresh() { refreshes++; } },
          };
          default: throw new Error(`Unexpected import: ${id}`);
        }
      },
      setTimeout: (callback: () => void, delay: number) => {
        timers.set(++timerId, { callback, due: now + delay });
        return timerId;
      },
      clearTimeout: (id: number) => timers.delete(id),
    });
    exports.activate({ subscriptions });
    return {
      settings,
      edit: (changedDocument = document) => changes.fire({ document: changedDocument }),
      switchEditor: () => editors.fire(),
      get refreshes() { return refreshes; },
      advance: (ms: number) => {
        now += ms;
        for (const [id, timer] of timers) {
          if (timer.due <= now) {
            timers.delete(id);
            timer.callback();
          }
        }
      },
      dispose: () => {
        subscriptions.forEach(subscription => subscription.dispose());
        changes.dispose();
        editors.dispose();
      },
    };
  }

  let harness: ReturnType<typeof createHarness>;
  setup(() => { harness = createHarness(); });
  teardown(() => harness.dispose());

  test('disabled automatic refresh ignores edits', () => {
    harness.settings.autoRefresh = false;
    harness.edit();
    harness.advance(1000);
    assert.strictEqual(harness.refreshes, 0);
  });

  test('edits are coalesced until the configured delay after the last edit', () => {
    harness.settings.debounceMs = 250;
    harness.edit();
    harness.advance(200);
    assert.strictEqual(harness.refreshes, 0);
    harness.edit();
    harness.advance(249);
    assert.strictEqual(harness.refreshes, 0);
    harness.advance(1);
    assert.strictEqual(harness.refreshes, 1);
    harness.advance(1000);
    assert.strictEqual(harness.refreshes, 1);
  });

  test('edits in inactive documents do not postpone an active document refresh', () => {
    harness.edit();
    harness.advance(50);
    harness.edit({ uri: vscode.Uri.parse('untitled:inactive.md') });
    harness.advance(50);
    assert.strictEqual(harness.refreshes, 1);
  });

  test('disabling automatic refresh prevents a pending refresh', () => {
    harness.edit();
    harness.settings.autoRefresh = false;
    harness.advance(100);
    assert.strictEqual(harness.refreshes, 0);
  });

  test('editor changes refresh immediately and cancel pending document refreshes', () => {
    harness.edit();
    harness.switchEditor();
    assert.strictEqual(harness.refreshes, 1);
    harness.advance(100);
    assert.strictEqual(harness.refreshes, 1);
  });

  test('disposal cancels pending refreshes', () => {
    harness.edit();
    harness.dispose();
    harness.advance(100);
    assert.strictEqual(harness.refreshes, 0);
  });
});
