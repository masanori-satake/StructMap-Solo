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

  // Stable key identifying a document, used to compare editor documents.
  const documentKey = (document: vscode.TextDocument): string =>
    document.uri ? document.uri.toString() : document.fileName;

  // Key of the document the tree currently targets. Used to tell a real
  // document switch apart from a temporary focus move to a non-text editor
  // such as the Markdown preview, which must leave the tree untouched.
  let lastTargetKey: string | undefined = vscode.window.activeTextEditor?.document
    ? documentKey(vscode.window.activeTextEditor.document)
    : undefined;

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
      if (!editor || !editor.document) {
        // A non-text editor (Markdown preview, settings, webview, ...)
        // became active. Keep the current tree, its expansion state and
        // the types context exactly as they are.
        return;
      }
      updateTypesSupportedContext(editor, structMapService);
      const key = documentKey(editor.document);
      if (key === lastTargetKey) {
        // Back to the document the tree already shows (e.g. returning
        // from its preview). Nothing needs to be redrawn.
        return;
      }
      cancelPendingRefresh();
      const config = vscode.workspace.getConfiguration('structMap', editor.document.uri);
      if (!config.get<boolean>('autoRefresh', true)) {
        // The tree keeps showing the previous document. Do not record
        // the new document as the target either, so that a later editor
        // change can still redraw it once autoRefresh is enabled again.
        // This keeps lastTargetKey in sync with the provider's retained
        // document, which only changes when the tree is redrawn.
        return;
      }
      lastTargetKey = key;
      treeExpansionState.clear();
      syncInitialExpansionState();
      treeDataProvider.refresh();
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      if (documentKey(document) === lastTargetKey) {
        lastTargetKey = undefined;
      }
      if (treeDataProvider.forgetDocument(document)) {
        // Forgetting the retained document always happens, but the
        // automatic redraw follows the autoRefresh setting, as with
        // editor changes and edits.
        const config = vscode.workspace.getConfiguration('structMap', document.uri);
        if (!config.get<boolean>('autoRefresh', true)) {
          return;
        }
        treeExpansionState.clear();
        treeDataProvider.refresh();
      }
    }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      const isTargetDocument =
        e.document === vscode.window.activeTextEditor?.document ||
        e.document === treeDataProvider.getTargetDocument();
      if (isTargetDocument) {
        cancelPendingRefresh();
        const config = vscode.workspace.getConfiguration('structMap', e.document.uri);
        if (!config.get<boolean>('autoRefresh', true)) {
          return;
        }
        refreshTimer = setTimeout(() => {
          refreshTimer = undefined;
          if (
            (e.document === vscode.window.activeTextEditor?.document ||
              e.document === treeDataProvider.getTargetDocument()) &&
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
