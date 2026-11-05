const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Client } = require('pg');
const container = process.env.FAVORITES_REVIEW_TEST_CONTAINER;

test('favorites ownership, review visibility, stable pagination and masking in PostgreSQL', { skip: !container }, async () => {
  const entries = JSON.parse(execFileSync('docker', ['inspect', container, '--format', '{{json .Config.Env}}'], { encoding: 'utf8' }));
  const env = Object.fromEntries(entries.map(value => [value.slice(0, value.indexOf('=')), value.slice(value.indexOf('=') + 1)]));
  const port = Number(execFileSync('docker', ['port', container, '5432'], { encoding: 'utf8' }).split('\n')[0].split(':').at(-1));
  const client = new Client({ host: '127.0.0.1', port, user: env.POSTGRES_USER, password: env.POSTGRES_PASSWORD, database: env.POSTGRES_DB });
  await client.connect();
  const dbPath = require.resolve('../src/config/db');
  const original = require.cache[dbPath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { pool: client } };
  const favorites = require('../src/repositories/favorites');
  const ratings = require('../src/repositories/ratings');
  try {
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA favorites_review_test_${process.pid}; SET LOCAL search_path TO favorites_review_test_${process.pid}`);
    await client.query(`CREATE TABLE users(id BIGINT PRIMARY KEY, name TEXT, display_name TEXT);
      CREATE TABLE tenants(id BIGINT PRIMARY KEY, slug TEXT, name TEXT, public_profile_display_name TEXT, public_profile_category TEXT, is_active BOOLEAN DEFAULT TRUE, public_profile_enabled BOOLEAN DEFAULT TRUE, vendor_approval_status TEXT DEFAULT 'approved');
      CREATE TABLE public_board_themes(tenant_id BIGINT, location_id BIGINT, theme JSONB);
      CREATE TABLE vendor_reviews(id BIGSERIAL PRIMARY KEY, tenant_id BIGINT, customer_user_id BIGINT REFERENCES users(id), stars INTEGER, comment TEXT, vendor_reply TEXT, moderation_status TEXT DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT NOW());
      INSERT INTO users VALUES (1, 'Mark Smith', NULL), (2, 'Jane Doe', NULL);
      INSERT INTO tenants(id,slug,name,public_profile_category) VALUES (1,'clinic','Clinic','Wellness'), (2,'shop','Shop','Retail');`);
    const migration = fs.readFileSync(path.resolve(__dirname, '../../database/migrations/20260905_add_favorites_review_visibility.sql'), 'utf8');
    await client.query(migration); await client.query(migration);
    await favorites.add(1, 'clinic'); await favorites.add(1, 'clinic'); await favorites.add(2, 'clinic');
    assert.equal((await favorites.list(1)).length, 1);
    await favorites.remove(2, 'clinic'); assert.equal((await favorites.list(1)).length, 1); assert.equal((await favorites.list(2)).length, 0);
    await client.query("UPDATE tenants SET is_active = FALSE WHERE id=2"); assert.equal(await favorites.add(1,'shop'), null);
    await client.query("INSERT INTO vendor_reviews(tenant_id, customer_user_id, stars, comment) SELECT 1,1,4,'Review ' || n FROM generate_series(1,12) n");
    const first = await ratings.listPublicVendorReviews(1,5,0); const second = await ratings.listPublicVendorReviews(1,5,5);
    assert.equal(first.length,5); assert.equal(second.length,5); assert.equal(new Set([...first,...second].map(row=>row.id)).size,10);
    assert.equal(first[0].customer_display_name,'Mark S***h');
    assert.equal(await ratings.setReviewVisibility(2, first[0].id, false), null);
    await ratings.setReviewVisibility(1, first[0].id, false);
    assert.equal(await ratings.countPublicVendorReviews(1),11);
    assert.equal((await ratings.getVendorAggregate(1)).count,12);
    assert.equal((await ratings.listPublicVendorReviews(1,20)).some(row=>row.id===first[0].id),false);
    await client.query("UPDATE vendor_reviews SET moderation_status='removed' WHERE id=$1",[first[0].id]);
    await ratings.setReviewVisibility(1, first[0].id, true);
    assert.equal(await ratings.countPublicVendorReviews(1),11);
    assert.equal((await ratings.listVendorReviews(1,20,0)).length,12);
  } finally {
    await client.query('ROLLBACK'); await client.end();
    if (original) require.cache[dbPath] = original; else delete require.cache[dbPath];
  }
});
