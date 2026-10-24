import * as vscode from 'vscode';
import { StructMapService } from './core';
import {
  NodeNavigator,
  registerCommands,
  StructMapTreeProvider,
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

  registerCommands(
    context,
    treeDataProvider,
    viewStateManager,
    structMapService,
    nodeNavigator
  );

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
    vscode.window.onDidChangeActiveTextEditor(() => {
      cancelPendingRefresh();
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
        }, config.get<number>('debounceMs', 300));
      }
    })
  );
}

export function deactivate(): void {
  // Clean up resources if necessary
}
