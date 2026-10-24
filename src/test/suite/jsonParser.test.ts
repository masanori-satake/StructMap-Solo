import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { JsonParser, ParseErrorCode, ParseResult, ParseSuccess, StructTree } from '../../core';

suite('JsonParser Test Suite', () => {
  const parser = new JsonParser();

  function getTree(result: ParseResult): StructTree {
    assert.strictEqual(result.type, 'success');
    return (result as ParseSuccess).tree;
  }

  test('AC-1 Object解析: Converts object structures into StructNodes', () => {
    const json = JSON.stringify({
      project: {
        overview: {},
        design: {}
      }
    });

    const tree = getTree(parser.parse(json, 'config.json'));
    assert.strictEqual(tree.root.children.length, 1);

    const projectNode = tree.root.children[0];
    assert.strictEqual(projectNode.name, 'project');
    assert.strictEqual(projectNode.nodeType, 'object');
    assert.deepStrictEqual(projectNode.path, ['config.json', 'project']);
    assert.strictEqual(projectNode.children.length, 2);

    const [overviewNode, designNode] = projectNode.children;
    assert.strictEqual(overviewNode.name, 'overview');
    assert.strictEqual(overviewNode.nodeType, 'object');
    assert.deepStrictEqual(overviewNode.path, ['config.json', 'project', 'overview']);
    assert.deepStrictEqual(overviewNode.children, []);

    assert.strictEqual(designNode.name, 'design');
    assert.strictEqual(designNode.nodeType, 'object');
    assert.deepStrictEqual(designNode.path, ['config.json', 'project', 'design']);
    assert.deepStrictEqual(designNode.children, []);
  });

  test('AC-2 Value解析: Correctly identifies string, number, boolean, and null value types', () => {
    const json = JSON.stringify({
      name: 'Alice',
      age: 20,
      active: true,
      description: null
    });

    const tree = getTree(parser.parse(json, 'user.json'));
    const children = tree.root.children;

    assert.strictEqual(children.length, 4);

    const [nameNode, ageNode, activeNode, descNode] = children;

    assert.strictEqual(nameNode.name, 'name');
    assert.strictEqual(nameNode.nodeType, 'value');
    assert.strictEqual(nameNode.valueType, 'string');
    assert.strictEqual(nameNode.value, 'Alice');

    assert.strictEqual(ageNode.name, 'age');
    assert.strictEqual(ageNode.nodeType, 'value');
    assert.strictEqual(ageNode.valueType, 'number');
    assert.strictEqual(ageNode.value, 20);

    assert.strictEqual(activeNode.name, 'active');
    assert.strictEqual(activeNode.nodeType, 'value');
    assert.strictEqual(activeNode.valueType, 'boolean');
    assert.strictEqual(activeNode.value, true);

    assert.strictEqual(descNode.name, 'description');
    assert.strictEqual(descNode.nodeType, 'value');
    assert.strictEqual(descNode.valueType, 'null');
    assert.strictEqual(descNode.value, null);
  });

  test('AC-3 Array解析: Generates nodeType=array for arrays', () => {
    const json = JSON.stringify({
      users: [
        {
          id: 1,
          name: 'Alice'
        }
      ]
    });

    const tree = getTree(parser.parse(json, 'data.json'));
    const usersNode = tree.root.children[0];

    assert.strictEqual(usersNode.name, 'users');
    assert.strictEqual(usersNode.nodeType, 'array');
    assert.deepStrictEqual(usersNode.path, ['data.json', 'users']);
    assert.strictEqual(usersNode.children.length, 1);

    const firstElem = usersNode.children[0];
    assert.strictEqual(firstElem.name, '[0]');
    assert.strictEqual(firstElem.nodeType, 'object');
    assert.deepStrictEqual(firstElem.path, ['data.json', 'users', '[0]']);
    assert.strictEqual(firstElem.children.length, 2);

    assert.strictEqual(firstElem.children[0].name, 'id');
    assert.strictEqual(firstElem.children[0].value, 1);

    assert.strictEqual(firstElem.children[1].name, 'name');
    assert.strictEqual(firstElem.children[1].value, 'Alice');
  });

  test('AC-4 First戦略: Converts only the first element of an array', () => {
    const json = JSON.stringify({
      users: [
        {
          id: 1
        },
        {
          id: 2,
          email: 'test@example.com'
        }
      ]
    });

    const tree = getTree(parser.parse(json, 'users.json'));
    const usersNode = tree.root.children[0];

    assert.strictEqual(usersNode.children.length, 1);

    const firstElem = usersNode.children[0];
    assert.strictEqual(firstElem.name, '[0]');
    assert.strictEqual(firstElem.children.length, 1);

    assert.strictEqual(firstElem.children[0].name, 'id');
    assert.strictEqual(firstElem.children[0].value, 1);
  });

  test('AC-5 空配列対応: Handles empty arrays without throwing exceptions', () => {
    const json = JSON.stringify({
      users: []
    });

    const tree = getTree(parser.parse(json, 'empty_array.json'));
    const usersNode = tree.root.children[0];

    assert.strictEqual(usersNode.name, 'users');
    assert.strictEqual(usersNode.nodeType, 'array');
    assert.deepStrictEqual(usersNode.children, []);
  });

  test('AC-6 空オブジェクト対応: Handles empty objects without throwing exceptions', () => {
    const json = JSON.stringify({
      settings: {}
    });

    const tree = getTree(parser.parse(json, 'empty_object.json'));
    const settingsNode = tree.root.children[0];

    assert.strictEqual(settingsNode.name, 'settings');
    assert.strictEqual(settingsNode.nodeType, 'object');
    assert.deepStrictEqual(settingsNode.children, []);
  });

  test('AC-7 Unicodeキー保持: Preserves Unicode keys in node names', () => {
    const json = JSON.stringify({
      ユーザー: {
        名前: 'テスト',
        '🚀': 'rocket'
      }
    });

    const tree = getTree(parser.parse(json, 'unicode.json'));
    const userNode = tree.root.children[0];

    assert.strictEqual(userNode.name, 'ユーザー');
    assert.strictEqual(userNode.children[0].name, '名前');
    assert.strictEqual(userNode.children[0].value, 'テスト');
    assert.strictEqual(userNode.children[1].name, '🚀');
    assert.strictEqual(userNode.children[1].value, 'rocket');
  });

  test('AC-8 Rootノード生成: Sets root.name to file name', () => {
    const json = JSON.stringify({ key: 'value' });

    const tree = getTree(parser.parse(json, 'config.json'));

    assert.strictEqual(tree.sourceFormat, 'json');
    assert.strictEqual(tree.root.name, 'config.json');
    assert.strictEqual(tree.root.nodeType, 'root');
    assert.deepStrictEqual(tree.root.path, ['config.json']);

    // Default file name test
    const defaultTree = getTree(parser.parse(json));
    assert.strictEqual(defaultTree.root.name, 'root');
    assert.deepStrictEqual(defaultTree.root.path, ['root']);
  });

  test('AC-9 VSCode API非依存: JsonParser does not import VSCode API', () => {
    const parserFilePath = path.resolve(__dirname, '../../../src/core/parsers/json/JsonParser.ts');
    const fileContent = fs.readFileSync(parserFilePath, 'utf8');

    assert.strictEqual(fileContent.includes("from 'vscode'"), false);
    assert.strictEqual(fileContent.includes('from "vscode"'), false);
    assert.strictEqual(fileContent.includes("require('vscode')"), false);
    assert.strictEqual(fileContent.includes('require("vscode")'), false);
  });

  test('Top-level primitives, empty root object/array, and array of primitives', () => {
    // Top level scalar
    const numTree = getTree(parser.parse('42', 'num.json'));
    assert.strictEqual(numTree.root.children.length, 1);
    assert.strictEqual(numTree.root.children[0].nodeType, 'value');
    assert.strictEqual(numTree.root.children[0].value, 42);

    // Top level array of primitives
    const arrTree = getTree(parser.parse('[10, 20, 30]', 'arr.json'));
    assert.strictEqual(arrTree.root.children.length, 1);
    assert.strictEqual(arrTree.root.children[0].name, '[0]');
    assert.strictEqual(arrTree.root.children[0].value, 10);

    // Top level empty object
    const emptyObjTree = getTree(parser.parse('{}', 'empty.json'));
    assert.strictEqual(emptyObjTree.root.children.length, 0);

    // Top level empty array
    const emptyArrTree = getTree(parser.parse('[]', 'empty_arr.json'));
    assert.strictEqual(emptyArrTree.root.children.length, 0);
  });

  test('AC-1 & AC-4 & AC-5 & AC-6: JSON構文エラーでParseErrorが返り、Line/Columnを保持しアプリがクラッシュしない', () => {
    const invalidJson = '{\n  "name":';
    const result = parser.parse(invalidJson, 'invalid.json');

    assert.strictEqual(result.type, 'error');
    if (result.type === 'error') {
      assert.strictEqual(result.code, ParseErrorCode.JSON_PARSE_ERROR);
      assert.ok(result.message.includes('JSON Parse Error'));
      assert.strictEqual(typeof result.line, 'number');
      assert.strictEqual(typeof result.column, 'number');
      assert.strictEqual(result.line, 2);
    }
  });

  test('JSON error on empty string input does not crash and returns ParseError', () => {
    const result = parser.parse('');
    assert.strictEqual(result.type, 'error');
    if (result.type === 'error') {
      assert.strictEqual(result.code, ParseErrorCode.JSON_PARSE_ERROR);
      assert.ok(result.message.includes('JSON Parse Error'));
    }
  });
});
