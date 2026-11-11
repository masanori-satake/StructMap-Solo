import * as vscode from 'vscode';
import { isParseSuccess, StructMapService, StructNode, TreeRenderer } from '../../core';
import { NodeNavigator } from '../navigation/NodeNavigator';
import { StructMapTreeProvider, StructTreeItem } from '../providers/StructMapTreeProvider';
import { ViewStateManager } from '../state/ViewState';
import { TreeExpansionState } from '../view/TreeExpansionState';
import { VisibleTreeProjection } from '../view/VisibleTreeProjection';
import { structMapTreeView, updateTreeStyleDescription } from '../view/StructMapView';

/**
 * Updates the VS Code context key indicating whether the active document supports type toggle.
 *
 * @param editor Currently active text editor, or undefined.
 * @param structMapService Service for parsing and format inspection.
 */
export function updateTypesSupportedContext(
  editor: vscode.TextEditor | undefined,
  structMapService: StructMapService
): Thenable<unknown> {
  const customMappings = editor && editor.document
    ? vscode.workspace.getConfiguration('structMap', editor.document.uri).get<Record<string, string>>('customMappings')
    : undefined;
  const isSupported =
    editor && editor.document
      ? structMapService.supportsTypes(editor.document.fileName, customMappings)
      : false;
  return vscode.commands.executeCommand(
    'setContext',
    'structmap-solo.typesSupported',
    isSupported
  );
}

/**
 * Registers all StructMap commands with VSCode.
 *
 * @param context Extension context.
 * @param treeDataProvider Tree view provider instance.
 * @param viewStateManager ViewState manager instance.
 * @param structMapService Service for parsing document trees.
 * @param nodeNavigator Service for navigating active editor to node positions.
 */
/**
 * Helper to retrieve structMap workspace configurations for a given document URI.
 */
function getStructMapConfig(documentUri?: vscode.Uri): {
  maxFileSizeMB: number;
  maxArrayItems: number;
  customMappings?: Record<string, string>;
} {
  const config = vscode.workspace?.getConfiguration
    ? vscode.workspace.getConfiguration('structMap', documentUri)
    : undefined;
  const maxFileSizeMB = config ? config.get<number>('maxFileSizeMB', 5) : 5;
  const maxArrayItems = config ? config.get<number>('maxArrayItems', 50) : 50;
  const customMappings = config ? config.get<Record<string, string>>('customMappings') : undefined;
  return { maxFileSizeMB, maxArrayItems, customMappings };
}

/**
 * Resolves the document a command should operate on: the active text
 * editor's document when there is one, otherwise the tree's remembered
 * target document. The fallback lets commands keep working while a
 * non-text editor such as the Markdown preview has focus.
 */
function resolveTargetDocument(
  treeDataProvider: StructMapTreeProvider
): vscode.TextDocument | undefined {
  const activeDocument = vscode.window.activeTextEditor?.document;
  if (activeDocument) {
    return activeDocument;
  }
  return typeof treeDataProvider.getTargetDocument === 'function'
    ? treeDataProvider.getTargetDocument()
    : undefined;
}

export function registerCommands(
  context: vscode.ExtensionContext,
  treeDataProvider: StructMapTreeProvider,
  viewStateManager: ViewStateManager,
  structMapService: StructMapService,
  nodeNavigator: NodeNavigator,
  treeView?: vscode.TreeView<StructTreeItem>,
  treeExpansionState?: TreeExpansionState
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('structmap-solo.copyTree', async () => {
      const document = resolveTargetDocument(treeDataProvider);
      if (!document) {
        vscode.window.showWarningMessage(
          vscode.l10n?.t
            ? vscode.l10n.t('No active text editor to copy tree from.')
            : 'No active text editor to copy tree from.'
        );
        return;
      }
      const fileName = document.fileName;
      const content = document.getText();
      const { maxFileSizeMB, maxArrayItems, customMappings } = getStructMapConfig(document.uri);
      const parseResult = structMapService.build(fileName, content, maxFileSizeMB, maxArrayItems, customMappings);
      if (!isParseSuccess(parseResult)) {
        vscode.window.showWarningMessage(
          vscode.l10n?.t
            ? vscode.l10n.t('Unable to parse active document structure.')
            : 'Unable to parse active document structure.'
        );
        return;
      }
      const viewState = viewStateManager.getState();
      const renderer = new TreeRenderer();
      const treeText = renderer.render(parseResult.tree, viewState);
      await vscode.env.clipboard.writeText(treeText);
      vscode.window.showInformationMessage(
        vscode.l10n?.t
          ? vscode.l10n.t('StructMap tree copied to clipboard.')
          : 'StructMap tree copied to clipboard.'
      );
    }),

    vscode.commands.registerCommand('structmap-solo.copyVisibleTree', async () => {
      const document = resolveTargetDocument(treeDataProvider);
      if (!document) {
        vscode.window.showWarningMessage(
          vscode.l10n?.t
            ? vscode.l10n.t('No active text editor to copy tree from.')
            : 'No active text editor to copy tree from.'
        );
        return;
      }
      const fileName = document.fileName;
      const content = document.getText();
      const { maxFileSizeMB, maxArrayItems, customMappings } = getStructMapConfig(document.uri);
      const parseResult = structMapService.build(fileName, content, maxFileSizeMB, maxArrayItems, customMappings);
      if (!isParseSuccess(parseResult)) {
        vscode.window.showWarningMessage(
          vscode.l10n?.t
            ? vscode.l10n.t('Unable to parse active document structure.')
            : 'Unable to parse active document structure.'
        );
        return;
      }
      const viewState = viewStateManager.getState();
      const projection = new VisibleTreeProjection();
      const expandedSnapshot = treeExpansionState
        ? treeExpansionState.snapshot()
        : new Set<string>();
      const visibleTree = projection.project(parseResult.tree, expandedSnapshot);
      const renderer = new TreeRenderer();
      const treeText = renderer.render(visibleTree, viewState);
      await vscode.env.clipboard.writeText(treeText);
      vscode.window.showInformationMessage(
        vscode.l10n?.t
          ? vscode.l10n.t('StructMap tree copied to clipboard.')
          : 'StructMap tree copied to clipboard.'
      );
    }),

    vscode.commands.registerCommand('structmap-solo.expandAll', async () => {
      const activeView = treeView || (structMapTreeView as vscode.TreeView<StructTreeItem> | undefined);
      const topItems = (await treeDataProvider.getChildren()) as StructTreeItem[] | undefined;
      if (!topItems || topItems.length === 0) {
        return;
      }

      async function expandNode(item: StructTreeItem): Promise<void> {
        if (!item.node || item.isError) {
          return;
        }
        // Skip expanding range nodes (elements beyond maxArrayItems)
        if (item.node.isRange) {
          return;
        }

        const children = (await treeDataProvider.getChildren(item)) as StructTreeItem[] | undefined;
        if (children && children.length > 0) {
          if (item.node.id && treeExpansionState) {
            treeExpansionState.expand(item.node.id);
          }
          if (activeView) {
            try {
              await activeView.reveal(item, { expand: true, focus: false, select: false });
            } catch {
              // Ignore reveal errors
            }
          }
          for (const child of children) {
            await expandNode(child);
          }
        }
      }

      for (const item of topItems) {
        await expandNode(item);
      }
    }),

    vscode.commands.registerCommand('structmap-solo.collapseAll', async () => {
      if (treeExpansionState) {
        treeExpansionState.clear();
        const viewState = viewStateManager.getState();
        if (viewState.showRoot) {
          const topItems = (await treeDataProvider.getChildren()) as StructTreeItem[] | undefined;
          if (topItems && topItems.length > 0 && topItems[0].node && topItems[0].node.id) {
            treeExpansionState.expand(topItems[0].node.id);
          }
        }
      }
      try {
        await vscode.commands.executeCommand(
          'workbench.actions.treeView.structmap-solo.view.collapseAll'
        );
      } catch {
        treeDataProvider.refresh();
      }
    }),

    vscode.commands.registerCommand('structmap-solo.toggleTypes', async () => {
      const document = resolveTargetDocument(treeDataProvider);
      const customMappings = document
        ? vscode.workspace.getConfiguration('structMap', document.uri).get<Record<string, string>>('customMappings')
        : undefined;
      if (
        !document ||
        !structMapService.supportsTypes(document.fileName, customMappings)
      ) {
        return;
      }
      const currentState = viewStateManager.getState();
      await viewStateManager.setShowTypes(!currentState.showTypes);
      treeDataProvider.refresh();
    }),

    vscode.commands.registerCommand('structmap-solo.toggleTreeStyle', async () => {
      const currentState = viewStateManager.getState();
      const nextStyle = currentState.treeStyle === 'unicode' ? 'ascii' : 'unicode';
      await viewStateManager.setTreeStyle(nextStyle);
      // Update view description to reflect current style
      updateTreeStyleDescription(nextStyle);
    }),

    vscode.commands.registerCommand('structmap-solo.toggleRoot', async () => {
      const currentState = viewStateManager.getState();
      await viewStateManager.setShowRoot(!currentState.showRoot);
      treeDataProvider.refresh();
    }),

    vscode.commands.registerCommand('structmap-solo.refresh', () => {
      // While a non-text editor has focus the tree keeps its previous
      // target, so leave the types context untouched instead of
      // resetting it based on the missing active editor.
      if (vscode.window.activeTextEditor) {
        updateTypesSupportedContext(vscode.window.activeTextEditor, structMapService);
      }
      treeDataProvider.refresh();
    }),

    vscode.commands.registerCommand(
      'structmap-solo.jumpToNode',
      async (node: StructNode) => {
        if (!node) {
          return;
        }
        // Resolve against the tree's target document (active editor, or the
        // retained target while the Markdown preview has focus) rather than
        // only the active editor, so node clicks still jump after the user
        // clicked or selected text in the preview.
        const targetDocument = resolveTargetDocument(treeDataProvider);
        if (!targetDocument) {
          return;
        }
        // Prefer the active editor when it shows the target document (the
        // same document may be open in several panes); otherwise use any
        // visible editor showing it.
        const activeEditor = vscode.window.activeTextEditor;
        const visibleEditors = vscode.window.visibleTextEditors ?? [];
        let editor =
          activeEditor && activeEditor.document === targetDocument
            ? activeEditor
            : visibleEditors.find(
                (candidate) => candidate.document === targetDocument
              );
        if (!editor) {
          // The target document is not shown anywhere (e.g. only its preview
          // is open): open the source beside the current editor and jump.
          editor = await vscode.window.showTextDocument(targetDocument, {
            viewColumn: vscode.ViewColumn.Beside,
            preview: false,
          });
        }
        nodeNavigator.jumpToNode(editor, node);
      }
    )
  );
}
