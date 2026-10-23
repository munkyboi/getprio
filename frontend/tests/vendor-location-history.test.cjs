require('tsx/cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { installLocationPageBackGuard } = require('../src/vendor/useLocationPageBackGuard.ts');

function fixture(request) {
  const original = global.window;
  let listener, index = 3;
  const moves = [], queued = [], routed = [];
  global.window = {
    history: { get state() { return {idx:index}; }, go(delta) { moves.push(delta); queued.push(index + delta); } },
    addEventListener(_name, handle) { listener = handle; },
    removeEventListener(_name, handle) { if (listener === handle) listener = undefined; },
  };
  const cleanup = installLocationPageBackGuard(request);
  function emit(next) {
    index = next;
    let stopped = false;
    listener?.({state:{idx:next},stopImmediatePropagation(){stopped=true;}});
    if (!stopped) routed.push(next);
  }
  function flush() { while (queued.length) emit(queued.shift()); }
  return { moves,routed,emit,flush,index:()=>index,cleanup,restore(){cleanup();global.window=original;} };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 5));

test('cancelled Back restores the editor entry without notifying the router; confirmed Back replays once', async () => {
  let proceed, requests=0;
  const f=fixture(action=>{proceed=action;requests++;});
  try {
    f.emit(2); f.flush();
    assert.equal(requests,1); assert.equal(f.index(),3); assert.deepEqual(f.routed,[]);
    // Keep editing: the caller does not approve the pending exit.
    f.emit(2); f.flush();
    assert.equal(requests,2); assert.equal(f.index(),3);
    proceed(); await tick(); f.flush();
    assert.equal(f.index(),2); assert.deepEqual(f.routed,[2]);
  } finally { f.restore(); }
});
test('Forward approval also replays exactly once, including immediate approval before restoration',async()=>{
  const f=fixture(proceed=>proceed());
  try { f.emit(4);f.flush(); await tick(); f.flush(); assert.equal(f.index(),4); assert.deepEqual(f.routed,[4]); }
  finally { f.restore(); }
});
test('unmount cancels a scheduled approval so a departed editor cannot move history',async()=>{
  let proceed; const f=fixture(action=>{proceed=action;});
  try { f.emit(2);f.flush();proceed();f.cleanup();await tick();assert.deepEqual(f.moves,[1]);assert.equal(f.index(),3); }
  finally { f.restore(); }
});
test('late approval after unmount is inert and duplicate approvals replay only once',async()=>{
  let proceed; const f=fixture(action=>{proceed=action;});
  try {
    f.emit(2);f.flush();proceed();proceed();await tick();f.flush();
    assert.deepEqual(f.routed,[2]);assert.deepEqual(f.moves,[1,-1]);
  } finally {f.restore();}
  const departed=fixture(action=>{proceed=action;});
  try {departed.emit(2);departed.flush();departed.cleanup();proceed();await tick();assert.deepEqual(departed.moves,[1]);}
  finally {departed.restore();}
});
