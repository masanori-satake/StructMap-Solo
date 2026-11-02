import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { ParseResult, ParseSuccess, StructNode, StructTree } from '../../../core';
import { EnvParser } from '../../../core/parsers/env/EnvParser';

suite('EnvParser Test Suite', () => {
  const parser = new EnvParser();

  function getTree(result: ParseResult): StructTree {
    assert.strictEqual(result.type, 'success');
    return (result as ParseSuccess).tree;
  }

  test('正常系: アンダースコアプレフィックスでグループ化されること', () => {
    const content = `
      # Database settings
      DB_HOST=localhost
      DB_PORT=5432
      API_KEY=xyz123
    `;
    const result = parser.parse(content, '.env');

    assert.strictEqual(result.type, 'success');
    if (result.type === 'success') {
      assert.strictEqual(result.tree.sourceFormat, 'env');
      const dbGroup = result.tree.root.children.find((n: StructNode) => n.name === 'DB');
      assert.ok(dbGroup);
      assert.strictEqual(dbGroup?.nodeType, 'object');

      const hostNode = dbGroup?.children.find((n: StructNode) => n.name === 'HOST');
      assert.ok(hostNode);
      assert.strictEqual(hostNode?.value, 'localhost');
      assert.strictEqual(hostNode?.valueType, 'string');

      const portNode = dbGroup?.children.find((n: StructNode) => n.name === 'PORT');
      assert.ok(portNode);
      assert.strictEqual(portNode?.value, 5432);
      assert.strictEqual(portNode?.valueType, 'number');

      const apiGroup = result.tree.root.children.find((n: StructNode) => n.name === 'API');
      assert.ok(apiGroup);
      assert.strictEqual(apiGroup?.children.find((n: StructNode) => n.name === 'KEY')?.value, 'xyz123');
    }
  });

  test('VSCode API非依存: EnvParser does not import VSCode API', () => {
    const parserFilePath = path.resolve(__dirname, '../../../../src/core/parsers/env/EnvParser.ts');
    const fileContent = fs.readFileSync(parserFilePath, 'utf8');

    assert.strictEqual(fileContent.includes('from \'vscode\''), false);
    assert.strictEqual(fileContent.includes('from "vscode"'), false);
    assert.strictEqual(fileContent.includes('require(\'vscode\')'), false);
    assert.strictEqual(fileContent.includes('require("vscode")'), false);
  });

  test('コメントおよび空行が安全に無視・処理されること', () => {
    const content = '\n# Comment line\nFOO=bar\n\n';
    const result = parser.parse(content, '.env');

    assert.strictEqual(result.type, 'success');
    if (result.type === 'success') {
      assert.strictEqual(result.tree.root.children.length, 1);
      assert.strictEqual(result.tree.root.children[0].name, 'FOO');
      assert.strictEqual(result.tree.root.children[0].value, 'bar');
      assert.strictEqual(result.tree.root.children[0].valueType, 'string');
    }
  });

  test('再帰的な階層化: A_B_C およびドット記法 app.server.port が多層グループ化されること', () => {
    const content = `
      A_B_C=nested_val
      app.server.port=8080
      FLAG=true
    `;
    const tree = getTree(parser.parse(content, '.env.local'));

    // A -> B -> C
    const aNode = tree.root.children.find((n: StructNode) => n.name === 'A');
    assert.ok(aNode);
    assert.strictEqual(aNode?.nodeType, 'object');
    const bNode = aNode?.children.find((n: StructNode) => n.name === 'B');
    assert.ok(bNode);
    assert.strictEqual(bNode?.nodeType, 'object');
    const cNode = bNode?.children.find((n: StructNode) => n.name === 'C');
    assert.ok(cNode);
    assert.strictEqual(cNode?.nodeType, 'value');
    assert.strictEqual(cNode?.value, 'nested_val');

    // app -> server -> port
    const appNode = tree.root.children.find((n: StructNode) => n.name === 'app');
    assert.ok(appNode);
    const serverNode = appNode?.children.find((n: StructNode) => n.name === 'server');
    assert.ok(serverNode);
    const portNode = serverNode?.children.find((n: StructNode) => n.name === 'port');
    assert.ok(portNode);
    assert.strictEqual(portNode?.value, 8080);
    assert.strictEqual(portNode?.valueType, 'number');

    // FLAG=true
    const flagNode = tree.root.children.find((n: StructNode) => n.name === 'FLAG');
    assert.ok(flagNode);
    assert.strictEqual(flagNode?.value, true);
    assert.strictEqual(flagNode?.valueType, 'boolean');
  });

  test('引用符付きの値およびエスケープ解除処理', () => {
    const content = `
      SINGLE='quoted value'
      DOUBLE="hello\\nworld"
      ESCAPED="quote \\" test"
      LITERAL="slash \\\\n keep"
    `;
    const tree = getTree(parser.parse(content, '.env'));

    const singleNode = tree.root.children.find((n: StructNode) => n.name === 'SINGLE');
    assert.strictEqual(singleNode?.value, 'quoted value');
    assert.strictEqual(singleNode?.valueType, 'string');

    const doubleNode = tree.root.children.find((n: StructNode) => n.name === 'DOUBLE');
    assert.strictEqual(doubleNode?.value, 'hello\nworld');
    assert.strictEqual(doubleNode?.valueType, 'string');

    const escapedNode = tree.root.children.find((n: StructNode) => n.name === 'ESCAPED');
    assert.strictEqual(escapedNode?.value, 'quote " test');

    const literalNode = tree.root.children.find((n: StructNode) => n.name === 'LITERAL');
    assert.strictEqual(literalNode?.value, 'slash \\n keep');
  });

  test('行末コメント除去および既存値ノードの保持', () => {
    const content = `
      UNQUOTED=12345 # this is a comment
      QUOTED="hello # inside" # this is outside
      LOG=foo
      LOG_LEVEL=debug
    `;
    const tree = getTree(parser.parse(content, '.env'));

    const unquotedNode = tree.root.children.find((n: StructNode) => n.name === 'UNQUOTED');
    assert.strictEqual(unquotedNode?.value, 12345);
    assert.strictEqual(unquotedNode?.valueType, 'number');

    const quotedNode = tree.root.children.find((n: StructNode) => n.name === 'QUOTED');
    assert.strictEqual(quotedNode?.value, 'hello # inside');
    assert.strictEqual(quotedNode?.valueType, 'string');

    const logNode = tree.root.children.find((n: StructNode) => n.name === 'LOG');
    assert.ok(logNode);
    assert.strictEqual(logNode?.nodeType, 'object');
    assert.strictEqual(logNode?.value, 'foo');
    assert.strictEqual(logNode?.children.find((n: StructNode) => n.name === 'LEVEL')?.value, 'debug');
  });

  test('区切り文字の差異保持: DB_HOST と DB.HOST が別ノードとして表現されること', () => {
    const content = `
      DB_HOST=underscore_host
      DB.HOST=dot_host
      DB_HOST=underscore_host_updated
    `;
    const tree = getTree(parser.parse(content, '.env'));

    const dbGroups = tree.root.children.filter((n: StructNode) => n.name === 'DB');
    assert.strictEqual(dbGroups.length, 2);

    const underscoreGroup = dbGroups.find((n: StructNode) => n.attributes?.delimiter === '_');
    const dotGroup = dbGroups.find((n: StructNode) => n.attributes?.delimiter === '.');

    assert.ok(underscoreGroup);
    assert.ok(dotGroup);

    assert.strictEqual(
      underscoreGroup?.children.find((n: StructNode) => n.name === 'HOST')?.value,
      'underscore_host_updated'
    );
    assert.strictEqual(
      dotGroup?.children.find((n: StructNode) => n.name === 'HOST')?.value,
      'dot_host'
    );
  });

  test('エスケープされた引用符および未終了引用符の安全な境界処理', () => {
    const content = `
      ESCAPED_QUOTE="hello\\"world" # valid quoted
      UNCLOSED="unclosed\\" # comment here
      ESCAPED_SLASH="ends_with_backslash\\\\" # properly closed with escaped slash
    `;
    const tree = getTree(parser.parse(content, '.env'));

    const escapedNode = tree.root.children.find((n: StructNode) => n.name === 'ESCAPED');
    assert.strictEqual(
      escapedNode?.children.find((n: StructNode) => n.name === 'QUOTE')?.value,
      'hello"world'
    );

    const unclosedNode = tree.root.children.find((n: StructNode) => n.name === 'UNCLOSED');
    // UNCLOSED is not properly closed before comment, so treated as unquoted string without leaking or breaking
    assert.strictEqual(unclosedNode?.value, '"unclosed\\"');

    const slashNode = tree.root.children.find((n: StructNode) => n.name === 'ESCAPED');
    assert.strictEqual(
      slashNode?.children.find((n: StructNode) => n.name === 'SLASH')?.value,
      'ends_with_backslash\\'
    );
  });

});
