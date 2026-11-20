import type { Campaign } from "./campaignUi";

export function campaignDetailForSession(record: { workspaceKey: string; campaign: Campaign } | null, workspaceKey: string, id: string | null, loaded: Campaign[]) {
  return record?.workspaceKey === workspaceKey && record.campaign.id === id ? record.campaign : loaded.find(campaign => campaign.id === id);
}
/** Discard old workspace/page reads even when a fetch implementation ignores AbortSignal. */
export function createCampaignReadGuard() {
  let workspace = ""; let epoch = 0; let controller: AbortController | null = null;
  return {
    setWorkspace(key: string) { if (key !== workspace) { workspace = key; epoch++; controller?.abort(); } },
    begin(expectedWorkspace = workspace) {
      if (expectedWorkspace !== workspace) { const ignored = new AbortController(); ignored.abort(); return { signal: ignored.signal, current: () => false }; }
      controller?.abort(); controller = new AbortController(); const signal = controller.signal; const started = ++epoch;
      return { signal, current: () => !signal.aborted && started === epoch };
    },
    cancel() { epoch++; controller?.abort(); },
  };
}
