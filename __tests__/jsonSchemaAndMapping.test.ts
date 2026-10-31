import {
  isJsonSchema,
  parseJsonSchema,
  resolveSchemaWithCircularGuard,
} from '../src/parsers/jsonSchemaParser';
import { resolveParserByCustomMappings } from '../src/utils/mappingResolver';

describe('JSON Schema Parser & Universal Custom Mappings', () => {
  // 1. 自動識別（JSON vs JSON Schema）のテスト
  describe('Auto-detection', () => {
    it('should detect JSON Schema when $schema or definitions are present', () => {
      const standardJson = { name: 'test', value: 123 };
      const schemaJson = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: { id: { type: 'string' } },
      };

      expect(isJsonSchema(standardJson)).toBe(false);
      expect(isJsonSchema(schemaJson)).toBe(true);
    });
  });

  // 2. $ref のインライン展開と透明性のテスト
  describe('$ref Resolution & Inline Expansion', () => {
    it('should inline expand $ref pointers and add reference metadata', () => {
      const rootSchema = {
        definitions: {
          User: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
          },
        },
        type: 'object',
        properties: {
          author: { $ref: '#/definitions/User' },
        },
      };

      const result = resolveSchemaWithCircularGuard(rootSchema, rootSchema);

      expect(result.properties.author.properties.name).toBeDefined();
      expect(result.properties.author.$refMeta).toEqual({
        refPath: '#/definitions/User',
      });
    });
  });

  // 3. 循環参照（Circular Reference）ガードのテスト
  describe('Circular Reference Guard', () => {
    it('should safely guard against circular references without throwing stack overflow', () => {
      const rootSchema = {
        definitions: {
          Node: {
            type: 'object',
            properties: {
              child: { $ref: '#/definitions/Node' },
            },
          },
        },
        type: 'object',
        properties: {
          rootNode: { $ref: '#/definitions/Node' },
        },
      };

      expect(() => {
        const result = resolveSchemaWithCircularGuard(rootSchema, rootSchema);
        const childProp = result.properties.rootNode.properties.child;
        expect(childProp.type).toBe('circular');
        expect(childProp.description).toContain('Circular Reference');
      }).not.toThrow();
    });
  });

  // 4. 定義ブロックおよび複合型のテスト
  describe('Definitions and Complex Types', () => {
    it('should group definitions under dedicated root and expand oneOf options', () => {
      const schema = {
        definitions: {
          Item: { type: 'string' },
        },
        oneOf: [{ type: 'string' }, { type: 'number' }],
      };

      const mapped = parseJsonSchema(schema);

      expect(mapped.children.some((node) => node.name === '[Definitions]')).toBe(true);
      expect(
        mapped.children.some(
          (node) =>
            node.name === '[0]' ||
            node.name === 'option_0' ||
            (node.children && node.children.some((c) => c.name === '[0]'))
        )
      ).toBe(true);
    });
  });

  // 5. settings.json カスタムマッピングのテスト
  describe('Universal Custom Mappings (settings.json)', () => {
    it('should resolve correct parser based on custom glob patterns', () => {
      const customMappings = {
        '*_config.json': 'json',
        '*.xlf': 'xml',
      };

      expect(resolveParserByCustomMappings('app_config.json', customMappings)).toBe('json');
      expect(resolveParserByCustomMappings('strings.xlf', customMappings)).toBe('xml');
    });
  });
});
