/**
 * Structural classification of a node in the document hierarchy.
 */
export type NodeType =
  | 'root'
  | 'section'
  | 'object'
  | 'array'
  | 'value';

/**
 * Primitive data type for scalar values within a node.
 */
export type ValueType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'null';

/**
 * Format of the source document parsed into a StructTree.
 */
export type SourceFormat =
  | 'markdown'
  | 'json'
  | 'yaml';

/**
 * Represents a single node in the unified document structure tree.
 */
export interface StructNode {
  /** Unique identifier for the node within the tree. */
  id: string;
  /** Display label or property key for the node. */
  name: string;
  /** Path components identifying the node's location in the document hierarchy. */
  path: string[];
  /** The structural category of the node. */
  nodeType: NodeType;
  /** Optional primitive data type, present when nodeType is 'value'. */
  valueType?: ValueType;
  /** Optional scalar value, present when nodeType is 'value'. */
  value?: string | number | boolean | null;
  /** Array of child structural nodes. */
  children: StructNode[];
  /** Optional flag indicating if the node is an array index range node (e.g. [1 .. 999]). */
  isRange?: boolean;
}

/**
 * Represents the root structure of a parsed document tree.
 */
export interface StructTree {
  /** Source document format (Markdown, JSON, or YAML). */
  sourceFormat: SourceFormat;
  /** The root node of the structure tree. */
  root: StructNode;
}
