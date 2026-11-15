import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('capacitor.config.ts', 'utf8');
const javascript = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const config = target => {
  const context = { exports: {}, process: { env: { KONNEKT_BUILD_TARGET: target } } };
  vm.runInNewContext(javascript, context);
  return context.exports.default;
};
test('staging Android installation cannot replace the production package', () => {
  assert.equal(config('staging').appId, 'com.konnekt.staging');
  assert.equal(config('staging').appName, 'KONNEKT Staging');
  assert.equal(config('staging').android.allowMixedContent, false);
});
test('production and ordinary local builds retain the existing Android identity', () => {
  for (const target of ['production', undefined]) {
    assert.equal(config(target).appId, 'com.konnekt.app');
    assert.equal(config(target).appName, 'KONNEKT');
  }
});
