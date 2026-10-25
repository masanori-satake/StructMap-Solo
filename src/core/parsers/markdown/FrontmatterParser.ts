import * as yaml from 'js-yaml';
import { StructNode, ValueType } from '../../model';

const MAX_NODES = 10_000;

interface ConversionContext {
  ancestors: Set<object>;
  nodeCount: number;
}

/**
 * Gets the ValueType for a primitive JS value.
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
  context: ConversionContext,
  maxArrayItems: number
): StructNode {
  const rangeName = `[${start} .. ${end}]`;
  const currentPath = [...parentPath, rangeName];
  const count = end - start + 1;

  const children: StructNode[] = [];

  if (count <= maxArrayItems) {
    for (let i = start; i <= end; i++) {
      children.push(
        convertValueToNodes(arr[i], `[${i}]`, currentPath, createId, context, maxArrayItems)
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
          convertValueToNodes(arr[s], `[${s}]`, currentPath, createId, context, maxArrayItems)
        );
      } else {
        children.push(
          createRangeNode(arr, s, e, currentPath, createId, context, maxArrayItems)
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
 * Converts a JavaScript value recursively into StructNode children.
 */
function convertValueToNodes(
  value: unknown,
  key: string,
  parentPath: string[],
  createId: () => string,
  context: ConversionContext,
  maxArrayItems: number = 50
): StructNode {
  if (++context.nodeCount > MAX_NODES) {
    throw new Error(`YAML frontmatter exceeds the maximum of ${MAX_NODES} nodes`);
  }
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

  if (context.ancestors.has(value)) {
    throw new Error('YAML frontmatter contains a circular alias');
  }

  context.ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const children: StructNode[] = [];
      const len = value.length;
      if (len > 0) {
        if (len <= maxArrayItems) {
          for (let i = 0; i < len; i++) {
            children.push(
              convertValueToNodes(value[i], `[${i}]`, currentPath, createId, context, maxArrayItems)
            );
          }
        } else {
          for (let i = 0; i < maxArrayItems; i++) {
            children.push(
              convertValueToNodes(value[i], `[${i}]`, currentPath, createId, context, maxArrayItems)
            );
          }
          children.push(
            createRangeNode(value, maxArrayItems, len - 1, currentPath, createId, context, maxArrayItems)
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
    const keys = Object.keys(obj);
    const children: StructNode[] = keys.map((childKey) => {
      return convertValueToNodes(obj[childKey], childKey, currentPath, createId, context, maxArrayItems);
    });

    return {
      id: createId(),
      name: key,
      path: currentPath,
      nodeType: 'object',
      children
    };
  } finally {
    context.ancestors.delete(value);
  }
}

/**
 * Parser for converting YAML frontmatter into StructNode structures.
 */
export class FrontmatterParser {
  /**
   * Parses raw YAML frontmatter content into a list of StructNodes.
   *
   * @param yamlContent The raw YAML string inside frontmatter delimiters.
   * @param parentPath The path array of the parent node (e.g. ['README.md', 'Frontmatter (YAML)']).
   * @param createId Generator function for unique node IDs.
   * @param maxArrayItems Maximum number of array items to display directly before chunking.
   * @returns Array of child StructNodes.
   * @throws Error if YAML syntax is invalid, an alias is circular, or more than 10,000 nodes are generated.
   */
  public parse(
    yamlContent: string,
    parentPath: string[],
    createId: () => string,
    maxArrayItems: number = 50
  ): StructNode[] {
    let parsed: unknown;
    try {
      parsed = yaml.load(yamlContent);
    } catch (err) {
      throw new Error(`YAML frontmatter parse error: ${(err as Error).message}`);
    }

    if (parsed === null || parsed === undefined) {
      return [];
    }

    const context: ConversionContext = {
      ancestors: new Set(typeof parsed === 'object' ? [parsed] : []),
      nodeCount: 0
    };

    if (typeof parsed !== 'object' || parsed instanceof Date) {
      // Top-level scalar value
      const node = convertValueToNodes(parsed, 'value', parentPath, createId, context, maxArrayItems);
      return [node];
    }

    if (Array.isArray(parsed)) {
      const len = parsed.length;
      if (len === 0) {
        return [];
      }
      if (len <= maxArrayItems) {
        return parsed.map((item, index) => {
          const itemKey = `[${index}]`;
          return convertValueToNodes(item, itemKey, parentPath, createId, context, maxArrayItems);
        });
      }
      const children: StructNode[] = [];
      for (let i = 0; i < maxArrayItems; i++) {
        children.push(
          convertValueToNodes(parsed[i], `[${i}]`, parentPath, createId, context, maxArrayItems)
        );
      }
      children.push(
        createRangeNode(parsed, maxArrayItems, len - 1, parentPath, createId, context, maxArrayItems)
      );
      return children;
    }

    // Top-level object
    const obj = parsed as Record<string, unknown>;
    return Object.keys(obj).map((key) => {
      return convertValueToNodes(obj[key], key, parentPath, createId, context, maxArrayItems);
    });
  }
}
