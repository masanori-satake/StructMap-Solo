import * as assert from 'assert';
import {
  StructTree,
  TreeRenderer,
} from '../../core';
import {
  TreeExpansionState,
  VisibleTreeProjection,
} from '../../vscode';

suite('Visible Tree & Expansion State Test Suite', () => {
  test('TreeExpansionState expand, collapse, isExpanded, snapshot, clear', () => {
    const expansionState = new TreeExpansionState();

    assert.strictEqual(expansionState.isExpanded('node-1'), false);

    expansionState.expand('node-1');
    expansionState.expand('node-2');
    assert.strictEqual(expansionState.isExpanded('node-1'), true);
    assert.strictEqual(expansionState.isExpanded('node-2'), true);

    const snapshot = expansionState.snapshot();
    assert.strictEqual(snapshot.size, 2);
    assert.ok(snapshot.has('node-1'));
    assert.ok(snapshot.has('node-2'));

    expansionState.collapse('node-1');
    assert.strictEqual(expansionState.isExpanded('node-1'), false);
    assert.strictEqual(expansionState.isExpanded('node-2'), true);

    expansionState.clear();
    assert.strictEqual(expansionState.isExpanded('node-2'), false);
    assert.strictEqual(expansionState.snapshot().size, 0);
  });

  test('AC-05: VisibleTreeProjection - Only root is expanded', () => {
    // Structure:
    // root
    //  ├ A
    //  │  └ A1
    //  └ B
    const sampleTree: StructTree = {
      sourceFormat: 'json',
      root: {
        id: 'root-id',
        name: 'root',
        nodeType: 'root',
        path: ['root'],
        children: [
          {
            id: 'node-A',
            name: 'A',
            nodeType: 'object',
            path: ['root', 'A'],
            children: [
              {
                id: 'node-A1',
                name: 'A1',
                nodeType: 'value',
                valueType: 'string',
                value: 'val1',
                path: ['root', 'A', 'A1'],
                children: [],
              },
            ],
          },
          {
            id: 'node-B',
            name: 'B',
            nodeType: 'object',
            path: ['root', 'B'],
            children: [],
          },
        ],
      },
    };

    const projection = new VisibleTreeProjection();
    // Only root is in expanded set
    const expandedIds = new Set<string>(['root-id']);

    const visibleTree = projection.project(sampleTree, expandedIds);

    // Root should have children A and B, but A should have 0 children (A1 omitted)
    assert.strictEqual(visibleTree.root.children.length, 2);
    assert.strictEqual(visibleTree.root.children[0].name, 'A');
    assert.strictEqual(visibleTree.root.children[0].children.length, 0);
    assert.strictEqual(visibleTree.root.children[1].name, 'B');

    const renderer = new TreeRenderer();
    const renderedText = renderer.render(visibleTree, {
      showRoot: true,
      showTypes: false,
      treeStyle: 'unicode',
    });

    const expectedText = [
      'root',
      '├─ A {}',
      '└─ B {}',
    ].join('\n');

    assert.strictEqual(renderedText, expectedText);
  });

  test('AC-06: VisibleTreeProjection - A is expanded', () => {
    // Structure:
    // root
    //  ├ A
    //  │  └ A1
    //  └ B
    const sampleTree: StructTree = {
      sourceFormat: 'json',
      root: {
        id: 'root-id',
        name: 'root',
        nodeType: 'root',
        path: ['root'],
        children: [
          {
            id: 'node-A',
            name: 'A',
            nodeType: 'object',
            path: ['root', 'A'],
            children: [
              {
                id: 'node-A1',
                name: 'A1',
                nodeType: 'value',
                valueType: 'string',
                value: 'val1',
                path: ['root', 'A', 'A1'],
                children: [],
              },
            ],
          },
          {
            id: 'node-B',
            name: 'B',
            nodeType: 'object',
            path: ['root', 'B'],
            children: [],
          },
        ],
      },
    };

    const projection = new VisibleTreeProjection();
    // root and node-A are in expanded set
    const expandedIds = new Set<string>(['root-id', 'node-A']);

    const visibleTree = projection.project(sampleTree, expandedIds);

    assert.strictEqual(visibleTree.root.children.length, 2);
    assert.strictEqual(visibleTree.root.children[0].name, 'A');
    assert.strictEqual(visibleTree.root.children[0].children.length, 1);
    assert.strictEqual(visibleTree.root.children[0].children[0].name, 'A1');

    const renderer = new TreeRenderer();
    const renderedText = renderer.render(visibleTree, {
      showRoot: true,
      showTypes: false,
      treeStyle: 'unicode',
    });

    const expectedText = [
      'root',
      '├─ A',
      '│  └─ A1',
      '└─ B {}',
    ].join('\n');

    assert.strictEqual(renderedText, expectedText);
  });

  test('AC-07: Expand All - Copy Visible Tree equals Copy Tree', () => {
    const sampleTree: StructTree = {
      sourceFormat: 'json',
      root: {
        id: 'root-id',
        name: 'root',
        nodeType: 'root',
        path: ['root'],
        children: [
          {
            id: 'node-A',
            name: 'A',
            nodeType: 'object',
            path: ['root', 'A'],
            children: [
              {
                id: 'node-A1',
                name: 'A1',
                nodeType: 'value',
                valueType: 'string',
                value: 'val1',
                path: ['root', 'A', 'A1'],
                children: [],
              },
            ],
          },
        ],
      },
    };

    const projection = new VisibleTreeProjection();
    // All nodes expanded
    const expandedIds = new Set<string>(['root-id', 'node-A', 'node-A1']);

    const visibleTree = projection.project(sampleTree, expandedIds);

    const renderer = new TreeRenderer();
    const options = { showRoot: true, showTypes: true, treeStyle: 'unicode' as const };

    const fullRender = renderer.render(sampleTree, options);
    const visibleRender = renderer.render(visibleTree, options);

    assert.strictEqual(visibleRender, fullRender);
  });

  test('AC-08: Collapse All - Grandchildren are omitted', () => {
    const sampleTree: StructTree = {
      sourceFormat: 'json',
      root: {
        id: 'root-id',
        name: 'root',
        nodeType: 'root',
        path: ['root'],
        children: [
          {
            id: 'node-parent',
            name: 'Parent',
            nodeType: 'object',
            path: ['root', 'Parent'],
            children: [
              {
                id: 'node-child',
                name: 'Child',
                nodeType: 'object',
                path: ['root', 'Parent', 'Child'],
                children: [
                  {
                    id: 'node-grandchild',
                    name: 'Grandchild',
                    nodeType: 'value',
                    valueType: 'number',
                    value: 42,
                    path: ['root', 'Parent', 'Child', 'Grandchild'],
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    };

    const projection = new VisibleTreeProjection();
    // Collapse All leaves only root expanded
    const expandedIds = new Set<string>(['root-id']);

    const visibleTree = projection.project(sampleTree, expandedIds);

    const renderer = new TreeRenderer();
    const renderedText = renderer.render(visibleTree, {
      showRoot: true,
      showTypes: true,
      treeStyle: 'unicode',
    });

    assert.ok(renderedText.includes('Parent : object'));
    assert.strictEqual(renderedText.includes('Child'), false);
    assert.strictEqual(renderedText.includes('Grandchild'), false);
  });

  test('AC-09, AC-10, AC-11, AC-12, AC-13: Render options (showRoot, showTypes, treeStyle) compatibility', () => {
    const sampleTree: StructTree = {
      sourceFormat: 'yaml',
      root: {
        id: 'root-id',
        name: 'root',
        nodeType: 'root',
        path: ['root'],
        children: [
          {
            id: 'section-1',
            name: 'Section1',
            nodeType: 'section',
            path: ['root', 'Section1'],
            children: [
              {
                id: 'val-1',
                name: 'key1',
                nodeType: 'value',
                valueType: 'string',
                value: 'hello',
                path: ['root', 'Section1', 'key1'],
                children: [],
              },
            ],
          },
        ],
      },
    };

    const projection = new VisibleTreeProjection();
    const expandedIds = new Set<string>(['root-id', 'section-1']);
    const visibleTree = projection.project(sampleTree, expandedIds);
    const renderer = new TreeRenderer();

    // AC-09: showRoot=false
    const textNoRoot = renderer.render(visibleTree, {
      showRoot: false,
      showTypes: true,
      treeStyle: 'unicode',
    });
    assert.strictEqual(textNoRoot, 'Section1\n└─ key1 : string');

    // AC-10: showTypes=true
    const textTypes = renderer.render(visibleTree, {
      showRoot: true,
      showTypes: true,
      treeStyle: 'unicode',
    });
    assert.ok(textTypes.includes('key1 : string'));

    // AC-11: showTypes=false
    const textNoTypes = renderer.render(visibleTree, {
      showRoot: true,
      showTypes: false,
      treeStyle: 'unicode',
    });
    assert.ok(textNoTypes.includes('key1'));
    assert.strictEqual(textNoTypes.includes(': string'), false);

    // AC-12: unicode
    const textUnicode = renderer.render(visibleTree, {
      showRoot: true,
      showTypes: false,
      treeStyle: 'unicode',
    });
    assert.ok(textUnicode.includes('└─ key1'));

    // AC-13: ascii
    const textAscii = renderer.render(visibleTree, {
      showRoot: true,
      showTypes: false,
      treeStyle: 'ascii',
    });
    assert.ok(textAscii.includes('+- key1'));
  });
});
