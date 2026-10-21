import type { QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

export function refreshCounterRequests(client: QueryClient, token: string, tenant: string, location: string) {
  return Promise.all([
    'queue-counter-controls', 'queue-counter-resource-conflicts', 'queue-counter-next-plan',
    'queue-counter-next-eligible-plan', 'queue-counter-request-details',
  ].map(key => client.invalidateQueries({ queryKey: [key, token, tenant, location] })));
}

const streams = new Map<string, {owner: symbol; healthy: boolean}>();
const listeners = new Map<string, Set<() => void>>();
export const queueStreamScope = (token: string, tenant: string, location: string) => JSON.stringify([token, tenant, location]);
export function queueStreamHealthy(scope: string) { return streams.get(scope)?.healthy === true; }
export function subscribeQueueStreamHealth(scope: string, listener: () => void) {
  const group = listeners.get(scope) || new Set<() => void>(); group.add(listener); listeners.set(scope, group);
  return () => { group.delete(listener); if (!group.size) listeners.delete(scope); };
}
export function useQueueStreamHealthy(scope: string) {
  return useSyncExternalStore(listener => subscribeQueueStreamHealth(scope, listener), () => queueStreamHealthy(scope), () => false);
}
type Timer = ReturnType<typeof setTimeout> | number;
type Options = {
  scope?: string; locationId?: string;
  clock?: () => number;
  schedule?: (callback: () => void, delay: number) => Timer;
  cancel?: (timer: Timer) => void;
};
/** Authorized ready owns health. Events invalidate; browser time only detects transport silence. */
export function subscribeCounterUpdates(url: string, onUpdate: () => void, options: Options = {}) {
  const scope = options.scope, owner = Symbol('queue-stream');
  const clock = options.clock || Date.now, schedule = options.schedule || setTimeout, cancel = options.cancel || clearTimeout;
  let disposed = false, retry: Timer | undefined, gap: Timer | undefined, backoff = 5000;
  let closeCurrent = () => {};
  const health = (healthy: boolean) => {
    if (!scope || disposed) return;
    if (streams.get(scope)?.owner !== owner) return;
    if (streams.get(scope)?.healthy === healthy) return;
    streams.set(scope, {owner, healthy}); listeners.get(scope)?.forEach(listener => listener());
  };
  if (scope) { streams.set(scope, {owner, healthy: false}); listeners.get(scope)?.forEach(listener => listener()); }
  const connect = () => {
    if (disposed) return;
    const source = new EventSource(url, {withCredentials: true});
    let active = true, authorized = false, lastMessage = clock();
    const refresh = () => { if (!disposed && active) onUpdate(); };
    const payload = (event: Event): {locationId?: unknown} | undefined => {
      if (!('data' in event)) return undefined;
      try { const parsed = JSON.parse(String(event.data)); return parsed && typeof parsed === 'object' ? parsed : undefined; } catch { return undefined; }
    };
    const matchingHint = (event: Event) => { const value = payload(event); return !value || !('locationId' in value) || !options.locationId || value.locationId === options.locationId; };
    const open = () => { if (!disposed && active) { health(false); refresh(); } };
    const ready = (event: Event) => {
      const value = payload(event);
      if (disposed || !active || typeof value?.locationId !== 'string' || (options.locationId && value.locationId !== options.locationId)) return;
      authorized = true; lastMessage = clock(); backoff = 5000; health(true); refresh();
    };
    const hint = (event: Event) => { if (!disposed && active && matchingHint(event)) { lastMessage = clock(); refresh(); } };
    const heartbeat = () => { if (!disposed && active && authorized) { lastMessage = clock(); health(true); refresh(); } };
    const close = () => {
      active = false;
      events.forEach(([name, handler]) => source.removeEventListener(name, handler));
      source.close(); if (gap !== undefined) cancel(gap);
    };
    const error = () => {
      if (disposed || !active) return;
      health(false); refresh(); close(); retry = schedule(connect, backoff); backoff = Math.min(30000, backoff * 2);
    };
    const events: [string, EventListener][] = [['open',open],['ready',ready],['queue-plans-updated',hint],['heartbeat',heartbeat],['error',error]];
    events.forEach(([name, handler]) => source.addEventListener(name, handler));
    const check = () => { if (disposed || !active) return; if (clock() - lastMessage > 60000) error(); else gap = schedule(check, 5000); };
    gap = schedule(check, 5000); closeCurrent = close;
  };
  connect();
  return () => {
    health(false); disposed = true; if (retry !== undefined) cancel(retry); if (gap !== undefined) cancel(gap); closeCurrent();
    if (scope && streams.get(scope)?.owner === owner) streams.delete(scope);
  };
}

/** Keep one trailing read when an invalidation arrives during an in-flight read. */
export function createCounterReadQueue(read: () => Promise<unknown>, visible: () => boolean = () => true) {
  let running = false, queued = false, disposed = false;
  const update = () => {
    if (disposed || !visible()) return;
    if (running) { queued = true; return; }
    running = true;
    void Promise.resolve().then(read).catch(() => {}).finally(() => {
      running = false;
      if (!disposed && queued) { queued = false; update(); }
    });
  };
  return {update, dispose: () => { disposed = true; queued = false; }};
}
