export type BroadcastOrderFields = {
  id: number | string;
  sentAt?: Date | string | number | null;
  createdAt?: Date | string | number | null;
};

export function compareBroadcastsNewestFirst<T extends BroadcastOrderFields>(a: T, b: T): number;
