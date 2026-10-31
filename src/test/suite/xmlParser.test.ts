import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  isParseError,
  isParseSuccess,
  ParseErrorCode,
  StructMapService,
  XmlParser
} from '../../core';
import { NodeNavigator } from '../../vscode/navigation/NodeNavigator';

suite('XmlParser Test Suite', () => {
  let xmlParser: XmlParser;
  let service: StructMapService;

  setup(() => {
    xmlParser = new XmlParser();
    service = new StructMapService();
  });

  test('parses simple XML document successfully', () => {
    const xml = `
      <book id="1">
        <title>StructMap Guide</title>
        <price>29.99</price>
        <available>true</available>
      </book>
    `;
    const result = xmlParser.parse(xml, 'sample.xml');
    assert.ok(isParseSuccess(result));
    const tree = result.tree;
    assert.strictEqual(tree.sourceFormat, 'xml');
    assert.strictEqual(tree.root.name, 'sample.xml');
    assert.strictEqual(tree.root.children.length, 1);

    const bookNode = tree.root.children[0];
    assert.strictEqual(bookNode.name, 'book');
    assert.strictEqual(bookNode.nodeType, 'object');
    assert.deepStrictEqual(bookNode.attributes, { id: '1' });

    // Children should include @id, title, price, available
    assert.strictEqual(bookNode.children.length, 4);
    assert.strictEqual(bookNode.children[0].name, '@id');
    assert.strictEqual(bookNode.children[0].value, 1);
    assert.strictEqual(bookNode.children[0].valueType, 'number');

    assert.strictEqual(bookNode.children[1].name, 'title');
    assert.strictEqual(bookNode.children[1].value, 'StructMap Guide');
    assert.strictEqual(bookNode.children[1].valueType, 'string');

    assert.strictEqual(bookNode.children[2].name, 'price');
    assert.strictEqual(bookNode.children[2].value, 29.99);
    assert.strictEqual(bookNode.children[2].valueType, 'number');

    assert.strictEqual(bookNode.children[3].name, 'available');
    assert.strictEqual(bookNode.children[3].value, true);
    assert.strictEqual(bookNode.children[3].valueType, 'boolean');
  });

  test('deterministic mapping for single vs multiple children', () => {
    const singleChildXml = `
      <root>
        <item>A</item>
      </root>
    `;
    const multiChildXml = `
      <root>
        <item>A</item>
        <item>B</item>
      </root>
    `;

    const resSingle = xmlParser.parse(singleChildXml, 'test.xml');
    const resMulti = xmlParser.parse(multiChildXml, 'test.xml');

    assert.ok(isParseSuccess(resSingle));
    assert.ok(isParseSuccess(resMulti));

    const rootSingle = resSingle.tree.root.children[0];
    const rootMulti = resMulti.tree.root.children[0];

    assert.strictEqual(rootSingle.nodeType, 'object');
    assert.strictEqual(rootMulti.nodeType, 'object');

    // Both are consistent deterministic lists (StructNode[])
    assert.strictEqual(rootSingle.children.length, 1);
    assert.strictEqual(rootMulti.children.length, 2);
    assert.strictEqual(rootSingle.children[0].name, 'item');
    assert.strictEqual(rootMulti.children[0].name, 'item');
    assert.strictEqual(rootMulti.children[1].name, 'item');
  });

  test('parses mixed content with #text nodes', () => {
    const xml = `
      <p>Hello <b>World</b>!</p>
    `;
    const result = xmlParser.parse(xml, 'mixed.xml');
    assert.ok(isParseSuccess(result));
    const pNode = result.tree.root.children[0];
    assert.strictEqual(pNode.name, 'p');
    assert.strictEqual(pNode.children.length, 3);

    assert.strictEqual(pNode.children[0].name, '#text');
    assert.strictEqual(pNode.children[0].value, 'Hello');

    assert.strictEqual(pNode.children[1].name, 'b');
    assert.strictEqual(pNode.children[1].value, 'World');

    assert.strictEqual(pNode.children[2].name, '#text');
    assert.strictEqual(pNode.children[2].value, '!');
  });

  test('handles comments, CDATA, XML declaration, and self-closing tags', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <!-- This is a comment -->
      <data>
        <raw><![CDATA[Some <unescaped> data & characters]]></raw>
        <empty-tag key="val" />
      </data>
    `;
    const result = xmlParser.parse(xml, 'data.xml');
    assert.ok(isParseSuccess(result));
    const dataNode = result.tree.root.children[0];
    assert.strictEqual(dataNode.children.length, 2);

    const rawNode = dataNode.children[0];
    assert.strictEqual(rawNode.name, 'raw');
    assert.strictEqual(rawNode.value, 'Some <unescaped> data & characters');

    const emptyNode = dataNode.children[1];
    assert.strictEqual(emptyNode.name, 'empty-tag');
    assert.strictEqual(emptyNode.attributes?.key, 'val');
    assert.strictEqual(emptyNode.children[0].name, '@key');
    assert.strictEqual(emptyNode.children[0].value, 'val');
  });

  test('returns ParseError on malformed XML syntax', () => {
    const invalidXml = `
      <root>
        <open>No close
      </root>
    `;
    const result = xmlParser.parse(invalidXml, 'invalid.xml');
    assert.ok(isParseError(result));
    assert.strictEqual(result.code, ParseErrorCode.XML_PARSE_ERROR);
    assert.ok(result.line !== undefined);
  });

  test('StructMapService integrates XML parsing and supportsTypes', () => {
    assert.strictEqual(service.supportsTypes('file.xml'), true);
    assert.strictEqual(service.supportsTypes('file.json'), true);
    assert.strictEqual(service.supportsTypes('file.md'), false);

    const result = service.build('test.xml', '<root><name>Solo</name></root>');
    assert.ok(isParseSuccess(result));
    assert.strictEqual(result.tree.sourceFormat, 'xml');
  });

  test('NodeNavigator finds position of XML tags and attributes', async () => {
    const navigator = new NodeNavigator();
    const docText = '<root id="123">\n  <item name="foo">Value</item>\n</root>';
    const doc = await vscode.workspace.openTextDocument({
      content: docText,
      language: 'xml'
    });

    const rootRes = xmlParser.parse(docText, 'doc.xml');
    assert.ok(isParseSuccess(rootRes));
    const rootEl = rootRes.tree.root.children[0];

    const posRoot = navigator.findNodePosition(doc, rootEl);
    assert.ok(posRoot);
    assert.strictEqual(posRoot.line, 0);

    const attrNode = rootEl.children[0]; // @id
    const posAttr = navigator.findNodePosition(doc, attrNode);
    assert.ok(posAttr);
    assert.strictEqual(posAttr.line, 0);

    const itemNode = rootEl.children[1]; // item
    const posItem = navigator.findNodePosition(doc, itemNode);
    assert.ok(posItem);
    assert.strictEqual(posItem.line, 1);
  });
});
