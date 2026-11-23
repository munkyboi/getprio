const test = require('node:test');
const assert = require('node:assert/strict');
require('tsx/cjs');
const { helpArticles, helpTopics, searchHelpArticles } = require('../src/pages/helpContent.ts');

test('help search finds recovery guidance from article body and ignores case and whitespace', () => {
  assert.ok(searchHelpArticles('  PASSWORD   RESET ').some(article => article.id === 'signin'));
  assert.equal(searchHelpArticles('password reset unavailablekeyword').length, 0);
});

test('topic filtering keeps search results within the selected subject', () => {
  const results = searchHelpArticles('payment', 'payments');
  assert.ok(results.length > 0);
  assert.ok(results.every(article => article.topic === 'payments'));
  assert.equal(searchHelpArticles('unavailablekeyword', 'queues').length, 0);
});

test('every public topic has guides with unambiguous deep links', () => {
  assert.equal(new Set(helpArticles.map(article => article.id)).size, helpArticles.length);
  for (const topic of helpTopics) assert.ok(searchHelpArticles('', topic.id).length > 0);
  for (const article of helpArticles) assert.ok(helpTopics.some(topic => topic.id === article.topic));
  assert.equal(searchHelpArticles('   ').length, helpArticles.length);
});
