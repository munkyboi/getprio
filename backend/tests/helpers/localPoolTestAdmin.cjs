// CI PostgreSQL service containers have a bridge server address even when the
// client URL is loopback. Use a fresh native loopback postmaster for this local-
// only fixture's tests; never relax the production-facing fixture guard.
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { access, mkdtemp, rm } = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const { tmpdir } = require('node:os');
const net = require('node:net');
const exec = promisify(execFile);

async function postgresBin() {
  const configured = await exec('pg_config', ['--bindir']).then(result => result.stdout.trim()).catch(() => null);
  for (const directory of [configured, '/usr/lib/postgresql/16/bin', '/opt/homebrew/bin'].filter(Boolean)) {
    try {
      await access(path.join(directory, 'initdb'), constants.X_OK);
      await access(path.join(directory, 'pg_ctl'), constants.X_OK);
      return directory;
    } catch { /* Try the next installed native distribution. */ }
  }
  throw new Error('Native PostgreSQL binaries required for strict loopback demo tests.');
}
async function unusedPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}
async function createLocalPoolTestAdmin(input, { forceNative = false } = {}) {
  const { validateAdminUrl } = await import('../../../scripts/local-four-court-demo.mjs');
  validateAdminUrl(input);
  const { Pool } = require('pg');
  const probe = new Pool({ connectionString: input, max: 1 });
  let address;
  try { address = (await probe.query('SELECT host(inet_server_addr()) AS address')).rows[0].address; } finally { await probe.end(); }
  if (!forceNative && address === '127.0.0.1') return { url: input, close: async () => {} };
  if (!forceNative && process.env.CI !== 'true') throw new Error('Non-loopback test server refused outside explicit CI native fixture setup.');
  const bin = await postgresBin();
  const directory = await mkdtemp(path.join(tmpdir(), 'getprio-native-pool-test-'));
  const data = path.join(directory, 'data');
  let startAttempted = false;
  try {
    await exec(path.join(bin, 'initdb'), ['-D', data, '-A', 'trust', '-U', 'local_demo', '--no-locale', '-E', 'UTF8']);
    const port = await unusedPort();
    startAttempted = true;
    await exec(path.join(bin, 'pg_ctl'), ['-D', data, '-l', path.join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -c unix_socket_directories=''`, '-t', '15', '-w', 'start']);
    return { url: `postgresql://local_demo@127.0.0.1:${port}/postgres`, close: async () => {
      await exec(path.join(bin, 'pg_ctl'), ['-D', data, '-m', 'fast', '-t', '60', '-w', 'stop']);
      await rm(directory, { recursive: true, force: true });
    } };
  } catch (error) {
    if (startAttempted) {
      const status = await exec(path.join(bin, 'pg_ctl'), ['-D', data, 'status']).then(() => 0).catch(failure => failure.code);
      if (status === 0) await exec(path.join(bin, 'pg_ctl'), ['-D', data, '-m', 'fast', '-t', '60', '-w', 'stop']);
      else if (status !== 3) throw error; // Preserve the directory if process state is unknown.
    }
    await rm(directory, { recursive: true, force: true });
    throw error;
  }
}
module.exports = { createLocalPoolTestAdmin };
