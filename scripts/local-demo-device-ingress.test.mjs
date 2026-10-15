import test from 'node:test';
import assert from 'node:assert/strict';
import { localDeviceIngress, deviceIngressHandler } from './helpers/localDemoDeviceIngress.mjs';
const interfaces = { en10: [{ address: '169.254.97.192', family: 'IPv4', internal: false }] };
const args = ['--local-device-host=169.254.97.192', '--local-device-peer=169.254.233.243'];
test('default remains loopback; explicit wired host and peer require isolated configuration', () => {
  assert.equal(localDeviceIngress([], interfaces, {}), null);
  assert.deepEqual(localDeviceIngress(args, interfaces, {}), { host: '169.254.97.192', peer: '169.254.233.243' });
  for (const invalid of [args.slice(0, 1), [...args, args[0]], ['--local-device-host=0.0.0.0', args[1]], ['--local-device-host=192.168.1.5', args[1]], [args[0], '--local-device-peer=8.8.8.8'], [args[0], '--local-device-peer=169.254.97.192']]) assert.throws(() => localDeviceIngress(invalid, interfaces, {}));
  assert.throws(() => localDeviceIngress(args, {}, {}));
  assert.throws(() => localDeviceIngress(args, interfaces, null));
});
test('only the explicit peer reaches the unchanged application handler', () => {
  let calls = 0;const handler = deviceIngressHandler(() => calls++, { peer: '169.254.233.243' });
  for (const remoteAddress of ['169.254.233.243', '::ffff:169.254.233.243']) handler({ socket: { remoteAddress } }, {});
  assert.equal(calls, 2);
  for (const remoteAddress of ['169.254.233.244', '127.0.0.1', '']) {
    let status;let body;handler({ socket: { remoteAddress } }, { writeHead: code => { status = code; }, end: value => { body = value; } });
    assert.equal(status, 403);assert.match(body, /unavailable/);
  }
  assert.equal(calls, 2);
});
