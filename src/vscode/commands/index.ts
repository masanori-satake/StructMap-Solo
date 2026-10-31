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
    ? (vscode.workspace.getConfiguration('structMap', editor.document.uri).get<Record<string, string>>('customMappings') ||
       vscode.workspace.getConfiguration('structMapSolo', editor.document.uri).get<Record<string, string>>('customMappings'))
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
  const configSolo = vscode.workspace?.getConfiguration
    ? vscode.workspace.getConfiguration('structMapSolo', documentUri)
    : undefined;
  const maxFileSizeMB = config ? config.get<number>('maxFileSizeMB', 5) : 5;
  const maxArrayItems = config ? config.get<number>('maxArrayItems', 50) : 50;
  const customMappings =
    (config ? config.get<Record<string, string>>('customMappings') : undefined) ||
    (configSolo ? configSolo.get<Record<string, string>>('customMappings') : undefined);
  return { maxFileSizeMB, maxArrayItems, customMappings };
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
      const editor = vscode.window.activeTextEditor;
      if (!editor || !editor.document) {
        vscode.window.showWarningMessage(
          vscode.l10n?.t
            ? vscode.l10n.t('No active text editor to copy tree from.')
            : 'No active text editor to copy tree from.'
        );
        return;
      }
      const fileName = editor.document.fileName;
      const content = editor.document.getText();
      const { maxFileSizeMB, maxArrayItems, customMappings } = getStructMapConfig(editor.document.uri);
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
      const editor = vscode.window.activeTextEditor;
      if (!editor || !editor.document) {
        vscode.window.showWarningMessage(
          vscode.l10n?.t
            ? vscode.l10n.t('No active text editor to copy tree from.')
            : 'No active text editor to copy tree from.'
        );
        return;
      }
      const fileName = editor.document.fileName;
      const content = editor.document.getText();
      const { maxFileSizeMB, maxArrayItems } = getStructMapConfig(editor.document.uri);
      const parseResult = structMapService.build(fileName, content, maxFileSizeMB, maxArrayItems);
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
      const editor = vscode.window.activeTextEditor;
      const customMappings = editor && editor.document
        ? (vscode.workspace.getConfiguration('structMap', editor.document.uri).get<Record<string, string>>('customMappings') ||
           vscode.workspace.getConfiguration('structMapSolo', editor.document.uri).get<Record<string, string>>('customMappings'))
        : undefined;
      if (
        !editor ||
        !editor.document ||
        !structMapService.supportsTypes(editor.document.fileName, customMappings)
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
      updateTypesSupportedContext(vscode.window.activeTextEditor, structMapService);
      treeDataProvider.refresh();
    }),

    vscode.commands.registerCommand(
      'structmap-solo.jumpToNode',
      (node: StructNode) => {
        const editor = vscode.window.activeTextEditor;
        if (editor && node) {
          nodeNavigator.jumpToNode(editor, node);
        }
      }
    )
  );
}
