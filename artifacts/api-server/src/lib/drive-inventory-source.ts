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

type DrivePathItem = {
  id: string;
  name: string;
  path?: string;
  parentFolderId?: string | null;
  parents?: string[];
  [key: string]: unknown;
};

export function hydrateDriveInventoryPaths<T extends DrivePathItem>(items: T[]): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const memo = new Map<string, string>();
  const resolving = new Set<string>();
  const resolvePath = (item: T): string => {
    const cached = memo.get(item.id);
    if (cached) return cached;
    if (resolving.has(item.id)) return `/${item.name}`;
    resolving.add(item.id);
    const parentId = item.parentFolderId ?? item.parents?.[0] ?? null;
    const parent = parentId ? byId.get(parentId) : null;
    const explicit = String(item.path ?? "").trim();
    const parentPath = parent ? resolvePath(parent) : "";
    const value = parent
      ? `${parentPath}/${item.name}`.replace(/\/+/g, "/")
      : explicit
        ? (explicit.startsWith("/") ? explicit : `/${explicit}`)
        : `/${item.name}`;
    resolving.delete(item.id);
    memo.set(item.id, value);
    return value;
  };
  return items.map((item) => ({ ...item, path: resolvePath(item) }));
}

const DRIVE_MONTH_NAMES = ["JANEIRO", "FEVEREIRO", "MARCO", "ABRIL", "MAIO", "JUNHO", "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO"];

export function scoreDrivePeriodPath(folderPath: string, periodStart: string | null | undefined) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(periodStart ?? ""))) return 0;
  const month = DRIVE_MONTH_NAMES[Number(String(periodStart).slice(5, 7)) - 1];
  const normalized = String(folderPath).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  return month && normalized.split("/").some((segment) => segment.trim() === month) ? 200 : 0;
}
