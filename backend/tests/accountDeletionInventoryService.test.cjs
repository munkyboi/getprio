const test = require('node:test');
const assert = require('node:assert/strict');
const { collectRelationalInventory } = require('../src/services/accountDeletionInventoryService');

test('relational inventory exposes stable opaque items for each referenced row', async () => {
  const client = {
    async query(sql) {
      if (sql.includes('information_schema.columns')) {
        return { rows: [{ table_schema: 'public', table_name: 'users', column_name: 'id' }] };
      }
      if (sql.includes('information_schema.key_column_usage') && sql.includes('PRIMARY KEY')) {
        return { rows: [{ table_schema: 'public', table_name: 'users', column_name: 'id', ordinal_position: 1 }] };
      }
      if (sql.includes('information_schema.table_constraints')) return { rows: [] };
      if (sql.includes('AS reference_keys')) {
        return { rows: [{ source: 'public.users.id', record_count: 2, reference_keys: [['42'], ['43']] }] };
      }
      throw new Error(`Unexpected query: ${sql}`);
    }
  };

  const first = await collectRelationalInventory(client, 42);
  const second = await collectRelationalInventory(client, 42);
  const items = first.sources[0].items;

  assert.equal(items.length, 2);
  assert.deepEqual(items.map(({ ordinal }) => ordinal), [1, 2]);
  assert.ok(items.every(({ id }) => /^[a-f0-9]{32}$/.test(id)));
  assert.deepEqual(items.map(({ id }) => id), second.sources[0].items.map(({ id }) => id));
  assert.ok(items.every(({ id }) => id !== '42' && id !== '43'), 'item IDs are opaque rather than raw row keys');
});
