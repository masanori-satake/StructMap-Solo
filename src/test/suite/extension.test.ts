import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Sample test - Extension should be present', () => {
    assert.strictEqual([1, 2, 3].indexOf(4), -1);
    assert.strictEqual([1, 2, 3].indexOf(1), 0);
  });
});
