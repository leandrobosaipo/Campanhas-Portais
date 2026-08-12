export function selectDriveInventorySource(input: {
  snapshotItems: number;
  refreshDrive: boolean;
  directCredentials: boolean;
}): "snapshot" | "live" | "cache" {
  if (input.snapshotItems > 0) return "snapshot";
  if (input.refreshDrive && input.directCredentials) return "live";
  return "cache";
}
