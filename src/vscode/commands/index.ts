import * as vscode from 'vscode';
import { isParseSuccess, StructMapService, StructNode, TreeRenderer } from '../../core';
import { NodeNavigator } from '../navigation/NodeNavigator';
import { StructMapTreeProvider } from '../providers/StructMapTreeProvider';
import { ViewStateManager } from '../state/ViewState';
import { updateTreeStyleDescription } from '../view/StructMapView';

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
  const isSupported =
    editor && editor.document
      ? structMapService.supportsTypes(editor.document.fileName)
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
export function registerCommands(
  context: vscode.ExtensionContext,
  treeDataProvider: StructMapTreeProvider,
  viewStateManager: ViewStateManager,
  structMapService: StructMapService,
  nodeNavigator: NodeNavigator
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
      const parseResult = structMapService.build(fileName, content);
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

    vscode.commands.registerCommand('structmap-solo.toggleTypes', async () => {
      const editor = vscode.window.activeTextEditor;
      if (
        !editor ||
        !editor.document ||
        !structMapService.supportsTypes(editor.document.fileName)
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
      treeDataProvider.refresh();
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
