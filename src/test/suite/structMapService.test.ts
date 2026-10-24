import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { ParseErrorCode, ParseResult, ParseSuccess, StructMapService, StructTree } from '../../core';

suite('StructMapService Test Suite', () => {
  const service = new StructMapService();

  function getTree(result: ParseResult): StructTree {
    assert.strictEqual(result.type, 'success');
    return (result as ParseSuccess).tree;
  }

  test('AC-1 Markdown選択: README.md を入力すると MarkdownParser が利用される', () => {
    const markdownContent = '# Title\n## Section 1';
    const result = service.build('README.md', markdownContent);

    const tree = getTree(result);
    assert.strictEqual(tree.sourceFormat, 'markdown');
    assert.strictEqual(tree.root.name, 'README.md');
    assert.strictEqual(tree.root.children.length, 1);
    assert.strictEqual(tree.root.children[0].name, 'Title');

    // Also test .markdown extension
    const altResult = service.build('doc.markdown', markdownContent);
    const altTree = getTree(altResult);
    assert.strictEqual(altTree.sourceFormat, 'markdown');
    assert.strictEqual(altTree.root.name, 'doc.markdown');
  });

  test('AC-2 JSON選択: config.json を入力すると JsonParser が利用される', () => {
    const jsonContent = JSON.stringify({ name: 'StructMap', version: 1 });
    const result = service.build('config.json', jsonContent);

    const tree = getTree(result);
    assert.strictEqual(tree.sourceFormat, 'json');
    assert.strictEqual(tree.root.name, 'config.json');
    assert.strictEqual(tree.root.children.length, 2);
    assert.strictEqual(tree.root.children[0].name, 'name');
    assert.strictEqual(tree.root.children[0].value, 'StructMap');
  });

  test('AC-3 YAML選択: config.yaml を入力すると YamlParser が利用される', () => {
    const yamlContent = 'server:\n  port: 8080\n';
    const result = service.build('config.yaml', yamlContent);

    const tree = getTree(result);
    assert.strictEqual(tree.sourceFormat, 'yaml');
    assert.strictEqual(tree.root.name, 'config.yaml');
    assert.strictEqual(tree.root.children.length, 1);
    assert.strictEqual(tree.root.children[0].name, 'server');

    // Also test .yml extension
    const ymlResult = service.build('config.yml', yamlContent);
    const ymlTree = getTree(ymlResult);
    assert.strictEqual(ymlTree.sourceFormat, 'yaml');
    assert.strictEqual(ymlTree.root.name, 'config.yml');
  });

  test('AC-4 未対応形式: sample.txt の場合 ErrorResult が返る', () => {
    const result = service.build('sample.txt', 'Some plain text');

    assert.strictEqual(result.type, 'error');
    if (result.type === 'error') {
      assert.strictEqual(result.code, ParseErrorCode.UNSUPPORTED_FORMAT);
      assert.ok(result.message.includes('sample.txt'));
    }
  });

  test('AC-5 空ファイル: 空文字列入力時に ErrorResult が返る', () => {
    const result = service.build('README.md', '');

    assert.strictEqual(result.type, 'error');
    if (result.type === 'error') {
      assert.strictEqual(result.code, ParseErrorCode.EMPTY_FILE);
    }

    const whitespaceResult = service.build('config.json', '   \n  ');
    assert.strictEqual(whitespaceResult.type, 'error');
    if (whitespaceResult.type === 'error') {
      assert.strictEqual(whitespaceResult.code, ParseErrorCode.EMPTY_FILE);
    }
  });

  test('AC-6 ParseError伝播: Parserエラーが失われない', () => {
    // Invalid JSON
    const jsonResult = service.build('invalid.json', '{\n  "name":');
    assert.strictEqual(jsonResult.type, 'error');
    if (jsonResult.type === 'error') {
      assert.strictEqual(jsonResult.code, ParseErrorCode.JSON_PARSE_ERROR);
      assert.ok(jsonResult.message.includes('JSON Parse Error'));
      assert.strictEqual(typeof jsonResult.line, 'number');
    }

    // Invalid YAML
    const yamlResult = service.build('invalid.yaml', 'key: : invalid');
    assert.strictEqual(yamlResult.type, 'error');
    if (yamlResult.type === 'error') {
      assert.strictEqual(yamlResult.code, ParseErrorCode.YAML_PARSE_ERROR);
      assert.ok(yamlResult.message.includes('YAML Parse Error'));
    }

    // Unclosed frontmatter in Markdown
    const mdResult = service.build('unclosed.md', '---\ntitle: Unclosed\n');
    assert.strictEqual(mdResult.type, 'error');
    if (mdResult.type === 'error') {
      assert.strictEqual(mdResult.code, ParseErrorCode.FRONTMATTER_PARSE_ERROR);
    }
  });

  test('AC-7 VSCode API非依存: StructMapService does not import VSCode API', () => {
    const serviceFilePath = path.resolve(
      __dirname,
      '../../../src/core/services/StructMapService.ts'
    );
    const fileContent = fs.readFileSync(serviceFilePath, 'utf8');

    assert.strictEqual(fileContent.includes("from 'vscode'"), false);
    assert.strictEqual(fileContent.includes('from "vscode"'), false);
    assert.strictEqual(fileContent.includes("require('vscode')"), false);
    assert.strictEqual(fileContent.includes('require("vscode")'), false);
  });
});
