export interface JoinedQueueAccessPayload {
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
}

const STORAGE_KEY = "getprio.joined-queue-access";

type JoinedQueueAccessMap = Record<string, JoinedQueueAccessPayload>;

function normalizeLookupCode(lookupCode: string): string {
  return String(lookupCode || "").trim().toUpperCase();
}

function readStorage(): JoinedQueueAccessMap {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return parsed as JoinedQueueAccessMap;
  } catch {
    return {};
  }
}

function writeStorage(value: JoinedQueueAccessMap) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

export function saveJoinedQueueAccess(lookupCode: string, payload: JoinedQueueAccessPayload) {
  const normalizedLookupCode = normalizeLookupCode(lookupCode);
  if (!normalizedLookupCode) {
    return;
  }

  const current = readStorage();
  current[normalizedLookupCode] = {
    customerEmail: String(payload.customerEmail || "").trim() || undefined,
    customerPhone: String(payload.customerPhone || "").trim() || undefined,
    customerName: String(payload.customerName || "").trim() || undefined
  };
  writeStorage(current);
}

export function getJoinedQueueAccess(lookupCode: string): JoinedQueueAccessPayload | null {
  const normalizedLookupCode = normalizeLookupCode(lookupCode);
  if (!normalizedLookupCode) {
    return null;
  }

  const current = readStorage();
  return current[normalizedLookupCode] || null;
}

export function clearJoinedQueueAccess(lookupCode: string) {
  const normalizedLookupCode = normalizeLookupCode(lookupCode);
  if (!normalizedLookupCode) {
    return;
  }

  const current = readStorage();
  if (!current[normalizedLookupCode]) {
    return;
  }

  delete current[normalizedLookupCode];
  writeStorage(current);
}
