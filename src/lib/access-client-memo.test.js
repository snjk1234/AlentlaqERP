/* eslint @typescript-eslint/no-require-imports: "off" */
const assert = require('node:assert/strict');
const test = require('node:test');
const { appendMemoFields, encodeValue, models, splitMemoFields } = require('./access-client');

test('long Unicode memo values are written through short Access expressions', async () => {
  const original = `تفاصيل الصنف | ${'المواصفات العربية '.repeat(24)}`;
  const data = { productLabel: original };
  const remaining = splitMemoFields('distributionItem', data);
  const definition = models.distributionItem.fields.productLabel;
  const countChrW = value => (value.match(/ChrW\(/g) || []).length;
  const statements = [];
  await appendMemoFields({
    query: async sql => { statements.push(sql); return []; }
  }, 'distributionItem', 'distribution-1', remaining);

  assert.equal(data.productLabel + remaining.map(part => part.value).join(''), original);
  assert.ok(countChrW(encodeValue(data.productLabel, definition)) <= 32);
  assert.equal(statements.length, Math.ceil(remaining[0].value.length / 32));
  assert.ok(statements.every(statement => countChrW(statement) <= 32));
});

test('memo chunking rejects NUL characters before writing', () => {
  const data = { afterSnapshot: `${'ع'.repeat(40)}\0` };
  assert.throws(() => splitMemoFields('distributionRevision', data), /NUL/);
});
