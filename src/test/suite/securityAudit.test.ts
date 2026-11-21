import * as assert from 'assert';
import { EnvParser, JsonParser, MarkdownParser, NdjsonParser, ParseErrorCode, XmlParser, YamlParser } from '../../core';
import { StructMapService } from '../../core/services/StructMapService';
import { JsonSchemaParser } from '../../parsers/jsonSchemaParser';
import { TomlParser } from '../../parsers/tomlParser';
import { resolveParserByCustomMappings } from '../../utils/mappingResolver';
import {
  clampDebounceMs,
  clampMaxArrayItems,
  clampMaxFileSizeMB
} from '../../utils/configClamp';

/**
 * Regression tests for the 2026-11-20 security/reliability audit
 * (findings #1-#4: glob ReDoS, node-expansion budget, $ref diamond
 * expansion, unclamped settings).
 */
suite('Security Audit 2026-11-20 Regression Tests', () => {
  suite('Finding #1: customMappings glob ReDoS', () => {
    test('audit PoC pattern (22 chars) against a non-matching name returns quickly', () => {
      // Pattern from the audit: '*a' x10 + '*b' hung the old RegExp-based
      // matcher for over 90 seconds on this input.
      const evilPattern = '*a'.repeat(10) + '*b';
      const fileName = 'a'.repeat(50) + '.json';

      const start = Date.now();
      const result = resolveParserByCustomMappings(fileName, { [evilPattern]: 'json' });
      const elapsed = Date.now() - start;

      assert.strictEqual(result, undefined);
      assert.ok(elapsed < 5000, `matching took ${elapsed}ms`);
    });

    test('ordinary glob patterns still match as before', () => {
      assert.strictEqual(
        resolveParserByCustomMappings('config.json', { '*.json': 'json' }),
        'json'
      );
      assert.strictEqual(
        resolveParserByCustomMappings('src/deep/data.yaml', { '**/*.yaml': 'yaml' }),
        'yaml'
      );
      assert.strictEqual(
        resolveParserByCustomMappings('SRC/Config.JSON', { '*.json': 'json' }),
        'json'
      );
      assert.strictEqual(
        resolveParserByCustomMappings('data.toml', { '*.json': 'json' }),
        undefined
      );
      assert.strictEqual(
        resolveParserByCustomMappings('a/b/c.txt', { 'a/*/c.txt': 'toml' }),
        'toml'
      );
      assert.strictEqual(
        resolveParserByCustomMappings('a/b/d/c.txt', { 'a/*/c.txt': 'toml' }),
        undefined
      );
    });

    test('patterns exceeding the length limit are ignored', () => {
      const longPattern = 'x'.repeat(600) + '*.json';
      assert.strictEqual(
        resolveParserByCustomMappings('config.json', { [longPattern]: 'json' }),
        undefined
      );
    });

    test('patterns exceeding the wildcard limit are ignored', () => {
      const starPattern = '*'.repeat(17) + '.json';
      assert.strictEqual(
        resolveParserByCustomMappings('config.json', { [starPattern]: 'json' }),
        undefined
      );
    });
  });

  suite('Finding #2: expanded-node budget (objectConverter)', () => {
    test('YAML alias bomb (audit PoC, ~375 bytes class) is rejected as a parse error', () => {
      const lines: string[] = ['l0: &l0 [1, 1, 1, 1, 1, 1, 1, 1, 1]'];
      for (let level = 1; level <= 8; level++) {
        const refs = Array(9).fill(`*l${level - 1}`).join(', ');
        lines.push(`l${level}: &l${level} [${refs}]`);
      }
      lines.push('root: *l8');
      const bomb = lines.join('\n');

      const start = Date.now();
      const result = new YamlParser().parse(bomb, 'bomb.yaml');
      const elapsed = Date.now() - start;

      assert.strictEqual(result.type, 'error');
      if (result.type === 'error') {
        assert.strictEqual(result.code, ParseErrorCode.YAML_PARSE_ERROR);
        assert.ok(result.message.includes('10000'));
      }
      assert.ok(elapsed < 10000, `parsing took ${elapsed}ms`);
    });

    test('flat JSON object with more than 10,000 nodes is rejected', () => {
      const entries: string[] = [];
      for (let i = 0; i < 20000; i++) {
        entries.push(`"k${i}": ${i}`);
      }
      const result = new JsonParser().parse(`{${entries.join(',')}}`, 'big.json');
      assert.strictEqual(result.type, 'error');
      if (result.type === 'error') {
        assert.strictEqual(result.code, ParseErrorCode.JSON_PARSE_ERROR);
      }
    });

    test('NDJSON total nodes across lines are bounded cumulatively', () => {
      const lineObj: Record<string, number> = {};
      for (let i = 0; i < 200; i++) {
        lineObj[`k${i}`] = i;
      }
      const line = JSON.stringify(lineObj);
      const content = Array(100).fill(line).join('\n');

      const result = new NdjsonParser().parse(content, 'many.ndjson');
      assert.strictEqual(result.type, 'error');
      if (result.type === 'error') {
        assert.strictEqual(result.code, ParseErrorCode.NDJSON_PARSE_ERROR);
      }
    });

    test('NDJSON document root and range nodes count toward the budget', () => {
      // CodeRabbit follow-up on PR #73: 10,000 `{}` lines used to succeed
      // with maxArrayItems=2 even though the document root plus the
      // binary-split range nodes pushed the total to ~20,000 nodes.
      const content = Array(10000).fill('{}').join('\n');
      const result = new NdjsonParser().parse(content, 'many.ndjson', 2);
      assert.strictEqual(result.type, 'error');
      if (result.type === 'error') {
        assert.strictEqual(result.code, ParseErrorCode.NDJSON_PARSE_ERROR);
        assert.ok(result.message.includes('10000'));
      }
    });

    test('NDJSON document under the budget with range nodes still parses', () => {
      const content = Array(60).fill('{}').join('\n');
      const result = new NdjsonParser().parse(content, 'ok.ndjson', 2);
      assert.strictEqual(result.type, 'success');
      if (result.type === 'success') {
        assert.ok(result.tree.root.children.some((n) => Boolean(n.isRange)));
      }
    });

    test('ordinary documents well under the budget still parse', () => {
      const result = new YamlParser().parse('a:\n  b: [1, 2, 3]\n', 'ok.yaml');
      assert.strictEqual(result.type, 'success');
    });
  });

  suite('Finding #3: JSON Schema $ref diamond expansion', () => {
    function buildDiamondSchema(levels: number): Record<string, unknown> {
      const defs: Record<string, unknown> = {
        L0: { type: 'object', properties: { leaf: { type: 'string' } } }
      };
      for (let i = 1; i <= levels; i++) {
        defs[`L${i}`] = {
          type: 'object',
          properties: {
            a: { $ref: `#/$defs/L${i - 1}` },
            b: { $ref: `#/$defs/L${i - 1}` }
          }
        };
      }
      return { $defs: defs, $ref: `#/$defs/L${levels}` };
    }

    test('audit PoC diamond (18 levels, ~1.7KB input) is rejected quickly', () => {
      const content = JSON.stringify(buildDiamondSchema(18));

      const start = Date.now();
      const result = new JsonSchemaParser().parse(content, 'bomb.schema.json');
      const elapsed = Date.now() - start;

      assert.strictEqual(result.type, 'error');
      if (result.type === 'error') {
        assert.strictEqual(result.code, ParseErrorCode.JSON_PARSE_ERROR);
        assert.ok(result.message.includes('10000'));
      }
      assert.ok(elapsed < 10000, `parsing took ${elapsed}ms`);
    });

    test('small diamond references still resolve successfully', () => {
      const content = JSON.stringify(buildDiamondSchema(3));
      const result = new JsonSchemaParser().parse(content, 'ok.schema.json');
      assert.strictEqual(result.type, 'success');
    });

    test('primitive-heavy $ref duplication is counted and rejected', () => {
      // CodeRabbit follow-up on PR #73: $defs/W.properties holding
      // 10,000 `true` values, referenced from 1,000 properties, used to
      // pass the budget (~3,005 counted) and then generate 10M+ nodes.
      // Primitives in duplicated content are now counted, and the same
      // shared budget caps the generated StructNode tree.
      const wProps: Record<string, boolean> = {};
      for (let i = 0; i < 10000; i++) {
        wProps[`p${i}`] = true;
      }
      const props: Record<string, unknown> = {};
      for (let i = 0; i < 1000; i++) {
        props[`r${i}`] = { $ref: '#/$defs/W' };
      }
      const schema = {
        $defs: { W: { type: 'object', properties: wProps } },
        type: 'object',
        properties: props,
      };

      const start = Date.now();
      const result = new JsonSchemaParser().parse(JSON.stringify(schema), 'bomb.schema.json');
      const elapsed = Date.now() - start;

      assert.strictEqual(result.type, 'error');
      if (result.type === 'error') {
        assert.strictEqual(result.code, ParseErrorCode.JSON_PARSE_ERROR);
        assert.ok(result.message.includes('10000'));
      }
      assert.ok(elapsed < 10000, `parsing took ${elapsed}ms`);
    });

    test('small boolean schemas are still accepted', () => {
      const schema = {
        $defs: { Flag: true },
        type: 'object',
        properties: {
          a: { $ref: '#/$defs/Flag' },
          b: { $ref: '#/$defs/Flag' },
          c: true,
        },
      };
      const result = new JsonSchemaParser().parse(JSON.stringify(schema), 'ok.schema.json');
      assert.strictEqual(result.type, 'success');
    });
  });

  suite('Finding #4: settings clamping', () => {
    test('clampMaxFileSizeMB falls back to the default for non-positive values', () => {
      assert.strictEqual(clampMaxFileSizeMB(0), 5);
      assert.strictEqual(clampMaxFileSizeMB(-3), 5);
      assert.strictEqual(clampMaxFileSizeMB(Number.NaN), 5);
      assert.strictEqual(clampMaxFileSizeMB(2), 2);
      assert.strictEqual(clampMaxFileSizeMB(999), 50);
      assert.strictEqual(clampMaxFileSizeMB(0.01), 0.1);
    });

    test('clampMaxArrayItems clamps to [1, 1000]', () => {
      assert.strictEqual(clampMaxArrayItems(0), 1);
      assert.strictEqual(clampMaxArrayItems(100000), 1000);
      assert.strictEqual(clampMaxArrayItems(50.7), 50);
      assert.strictEqual(clampMaxArrayItems(Number.NaN), 50);
    });

    test('clampDebounceMs clamps to [0, 5000]', () => {
      assert.strictEqual(clampDebounceMs(-5), 0);
      assert.strictEqual(clampDebounceMs(99999), 5000);
      assert.strictEqual(clampDebounceMs(500), 500);
    });

    test('service clamps an oversized maxArrayItems instead of chunking being disabled', () => {
      const service = new StructMapService();
      const bigArray = JSON.stringify(Array.from({ length: 2000 }, (_, i) => i));
      const result = service.build('arr.json', bigArray, 5, 100000);

      assert.strictEqual(result.type, 'success');
      if (result.type === 'success') {
        // Clamped to 1000 direct items + 1 range node.
        assert.strictEqual(result.tree.root.children.length, 1001);
      }
    });

    test('service clamps an oversized maxFileSizeMB to 50MB', () => {
      const service = new StructMapService();
      // 6MB of whitespace: over the 5MB default but under the 50MB ceiling,
      // so with clamping it must reach the empty-file check, not FILE_TOO_LARGE.
      const result = service.build('ws.json', ' '.repeat(6 * 1024 * 1024), 999);
      assert.strictEqual(result.type, 'error');
      if (result.type === 'error') {
        assert.strictEqual(result.code, ParseErrorCode.EMPTY_FILE);
      }
    });
  });
});

/**
 * Regression tests for the 2026-11-22 security audit: the shared
 * MAX_NODES budget (already enforced for JSON/YAML/NDJSON) was not
 * applied to the TOML, XML, Markdown and Env parsers, the TOML range
 * node expanded every remaining array element as a direct child, and
 * Env entry insertion was O(n²) due to a per-entry linear child search.
 */
suite('Security Audit 2026-11-22 Regression Tests', () => {
  suite('Node budget applied to the remaining parsers', () => {
    test('TOML: flat table with more than 10,000 entries is rejected', () => {
      const lines: string[] = [];
      for (let i = 0; i < 20000; i++) {
        lines.push(`k${i} = ${i}`);
      }
      const result = new TomlParser().parse(lines.join('\n'), 'big.toml');
      assert.strictEqual(result.type, 'error');
      if (result.type === 'error') {
        assert.strictEqual(result.code, ParseErrorCode.TOML_PARSE_ERROR);
        assert.ok(result.message.includes('10000'));
      }
    });

    test('TOML: array with more than 10,000 elements is rejected', () => {
      const content = `arr = [${Array(20000).fill('0').join(',')}]`;
      const result = new TomlParser().parse(content, 'big.toml');
      assert.strictEqual(result.type, 'error');
      if (result.type === 'error') {
        assert.strictEqual(result.code, ParseErrorCode.TOML_PARSE_ERROR);
        assert.ok(result.message.includes('10000'));
      }
    });

    test('TOML: range node chunks large arrays recursively instead of expanding all elements', () => {
      const content = `arr = [${Array(200).fill('1').join(',')}]`;
      const result = new TomlParser().parse(content, 'chunked.toml');
      assert.strictEqual(result.type, 'success');
      if (result.type === 'success') {
        const arrNode = result.tree.root.children.find((n) => n.name === 'arr');
        assert.ok(arrNode);
        // 50 direct items + 1 range node.
        assert.strictEqual(arrNode.children.length, 51);
        const rangeNode = arrNode.children[50];
        assert.strictEqual(rangeNode.isRange, true);
        // The remaining 150 elements are grouped into sub-ranges of 50,
        // not expanded as 150 direct children of the range node.
        assert.strictEqual(rangeNode.children.length, 3);
        for (const subRange of rangeNode.children) {
          assert.strictEqual(subRange.isRange, true);
          assert.strictEqual(subRange.children.length, 50);
        }
      }
    });

    test('XML: document with more than 10,000 elements is rejected', () => {
      const content = `<root>${'<a/>'.repeat(20000)}</root>`;
      const result = new XmlParser().parse(content, 'big.xml');
      assert.strictEqual(result.type, 'error');
      if (result.type === 'error') {
        assert.strictEqual(result.code, ParseErrorCode.XML_PARSE_ERROR);
        assert.ok(result.message.includes('10000'));
      }
    });

    test('Markdown: document with more than 10,000 headings is rejected', () => {
      const content = Array(20000).fill('# heading').join('\n');
      const result = new MarkdownParser().parse(content, 'big.md');
      assert.strictEqual(result.type, 'error');
      if (result.type === 'error') {
        assert.ok(result.message.includes('10000'));
      }
    });

    test('Env: file with more than 10,000 entries is rejected', () => {
      const lines: string[] = [];
      for (let i = 0; i < 20000; i++) {
        lines.push(`KEY${i}=value`);
      }
      const start = Date.now();
      const result = new EnvParser().parse(lines.join('\n'), '.env');
      const elapsed = Date.now() - start;
      assert.strictEqual(result.type, 'error');
      if (result.type === 'error') {
        assert.strictEqual(result.code, ParseErrorCode.ENV_PARSE_ERROR);
        assert.ok(result.message.includes('10000'));
      }
      assert.ok(elapsed < 10000, `parsing took ${elapsed}ms`);
    });

    test('Env: many entries sharing prefixes still parse correctly (Map-based child lookup)', () => {
      const lines: string[] = [];
      for (let i = 0; i < 2000; i++) {
        lines.push(`GROUP${i % 10}_KEY${i}=v${i}`);
      }
      lines.push('DUP_KEY=first');
      lines.push('DUP_KEY=second');
      const result = new EnvParser().parse(lines.join('\n'), '.env');
      assert.strictEqual(result.type, 'success');
      if (result.type === 'success') {
        const group3 = result.tree.root.children.find((n) => n.name === 'GROUP3');
        assert.ok(group3);
        assert.strictEqual(
          group3.children.find((n) => n.name === 'KEY3')?.value,
          'v3'
        );
        // Duplicate keys keep the existing overwrite behaviour.
        const dupGroup = result.tree.root.children.find((n) => n.name === 'DUP');
        assert.strictEqual(
          dupGroup?.children.find((n) => n.name === 'KEY')?.value,
          'second'
        );
      }
    });
  });
});
