import { useEffect, useRef } from "react";

/** Intercept traversal, restore the editor entry, then replay only approved exits. */
export function installLocationPageBackGuard(requestLeave: (proceed: () => void) => void) {
    const index = window.history.state?.idx;
    let restoring = false;
    let forwarding = false;
    let delta = 0;
    let active = true;
    let decision: ReturnType<typeof setTimeout> | undefined;
    const handle = (event: PopStateEvent) => {
      if (forwarding && !restoring) { forwarding = false; return; }
      if (restoring) {
        event.stopImmediatePropagation();
        restoring = false;
        if (forwarding) window.history.go(delta);
        return;
      }
      const next = event.state?.idx;
      if (typeof index !== "number" || typeof next !== "number" || index === next) return;
      event.stopImmediatePropagation();
      delta = next - index;
      restoring = true;
      let approved = false;
      requestLeave(() => {
        if (!active || approved) return;
        approved = true;
        decision = setTimeout(() => {
          if (!active) return;
          forwarding = true;
          if (!restoring) window.history.go(delta);
        }, 0);
      });
      window.history.go(-delta);
    };
    window.addEventListener("popstate", handle, true);
    return () => {
      active = false;
      window.removeEventListener("popstate", handle, true);
      if (decision !== undefined) clearTimeout(decision);
    };
}

export function useLocationPageBackGuard(enabled: boolean, routeKey: string, requestLeave: (proceed: () => void) => void) {
  const guard = useRef(requestLeave);
  useEffect(() => { guard.current = requestLeave; }, [requestLeave]);
  useEffect(() => {
    if (!enabled) return;
    return installLocationPageBackGuard((proceed) => guard.current(proceed));
  }, [enabled, routeKey]);
}
