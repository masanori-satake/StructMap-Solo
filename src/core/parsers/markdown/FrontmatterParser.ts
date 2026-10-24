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
 * Converts a JavaScript value recursively into StructNode children.
 */
function convertValueToNodes(
  value: unknown,
  key: string,
  parentPath: string[],
  createId: () => string,
  context: ConversionContext
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
      const children: StructNode[] = value.map((item, index) => {
        const itemKey = `[${index}]`;
        return convertValueToNodes(item, itemKey, currentPath, createId, context);
      });

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
      return convertValueToNodes(obj[childKey], childKey, currentPath, createId, context);
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
   * @returns Array of child StructNodes.
   * @throws Error if YAML syntax is invalid, an alias is circular, or more than 10,000 nodes are generated.
   */
  public parse(
    yamlContent: string,
    parentPath: string[],
    createId: () => string
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
      const node = convertValueToNodes(parsed, 'value', parentPath, createId, context);
      return [node];
    }

    if (Array.isArray(parsed)) {
      // Top-level array
      return parsed.map((item, index) => {
        const itemKey = `[${index}]`;
        return convertValueToNodes(item, itemKey, parentPath, createId, context);
      });
    }

    // Top-level object
    const obj = parsed as Record<string, unknown>;
    return Object.keys(obj).map((key) => {
      return convertValueToNodes(obj[key], key, parentPath, createId, context);
    });
  }
}
