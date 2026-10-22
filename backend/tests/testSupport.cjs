const Module = require("node:module");
const path = require("node:path");

function requireWithMocks(targetPath, mocks) {
  const resolvedTarget = require.resolve(targetPath);
  const entries = Object.entries(mocks);
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    const match = entries.find(([candidate]) => {
      if (candidate === request) return true;
      if (!parent?.filename) return false;
      try {
        return require.resolve(candidate, { paths: [path.dirname(parent.filename)] }) === request;
      } catch {
        return false;
      }
    });
    return match ? match[1] : originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[resolvedTarget];
    return require(resolvedTarget);
  } finally {
    Module._load = originalLoad;
    delete require.cache[resolvedTarget];
  }
}

module.exports = { requireWithMocks };
