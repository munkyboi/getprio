import { isIP } from 'node:net';

// Explicit wired link-local ingress only; ordinary preview launches stay loopback.
export function localDeviceIngress(args, interfaces, localConfiguration) {
  const values = name => args.filter(arg => arg.startsWith(`--${name}=`)).map(arg => arg.slice(name.length + 3));
  const hosts = values('local-device-host'), peers = values('local-device-peer');
  if (!hosts.length && !peers.length) return null;
  const linkLocal = value => isIP(value) === 4 && value.startsWith('169.254.')
    && !['0', '255'].includes(value.split('.')[2]);
  if (!localConfiguration || hosts.length !== 1 || peers.length !== 1
    || !linkLocal(hosts[0]) || !linkLocal(peers[0]) || hosts[0] === peers[0]
    || !Object.values(interfaces).flat().some(item => item && !item.internal
      && item.family === 'IPv4' && item.address === hosts[0])) {
    throw new Error('Device ingress requires one local wired link-local interface and one distinct explicit link-local peer.');
  }
  return { host: hosts[0], peer: peers[0] };
}

export function deviceIngressHandler(app, configuration) {
  return (request, response) => {
    const peer = String(request.socket.remoteAddress || '').replace(/^::ffff:/, '');
    if (peer !== configuration.peer) {
      response.writeHead(403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ message: 'This local device preview is unavailable to this peer.' }));
      return;
    }
    app(request, response);
  };
}
