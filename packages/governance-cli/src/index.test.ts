import test from 'node:test';
import assert from 'node:assert/strict';
import { main } from './index';

test('usage fails closed without arguments', () => {
  assert.equal(main([]), 2);
});
