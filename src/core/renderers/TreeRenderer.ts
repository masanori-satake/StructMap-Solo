import { StructNode, StructTree } from '../model';

/**
 * Options controlling tree text rendering output format and layout.
 */
export interface RenderOptions {
  showTypes: boolean;
  showRoot: boolean;
  treeStyle: 'unicode' | 'ascii';
}

/**
 * Formats a single node's display label based on node type, value type, and render options.
 */
function formatNodeLabel(node: StructNode, options: RenderOptions): string {
  if (options.showTypes) {
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
 * Recursively renders child structural nodes into line buffers with prefix branches.
 */
function renderChildren(
  children: StructNode[],
  indentPrefix: string,
  options: RenderOptions,
  lines: string[]
): void {
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const isLast = i === children.length - 1;

    let connector: string;
    let childIndent: string;

    if (options.treeStyle === 'unicode') {
      connector = isLast ? '└─ ' : '├─ ';
      childIndent = indentPrefix + (isLast ? '   ' : '│  ');
    } else {
      connector = '+- ';
      childIndent = indentPrefix + (isLast ? '   ' : '|  ');
    }

    const label = formatNodeLabel(child, options);
    lines.push(indentPrefix + connector + label);

    if (child.children && child.children.length > 0) {
      renderChildren(child.children, childIndent, options, lines);
    }
  }
}

/**
 * Converts a StructTree into a formatted text-based tree string representation.
 */
export class TreeRenderer {
  /**
   * Renders the given StructTree into a string based on the provided RenderOptions.
   */
  public render(tree: StructTree, options: RenderOptions): string {
    const lines: string[] = [];

    if (options.showRoot) {
      const rootLabel = formatNodeLabel(tree.root, options);
      lines.push(rootLabel);

      if (tree.root.children && tree.root.children.length > 0) {
        renderChildren(tree.root.children, '', options, lines);
      }
    } else {
      if (tree.root.children && tree.root.children.length > 0) {
        for (const child of tree.root.children) {
          const childLabel = formatNodeLabel(child, options);
          lines.push(childLabel);

          if (child.children && child.children.length > 0) {
            renderChildren(child.children, '', options, lines);
          }
        }
      }
    }

    return lines.join('\n');
  }
}
