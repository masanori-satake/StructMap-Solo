import * as vscode from 'vscode';
import { isParseError, isParseSuccess, ParseError, ParseErrorCode, StructMapService, StructNode } from '../../core';
import { DEFAULT_VIEW_STATE, ViewState, ViewStateManager } from '../state/ViewState';

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
  const t = (str: string) => (vscode.l10n?.t ? vscode.l10n.t(str) : str);
  switch (error.code) {
    case ParseErrorCode.FILE_TOO_LARGE:
      return t('File Too Large');
    case ParseErrorCode.JSON_PARSE_ERROR:
      return t('JSON Parse Error');
    case ParseErrorCode.YAML_PARSE_ERROR:
      return t('YAML Parse Error');
    case ParseErrorCode.FRONTMATTER_PARSE_ERROR:
      return t('Frontmatter Parse Error');
    case ParseErrorCode.XML_PARSE_ERROR:
      return t('XML Parse Error');
    case ParseErrorCode.TOML_PARSE_ERROR:
      return t('TOML Parse Error');
    case ParseErrorCode.UNSUPPORTED_FORMAT:
      return t('Unsupported Format');
    case ParseErrorCode.EMPTY_FILE:
      return t('Empty File');
    default:
      return error.message || t('Parse Error');
  }
}

/**
 * Formats a node's display label based on ViewState.
 */
function formatNodeLabel(node: StructNode, viewState: ViewState): string {
  if (node.isRange) {
    return node.name;
  }
  if (viewState.showTypes) {
    if (node.nodeType === 'array' || node.nodeType === 'object') {
      return `${node.name} : ${node.nodeType}`;
    }
    if (node.nodeType === 'value') {
      return node.valueType ? `${node.name} : ${node.valueType}` : node.name;
    }
    return node.name;
  } else {
    if (node.nodeType === 'array') {
      return node.children.length === 0 ? `${node.name} []` : node.name;
    }
    if (node.nodeType === 'object') {
      return node.children.length === 0 ? `${node.name} {}` : node.name;
    }
    return node.name;
  }
}

/**
 * Represents an item in the StructMap TreeView, wrapping either a StructNode or an error message.
 */
export class StructTreeItem extends vscode.TreeItem {
  public readonly node?: StructNode;
  public readonly isError: boolean;
  public readonly parent?: StructTreeItem;

  /**
   * Constructs a StructTreeItem for a StructNode.
   */
  constructor(node: StructNode, viewState?: ViewState, parent?: StructTreeItem);
  /**
   * Constructs an error/status StructTreeItem with a display message and optional tooltip.
   */
  constructor(label: string, tooltip?: string);
  constructor(
    nodeOrLabel: StructNode | string,
    tooltipOrViewState?: string | ViewState,
    parent?: StructTreeItem
  ) {
    if (typeof nodeOrLabel === 'string') {
      super(nodeOrLabel, vscode.TreeItemCollapsibleState.None);
      this.isError = true;
      this.iconPath = new vscode.ThemeIcon('error');
      if (typeof tooltipOrViewState === 'string') {
        this.tooltip = tooltipOrViewState;
      }
      this.contextValue = 'structMapErrorItem';
    } else {
      const node = nodeOrLabel;
      const viewState = (typeof tooltipOrViewState === 'object' && tooltipOrViewState)
        ? tooltipOrViewState
        : DEFAULT_VIEW_STATE;

      const hasChildren = node.children && node.children.length > 0;
      let collapsibleState = vscode.TreeItemCollapsibleState.None;

      if (hasChildren) {
        if (node.nodeType === 'root' || node.name === 'Frontmatter (YAML)' || node.name.startsWith('Frontmatter')) {
          collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        } else {
          collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        }
      }

      const displayLabel = formatNodeLabel(node, viewState);
      super(displayLabel, collapsibleState);
      this.id = node.id;
      this.node = node;
      this.isError = false;
      this.parent = parent;
      this.iconPath = getIconForNodeType(node.nodeType);
      this.contextValue = 'structMapNodeItem';

      if (node.nodeType === 'value' && node.value !== undefined) {
        this.description = String(node.value);
      }

      // Command for jump to node in active editor
      this.command = {
        command: 'structmap-solo.jumpToNode',
        title: 'Jump to Node',
        arguments: [this.node],
      };
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
      vscode.window.activeTextEditor,
    private readonly viewStateManager?: ViewStateManager
  ) {}

  /**
   * Triggers a refresh of the TreeView.
   */
  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  /**
   * Returns the parent of a given TreeItem element to support TreeView API navigation and reveal.
   */
  public getParent(element: StructTreeItem): StructTreeItem | undefined {
    return element.parent;
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
    const viewState = this.viewStateManager
      ? this.viewStateManager.getState()
      : DEFAULT_VIEW_STATE;

    if (!element) {
      const activeEditor = this.getActiveTextEditor();
      if (!activeEditor || !activeEditor.document) {
        return [
          StructTreeItem.createError(
            vscode.l10n?.t ? vscode.l10n.t('No Active Editor') : 'No Active Editor'
          ),
        ];
      }

      const fileName = activeEditor.document.fileName;
      const content = activeEditor.document.getText();

      const config = vscode.workspace?.getConfiguration
        ? vscode.workspace.getConfiguration('structMap', activeEditor.document.uri)
        : undefined;
      const configSolo = vscode.workspace?.getConfiguration
        ? vscode.workspace.getConfiguration('structMapSolo', activeEditor.document.uri)
        : undefined;
      const maxFileSizeMB = config ? config.get<number>('maxFileSizeMB', 5) : 5;
      const maxArrayItems = config ? config.get<number>('maxArrayItems', 50) : 50;
      const customMappings =
        (config ? config.get<Record<string, string>>('customMappings') : undefined) ||
        (configSolo ? configSolo.get<Record<string, string>>('customMappings') : undefined);

      const parseResult = this.structMapService.build(
        fileName,
        content,
        maxFileSizeMB,
        maxArrayItems,
        customMappings
      );

      if (isParseError(parseResult)) {
        const displayLabel = getErrorDisplayLabel(parseResult);
        let tooltip = parseResult.message;
        if (parseResult.code === ParseErrorCode.FILE_TOO_LARGE) {
          const match = parseResult.message.match(/Current:\s*([^\s]+)\s*MB\nLimit:\s*([^\s]+)\s*MB/);
          if (match && vscode.l10n?.t) {
            tooltip = vscode.l10n.t('Current: {0} MB\nLimit: {1} MB', match[1], match[2]);
          }
        }
        return [StructTreeItem.createError(displayLabel, tooltip)];
      }

      if (isParseSuccess(parseResult)) {
        if (viewState.showRoot) {
          return [new StructTreeItem(parseResult.tree.root, viewState)];
        } else {
          return parseResult.tree.root.children.map(
            (child) => new StructTreeItem(child, viewState)
          );
        }
      }

      return [
        StructTreeItem.createError(
          vscode.l10n?.t ? vscode.l10n.t('Parse Error') : 'Parse Error'
        ),
      ];
    }

    if (element.isError || !element.node) {
      return [];
    }

    return element.node.children.map(
      (child) => new StructTreeItem(child, viewState, element)
    );
  }
}
