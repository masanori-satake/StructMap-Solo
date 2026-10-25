import * as vscode from 'vscode';

/**
 * Holds a reference to the StructMap TreeView so other modules (e.g., commands) can update UI aspects
 * such as the description that appears next to the view title.
 */
export let structMapTreeView: vscode.TreeView<vscode.TreeItem> | undefined;

/**
 * Set the TreeView instance after creation. Called from extension activation.
 */
export function setStructMapTreeView(view: vscode.TreeView<any>): void {
  structMapTreeView = view;
}

/**
 * Update the description displayed next to the view title to reflect the current tree style.
 * The description appears in a lighter, secondary font beside the view title.
 */
export function updateTreeStyleDescription(style: string): void {
  if (structMapTreeView) {
    structMapTreeView.description = style;
  }
}
