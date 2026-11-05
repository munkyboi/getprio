/* global URL */
import net from 'node:net';
const loopback = new Set(['localhost','127.0.0.1','::1','[::1]']);
function blocked() { return Object.assign(new Error('External network access is disabled in the local pooled demo.'),{code:'LOCAL_DEMO_OUTBOUND_DISABLED'}); }
export function installLocalDemoNetworkGuard() {
  const originalConnect=net.Socket.prototype.connect;
  const originalFetch=globalThis.fetch;
  net.Socket.prototype.connect=function(...input) {
    const args=Array.isArray(input[0])?input[0]:input;
    const options=args[0];
    const host=typeof options==='object' && options!==null
      ? (options.host || options.hostname || 'localhost')
      : typeof args[1]==='string'?args[1]:'localhost';
    if (!loopback.has(String(host))) throw blocked();
    return originalConnect.apply(this,input);
  };
  globalThis.fetch=function(input,...options) {
    const url=new URL(typeof input==='string'||input instanceof URL?input:input.url);
    if (!['http:','https:'].includes(url.protocol)||!loopback.has(url.hostname)) return Promise.reject(blocked());
    return originalFetch.call(this,input,...options);
  };
  return () => { net.Socket.prototype.connect=originalConnect;globalThis.fetch=originalFetch; };
}
