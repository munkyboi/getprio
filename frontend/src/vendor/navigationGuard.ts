import { createContext, type MutableRefObject } from "react";

// The public header and vendor workspace share the same exit decision.
export const VendorNavigationGuard = createContext<MutableRefObject<(() => boolean) | null> | null>(null);
