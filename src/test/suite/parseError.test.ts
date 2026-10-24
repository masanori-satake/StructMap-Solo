import * as assert from 'assert';
import {
  createParseError,
  createParseSuccess,
  isParseError,
  isParseSuccess,
  ParseErrorCode,
  StructTree
} from '../../core';

suite('ParseError & ParseResult Test Suite', () => {
  test('createParseSuccess creates a valid ParseSuccess object', () => {
    const dummyTree: StructTree = {
      sourceFormat: 'json',
      root: {
        id: 'node-0',
        name: 'root',
        path: ['root'],
        nodeType: 'root',
        children: []
      }
    };

    const success = createParseSuccess(dummyTree);
    assert.strictEqual(success.type, 'success');
    assert.strictEqual(success.tree, dummyTree);
    assert.strictEqual(isParseSuccess(success), true);
    assert.strictEqual(isParseError(success), false);
  });

  test('createParseError creates a valid ParseError object with optional line and column', () => {
    const errWithLocation = createParseError(
      ParseErrorCode.JSON_PARSE_ERROR,
      'JSON Parse Error',
      10,
      5
    );

    assert.strictEqual(errWithLocation.type, 'error');
    assert.strictEqual(errWithLocation.code, ParseErrorCode.JSON_PARSE_ERROR);
    assert.strictEqual(errWithLocation.message, 'JSON Parse Error');
    assert.strictEqual(errWithLocation.line, 10);
    assert.strictEqual(errWithLocation.column, 5);
    assert.strictEqual(isParseError(errWithLocation), true);
    assert.strictEqual(isParseSuccess(errWithLocation), false);

    const errWithoutLocation = createParseError(
      ParseErrorCode.UNSUPPORTED_FORMAT,
      'Unsupported format: xml'
    );

    assert.strictEqual(errWithoutLocation.type, 'error');
    assert.strictEqual(errWithoutLocation.code, ParseErrorCode.UNSUPPORTED_FORMAT);
    assert.strictEqual(errWithoutLocation.message, 'Unsupported format: xml');
    assert.strictEqual(errWithoutLocation.line, undefined);
    assert.strictEqual(errWithoutLocation.column, undefined);
  });
});
