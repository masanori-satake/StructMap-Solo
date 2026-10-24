import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

suite('Localization (l10n) Test Suite', () => {
  const rootDir = path.resolve(__dirname, '../../../');

  test('package.nls.json and package.nls.ja.json exist and have matching keys', () => {
    const nlsPath = path.join(rootDir, 'package.nls.json');
    const nlsJaPath = path.join(rootDir, 'package.nls.ja.json');

    assert.ok(fs.existsSync(nlsPath), 'package.nls.json should exist');
    assert.ok(fs.existsSync(nlsJaPath), 'package.nls.ja.json should exist');

    const nls = JSON.parse(fs.readFileSync(nlsPath, 'utf8'));
    const nlsJa = JSON.parse(fs.readFileSync(nlsJaPath, 'utf8'));

    const nlsKeys = Object.keys(nls).sort();
    const nlsJaKeys = Object.keys(nlsJa).sort();

    assert.deepStrictEqual(nlsKeys, nlsJaKeys, 'package.nls.json and package.nls.ja.json keys must match');
  });

  test('package.json placeholders exist in package.nls.json', () => {
    const pkgPath = path.join(rootDir, 'package.json');
    const nlsPath = path.join(rootDir, 'package.nls.json');

    const pkgContent = fs.readFileSync(pkgPath, 'utf8');
    const nls = JSON.parse(fs.readFileSync(nlsPath, 'utf8'));

    const matches = pkgContent.match(/%([^%]+)%/g) || [];
    const placeholderKeys = matches.map((m) => m.replace(/%/g, ''));

    for (const key of placeholderKeys) {
      assert.ok(key in nls, `Key "${key}" from package.json must exist in package.nls.json`);
    }
  });

  test('l10n bundle files exist and have matching keys', () => {
    const bundlePath = path.join(rootDir, 'l10n/bundle.l10n.json');
    const bundleJaPath = path.join(rootDir, 'l10n/bundle.l10n.ja.json');

    assert.ok(fs.existsSync(bundlePath), 'l10n/bundle.l10n.json should exist');
    assert.ok(fs.existsSync(bundleJaPath), 'l10n/bundle.l10n.ja.json should exist');

    const bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf8'));
    const bundleJa = JSON.parse(fs.readFileSync(bundleJaPath, 'utf8'));

    const bundleKeys = Object.keys(bundle).sort();
    const bundleJaKeys = Object.keys(bundleJa).sort();

    assert.deepStrictEqual(bundleKeys, bundleJaKeys, 'l10n bundles keys must match');
  });
});
