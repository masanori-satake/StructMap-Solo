import * as vscode from 'vscode';
import { StructMapService } from './core';
import { setStructMapTreeView } from './vscode/view/StructMapView';
import { updateTreeStyleDescription } from './vscode/view/StructMapView';
import {
  NodeNavigator,
  registerCommands,
  StructMapTreeProvider,
  updateTypesSupportedContext,
  ViewStateManager,
} from './vscode';

export function activate(context: vscode.ExtensionContext): void {
  const viewStateManager = new ViewStateManager(context);
  const structMapService = new StructMapService();
  const nodeNavigator = new NodeNavigator();

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

  registerCommands(
    context,
    treeDataProvider,
    viewStateManager,
    structMapService,
    nodeNavigator
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
