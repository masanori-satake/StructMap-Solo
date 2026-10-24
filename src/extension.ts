import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  console.log('StructMap-Solo extension is now active.', context.extensionPath);
}

export function deactivate(): void {
  // Clean up resources if necessary
}
