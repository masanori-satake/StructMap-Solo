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
 * Creates a range node representing a subset of array items [start .. end].
 */
function createRangeNode(
  arr: unknown[],
  start: number,
  end: number,
  parentPath: string[],
  createId: () => string,
  ancestors: WeakSet<object>,
  maxArrayItems: number
): StructNode {
  const rangeName = `[${start} .. ${end}]`;
  const currentPath = [...parentPath, rangeName];
  const count = end - start + 1;

  const children: StructNode[] = [];

  if (count <= maxArrayItems) {
    for (let i = start; i <= end; i++) {
      children.push(
        convertValueToNode(
          arr[i],
          `[${i}]`,
          currentPath,
          createId,
          ancestors,
          maxArrayItems
        )
      );
    }
  } else {
    const step = Math.max(
      1,
      Math.pow(
        maxArrayItems,
        Math.max(1, Math.ceil(Math.log(count) / Math.log(maxArrayItems)) - 1)
      )
    );

    for (let s = start; s <= end; s += step) {
      const e = Math.min(s + step - 1, end);
      if (s === e) {
        children.push(
          convertValueToNode(
            arr[s],
            `[${s}]`,
            currentPath,
            createId,
            ancestors,
            maxArrayItems
          )
        );
      } else {
        children.push(
          createRangeNode(
            arr,
            s,
            e,
            currentPath,
            createId,
            ancestors,
            maxArrayItems
          )
        );
      }
    }
  }

  return {
    id: createId(),
    name: rangeName,
    path: currentPath,
    nodeType: 'array',
    children,
    isRange: true
  };
}

/**
 * Converts a JS value recursively into a StructNode.
 */
function convertValueToNode(
  value: unknown,
  key: string,
  parentPath: string[],
  createId: () => string,
  ancestors: WeakSet<object>,
  maxArrayItems: number = 50
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

  if (ancestors.has(value)) {
    throw new Error('Cannot convert circular reference to StructTree');
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const children: StructNode[] = [];
      const len = value.length;
      if (len > 0) {
        if (len <= maxArrayItems) {
          for (let i = 0; i < len; i++) {
            children.push(
              convertValueToNode(
                value[i],
                `[${i}]`,
                currentPath,
                createId,
                ancestors,
                maxArrayItems
              )
            );
          }
        } else {
          for (let i = 0; i < maxArrayItems; i++) {
            children.push(
              convertValueToNode(
                value[i],
                `[${i}]`,
                currentPath,
                createId,
                ancestors,
                maxArrayItems
              )
            );
          }
          children.push(
            createRangeNode(
              value,
              maxArrayItems,
              len - 1,
              currentPath,
              createId,
              ancestors,
              maxArrayItems
            )
          );
        }
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
      convertValueToNode(
        obj[childKey],
        childKey,
        currentPath,
        createId,
        ancestors,
        maxArrayItems
      )
    );

    return {
      id: createId(),
      name: key,
      path: currentPath,
      nodeType: 'object',
      children
    };
  } finally {
    ancestors.delete(value);
  }
}

/**
 * Converts a parsed JavaScript object/array/primitive into a StructTree structure.
 *
 * @param parsed The parsed JS value (e.g. from JSON.parse or yaml.load).
 * @param fileName File name to be set as the root node name.
 * @param sourceFormat Document format ('json' | 'yaml' | 'markdown').
 * @param maxArrayItems Maximum number of array items to display directly before chunking.
 * @returns Generated StructTree containing document structure.
 * @throws Error if a circular reference is encountered during conversion.
 */
export function convertObjectToStructTree(
  parsed: unknown,
  fileName: string = 'root',
  sourceFormat: SourceFormat,
  maxArrayItems: number = 50
): StructTree {
  let idCounter = 0;
  const createId = () => `node-${idCounter++}`;
  const ancestors = new WeakSet<object>(
    parsed !== null && typeof parsed === 'object' ? [parsed] : []
  );

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
      convertValueToNode(parsed, 'value', rootPath, createId, ancestors, maxArrayItems)
    ];
  } else if (Array.isArray(parsed)) {
    const len = parsed.length;
    if (len > 0) {
      if (len <= maxArrayItems) {
        rootNode.children = parsed.map((item, index) =>
          convertValueToNode(item, `[${index}]`, rootPath, createId, ancestors, maxArrayItems)
        );
      } else {
        const children: StructNode[] = [];
        for (let i = 0; i < maxArrayItems; i++) {
          children.push(
            convertValueToNode(parsed[i], `[${i}]`, rootPath, createId, ancestors, maxArrayItems)
          );
        }
        children.push(
          createRangeNode(
            parsed,
            maxArrayItems,
            len - 1,
            rootPath,
            createId,
            ancestors,
            maxArrayItems
          )
        );
        rootNode.children = children;
      }
    }
  } else {
    const obj = parsed as Record<string, unknown>;
    rootNode.children = Object.keys(obj).map((key) =>
      convertValueToNode(obj[key], key, rootPath, createId, ancestors, maxArrayItems)
    );
  }

  return {
    sourceFormat,
    root: rootNode
  };
}
