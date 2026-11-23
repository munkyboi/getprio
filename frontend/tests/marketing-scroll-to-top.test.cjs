const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

const file = path.resolve(__dirname, "../src/pages/LandingPage.tsx");
const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function loadLandingFunction(name, context) {
  const find = node => {
    if ((ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) && node.name?.text === name) return node;
    return ts.forEachChild(node, find);
  };
  const node = find(source);
  assert.ok(node, name);
  const { outputText } = ts.transpileModule(`run = (${node.getText(source)});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 }
  });
  const scope = { ...context, run: null };
  vm.runInNewContext(outputText, scope);
  return scope.run;
}

test("scroll-to-top waits for the manifesto to reach the bottom of the sticky header", () => {
  const listeners = new Map();
  const observed = [];
  let headerBottom = 79;
  const header = { getBoundingClientRect: () => ({ bottom: headerBottom }) };
  const landing = { closest: () => ({ querySelector: () => header }) };
  const button = {};
  let top = 900;
  let visible;
  let observeResize;
  let disconnected = false;
  let focusMoved = false;
  const window = {
    scrollY: 0,
    addEventListener: (event, listener) => listeners.set(event, listener),
    removeEventListener(event, listener) {
      assert.equal(listeners.get(event), listener);
      listeners.delete(event);
    }
  };
  const document = { activeElement: null };
  const stop = loadLandingFunction("observeScrollTopThreshold", {
    window,
    document,
    manifestoSection: { current: { getBoundingClientRect: () => ({ top }) } },
    landingRoot: { current: landing },
    scrollTopButton: { current: button },
    heroHeading: { current: { focus: options => { focusMoved = options.preventScroll; } } },
    setShowScrollTop: value => { visible = value; },
    ResizeObserver: class {
      constructor(callback) { observeResize = callback; }
      observe(element) { observed.push(element); }
      disconnect() { disconnected = true; }
    }
  })();

  assert.equal(visible, false);
  assert.deepEqual(observed, [landing, header]);
  window.scrollY = 100;
  top = 799;
  listeners.get("scroll")();
  assert.equal(visible, false);
  top = 80;
  listeners.get("scroll")();
  assert.equal(visible, false);
  top = 79;
  listeners.get("scroll")();
  assert.equal(visible, true);
  top = -1200;
  listeners.get("scroll")();
  assert.equal(visible, true);

  document.activeElement = button;
  top = 80;
  listeners.get("scroll")();
  assert.equal(visible, false);
  assert.equal(focusMoved, true);
  headerBottom = 82;
  observeResize();
  assert.equal(visible, true);
  window.scrollY = 0;
  listeners.get("scroll")();
  assert.equal(visible, false);

  stop();
  assert.equal(disconnected, true);
  assert.equal(listeners.size, 0);
});

test("scroll to top focuses the hero and respects reduced motion", () => {
  for (const [reducedMotion, behavior] of [[false, "smooth"], [true, "instant"]]) {
    const actions = [];
    loadLandingFunction("handleScrollToTop", {
      heroHeading: { current: { focus: options => actions.push(["focus", options.preventScroll]) } },
      window: {
        matchMedia: query => {
          assert.equal(query, "(prefers-reduced-motion: reduce)");
          return { matches: reducedMotion };
        },
        scrollTo: options => actions.push(["scroll", options.top, options.behavior])
      }
    })();
    assert.deepEqual(actions, [["focus", true], ["scroll", 0, behavior]]);
  }
});
