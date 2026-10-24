import * as assert from 'assert';
import { NodeType, ValueType, SourceFormat, StructNode, StructTree } from '../../core';
import * as CoreModel from '../../core/model';

suite('Core Model Test Suite', () => {
  test('Exports from core and core/model should match', () => {
    // Verify types are accessible from both entry points
    const formatFromCore: SourceFormat = 'json';
    const formatFromModel: CoreModel.SourceFormat = 'json';
    assert.strictEqual(formatFromCore, formatFromModel);
  });

  test('Should correctly construct a Markdown StructTree', () => {
    const sectionNode: StructNode = {
      id: 'node-2',
      name: 'Section 1',
      path: ['Root', 'Section 1'],
      nodeType: 'section',
      children: []
    };

    const rootNode: StructNode = {
      id: 'node-1',
      name: 'Root Document',
      path: ['Root'],
      nodeType: 'root',
      children: [sectionNode]
    };

    const tree: StructTree = {
      sourceFormat: 'markdown',
      root: rootNode
    };

    assert.strictEqual(tree.sourceFormat, 'markdown');
    assert.strictEqual(tree.root.nodeType, 'root');
    assert.strictEqual(tree.root.children.length, 1);
    assert.strictEqual(tree.root.children[0].nodeType, 'section');
    assert.strictEqual(tree.root.children[0].name, 'Section 1');
  });

  test('Should correctly construct a JSON StructTree with value types', () => {
    const stringVal: StructNode = {
      id: 'val-1',
      name: 'key1',
      path: ['$', 'key1'],
      nodeType: 'value',
      valueType: 'string',
      children: []
    };

    const numVal: StructNode = {
      id: 'val-2',
      name: 'key2',
      path: ['$', 'key2'],
      nodeType: 'value',
      valueType: 'number',
      children: []
    };

    const boolVal: StructNode = {
      id: 'val-3',
      name: 'key3',
      path: ['$', 'key3'],
      nodeType: 'value',
      valueType: 'boolean',
      children: []
    };

    const nullVal: StructNode = {
      id: 'val-4',
      name: 'key4',
      path: ['$', 'key4'],
      nodeType: 'value',
      valueType: 'null',
      children: []
    };

    const arrayNode: StructNode = {
      id: 'arr-1',
      name: 'items',
      path: ['$', 'items'],
      nodeType: 'array',
      children: [stringVal, numVal]
    };

    const objectNode: StructNode = {
      id: 'obj-1',
      name: 'rootObj',
      path: ['$'],
      nodeType: 'object',
      children: [arrayNode, boolVal, nullVal]
    };

    const tree: StructTree = {
      sourceFormat: 'json',
      root: objectNode
    };

    assert.strictEqual(tree.sourceFormat, 'json');
    assert.strictEqual(tree.root.nodeType, 'object');
    assert.strictEqual(tree.root.children.length, 3);
    assert.strictEqual(tree.root.children[0].nodeType, 'array');
    assert.strictEqual(tree.root.children[0].children[0].valueType, 'string');
    assert.strictEqual(tree.root.children[0].children[1].valueType, 'number');
    assert.strictEqual(tree.root.children[1].valueType, 'boolean');
    assert.strictEqual(tree.root.children[2].valueType, 'null');
  });

  test('Should correctly construct a YAML StructTree', () => {
    const nodeTypes: NodeType[] = ['root', 'section', 'object', 'array', 'value'];
    const valueTypes: ValueType[] = ['string', 'number', 'boolean', 'null'];

    assert.strictEqual(nodeTypes.length, 5);
    assert.strictEqual(valueTypes.length, 4);

    const tree: StructTree = {
      sourceFormat: 'yaml',
      root: {
        id: 'yaml-root',
        name: 'root',
        path: [],
        nodeType: 'root',
        children: []
      }
    };

    assert.strictEqual(tree.sourceFormat, 'yaml');
  });
});
