/** Global effective Platform policy. Legacy Kb means 1024-byte units, not bits. */
export interface PublicImageUploadPolicy {
  maxImageUploadKb: number;
  maxImageUploadBytes: number;
}
/** Existing authenticated account/mobile DTO; same effective byte limit. */
export interface AccountImageUploadPolicy {
  maxImageBytes: number;
}
