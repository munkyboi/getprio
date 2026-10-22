const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function writePrivateEvidence(value) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'getprio-pooled-evidence-'));
  fs.chmodSync(directory, 0o700);
  const filename = path.join(directory, 'evidence.json');
  fs.writeFileSync(filename, JSON.stringify(value, null, 2), {mode: 0o600, flag: 'wx'});
  return filename;
}
module.exports = {writePrivateEvidence};
