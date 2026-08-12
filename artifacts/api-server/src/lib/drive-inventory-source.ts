export function selectDriveInventorySource(input: {
  snapshotItems: number;
  snapshotFresh: boolean;
  refreshDrive: boolean;
  directCredentials: boolean;
}): "snapshot" | "live" | "cache" {
  if (input.snapshotItems > 0 && input.snapshotFresh) return "snapshot";
  if (input.refreshDrive && input.directCredentials) return "live";
  return "cache";
}
