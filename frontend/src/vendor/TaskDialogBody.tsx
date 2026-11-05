import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Reserve the notice's measured lane outside the body scroller at every scroll position. */
export function TaskDialogBody({ overlay, children }: { overlay: ReactNode; children: ReactNode }) {
  const noticeRef = useRef<HTMLDivElement>(null);
  const [noticeHeight, setNoticeHeight] = useState(0);
  useLayoutEffect(() => {
    const notice = noticeRef.current;
    if (!notice) return;
    const measure = () => setNoticeHeight(notice.getBoundingClientRect().height);
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(notice);
    // Older embedded browsers still clear the lane when the notice is dismissed.
    const mutation = !observer && typeof MutationObserver !== "undefined" ? new MutationObserver(measure) : null;
    mutation?.observe(notice, { childList: true, subtree: true, characterData: true });
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      mutation?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [overlay]);
  return <div className="queue-dialog-body" style={{ paddingBlockStart: noticeHeight ? noticeHeight + 24 : undefined }}>
    {children}
    <div ref={noticeRef} className="queue-dialog-body-overlay">{overlay}</div>
  </div>;
}
