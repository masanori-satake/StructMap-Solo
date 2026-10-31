import * as assert from 'assert';
import {
  isJsonSchema,
  parseJsonSchema,
  resolveSchemaWithCircularGuard,
} from '../../parsers/jsonSchemaParser';
import { resolveParserByCustomMappings } from '../../utils/mappingResolver';
import { StructMapService } from '../../core/services/StructMapService';
import { isParseSuccess } from '../../core/errors';

suite('JSON Schema Parser & Universal Custom Mappings', () => {
  // 1. 自動識別（JSON vs JSON Schema）のテスト
  suite('Auto-detection', () => {
    test('should detect JSON Schema when $schema or definitions are present', () => {
      const standardJson = { name: 'test', value: 123 };
      const schemaJson = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: { id: { type: 'string' } },
      };

      assert.strictEqual(isJsonSchema(standardJson), false);
      assert.strictEqual(isJsonSchema(schemaJson), true);

      const definitionsJson = {
        definitions: {
          User: { type: 'object' },
        },
      };
      assert.strictEqual(isJsonSchema(definitionsJson), true);

      const defsJson = {
        $defs: {
          Item: { type: 'string' },
        },
      };
      assert.strictEqual(isJsonSchema(defsJson), true);

      const propertiesJson = {
        properties: {
          title: { type: 'string' },
        },
      };
      assert.strictEqual(isJsonSchema(propertiesJson), true);
    });
  });

  // 2. $ref のインライン展開と透明性のテスト
  suite('$ref Resolution & Inline Expansion', () => {
    test('should inline expand $ref pointers and add reference metadata', () => {
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

      assert.ok(result.properties.author.properties.name);
      assert.deepStrictEqual(result.properties.author.$refMeta, {
        refPath: '#/definitions/User',
      });
    });
  });

  // 3. 循環参照（Circular Reference）ガードおよびセキュリティ保護のテスト
  suite('Circular Reference Guard & Security Protection', () => {
    test('should safely reject prototype traversal attempts via $ref', () => {
      const maliciousSchema = {
        $schema: 'http://json-schema.org/draft-07/schema#',
        properties: {
          badProto: {
            $ref: '#/__proto__',
          },
          badConstructor: {
            $ref: '#/constructor',
          },
          badPrototype: {
            $ref: '#/prototype',
          },
          badBuiltIn: {
            $ref: '#/toString',
          },
        },
      };

      const resolved = resolveSchemaWithCircularGuard(maliciousSchema, maliciousSchema);
      // Prototype chain lookups should be rejected and not resolve to Object prototype built-ins
      assert.strictEqual(resolved.properties.badProto.$ref, '#/__proto__');
      assert.strictEqual(resolved.properties.badProto.properties, undefined);
      assert.strictEqual(resolved.properties.badConstructor.$ref, '#/constructor');
      assert.strictEqual(resolved.properties.badPrototype.$ref, '#/prototype');
      assert.strictEqual(resolved.properties.badBuiltIn.$ref, '#/toString');

      const parsedNode = parseJsonSchema(maliciousSchema, 'schema.json');
      assert.strictEqual(parsedNode.children.length, 4);
      assert.strictEqual(parsedNode.children[0].name.includes('#/__proto__'), true);
      assert.strictEqual(parsedNode.children[0].nodeType, 'value');
    });

    test('should safely guard against circular references without throwing stack overflow', () => {
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

      assert.doesNotThrow(() => {
        const result = resolveSchemaWithCircularGuard(rootSchema, rootSchema);
        const childProp = result.properties.rootNode.properties.child;
        assert.strictEqual(childProp.type, 'circular');
        assert.ok(childProp.description.includes('Circular Reference'));
      });
    });
  });

  // 4. 定義ブロックおよび複合型のテスト
  suite('Definitions and Complex Types', () => {
    test('should group definitions under dedicated root and expand oneOf options', () => {
      const schema = {
        definitions: {
          Item: { type: 'string' },
        },
        oneOf: [{ type: 'string' }, { type: 'number' }],
      };

      const mapped = parseJsonSchema(schema);

      assert.strictEqual(
        mapped.children.some((node) => node.name === '[Definitions]'),
        true
      );
      assert.strictEqual(
        mapped.children.some(
          (node) =>
            node.name === '[0]' ||
            node.name === 'option_0' ||
            (node.children && node.children.some((c) => c.name === '[0]'))
        ),
        true
      );
    });
  });

  // 5. settings.json カスタムマッピングのテスト
  suite('Universal Custom Mappings (settings.json)', () => {
    test('should resolve correct parser based on custom glob patterns', () => {
      const customMappings = {
        '*_config.json': 'json',
        '*.xlf': 'xml',
      };

      assert.strictEqual(
        resolveParserByCustomMappings('app_config.json', customMappings),
        'json'
      );
      assert.strictEqual(
        resolveParserByCustomMappings('strings.xlf', customMappings),
        'xml'
      );
      assert.strictEqual(
        resolveParserByCustomMappings('/path/to/some_config.json', customMappings),
        'json'
      );
    });

    test('should integrate with StructMapService build and supportsTypes', () => {
      const service = new StructMapService();
      const customMappings = {
        '*.customxml': 'xml',
        '*.myschema': 'jsonSchema',
      };

      assert.strictEqual(
        service.supportsTypes('doc.customxml', customMappings),
        true
      );
      assert.strictEqual(
        service.supportsTypes('doc.myschema', customMappings),
        true
      );

      const xmlRes = service.build(
        'test.customxml',
        '<root><item>Hello</item></root>',
        5,
        50,
        customMappings
      );
      assert.strictEqual(isParseSuccess(xmlRes), true);
      if (isParseSuccess(xmlRes)) {
        assert.strictEqual(xmlRes.tree.sourceFormat, 'xml');
      }

      const schemaRes = service.build(
        'test.myschema',
        JSON.stringify({
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
        }),
        5,
        50,
        customMappings
      );
      assert.strictEqual(isParseSuccess(schemaRes), true);
      if (isParseSuccess(schemaRes)) {
        assert.strictEqual(schemaRes.tree.sourceFormat, 'jsonSchema');
      }
    });
  });
});
