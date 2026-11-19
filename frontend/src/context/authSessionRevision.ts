export function isCurrentAuthRevision(current: number, observed: number): boolean {
  return Number.isSafeInteger(current) && Number.isSafeInteger(observed) && current === observed;
}
