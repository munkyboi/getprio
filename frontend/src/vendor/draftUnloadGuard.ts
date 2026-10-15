/** Read draft state at event time so async account challenges cannot stale it. */
export function draftUnloadHandler(hasDraft: () => boolean) {
  return (event: BeforeUnloadEvent) => {
    if (!hasDraft()) return;
    event.preventDefault();
    event.returnValue = "";
  };
}
