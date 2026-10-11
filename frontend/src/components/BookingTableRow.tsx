import { Table } from "@mantine/core";
import type { ReactNode } from "react";

export function BookingTableRow({ reference, onOpen, children }: Readonly<{
  reference: string;
  onOpen: () => void;
  children: ReactNode;
}>) {
  return (
    <Table.Tr
      className="neura-booking-row"
      aria-label={`Booking ${reference}`}
      aria-haspopup="dialog"
      tabIndex={0}
      onClick={(event) => {
        // Nested controls own their actions, including disabled controls.
        if (event.target instanceof Element && event.target.closest(
          "button, a, input, select, textarea, [role='button'], [role='link'], [contenteditable]"
        )) return;
        onOpen();
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      {children}
    </Table.Tr>
  );
}
