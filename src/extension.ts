import * as vscode from 'vscode';
import { StructMapService } from './core';
import { StructMapTreeProvider } from './vscode/providers/StructMapTreeProvider';

export function activate(context: vscode.ExtensionContext): void {
  const structMapService = new StructMapService();
  const treeDataProvider = new StructMapTreeProvider(structMapService);

  const treeView = vscode.window.createTreeView('structmap-solo.view', {
    treeDataProvider,
  });

  context.subscriptions.push(
    treeView,
    vscode.window.onDidChangeActiveTextEditor(() => treeDataProvider.refresh()),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (
        vscode.window.activeTextEditor &&
        e.document === vscode.window.activeTextEditor.document
      ) {
        treeDataProvider.refresh();
      }
    })
  );
}

export function deactivate(): void {
  // Clean up resources if necessary
}
