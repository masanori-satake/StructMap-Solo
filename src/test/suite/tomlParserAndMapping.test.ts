import * as assert from 'assert';
import { parseTomlToStructNode, TomlParser } from '../../parsers/tomlParser';
import { resolveParserByCustomMappings } from '../../utils/mappingResolver';
import { StructMapService } from '../../core/services/StructMapService';
import { isParseSuccess } from '../../core/errors';

suite('TOML Parser & Universal Custom Mappings Test Suite', () => {
  suite('TOML Parsing & Deterministic Tree Mapping', () => {
    test('should parse simple tables and key-value pairs correctly', () => {
      const tomlContent = `
        title = "TOML Example"
        [owner]
        name = "Tom Preston-Werner"
      `;

      const rootNode = parseTomlToStructNode(tomlContent);
      assert.ok(rootNode);
      assert.strictEqual(
        rootNode.children.find((n) => n.name === 'title')?.value,
        'TOML Example'
      );

      const ownerNode = rootNode.children.find((n) => n.name === 'owner');
      assert.ok(ownerNode);
      assert.strictEqual(
        ownerNode?.children.find((n) => n.name === 'name')?.value,
        'Tom Preston-Werner'
      );
    });

    test('should handle Array of Tables ([[table]]) deterministically', () => {
      const tomlContent = `
        [[products]]
        name = "Hammer"
        sku = 7385949

        [[products]]
        name = "Nail"
        sku = 2847583
      `;

      const rootNode = parseTomlToStructNode(tomlContent);
      const productsNode = rootNode.children.find((n) => n.name === 'products');

      assert.ok(productsNode);
      assert.strictEqual(productsNode?.children.length, 2);
      assert.strictEqual(
        productsNode?.children[0].children.find((n) => n.name === 'name')?.value,
        'Hammer'
      );
      assert.strictEqual(
        productsNode?.children[1].children.find((n) => n.name === 'name')?.value,
        'Nail'
      );
    });

    test('should handle inline arrays, inline tables, booleans, and numbers', () => {
      const tomlContent = `
        intVal = 42
        floatVal = 3.14
        boolVal = true
        inlineArr = [1, 2, 3]
        inlineObj = { a = "hello", b = false }
      `;

      const rootNode = parseTomlToStructNode(tomlContent);
      assert.strictEqual(
        rootNode.children.find((n) => n.name === 'intVal')?.value,
        42
      );
      assert.strictEqual(
        rootNode.children.find((n) => n.name === 'floatVal')?.value,
        3.14
      );
      assert.strictEqual(
        rootNode.children.find((n) => n.name === 'boolVal')?.value,
        true
      );

      const arrNode = rootNode.children.find((n) => n.name === 'inlineArr');
      assert.ok(arrNode);
      assert.strictEqual(arrNode?.children.length, 3);
      assert.strictEqual(arrNode?.children[0].value, 1);

      const objNode = rootNode.children.find((n) => n.name === 'inlineObj');
      assert.ok(objNode);
      assert.strictEqual(
        objNode?.children.find((c) => c.name === 'a')?.value,
        'hello'
      );
    });

    test('TomlParser should return ParseSuccess for valid TOML', () => {
      const parser = new TomlParser();
      const res = parser.parse('key = "value"', 'test.toml');
      assert.strictEqual(isParseSuccess(res), true);
      if (isParseSuccess(res)) {
        assert.strictEqual(res.tree.sourceFormat, 'toml');
        assert.strictEqual(res.tree.root.children.length, 1);
      }
    });
  });

  suite('Universal Custom Mappings for TOML', () => {
    test('should resolve TOML parser for .toml extensions or custom patterns', () => {
      const customMappings = {
        '*.toml': 'toml',
        'Cargo.lock': 'toml',
      };

      assert.strictEqual(
        resolveParserByCustomMappings('config.toml', customMappings),
        'toml'
      );
      assert.strictEqual(
        resolveParserByCustomMappings('Cargo.lock', customMappings),
        'toml'
      );
    });

    test('StructMapService integrates TOML parsing and supportsTypes', () => {
      const service = new StructMapService();
      assert.strictEqual(service.supportsTypes('settings.toml'), true);

      const result = service.build(
        'Cargo.toml',
        `
        [package]
        name = "my_crate"
        version = "0.1.0"
        `
      );

      assert.strictEqual(isParseSuccess(result), true);
      if (isParseSuccess(result)) {
        assert.strictEqual(result.tree.sourceFormat, 'toml');
        const pkg = result.tree.root.children.find((c) => c.name === 'package');
        assert.ok(pkg);
        assert.strictEqual(
          pkg?.children.find((c) => c.name === 'name')?.value,
          'my_crate'
        );
      }
    });
  });
});
