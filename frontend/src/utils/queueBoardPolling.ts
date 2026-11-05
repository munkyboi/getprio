export const QUEUE_BOARD_POLL_INTERVAL = 15_000;

export function queueBoardPollingState(now: number, nextCheckAt: number, pairingExpiresAt: number | null, expiryChecked = false): "expired" | "final-check" | "wait" | "check" {
  if (pairingExpiresAt !== null) {
    if (!Number.isFinite(pairingExpiresAt)) return "expired";
    // An approval just before expiry already created a durable display grant.
    if (now >= pairingExpiresAt) return expiryChecked ? "expired" : "final-check";
  }
  return now < nextCheckAt ? "wait" : "check";
}
