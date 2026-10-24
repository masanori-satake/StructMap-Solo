import { StructNode, StructTree, ValueType } from '../../model';

/**
 * Gets the ValueType for a primitive JS value in JSON.
 */
function getValueType(value: unknown): ValueType {
  if (value === null) {
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
 * Parser that converts JSON content into a StructTree structure.
 */
export class JsonParser {
  /**
   * Parses JSON text content into a StructTree representation.
   *
   * @param content Raw JSON string.
   * @param fileName File name to be set as the root node name.
   * @returns Generated StructTree containing document structure.
   */
  public parse(content: string, fileName: string = 'root'): StructTree {
    let idCounter = 0;
    const createId = () => `node-${idCounter++}`;

    const parsed: unknown = JSON.parse(content);
    const rootPath = [fileName];

    const rootNode: StructNode = {
      id: createId(),
      name: fileName,
      path: rootPath,
      nodeType: 'root',
      children: []
    };

    if (parsed === null || typeof parsed !== 'object') {
      rootNode.children = [
        this.convertValueToNode(parsed, 'value', rootPath, createId)
      ];
    } else if (Array.isArray(parsed)) {
      if (parsed.length > 0) {
        rootNode.children = [
          this.convertValueToNode(parsed[0], '[0]', rootPath, createId)
        ];
      }
    } else {
      const obj = parsed as Record<string, unknown>;
      rootNode.children = Object.keys(obj).map((key) =>
        this.convertValueToNode(obj[key], key, rootPath, createId)
      );
    }

    return {
      sourceFormat: 'json',
      root: rootNode
    };
  }

  private convertValueToNode(
    value: unknown,
    key: string,
    parentPath: string[],
    createId: () => string
  ): StructNode {
    const currentPath = [...parentPath, key];

    if (value === null || typeof value !== 'object') {
      return {
        id: createId(),
        name: key,
        path: currentPath,
        nodeType: 'value',
        valueType: getValueType(value),
        value: value as string | number | boolean | null,
        children: []
      };
    }

    if (Array.isArray(value)) {
      const children: StructNode[] = [];
      if (value.length > 0) {
        // MVP: First strategy - process only the first element
        children.push(
          this.convertValueToNode(value[0], '[0]', currentPath, createId)
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
      this.convertValueToNode(obj[childKey], childKey, currentPath, createId)
    );

    return {
      id: createId(),
      name: key,
      path: currentPath,
      nodeType: 'object',
      children
    };
  }
}
