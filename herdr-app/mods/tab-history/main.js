// Records which tabs you visit, most recent first, in shared "tab.history" so other
// mods (the ctrl-b prefix's "last tab") can go back. Herdr's own layout is rebuilt on
// every start, so this lives in a kept 2x2-pixel invisible window: Herdr reopens
// kept windows on start, and a mod re-renders whenever focus changes.
// Overlay dimensions <= 1 are window fractions, so 1 means the entire window
// and would intercept clicks meant for tabs and terminal panes. Keep both > 1.
// Open once with: herdr-app do mod.open --name tab-history
import { View, div } from "gpui-kit";
import { focused, spaces, shared, setShared, checking } from "herdr";

export const HISTORY = "tab.history";
const MAX = 30;

export default class TabHistory extends View {
  init() {}

  record() {
    const f = focused();
    if (!f?.tab) return;
    const history = shared(HISTORY) ?? [];
    if (history[0]?.tab === f.tab) return;
    const live = new Set(spaces().flatMap((s) => s.tabs.map((t) => t.id)));
    setShared(HISTORY, [{ tab: f.tab, space: f.space }, ...history.filter((h) => h.tab !== f.tab && live.has(h.tab))].slice(0, MAX));
  }

  render() {
    if (!checking()) this.record();
    return div().id("tab-history").size_full();
  }
}
