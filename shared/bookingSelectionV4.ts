/** Customer-safe scheduled selection contract; no policy revisions or reservation identities. */
export interface BookingResourceLeafV4 {
  resourceSelectionId: string;
  resourceMemberId?: string | null;
  quantity: number;
  durationCount: number;
  durationVersion: string;
  extras: BookingExtraLeafV4[];
}
export interface BookingExtraLeafV4 {
  extraSelectionId: string;
  serviceId: string;
  quantity: number;
  durationCount: number;
  durationVersion: string;
  resourceMemberIds?: string[];
}
export interface BookingServiceSelectionV4 { serviceSelectionId: string; serviceId: string; resources: BookingResourceLeafV4[] }
export interface BookingCatalogServiceV4 {
  id: string; slug: string; name: string; assignment: 'named' | 'automatic'; resourceReady: boolean; quantityMax: number;
  duration: {baseMinutes:number;minCount:number;maxCount:number;stepCount:number;defaultCount:number;visible:boolean;version:string};
  resources: Array<{id:string;name:string;enabled:boolean}>;
  extras: Array<{serviceId:string;required:boolean}>;
  manualPaymentRequired:boolean;
}
export interface BookingCatalogV4 {contractVersion:4;enabled:boolean;catalogVersion?:string;reasonCode?:string;resourceServiceIds?:string[];resourceServiceSlugs?:string[];blockedServices?:Array<{id:string;name:string}>;services:BookingCatalogServiceV4[]}
export interface BookingSelectionDisplayV4 {
  contractVersion:4;scheduledStartAt:string;scheduledEndAt:string;warning:string|null;amountPendingConfirmation:boolean;
  services:Array<{name:string;resources:Array<{name:string;quantity:number;durationCount:number;durationMinutes:number;extras:Array<{name:string;quantity:number;durationCount:number;durationMinutes:number}>}>}>;
}
