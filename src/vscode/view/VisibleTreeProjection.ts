import { StructNode, StructTree } from '../../core';

/**
 * Projects a StructTree based on the current set of expanded node IDs.
 * Collapsed nodes retain their node metadata but have their children removed.
 */
export class VisibleTreeProjection {
  /**
   * Projects the input tree into a new tree containing only visible (expanded) nodes and leaves.
   *
   * @param tree Original full StructTree.
   * @param expandedIds Set of expanded node IDs.
   * @returns A new StructTree representing the visible portion.
   */
  public project(tree: StructTree, expandedIds: ReadonlySet<string>): StructTree {
    if (!tree || !tree.root) {
      return tree;
    }

    const projectedRoot = this.projectNode(tree.root, true, expandedIds);
    return {
      sourceFormat: tree.sourceFormat,
      root: projectedRoot,
    };
  }

  private projectNode(
    node: StructNode,
    isRoot: boolean,
    expandedIds: ReadonlySet<string>
  ): StructNode {
    if (isRoot) {
      const projectedChildren = node.children
        ? node.children.map((child) => this.projectNode(child, false, expandedIds))
        : [];
      return {
        ...node,
        children: projectedChildren,
      };
    }

    if (!node.children || node.children.length === 0) {
      return {
        ...node,
        children: [],
      };
    }

    if (expandedIds.has(node.id)) {
      const projectedChildren = node.children.map((child) =>
        this.projectNode(child, false, expandedIds)
      );
      return {
        ...node,
        children: projectedChildren,
      };
    }

    return {
      ...node,
      children: [],
    };
  }
}
