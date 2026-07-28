import { useEffect } from "react";

const MODAL_CONTENT_SELECTOR = ".customer-modal .mantine-Modal-content, .task-modal .mantine-Modal-content";
const PRIMARY_SCROLL_SELECTORS = [
  ".campaign-create-form__main",
  ".payment-proof-modal-main",
  ".contact-form-main",
  ".enterprise-contact-modal-main",
  ".task-modal__main"
];

function canScrollInDirection(element: HTMLElement, deltaY: number) {
  const { overflowY } = window.getComputedStyle(element);
  if (!["auto", "scroll"].includes(overflowY) || element.scrollHeight <= element.clientHeight) {
    return false;
  }

  return deltaY > 0
    ? element.scrollTop + element.clientHeight < element.scrollHeight - 1
    : element.scrollTop > 1;
}

function findScrollableAncestor(target: Element, modalContent: HTMLElement, deltaY: number) {
  let current: Element | null = target;
  while (current && current !== modalContent) {
    if (current instanceof HTMLElement && canScrollInDirection(current, deltaY)) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function findModalScrollTarget(modalContent: HTMLElement, deltaY: number) {
  for (const selector of PRIMARY_SCROLL_SELECTORS) {
    const primaryCandidates = modalContent.querySelectorAll<HTMLElement>(selector);
    for (const candidate of primaryCandidates) {
      if (canScrollInDirection(candidate, deltaY)) {
        return candidate;
      }
      const viewport = candidate.querySelector<HTMLElement>(".mantine-ScrollArea-viewport");
      if (viewport && canScrollInDirection(viewport, deltaY)) {
        return viewport;
      }
    }
  }

  const modalBody = modalContent.querySelector<HTMLElement>(".mantine-Modal-body");
  return modalBody && canScrollInDirection(modalBody, deltaY) ? modalBody : null;
}

function getPixelDelta(event: WheelEvent, scrollTarget: HTMLElement) {
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16;
  if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * scrollTarget.clientHeight;
  return event.deltaY;
}

export default function ModalWheelBridge() {
  useEffect(() => {
    const routeModalWheel = (event: WheelEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.deltaY === 0 || !(event.target instanceof Element)) return;

      const modalContent = event.target.closest<HTMLElement>(MODAL_CONTENT_SELECTOR);
      if (!modalContent) return;

      if (findScrollableAncestor(event.target, modalContent, event.deltaY)) return;

      const scrollTarget = findModalScrollTarget(modalContent, event.deltaY);
      if (!scrollTarget) return;

      event.preventDefault();
      scrollTarget.scrollTop += getPixelDelta(event, scrollTarget);
    };

    document.addEventListener("wheel", routeModalWheel, { passive: false });
    return () => document.removeEventListener("wheel", routeModalWheel);
  }, []);

  return null;
}
