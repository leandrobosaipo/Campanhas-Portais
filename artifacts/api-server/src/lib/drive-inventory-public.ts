export type PublicDriveInventoryStatus = {
  snapshotStatus: string;
  snapshotAt: string | null;
  snapshotAgeSeconds: number | null;
  stale: boolean;
  itemCount: number;
};

export function toPublicDriveInventoryStatus(inventory: {
  snapshotStatus: string;
  snapshotAt: string | null;
  snapshotAgeSeconds: number | null;
  stale: boolean;
  itemCount: number;
}): PublicDriveInventoryStatus {
  return {
    snapshotStatus: inventory.snapshotStatus,
    snapshotAt: inventory.snapshotAt,
    snapshotAgeSeconds: inventory.snapshotAgeSeconds,
    stale: inventory.stale,
    itemCount: inventory.itemCount,
  };
}
