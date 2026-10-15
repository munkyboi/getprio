export interface QueueTicketDetails {
  ticket: {
    id: string;
    ticketNumber: string;
    status: 'waiting' | 'called';
    customerName: string;
    notes: string | null;
    customerEmail: string | null;
    customerPhone: string | null;
    serviceName: string | null;
    serviceItemCount: number | null;
    /** Opaque server version. Preserve exactly; never parse as a timestamp. */
    version: string;
  };
  editableFields: ['customerName', 'notes'];
}
export interface QueueTicketDetailsUpdate {
  version: string;
  expectedStatus: 'waiting' | 'called';
  customerName: string;
  notes: string | null;
}
