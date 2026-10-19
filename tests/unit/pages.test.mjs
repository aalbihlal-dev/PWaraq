import { test } from 'node:test';
import assert from 'node:assert/strict';
import { move } from '../../src/lib/pages.ts';

const g = (id, ...ids) => ({ id, items: ids.map((i) => ({ id: i })) });
const ids = (groups) => groups.map((x) => x.items.map((i) => i.id).join(''));

test('move: several pages keep their order, within and across groups', () => {
  assert.deepEqual(ids(move([g('a', '1', '2', '3', '4')], new Set(['1', '2']), 'a', 4)), ['3412']);
  assert.deepEqual(ids(move([g('a', '1', '2', '3', '4')], new Set(['4']), 'a', 0)), ['4123']);
  assert.deepEqual(ids(move([g('a', '1', '2', '3', '4')], new Set(['1', '3']), 'a', 3)), ['2134']);
  assert.deepEqual(ids(move([g('a', '1', '2'), g('b', '3')], new Set(['2']), 'b', 0)), ['1', '23']);
});
