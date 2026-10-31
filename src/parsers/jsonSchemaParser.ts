/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  createParseError,
  createParseSuccess,
  ParseErrorCode,
  ParseResult,
} from '../core/errors';
import { StructNode, StructTree } from '../core/model';

/**
 * Checks if a parsed JS object appears to be a JSON Schema.
 * Triggers if:
 * - root has `$schema`, or
 * - root has `properties`, `definitions`, or `$defs` keywords.
 */
export function isJsonSchema(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return false;
  }
  const record = obj as Record<string, unknown>;
  if ('$schema' in record) {
    return true;
  }
  if ('properties' in record || 'definitions' in record || '$defs' in record) {
    return true;
  }
  return false;
}

/**
 * Metadata attached to an inlined schema property referencing another definition.
 */
export interface RefMetadata {
  refPath: string;
}

/**
 * Resolves a JSON Pointer (e.g. `#/definitions/User` or `#/$defs/Item`) in rootSchema.
 */
function resolveJsonPointer(rootSchema: any, ref: string): any {
  if (!ref.startsWith('#/')) {
    return undefined;
  }
  const parts = ref.slice(2).split('/').map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current = rootSchema;
  for (const part of parts) {
    // Security: Prevent Prototype Pollution and traversing Object prototype built-ins
    if (part === '__proto__' || part === 'prototype' || part === 'constructor') {
      return undefined;
    }
    if (
      current &&
      typeof current === 'object' &&
      Object.prototype.hasOwnProperty.call(current, part)
    ) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Resolves `$ref` pointers within a schema with circular reference protection.
 *
 * @param schema The schema object to resolve.
 * @param rootSchema The root schema containing definitions/$defs.
 * @param ancestorRefs Set of `$ref` strings currently in the resolution ancestor chain.
 * @returns Resolved schema object with inlined references and `$refMeta`.
 */
export function resolveSchemaWithCircularGuard(
  schema: any,
  rootSchema: any,
  ancestorRefs: Set<string> = new Set<string>()
): any {
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  if (Array.isArray(schema)) {
    return schema.map((item) =>
      resolveSchemaWithCircularGuard(item, rootSchema, new Set(ancestorRefs))
    );
  }

  // Handle $ref
  if (typeof schema.$ref === 'string') {
    const refPath = schema.$ref;
    if (ancestorRefs.has(refPath)) {
      // Detected circular reference! Return circular placeholder node
      return {
        type: 'circular',
        description: `[Circular Reference: ${refPath}]`,
        $refMeta: { refPath },
      };
    }

    const resolvedTarget = resolveJsonPointer(rootSchema, refPath);
    if (!resolvedTarget || typeof resolvedTarget !== 'object') {
      return {
        ...schema,
        $refMeta: { refPath },
      };
    }

    const nextAncestors = new Set(ancestorRefs);
    nextAncestors.add(refPath);

    // Recursively resolve the referenced target
    const resolvedClone = resolveSchemaWithCircularGuard(resolvedTarget, rootSchema, nextAncestors);

    // Merge inlined target with current schema properties (such as title, description, etc.)
    return {
      ...resolvedClone,
      ...schema,
      // Ensure resolved properties from target take precedence if not overridden
      properties: {
        ...(resolvedClone.properties || {}),
        ...(schema.properties || {}),
      },
      $refMeta: { refPath },
    };
  }

  // Shallow copy object and resolve properties, definitions, $defs, items, oneOf, etc.
  const copy: Record<string, any> = {};
  for (const key of Object.keys(schema)) {
    const val = schema[key];
    if (val && typeof val === 'object') {
      copy[key] = resolveSchemaWithCircularGuard(val, rootSchema, new Set(ancestorRefs));
    } else {
      copy[key] = val;
    }
  }

  return copy;
}

/**
 * Parses a JSON Schema object into a StructNode hierarchy.
 *
 * @param schema The raw or resolved JSON Schema object.
 * @param fileName Root display name (defaults to 'root').
 * @param maxArrayItems Maximum items to display before chunking.
 * @returns StructNode representing the schema tree.
 */
export function parseJsonSchema(
  schema: any,
  fileName: string = 'root',
  maxArrayItems: number = 50
): StructNode {
  let idCounter = 0;
  const createId = () => `schema-node-${idCounter++}`;

  const resolved = resolveSchemaWithCircularGuard(schema, schema);

  const rootNode: StructNode = {
    id: createId(),
    name: fileName,
    path: [fileName],
    nodeType: 'root',
    children: [],
  };

  const children: StructNode[] = [];

  // 1. Group definitions / $defs under dedicated root group: [Definitions]
  const defsObj = resolved.definitions || resolved.$defs;
  if (defsObj && typeof defsObj === 'object') {
    const defChildren: StructNode[] = [];
    const defPath = [fileName, '[Definitions]'];

    for (const [defKey, defVal] of Object.entries(defsObj)) {
      defChildren.push(
        convertSchemaPropertyToNode(defKey, defVal, defPath, createId, maxArrayItems)
      );
    }

    children.push({
      id: createId(),
      name: '[Definitions]',
      path: defPath,
      nodeType: 'object',
      children: defChildren,
    });
  }

  // 2. Complex types at root: oneOf, anyOf, allOf
  for (const complexKey of ['oneOf', 'anyOf', 'allOf'] as const) {
    if (Array.isArray(resolved[complexKey])) {
      const arr = resolved[complexKey] as any[];
      const complexPath = [fileName, complexKey];
      const optionChildren: StructNode[] = [];

      arr.forEach((option, idx) => {
        const optionName = `[${idx}]`;
        optionChildren.push(
          convertSchemaPropertyToNode(optionName, option, complexPath, createId, maxArrayItems)
        );
      });

      children.push({
        id: createId(),
        name: complexKey,
        path: complexPath,
        nodeType: 'array',
        children: optionChildren,
      });
    }
  }

  // 3. Properties at root
  if (resolved.properties && typeof resolved.properties === 'object') {
    for (const [propKey, propVal] of Object.entries(resolved.properties)) {
      children.push(
        convertSchemaPropertyToNode(propKey, propVal, [fileName], createId, maxArrayItems)
      );
    }
  }

  // 4. Other root-level schema attributes (type, title, description, required, etc. if no properties/definitions)
  for (const [key, val] of Object.entries(resolved)) {
    if (
      [
        'properties',
        'definitions',
        '$defs',
        'oneOf',
        'anyOf',
        'allOf',
        '$schema',
        '$refMeta',
      ].includes(key)
    ) {
      continue;
    }
    if (children.length === 0 || key === 'type' || key === 'title' || key === 'description') {
      if (typeof val !== 'object' || val === null) {
        children.push({
          id: createId(),
          name: key,
          path: [fileName, key],
          nodeType: 'value',
          valueType: typeof val === 'number' ? 'number' : typeof val === 'boolean' ? 'boolean' : 'string',
          value: val as any,
          children: [],
        });
      }
    }
  }

  rootNode.children = children;
  return rootNode;
}

/**
 * Helper to convert a schema property into a StructNode.
 */
function convertSchemaPropertyToNode(
  key: string,
  schemaProp: any,
  parentPath: string[],
  createId: () => string,
  maxArrayItems: number
): StructNode {
  const currentPath = [...parentPath, key];

  if (!schemaProp || typeof schemaProp !== 'object') {
    return {
      id: createId(),
      name: key,
      path: currentPath,
      nodeType: 'value',
      valueType: typeof schemaProp === 'number' ? 'number' : typeof schemaProp === 'boolean' ? 'boolean' : 'string',
      value: schemaProp as any,
      children: [],
    };
  }

  // Check if circular
  if (schemaProp.type === 'circular') {
    return {
      id: createId(),
      name: schemaProp.$refMeta ? `${key} 🔗 [Ref: ${schemaProp.$refMeta.refPath}]` : key,
      path: currentPath,
      nodeType: 'value',
      valueType: 'string',
      value: schemaProp.description || '[Circular Reference]',
      children: [],
    };
  }

  // Check ref badge
  const refBadge = schemaProp.$refMeta ? ` 🔗 [Ref: ${schemaProp.$refMeta.refPath}]` : '';
  const displayName = `${key}${refBadge}`;

  const children: StructNode[] = [];

  // Child properties
  if (schemaProp.properties && typeof schemaProp.properties === 'object') {
    for (const [childKey, childVal] of Object.entries(schemaProp.properties)) {
      children.push(
        convertSchemaPropertyToNode(childKey, childVal, currentPath, createId, maxArrayItems)
      );
    }
  }

  // Array items
  if (schemaProp.items && typeof schemaProp.items === 'object') {
    if (Array.isArray(schemaProp.items)) {
      schemaProp.items.forEach((itemSchema: any, idx: number) => {
        children.push(
          convertSchemaPropertyToNode(`[${idx}]`, itemSchema, currentPath, createId, maxArrayItems)
        );
      });
    } else {
      children.push(
        convertSchemaPropertyToNode('[items]', schemaProp.items, currentPath, createId, maxArrayItems)
      );
    }
  }

  // Complex types: oneOf, anyOf, allOf
  for (const complexKey of ['oneOf', 'anyOf', 'allOf'] as const) {
    if (Array.isArray(schemaProp[complexKey])) {
      const arr = schemaProp[complexKey] as any[];
      const complexPath = [...currentPath, complexKey];
      const optionChildren: StructNode[] = [];

      arr.forEach((option, idx) => {
        optionChildren.push(
          convertSchemaPropertyToNode(`[${idx}]`, option, complexPath, createId, maxArrayItems)
        );
      });

      children.push({
        id: createId(),
        name: complexKey,
        path: complexPath,
        nodeType: 'array',
        children: optionChildren,
      });
    }
  }

  const propType = typeof schemaProp.type === 'string' ? schemaProp.type : undefined;
  const isObject = propType === 'object' || (schemaProp.properties && Object.keys(schemaProp.properties).length > 0);
  const isArray = propType === 'array' || schemaProp.items !== undefined;

  let nodeType: StructNode['nodeType'] = 'value';
  if (isObject) {
    nodeType = 'object';
  } else if (isArray) {
    nodeType = 'array';
  }

  return {
    id: createId(),
    name: displayName,
    path: currentPath,
    nodeType,
    valueType: propType as any,
    value: propType,
    children,
  };
}

/**
 * JsonSchemaParser provides ParseResult output adhering to Core Parser principles.
 */
export class JsonSchemaParser {
  public parse(
    content: string,
    fileName: string = 'root',
    maxArrayItems: number = 50
  ): ParseResult {
    try {
      const parsed = JSON.parse(content);
      const rootNode = parseJsonSchema(parsed, fileName, maxArrayItems);
      const tree: StructTree = {
        sourceFormat: 'jsonSchema',
        root: rootNode,
      };
      return createParseSuccess(tree);
    } catch (err: any) {
      return createParseError(
        ParseErrorCode.JSON_PARSE_ERROR,
        `JSON Schema Parse Error: ${err.message || String(err)}`
      );
    }
  }
}
