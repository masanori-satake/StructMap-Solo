import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { YamlParser } from '../../core';

suite('YamlParser Test Suite', () => {
  const parser = new YamlParser();

  test('AC-1 YAML解析: Converts YAML structure into StructNodes', () => {
    const yamlContent = `
project:
  overview: {}
  design: {}
`;

    const tree = parser.parse(yamlContent, 'config.yaml');
    assert.strictEqual(tree.root.children.length, 1);

    const projectNode = tree.root.children[0];
    assert.strictEqual(projectNode.name, 'project');
    assert.strictEqual(projectNode.nodeType, 'object');
    assert.deepStrictEqual(projectNode.path, ['config.yaml', 'project']);
    assert.strictEqual(projectNode.children.length, 2);

    const [overviewNode, designNode] = projectNode.children;
    assert.strictEqual(overviewNode.name, 'overview');
    assert.strictEqual(overviewNode.nodeType, 'object');
    assert.deepStrictEqual(overviewNode.path, ['config.yaml', 'project', 'overview']);
    assert.deepStrictEqual(overviewNode.children, []);

    assert.strictEqual(designNode.name, 'design');
    assert.strictEqual(designNode.nodeType, 'object');
    assert.deepStrictEqual(designNode.path, ['config.yaml', 'project', 'design']);
    assert.deepStrictEqual(designNode.children, []);
  });

  test('AC-2 StructTree生成: Generates sourceFormat=yaml and correct value types', () => {
    const yamlContent = `
name: Alice
age: 20
active: true
description: null
`;

    const tree = parser.parse(yamlContent, 'user.yaml');
    assert.strictEqual(tree.sourceFormat, 'yaml');

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

  test('AC-3 Unicode保持: Preserves Unicode keys and values', () => {
    const yamlContent = `
ユーザー:
  名前: 山田
  絵文字: 🚀
`;

    const tree = parser.parse(yamlContent, 'unicode.yaml');
    const userNode = tree.root.children[0];

    assert.strictEqual(userNode.name, 'ユーザー');
    assert.strictEqual(userNode.children[0].name, '名前');
    assert.strictEqual(userNode.children[0].value, '山田');
    assert.strictEqual(userNode.children[1].name, '絵文字');
    assert.strictEqual(userNode.children[1].value, '🚀');
  });

  test('AC-4 空配列対応: Handles empty arrays without throwing exceptions', () => {
    const yamlContent = `
users: []
`;

    const tree = parser.parse(yamlContent, 'empty_array.yaml');
    const usersNode = tree.root.children[0];

    assert.strictEqual(usersNode.name, 'users');
    assert.strictEqual(usersNode.nodeType, 'array');
    assert.deepStrictEqual(usersNode.children, []);
  });

  test('AC-5 空オブジェクト対応: Handles empty objects without throwing exceptions', () => {
    const yamlContent = `
settings: {}
`;

    const tree = parser.parse(yamlContent, 'empty_object.yaml');
    const settingsNode = tree.root.children[0];

    assert.strictEqual(settingsNode.name, 'settings');
    assert.strictEqual(settingsNode.nodeType, 'object');
    assert.deepStrictEqual(settingsNode.children, []);
  });

  test('AC-6 YAMLアンカー対応: Handles anchors and aliases without crashing', () => {
    const yamlContent = `
defaults: &defaults
  timeout: 30

api:
  <<: *defaults
  host: 'localhost'
`;

    const tree = parser.parse(yamlContent, 'anchors.yaml');
    const apiNode = tree.root.children.find((c) => c.name === 'api');
    assert.ok(apiNode);
    assert.strictEqual(apiNode.nodeType, 'object');

    const timeoutChild = apiNode.children.find((c) => c.name === 'timeout');
    assert.ok(timeoutChild);
    assert.strictEqual(timeoutChild.value, 30);

    const hostChild = apiNode.children.find((c) => c.name === 'host');
    assert.ok(hostChild);
    assert.strictEqual(hostChild.value, 'localhost');
  });

  test('AC-7 Rootノード生成: Sets root.name to file name', () => {
    const yamlContent = 'key: value';

    const tree = parser.parse(yamlContent, 'service.yml');

    assert.strictEqual(tree.sourceFormat, 'yaml');
    assert.strictEqual(tree.root.name, 'service.yml');
    assert.strictEqual(tree.root.nodeType, 'root');
    assert.deepStrictEqual(tree.root.path, ['service.yml']);

    // Default file name test
    const defaultTree = parser.parse(yamlContent);
    assert.strictEqual(defaultTree.root.name, 'root');
    assert.deepStrictEqual(defaultTree.root.path, ['root']);
  });

  test('AC-8 VSCode API非依存: YamlParser does not import VSCode API', () => {
    const parserFilePath = path.resolve(__dirname, '../../../src/core/parsers/yaml/YamlParser.ts');
    const fileContent = fs.readFileSync(parserFilePath, 'utf8');

    assert.strictEqual(fileContent.includes("from 'vscode'"), false);
    assert.strictEqual(fileContent.includes('from "vscode"'), false);
    assert.strictEqual(fileContent.includes("require('vscode')"), false);
    assert.strictEqual(fileContent.includes('require("vscode")'), false);
  });

  test('Array handling with first strategy and empty/scalar cases', () => {
    const yamlContent = `
users:
  - name: Alice
  - name: Bob
`;

    const tree = parser.parse(yamlContent, 'users.yaml');
    const usersNode = tree.root.children[0];

    assert.strictEqual(usersNode.name, 'users');
    assert.strictEqual(usersNode.nodeType, 'array');
    assert.strictEqual(usersNode.children.length, 1);

    const firstItem = usersNode.children[0];
    assert.strictEqual(firstItem.name, '[0]');
    assert.strictEqual(firstItem.nodeType, 'object');
    assert.strictEqual(firstItem.children[0].name, 'name');
    assert.strictEqual(firstItem.children[0].value, 'Alice');
  });

  test('Invalid YAML syntax throws error', () => {
    const invalidYaml = `
key: : invalid
  nested
`;
    assert.throws(() => {
      parser.parse(invalidYaml, 'invalid.yaml');
    }, /YAML parse error/);
  });

  test('Empty string or comment-only YAML handling', () => {
    const emptyTree = parser.parse('', 'empty.yaml');
    assert.strictEqual(emptyTree.root.children.length, 0);

    const commentTree = parser.parse('# Just a comment', 'comment.yaml');
    assert.strictEqual(commentTree.root.children.length, 1);
    assert.strictEqual(commentTree.root.children[0].nodeType, 'value');
    assert.strictEqual(commentTree.root.children[0].valueType, 'null');
    assert.strictEqual(commentTree.root.children[0].value, null);
  });
});
