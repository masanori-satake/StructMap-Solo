import * as vscode from 'vscode';
import { isParseError, isParseSuccess, ParseError, ParseErrorCode, StructMapService, StructNode } from '../../core';

/**
 * Gets the ThemeIcon corresponding to a StructNode's nodeType according to requirements.
 */
function getIconForNodeType(nodeType: StructNode['nodeType']): vscode.ThemeIcon {
  switch (nodeType) {
    case 'root':
      return new vscode.ThemeIcon('file');
    case 'section':
      return new vscode.ThemeIcon('symbol-key');
    case 'object':
      return new vscode.ThemeIcon('symbol-object');
    case 'array':
      return new vscode.ThemeIcon('symbol-array');
    case 'value':
      return new vscode.ThemeIcon('symbol-field');
  }
}

/**
 * Maps a ParseError code to a human-readable TreeView display label.
 */
function getErrorDisplayLabel(error: ParseError): string {
  switch (error.code) {
    case ParseErrorCode.JSON_PARSE_ERROR:
      return 'JSON Parse Error';
    case ParseErrorCode.YAML_PARSE_ERROR:
      return 'YAML Parse Error';
    case ParseErrorCode.FRONTMATTER_PARSE_ERROR:
      return 'Frontmatter Parse Error';
    case ParseErrorCode.UNSUPPORTED_FORMAT:
      return 'Unsupported Format';
    case ParseErrorCode.EMPTY_FILE:
      return 'Empty File';
    default:
      return error.message || 'Parse Error';
  }
}

/**
 * Represents an item in the StructMap TreeView, wrapping either a StructNode or an error message.
 */
export class StructTreeItem extends vscode.TreeItem {
  public readonly node?: StructNode;
  public readonly isError: boolean;

  /**
   * Constructs a StructTreeItem for a StructNode.
   */
  constructor(node: StructNode);
  /**
   * Constructs an error/status StructTreeItem with a display message and optional tooltip.
   */
  constructor(label: string, tooltip?: string);
  constructor(nodeOrLabel: StructNode | string, tooltip?: string) {
    if (typeof nodeOrLabel === 'string') {
      super(nodeOrLabel, vscode.TreeItemCollapsibleState.None);
      this.isError = true;
      this.iconPath = new vscode.ThemeIcon('error');
      if (tooltip) {
        this.tooltip = tooltip;
      }
      this.contextValue = 'structMapErrorItem';
    } else {
      const node = nodeOrLabel;
      const hasChildren = node.children && node.children.length > 0;
      let collapsibleState = vscode.TreeItemCollapsibleState.None;

      if (hasChildren) {
        if (node.nodeType === 'root' || node.name === 'Frontmatter (YAML)' || node.name.startsWith('Frontmatter')) {
          collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        } else {
          collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        }
      }

      super(node.name, collapsibleState);
      this.node = node;
      this.isError = false;
      this.iconPath = getIconForNodeType(node.nodeType);
      this.contextValue = 'structMapNodeItem';

      if (node.nodeType === 'value' && node.value !== undefined) {
        this.description = String(node.value);
      }
    }
  }

  /**
   * Factory method to create an error/status StructTreeItem.
   */
  public static createError(label: string, tooltip?: string): StructTreeItem {
    return new StructTreeItem(label, tooltip);
  }
}

/**
 * VSCode TreeDataProvider connecting StructMapService and VSCode Explorer TreeView.
 */
export class StructMapTreeProvider implements vscode.TreeDataProvider<StructTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<StructTreeItem | undefined | null | void> =
    new vscode.EventEmitter<StructTreeItem | undefined | null | void>();
  public readonly onDidChangeTreeData: vscode.Event<StructTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  constructor(
    private readonly structMapService: StructMapService,
    private readonly getActiveTextEditor: () => vscode.TextEditor | undefined = () =>
      vscode.window.activeTextEditor
  ) {}

  /**
   * Triggers a refresh of the TreeView.
   */
  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Returns the TreeItem representation for an element.
   */
  public getTreeItem(element: StructTreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Returns the children for a given element or the root items if element is undefined.
   */
  public getChildren(element?: StructTreeItem): vscode.ProviderResult<StructTreeItem[]> {
    if (!element) {
      const activeEditor = this.getActiveTextEditor();
      if (!activeEditor || !activeEditor.document) {
        return [StructTreeItem.createError('No Active Editor')];
      }

      const fileName = activeEditor.document.fileName;
      const content = activeEditor.document.getText();

      const parseResult = this.structMapService.build(fileName, content);

      if (isParseError(parseResult)) {
        const displayLabel = getErrorDisplayLabel(parseResult);
        return [StructTreeItem.createError(displayLabel, parseResult.message)];
      }

      if (isParseSuccess(parseResult)) {
        return [new StructTreeItem(parseResult.tree.root)];
      }

      return [StructTreeItem.createError('Parse Error')];
    }

    if (element.isError || !element.node) {
      return [];
    }

    return element.node.children.map((child) => new StructTreeItem(child));
  }
}
