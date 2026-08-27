// The production Worker reads canonical operational data through the private
// API proxy.  This intentionally empty fallback keeps a clean checkout
// buildable without shipping an unversioned operational snapshot.
export const snapshot = {
  generatedAt: "",
  sites: [] as any[],
  clients: [] as any[],
  agencies: [] as any[],
  campaigns: [] as any[],
  insertions: [] as any[],
  campaignDetails: {} as Record<string, any>,
  insertionDetails: {} as Record<string, any>,
  captureStatuses: {} as Record<string, any>,
  dashboards: {} as Record<string, any>,
  byCompetencia: [] as any[],
  relations: {} as Record<string, any>,
  adrotatePlanned: {} as Record<string, any>,
  adrotateLivePreview: {} as Record<string, any>,
  syncDiagnostics: null,
  syncPreview: null,
};
