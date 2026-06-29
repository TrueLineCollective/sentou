import type { ViewEvent } from "@/lib/store";

export function aggregate(events: ViewEvent[]) {
  const byViewer = new Map<string, { viewer: string; opens: number; totalDwellMs: number; lastSeen: string }>();
  for (const e of events) {
    const v = byViewer.get(e.viewer) ?? { viewer: e.viewer, opens: 0, totalDwellMs: 0, lastSeen: e.openedAt };
    v.opens += 1;
    v.totalDwellMs += e.dwellMs;
    if (e.openedAt > v.lastSeen) v.lastSeen = e.openedAt;
    byViewer.set(e.viewer, v);
  }
  return { totalOpens: events.length, viewers: [...byViewer.values()] };
}
