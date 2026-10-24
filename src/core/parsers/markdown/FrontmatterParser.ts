import * as yaml from 'js-yaml';
import { StructNode, ValueType } from '../../model';

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
  createId: () => string
): StructNode {
  const currentPath = [...parentPath, key];

  if (value === null || value === undefined || typeof value !== 'object') {
    return {
      id: createId(),
      name: key,
      path: currentPath,
      nodeType: 'value',
      valueType: getValueType(value),
      children: []
    };
  }

  if (Array.isArray(value)) {
    const children: StructNode[] = value.map((item, index) => {
      const itemKey = `[${index}]`;
      return convertValueToNodes(item, itemKey, currentPath, createId);
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
    return convertValueToNodes(obj[childKey], childKey, currentPath, createId);
  });

  return {
    id: createId(),
    name: key,
    path: currentPath,
    nodeType: 'object',
    children
  };
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
   * @throws Error if YAML syntax is invalid.
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

    if (typeof parsed !== 'object') {
      // Top-level scalar value
      const node = convertValueToNodes(parsed, 'value', parentPath, createId);
      return [node];
    }

    if (Array.isArray(parsed)) {
      // Top-level array
      return parsed.map((item, index) => {
        const itemKey = `[${index}]`;
        return convertValueToNodes(item, itemKey, parentPath, createId);
      });
    }

    // Top-level object
    const obj = parsed as Record<string, unknown>;
    return Object.keys(obj).map((key) => {
      return convertValueToNodes(obj[key], key, parentPath, createId);
    });
  }
}
