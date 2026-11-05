const path = require('node:path');

// Load a fresh CommonJS module with temporary dependency replacements, restoring
// the previous cache even if loading fails. The caller resolves its target path.
function loadModuleWithMocks(target, mocks) {
  const saved = new Map();
  try {
    for (const [name, exports] of Object.entries(mocks)) {
      const id = require.resolve(path.resolve(path.dirname(target), name));
      saved.set(id, require.cache[id]);
      require.cache[id] = { id, filename: id, loaded: true, exports };
    }
    delete require.cache[target];
    return require(target);
  } finally {
    delete require.cache[target];
    for (const [id, original] of saved) {
      if (original) require.cache[id] = original;
      else delete require.cache[id];
    }
  }
}

module.exports = { loadModuleWithMocks };
