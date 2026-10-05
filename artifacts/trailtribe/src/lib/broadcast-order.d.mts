export type BroadcastOrderFields = {
  id: number | string;
  sentAt?: string | number | null;
  createdAt?: string | number | null;
};

export function compareBroadcastsNewestFirst<T extends BroadcastOrderFields>(a: T, b: T): number;
