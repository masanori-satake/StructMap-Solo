import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { StructTree, TreeRenderer, RenderOptions } from '../../core';

suite('TreeRenderer Test Suite', () => {
  const renderer = new TreeRenderer();

  test('AC-1 Unicode Renderer', () => {
    const tree: StructTree = {
      sourceFormat: 'markdown',
      root: {
        id: 'root-1',
        name: 'README.md',
        path: ['README.md'],
        nodeType: 'root',
        children: [
          {
            id: 'node-1',
            name: 'Project',
            path: ['README.md', 'Project'],
            nodeType: 'section',
            children: []
          }
        ]
      }
    };

    const options: RenderOptions = {
      showTypes: false,
      showRoot: true,
      treeStyle: 'unicode'
    };

    const output = renderer.render(tree, options);
    const expected = 'README.md\n└─ Project';
    assert.strictEqual(output, expected);
  });

  test('AC-2 ASCII Renderer', () => {
    const tree: StructTree = {
      sourceFormat: 'markdown',
      root: {
        id: 'root-1',
        name: 'README.md',
        path: ['README.md'],
        nodeType: 'root',
        children: [
          {
            id: 'node-1',
            name: 'Project',
            path: ['README.md', 'Project'],
            nodeType: 'section',
            children: []
          }
        ]
      }
    };

    const options: RenderOptions = {
      showTypes: false,
      showRoot: true,
      treeStyle: 'ascii'
    };

    const output = renderer.render(tree, options);
    const expected = 'README.md\n+- Project';
    assert.strictEqual(output, expected);
  });

  test('AC-3 showRoot=false', () => {
    const tree: StructTree = {
      sourceFormat: 'markdown',
      root: {
        id: 'root-1',
        name: 'README.md',
        path: ['README.md'],
        nodeType: 'root',
        children: [
          {
            id: 'node-1',
            name: 'Project',
            path: ['README.md', 'Project'],
            nodeType: 'section',
            children: []
          }
        ]
      }
    };

    const options: RenderOptions = {
      showTypes: false,
      showRoot: false,
      treeStyle: 'unicode'
    };

    const output = renderer.render(tree, options);
    const expected = 'Project';
    assert.strictEqual(output, expected);
  });

  test('AC-4 showTypes=true', () => {
    const tree: StructTree = {
      sourceFormat: 'json',
      root: {
        id: 'root-1',
        name: 'users',
        path: ['users'],
        nodeType: 'array',
        children: [
          {
            id: 'node-1',
            name: '[0]',
            path: ['users', '[0]'],
            nodeType: 'object',
            children: [
              {
                id: 'node-2',
                name: 'id',
                path: ['users', '[0]', 'id'],
                nodeType: 'value',
                valueType: 'number',
                children: []
              },
              {
                id: 'node-3',
                name: 'name',
                path: ['users', '[0]', 'name'],
                nodeType: 'value',
                valueType: 'string',
                children: []
              }
            ]
          }
        ]
      }
    };

    const options: RenderOptions = {
      showTypes: true,
      showRoot: true,
      treeStyle: 'unicode'
    };

    const output = renderer.render(tree, options);
    const expected =
      'users : array\n' +
      '└─ [0] : object\n' +
      '   ├─ id : number\n' +
      '   └─ name : string';
    assert.strictEqual(output, expected);
  });

  test('AC-5 Empty Object', () => {
    const tree: StructTree = {
      sourceFormat: 'json',
      root: {
        id: 'root-1',
        name: 'settings',
        path: ['settings'],
        nodeType: 'object',
        children: []
      }
    };

    const options: RenderOptions = {
      showTypes: false,
      showRoot: true,
      treeStyle: 'unicode'
    };

    const output = renderer.render(tree, options);
    const expected = 'settings {}';
    assert.strictEqual(output, expected);
  });

  test('AC-6 Empty Array', () => {
    const tree: StructTree = {
      sourceFormat: 'json',
      root: {
        id: 'root-1',
        name: 'users',
        path: ['users'],
        nodeType: 'array',
        children: []
      }
    };

    const options: RenderOptions = {
      showTypes: false,
      showRoot: true,
      treeStyle: 'unicode'
    };

    const output = renderer.render(tree, options);
    const expected = 'users []';
    assert.strictEqual(output, expected);
  });

  test('AC-7 VSCode APIに依存しない', () => {
    const rendererFilePath = path.resolve(__dirname, '../../../src/core/renderers/TreeRenderer.ts');
    const fileContent = fs.readFileSync(rendererFilePath, 'utf8');

    assert.strictEqual(fileContent.includes("from 'vscode'"), false);
    assert.strictEqual(fileContent.includes('from "vscode"'), false);
    assert.strictEqual(fileContent.includes("require('vscode')"), false);
    assert.strictEqual(fileContent.includes('require("vscode")'), false);
  });

  test('Multi-level Unicode rendering with middle and last children', () => {
    const tree: StructTree = {
      sourceFormat: 'markdown',
      root: {
        id: 'root',
        name: 'README.md',
        path: ['README.md'],
        nodeType: 'root',
        children: [
          {
            id: 'sec-1',
            name: 'Project',
            path: ['README.md', 'Project'],
            nodeType: 'section',
            children: [
              {
                id: 'sec-1-1',
                name: 'Overview',
                path: ['README.md', 'Project', 'Overview'],
                nodeType: 'section',
                children: []
              },
              {
                id: 'sec-1-2',
                name: 'Design',
                path: ['README.md', 'Project', 'Design'],
                nodeType: 'section',
                children: []
              }
            ]
          },
          {
            id: 'sec-2',
            name: 'License',
            path: ['README.md', 'License'],
            nodeType: 'section',
            children: []
          }
        ]
      }
    };

    const options: RenderOptions = {
      showTypes: false,
      showRoot: true,
      treeStyle: 'unicode'
    };

    const output = renderer.render(tree, options);
    const expected =
      'README.md\n' +
      '├─ Project\n' +
      '│  ├─ Overview\n' +
      '│  └─ Design\n' +
      '└─ License';
    assert.strictEqual(output, expected);
  });

  test('Multi-level ASCII rendering with middle and last children', () => {
    const tree: StructTree = {
      sourceFormat: 'markdown',
      root: {
        id: 'root',
        name: 'README.md',
        path: ['README.md'],
        nodeType: 'root',
        children: [
          {
            id: 'sec-1',
            name: 'Project',
            path: ['README.md', 'Project'],
            nodeType: 'section',
            children: [
              {
                id: 'sec-1-1',
                name: 'Overview',
                path: ['README.md', 'Project', 'Overview'],
                nodeType: 'section',
                children: []
              },
              {
                id: 'sec-1-2',
                name: 'Design',
                path: ['README.md', 'Project', 'Design'],
                nodeType: 'section',
                children: []
              }
            ]
          },
          {
            id: 'sec-2',
            name: 'License',
            path: ['README.md', 'License'],
            nodeType: 'section',
            children: []
          }
        ]
      }
    };

    const options: RenderOptions = {
      showTypes: false,
      showRoot: true,
      treeStyle: 'ascii'
    };

    const output = renderer.render(tree, options);
    const expected =
      'README.md\n' +
      '+- Project\n' +
      '|  +- Overview\n' +
      '|  +- Design\n' +
      '+- License';
    assert.strictEqual(output, expected);
  });

  test('showRoot=false with multiple children', () => {
    const tree: StructTree = {
      sourceFormat: 'markdown',
      root: {
        id: 'root',
        name: 'README.md',
        path: ['README.md'],
        nodeType: 'root',
        children: [
          {
            id: 'sec-1',
            name: 'Section 1',
            path: ['README.md', 'Section 1'],
            nodeType: 'section',
            children: [
              {
                id: 'sub-1',
                name: 'Sub 1',
                path: ['README.md', 'Section 1', 'Sub 1'],
                nodeType: 'section',
                children: []
              }
            ]
          },
          {
            id: 'sec-2',
            name: 'Section 2',
            path: ['README.md', 'Section 2'],
            nodeType: 'section',
            children: []
          }
        ]
      }
    };

    const options: RenderOptions = {
      showTypes: false,
      showRoot: false,
      treeStyle: 'unicode'
    };

    const output = renderer.render(tree, options);
    const expected =
      'Section 1\n' +
      '└─ Sub 1\n' +
      'Section 2';
    assert.strictEqual(output, expected);
  });
});
