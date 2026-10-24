import { SourceFormat, StructNode, StructTree, ValueType } from '../../model';

/**
 * Gets the ValueType for a primitive JS value in JSON/YAML.
 */
function getValueType(value: unknown): ValueType {
  if (value === null || value === undefined) {
    return 'null';
  }
  const type = typeof value;
  if (type === 'string') {
    return 'string';
  }
  if (type === 'number') {
    return 'number';
  }
  if (type === 'boolean') {
    return 'boolean';
  }
  return 'string';
}

/**
 * Converts a JS value recursively into a StructNode.
 */
function convertValueToNode(
  value: unknown,
  key: string,
  parentPath: string[],
  createId: () => string
): StructNode {
  const currentPath = [...parentPath, key];

  if (value instanceof Date) {
    value = value.toISOString();
  }

  if (value === null || value === undefined || typeof value !== 'object') {
    return {
      id: createId(),
      name: key,
      path: currentPath,
      nodeType: 'value',
      valueType: getValueType(value),
      value: (value ?? null) as string | number | boolean | null,
      children: []
    };
  }

  if (Array.isArray(value)) {
    const children: StructNode[] = [];
    if (value.length > 0) {
      // First strategy - process only the first element
      children.push(
        convertValueToNode(value[0], '[0]', currentPath, createId)
      );
    }
    return {
      id: createId(),
      name: key,
      path: currentPath,
      nodeType: 'array',
      children
    };
  }

  // Object
  const obj = value as Record<string, unknown>;
  const children: StructNode[] = Object.keys(obj).map((childKey) =>
    convertValueToNode(obj[childKey], childKey, currentPath, createId)
  );

  return {
    id: createId(),
    name: key,
    path: currentPath,
    nodeType: 'object',
    children
  };
}

/**
 * Converts a parsed JavaScript object/array/primitive into a StructTree structure.
 *
 * @param parsed The parsed JS value (e.g. from JSON.parse or yaml.load).
 * @param fileName File name to be set as the root node name.
 * @param sourceFormat Document format ('json' | 'yaml' | 'markdown').
 * @returns Generated StructTree containing document structure.
 */
export function convertObjectToStructTree(
  parsed: unknown,
  fileName: string = 'root',
  sourceFormat: SourceFormat
): StructTree {
  let idCounter = 0;
  const createId = () => `node-${idCounter++}`;

  const rootPath = [fileName];

  const rootNode: StructNode = {
    id: createId(),
    name: fileName,
    path: rootPath,
    nodeType: 'root',
    children: []
  };

  if (parsed === undefined) {
    rootNode.children = [];
  } else if (parsed === null || typeof parsed !== 'object' || parsed instanceof Date) {
    rootNode.children = [
      convertValueToNode(parsed, 'value', rootPath, createId)
    ];
  } else if (Array.isArray(parsed)) {
    if (parsed.length > 0) {
      rootNode.children = [
        convertValueToNode(parsed[0], '[0]', rootPath, createId)
      ];
    }
  } else {
    const obj = parsed as Record<string, unknown>;
    rootNode.children = Object.keys(obj).map((key) =>
      convertValueToNode(obj[key], key, rootPath, createId)
    );
  }

  return {
    sourceFormat,
    root: rootNode
  };
}
