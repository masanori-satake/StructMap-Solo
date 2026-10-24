import * as assert from 'assert';
import { FrontmatterParser } from '../../core';

suite('FrontmatterParser Test Suite', () => {
  const parser = new FrontmatterParser();
  const parentPath = ['README.md', 'Frontmatter (YAML)'];

  function parse(content: string) {
    let id = 0;
    return parser.parse(content, parentPath, () => `value-${id++}`);
  }

  test('Retains scalar values and their types in mappings, arrays, and scalar documents', () => {
    const values = ['StructMap 🚀', 42, false, null, ''];
    const types = ['string', 'number', 'boolean', 'null', 'string'];
    const nodes = parse('title: StructMap 🚀\ncount: 42\nenabled: false\nmissing: null\nempty: ""');
    assert.deepStrictEqual(nodes.map(node => node.value), values);
    assert.deepStrictEqual(nodes.map(node => node.valueType), types);

    const items = parse('items: [StructMap 🚀, 42, false, null, ""]')[0].children;
    assert.deepStrictEqual(items.map(node => node.value), values);
    assert.deepStrictEqual(items.map(node => node.valueType), types);

    const scalar = parse('開発')[0];
    assert.strictEqual(scalar.value, '開発');
    assert.strictEqual(scalar.nodeType, 'value');
    assert.deepStrictEqual(scalar.path, [...parentPath, 'value']);
  });

  test('Normalizes dates to ISO string values at every document position', () => {
    for (const date of ['2026-10-24', '2026-10-24T12:34:56+09:00']) {
      const expected = date === '2026-10-24'
        ? '2026-10-24T00:00:00.000Z' : '2026-10-24T03:34:56.000Z';
      const nodes = [
        parse(date)[0],
        parse(`date: ${date}`)[0],
        parse(`- ${date}`)[0],
        parse(`metadata: {dates: [${date}]}`)[0].children[0].children[0]
      ];

      for (const node of nodes) {
        assert.strictEqual(node.nodeType, 'value');
        assert.strictEqual(node.valueType, 'string');
        assert.strictEqual(node.value, expected);
        assert.deepStrictEqual(node.children, []);
      }
    }

    const metadata = parse('metadata: {date: 2026-10-24, title: StructMap}')[0];
    assert.strictEqual(metadata.nodeType, 'object');
    assert.deepStrictEqual(metadata.children.map(node => node.name), ['date', 'title']);
    assert.strictEqual(metadata.children[1].value, 'StructMap');
    assert.deepStrictEqual(metadata.children[0].path, [...parentPath, 'metadata', 'date']);
    assert.strictEqual(parse('date: "2026-10-24"')[0].value, '2026-10-24');
  });

  test('Rejects circular aliases through objects and arrays, including document roots', () => {
    for (const content of [
      '&root {self: *root}',
      '&root [*root]',
      'item: &item {self: *item}',
      'items: &items [*items]',
      'item: &item {children: [{parent: *item}]}'
    ]) {
      assert.throws(() => parse(content), /YAML frontmatter contains a circular alias/);
    }

    assert.strictEqual(parse('title: valid')[0].value, 'valid');
  });

  test('Expands shared aliases independently without treating them as cycles', () => {
    const nodes = parse('original: &obj {tags: &tags [開発, ビジュアル]}\ncopy: *obj\ntags: *tags');
    assert.deepStrictEqual(nodes[0].children[0].children.map(node => node.value), ['開発', 'ビジュアル']);
    assert.deepStrictEqual(nodes[1].children[0].children.map(node => node.value), ['開発', 'ビジュアル']);
    assert.deepStrictEqual(nodes[2].children.map(node => node.value), ['開発', 'ビジュアル']);
    assert.deepStrictEqual(nodes[1].children[0].children[0].path,
      [...parentPath, 'copy', 'tags', '[0]']);
    assert.notStrictEqual(nodes[0].children[0].id, nodes[1].children[0].id);
  });

  test('Accepts 10,000 nodes and rejects larger top-level arrays and mappings', () => {
    for (const content of [
      Array.from({ length: 10_000 }, () => '- value').join('\n'),
      Array.from({ length: 10_000 }, (_, index) => `key${index}: value`).join('\n')
    ]) {
      assert.strictEqual(parse(content).length, 10_000);
      const extra = content.startsWith('-') ? '\n- extra' : '\nextra: value';
      let createdCount = 0;
      assert.throws(() => parser.parse(content + extra, parentPath, () => `${createdCount++}`),
        /YAML frontmatter exceeds the maximum of 10000 nodes/);
      assert.strictEqual(createdCount, 10_000);
    }

    assert.strictEqual(parse('title: valid')[0].value, 'valid');
  });

  test('Counts nested containers and repeated alias expansion toward the node limit', () => {
    const items = Array.from({ length: 9_999 }, () => 'value').join(', ');
    assert.strictEqual(parse(`items: [${items}]`)[0].children.length, 9_999);
    assert.throws(() => parse(`items: [${items}, extra]`), /maximum of 10000 nodes/);

    const lines = ['a0: &a0 [value, value]'];
    for (let level = 1; level <= 12; level++) {
      lines.push(`a${level}: &a${level} [*a${level - 1}, *a${level - 1}]`);
    }
    assert.throws(() => parse(lines.join('\n')), /maximum of 10000 nodes/);
  });
});
