/**
 * Константы статусов для фронтенда
 */
export const AuctionStatus = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  ENDED: 'ended',
} as const;

export const RoundStatus = {
  ACTIVE: 'active',
  ENDED: 'ended',
} as const;

export type AuctionStatusType = typeof AuctionStatus[keyof typeof AuctionStatus];
export type RoundStatusType = typeof RoundStatus[keyof typeof RoundStatus];
