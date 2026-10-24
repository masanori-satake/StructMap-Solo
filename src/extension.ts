import * as vscode from 'vscode';
import { StructMapService } from './core';
import { StructMapTreeProvider } from './vscode/providers/StructMapTreeProvider';

export function activate(context: vscode.ExtensionContext): void {
  const structMapService = new StructMapService();
  const treeDataProvider = new StructMapTreeProvider(structMapService);

  const treeView = vscode.window.createTreeView('structmap-solo.view', {
    treeDataProvider,
  });
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
