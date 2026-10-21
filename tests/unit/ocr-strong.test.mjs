// Self-check of reading the strong engine's answer:  pnpm test:unit
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBlocks, textOf, requestBody, PROMPT } from '../../src/lib/ocr-strong.ts';

test('the answer: a block for every top-level div, boxes from 0–1000 to pixels, pictures left out, a fence ignored', () => {
  const raw = '```html\n<div data-label="Section-Header" data-bbox="100 50 900 120"><h1>مرحبا بكم</h1></div>\n'
    + '<div data-label="Image" data-bbox="0 200 1000 500"><img alt="x"></div>\n'
    + '<div data-label="Text" data-bbox="100 600 900 700"><p>سطر أول<br>سطر ثان &amp; ثالث</p></div>\n```';
  const blocks = parseBlocks(raw, 2000, 3000);
  assert.deepEqual(blocks.map((b) => b.text), ['مرحبا بكم', 'سطر أول سطر ثان & ثالث']);
  assert.deepEqual([blocks[0].x0, blocks[0].y0, blocks[0].x1, blocks[0].y1], [200, 150, 1800, 360]);
});

test('a table inside a block keeps its cells as words and its nested divs do not split the block', () => {
  const raw = '<div data-label="Table" data-bbox="0 0 1000 500"><table><tr><th>البيان</th><th>٢٠٢٥</th></tr><tr><td>الإيرادات</td><td>١٠٠</td></tr></table><div>تذييل</div></div>';
  const blocks = parseBlocks(raw, 1000, 1000);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].text, 'البيان ٢٠٢٥ الإيرادات ١٠٠ تذييل');
});

test('nonsense gives no blocks, the request carries the prompt and the picture', () => {
  assert.deepEqual(parseBlocks('no divs here', 100, 100), []);
  assert.deepEqual(parseBlocks('<div data-label="Text">no box</div><div data-label="Text" data-bbox="1 2 3">three numbers</div>', 100, 100), []);
  assert.equal(textOf('a&nbsp;b<br/>c'), 'a b c');
  const body = requestBody('QUJD');
  assert.equal(body.messages[0].content[1].text, PROMPT);
  assert.equal(body.messages[0].content[0].image_url.url, 'data:image/png;base64,QUJD');
  assert.equal(body.temperature, 0);
});
