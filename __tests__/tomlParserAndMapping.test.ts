// __tests__/tomlParserAndMapping.test.ts
import { parseTomlToStructNode } from '../src/parsers/tomlParser';
import { resolveParserByCustomMappings } from '../src/utils/mappingResolver';

describe('TOML Parser & Universal Custom Mappings', () => {

  // 1. 基本的な TOML パースと決定論的構造のテスト
  describe('TOML Parsing & Deterministic Tree Mapping', () => {
    it('should parse simple tables and key-value pairs correctly', () => {
      const tomlContent = `
        title = "TOML Example"
        [owner]
        name = "Tom Preston-Werner"
      `;

      const rootNode = parseTomlToStructNode(tomlContent);
      expect(rootNode).toBeDefined();
      expect(rootNode.children.find(n => n.name === 'title')?.value).toBe('TOML Example');

      const ownerNode = rootNode.children.find(n => n.name === 'owner');
      expect(ownerNode).toBeDefined();
      expect(ownerNode?.children.find(n => n.name === 'name')?.value).toBe('Tom Preston-Werner');
    });

    it('should handle Array of Tables ([[table]]) deterministically', () => {
      const tomlContent = `
        [[products]]
        name = "Hammer"
        sku = 7385949

        [[products]]
        name = "Nail"
        sku = 2847583
      `;

      const rootNode = parseTomlToStructNode(tomlContent);
      const productsNode = rootNode.children.find(n => n.name === 'products');

      expect(productsNode).toBeDefined();
      // クリーンなリスト構造（children）として配列が展開されていること
      expect(productsNode?.children.length).toBe(2);
      expect(productsNode?.children[0].children.find(n => n.name === 'name')?.value).toBe('Hammer');
    });
  });

  // 2. settings.json のカスタムマッピング連携テスト
  describe('Universal Custom Mappings for TOML', () => {
    it('should resolve TOML parser for .toml extensions or custom patterns', () => {
      const customMappings = {
        '*.toml': 'toml',
        'Cargo.lock': 'toml'
      };

      expect(resolveParserByCustomMappings('config.toml', customMappings)).toBe('toml');
      expect(resolveParserByCustomMappings('Cargo.lock', customMappings)).toBe('toml');
    });
  });
});
