import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { ParseErrorCode, ParseResult, ParseSuccess, StructNode, StructTree } from '../../../core';
import { NdjsonParser } from '../../../core/parsers/ndjson/NdjsonParser';

suite('NdjsonParser Test Suite', () => {
  const parser = new NdjsonParser();

  function getTree(result: ParseResult): StructTree {
    assert.strictEqual(result.type, 'success');
    return (result as ParseSuccess).tree;
  }

  test('正常系: 改行区切りの JSON を正しいツリー構造にパースできること', () => {
    const content = '{"name": "Alice", "role": "admin"}\n{"name": "Bob", "role": "user"}';
    const result = parser.parse(content, 'test.ndjson');

    assert.strictEqual(result.type, 'success');
    if (result.type === 'success') {
      assert.strictEqual(result.tree.sourceFormat, 'ndjson');
      assert.strictEqual(result.tree.root.children.length, 2);
      assert.ok(result.tree.root.children[0].name.includes('1'));
      assert.strictEqual(result.tree.root.children[0].name, 'Line 1');
      assert.strictEqual(result.tree.root.children[1].name, 'Line 2');
    }
  });

  test('空行がスキップされ、物理行番号が保持されること', () => {
    const content = '{"id": 1}\n\n{"id": 3}';
    const tree = getTree(parser.parse(content, 'test.ndjson'));
    assert.strictEqual(tree.root.children.length, 2);
    assert.strictEqual(tree.root.children[0].name, 'Line 1');
    assert.strictEqual(tree.root.children[1].name, 'Line 3');
  });

  test('Chunking: maxArrayItems を超える行数が範囲ノード化されること', () => {
    const lines = Array.from({ length: 60 }, (_, i) => `{"id": ${i + 1}}`).join('\n');
    const result = parser.parse(lines, 'large.ndjson', 50);

    assert.strictEqual(result.type, 'success');
    if (result.type === 'success') {
      assert.strictEqual(result.tree.root.children.length, 51);
      assert.strictEqual(result.tree.root.children.some((n: StructNode) => Boolean(n.isRange)), true);
      const rangeNode = result.tree.root.children.find((n: StructNode) => n.isRange);
      assert.ok(rangeNode);
      assert.strictEqual(rangeNode?.name, '[Line 51 .. Line 60]');
    }
  });

  test('異常系: 途中の行に構文エラーがある場合に ParseError を返すこと', () => {
    const content = '{"valid": true}\nINVALID_JSON\n{"valid": false}';
    const result = parser.parse(content, 'invalid.ndjson');

    assert.strictEqual(result.type, 'error');
    if (result.type === 'error') {
      assert.strictEqual(result.code, ParseErrorCode.NDJSON_PARSE_ERROR);
      assert.strictEqual(result.line, 2);
    }
  });

  test('VSCode API非依存: NdjsonParser does not import VSCode API', () => {
    const parserFilePath = path.resolve(__dirname, '../../../../src/core/parsers/ndjson/NdjsonParser.ts');
    const fileContent = fs.readFileSync(parserFilePath, 'utf8');

    assert.strictEqual(fileContent.includes('from \'vscode\''), false);
    assert.strictEqual(fileContent.includes('from "vscode"'), false);
    assert.strictEqual(fileContent.includes('require(\'vscode\')'), false);
    assert.strictEqual(fileContent.includes('require("vscode")'), false);
  });
});
