import { createContext, type RefObject } from "react";
export const VendorPortal = createContext<RefObject<HTMLElement | null> | null>(
  null,
);
