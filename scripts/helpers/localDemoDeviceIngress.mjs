import { isIP } from 'node:net';

// Explicit private-interface ingress only; ordinary preview launches stay loopback.
export function localDeviceIngress(args, interfaces, localConfiguration) {
  const values = name => args.filter(arg => arg.startsWith(`--${name}=`)).map(arg => arg.slice(name.length + 3));
  const hosts = values('local-device-host'), peers = values('local-device-peer');
  if (!hosts.length && !peers.length) return null;
  const linkLocal = value => isIP(value) === 4 && value.startsWith('169.254.')
    && !['0', '255'].includes(value.split('.')[2]);
  const privateAddress = value => {
    if (isIP(value) !== 4) return false;
    const [first, second] = value.split('.').map(Number);
    return first === 10 || (first === 172 && second >= 16 && second <= 31) || (first === 192 && second === 168);
  };
  const network = (value, mask) => value.split('.').map((part, index) => Number(part) & Number(mask.split('.')[index])).join('.');
  const local = Object.values(interfaces).flat().find(item => item && !item.internal
    && item.family === 'IPv4' && item.address === hosts[0]);
  const samePrivateNetwork = local && privateAddress(hosts[0]) && privateAddress(peers[0])
    && isIP(local.netmask || '') === 4 && network(hosts[0], local.netmask) === network(peers[0], local.netmask);
  if (!localConfiguration || hosts.length !== 1 || peers.length !== 1
    || !local || hosts[0] === peers[0]
    || !(samePrivateNetwork || (linkLocal(hosts[0]) && linkLocal(peers[0])))) {
    throw new Error('Device ingress requires one local private interface and one distinct explicit peer on its private network.');
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
