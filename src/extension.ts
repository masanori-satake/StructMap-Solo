import * as vscode from 'vscode';
import { StructMapService } from './core';
import { setStructMapTreeView } from './vscode/view/StructMapView';
import { updateTreeStyleDescription } from './vscode/view/StructMapView';
import {
  NodeNavigator,
  registerCommands,
  StructMapTreeProvider,
  TreeExpansionState,
  updateTypesSupportedContext,
  ViewStateManager,
} from './vscode';

export function activate(context: vscode.ExtensionContext): void {
  const viewStateManager = new ViewStateManager(context);
  const structMapService = new StructMapService();
  const nodeNavigator = new NodeNavigator();
  const treeExpansionState = new TreeExpansionState();

  const treeDataProvider = new StructMapTreeProvider(
    structMapService,
    () => vscode.window.activeTextEditor,
    viewStateManager
  );

  const treeView = vscode.window.createTreeView('structmap-solo.view', {
    treeDataProvider,
  });

  // Register the tree view globally for description updates
  setStructMapTreeView(treeView);
  // Initialize description with current tree style
  updateTreeStyleDescription(viewStateManager.getState().treeStyle);

  async function syncInitialExpansionState(): Promise<void> {
    const topItems = (await treeDataProvider.getChildren()) as import('./vscode').StructTreeItem[] | undefined;
    if (!topItems) {
      return;
    }

    async function processItem(item: import('./vscode').StructTreeItem): Promise<void> {
      if (
        item.collapsibleState === vscode.TreeItemCollapsibleState.Expanded &&
        item.node &&
        item.node.id
      ) {
        treeExpansionState.expand(item.node.id);
        const children = (await treeDataProvider.getChildren(item)) as import('./vscode').StructTreeItem[] | undefined;
        if (children) {
          for (const child of children) {
            await processItem(child);
          }
        }
      }
    }

    for (const item of topItems) {
      await processItem(item);
    }
  }

  // Register initial expanded nodes
  syncInitialExpansionState();

  registerCommands(
    context,
    treeDataProvider,
    viewStateManager,
    structMapService,
    nodeNavigator,
    treeView,
    treeExpansionState
  );

  updateTypesSupportedContext(vscode.window.activeTextEditor, structMapService);

  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  const cancelPendingRefresh = (): void => {
    if (refreshTimer !== undefined) {
      clearTimeout(refreshTimer);
      refreshTimer = undefined;
    }
  };

  context.subscriptions.push(
    treeView,
    treeView.onDidExpandElement((e) => {
      if (e.element.id) {
        treeExpansionState.expand(e.element.id);
      }
    }),
    treeView.onDidCollapseElement((e) => {
      if (e.element.id) {
        treeExpansionState.collapse(e.element.id);
      }
    }),
    new vscode.Disposable(cancelPendingRefresh),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      cancelPendingRefresh();
      updateTypesSupportedContext(editor, structMapService);
      if (editor && editor.document) {
        const config = vscode.workspace.getConfiguration('structMap', editor.document.uri);
        if (!config.get<boolean>('autoRefresh', true)) {
          return;
        }
      }
      treeExpansionState.clear();
      syncInitialExpansionState();
      treeDataProvider.refresh();
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (
        vscode.window.activeTextEditor &&
        e.document === vscode.window.activeTextEditor.document
      ) {
        cancelPendingRefresh();
        const config = vscode.workspace.getConfiguration('structMap', e.document.uri);
        if (!config.get<boolean>('autoRefresh', true)) {
          return;
        }
        refreshTimer = setTimeout(() => {
          refreshTimer = undefined;
          if (
            e.document === vscode.window.activeTextEditor?.document &&
            vscode.workspace.getConfiguration('structMap', e.document.uri)
              .get<boolean>('autoRefresh', true)
          ) {
            treeDataProvider.refresh();
          }
        }, config.get<number>('debounceMs', 500));
      }
    })
  );
}

export function deactivate(): void {
  // Clean up resources if necessary
}
