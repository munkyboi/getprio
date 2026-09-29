const test = require('node:test');
const assert = require('node:assert/strict');
require('tsx/cjs');
const { searchHelpArticles } = require('../src/pages/helpContent.ts');

const helpTopics = [
  { id: 'account', title: 'Account', description: 'Sign-in and profile help.' },
  { id: 'payments', title: 'Payments', description: 'Payment help.' },
  { id: 'queues', title: 'Queues', description: 'Queue help.' },
];
const helpArticles = [
  {
    id: 'signin',
    topic: 'account',
    title: 'Reset your password',
    intro: 'Recover access when you cannot sign in.',
    steps: ['Request a password reset link.'],
    note: 'The link expires for your protection.',
  },
  {
    id: 'payments-refunds',
    topic: 'payments',
    title: 'Understand a refund',
    intro: 'Learn how a refund is handled.',
    steps: ['Check the payment status.'],
    note: 'Processing times vary.',
  },
  {
    id: 'queue-estimate',
    topic: 'queues',
    title: 'Check your queue estimate',
    intro: 'See the latest wait estimate.',
    steps: ['Open your ticket.'],
    note: 'Estimates may change.',
  },
];

test('help search finds recovery guidance from article body and ignores case and whitespace', () => {
  assert.ok(searchHelpArticles('  PASSWORD   RESET ', '', helpArticles, helpTopics).some(article => article.id === 'signin'));
  assert.equal(searchHelpArticles('password reset unavailablekeyword', '', helpArticles, helpTopics).length, 0);
});

test('topic filtering keeps search results within the selected subject', () => {
  const results = searchHelpArticles('payment', 'payments', helpArticles, helpTopics);
  assert.ok(results.length > 0);
  assert.ok(results.every(article => article.topic === 'payments'));
  assert.equal(searchHelpArticles('unavailablekeyword', 'queues', helpArticles, helpTopics).length, 0);
});

test('every public topic has guides with unambiguous deep links', () => {
  assert.equal(new Set(helpArticles.map(article => article.id)).size, helpArticles.length);
  for (const topic of helpTopics) assert.ok(searchHelpArticles('', topic.id, helpArticles, helpTopics).length > 0);
  for (const article of helpArticles) assert.ok(helpTopics.some(topic => topic.id === article.topic));
  assert.equal(searchHelpArticles('   ', '', helpArticles, helpTopics).length, helpArticles.length);
});
