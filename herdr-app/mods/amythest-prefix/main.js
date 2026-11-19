// tmux-style prefix keys for the Herdr app.
//
// keys.json binds ctrl-b to "mod.open:tmux-prefix". That opens this popup, which takes the
// keyboard, runs one command for the next key and closes. Esc, ctrl-c, or a key with nothing
// bound, cancels. Wait a moment (or press ?) and the key list shows.
//
// The keys follow the terminal Herdr's defaults (v - h j k l c n p x z ...) plus stock
// tmux's (% " o & , $ { } :). To change one, edit KEYS (what a key does) and SHEET (the
// list shown). Saving this file reloads it.

import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, hc, props, closeOverlay, openOverlay, focused, panes, notify, theme, spaces, agents, shared } from "herdr";

// The key keys.json opens this with. Pressed again here, it goes to the program instead.
const PREFIX = "ctrl-b";

const go = (direction) => () => run("pane.go", { direction });
const split = (direction) => (c) => run("pane.split", { direction, ...c.on });

// The next or previous pane of the focused tab, in layout order: focus it, or swap with it.
function cycle(c, step, swap) {
  const all = panes().filter((p) => p.tab === c.tab);
  if (all.length < 2) return;
  const i = Math.max(0, all.findIndex((p) => p.pane === c.pane));
  const other = all[(i + step + all.length) % all.length].pane;
  if (swap) run("pane.swap", { pane: all[i].pane, target: other });
  else run("pane.focus", { pane: other });
}

// Show a tab in any space. tab.select alone only changes which tab that space shows, and
// space.select issued first would win over it, so select the tab, then its space.
function showTab(space, tab) {
  run("tab.select", { id: tab });
  if (space && space !== spaces().find((s) => s.active)?.id) run("space.select", { id: space });
}

// Back to the tab you were on before this one (like `cd -`; press again to come back).
// History is recorded by the tab-history mod, a kept invisible window.
function lastTab(c) {
  const live = new Set(spaces().flatMap((s) => s.tabs.map((t) => t.id)));
  const prev = (shared("tab.history") ?? []).find((h) => h.tab !== c.tab && live.has(h.tab));
  if (prev) return showTab(prev.space, prev.tab);
  if (!shared("tab.history")) run("mod.open", { name: "tab-history" });
  notify({ title: "No previous tab yet" });
}

// The agent that most recently started needing you (blocked, or done while you weren't
// looking), skipping the one you're on: press again for the next one back.
function attention(c) {
  const waiting = agents()
    .filter((a) => (a.status === "blocked" || a.status === "done") && a.address !== c.terminal)
    .sort((a, b) => b.seq - a.seq);
  const next = waiting[0];
  if (!next) return notify({ title: "No agent needs you" });
  run("agent.focus", { terminal: next.address });
}

// Key name -> what it does. Letters are "x" or "X" (with shift); other keys are the
// character they type ("%", "-") or their name ("left", "tab", "shift-tab").
const KEYS = {
  f: () => run("mod.open", { name: "amythest-find" }),
  A: () => run("mod.open", { name: "amythest-workspace" }),
  a: () => run("mod.open", { name: "amythest-add" }),
  // Panes
  v: split("right"), "%": split("right"),
  "-": split("down"), "\"": split("down"),
  h: go("left"), j: go("down"), k: go("up"), l: go("right"),
  left: go("left"), down: go("down"), up: go("up"), right: go("right"),
  tab: (c) => cycle(c, 1), o: (c) => cycle(c, 1), "shift-tab": (c) => cycle(c, -1),
  "{": (c) => cycle(c, -1, true), "}": (c) => cycle(c, 1, true),
  z: (c) => run("pane.zoom", c.on),
  x: (c) => run("pane.close", c.on),
  // Tabs
  c: () => run("tab.new"),
  n: () => run("tab.next"), p: () => run("tab.prev"),
  L: lastTab, u: attention,
  T: () => run("tab.rename"), ",": () => run("tab.rename"),
  X: () => run("tab.close"), "&": () => run("tab.close"),
  // Spaces
  w: () => run("mod.open", { name: "picker" }), g: () => run("mod.open", { name: "picker" }),
  N: () => run("space.new"),
  G: (c) => openOverlay({ mod: "worktree", kind: "dialog", width: 460, height: 280, props: { space: c.space, folder: c.cwd, action: "new" } }),
  W: () => run("space.rename"), "$": () => run("space.rename"),
  D: () => run("space.close"),
  // App
  s: () => run("app.settings"),
  ":": () => run("app.palette"),
  b: () => run("layout.toggle", { id: "sidebar" }),
  // amy find in a pane below: a copy of what keys.json binds to cmd-shift-f, so change both.
};
for (let i = 1; i <= 9; i++) KEYS[i] = () => run("tab.select", { index: i });

// The list shown: [group, width of its key column, [[keys, what they do], ...]].
const SHEET = [
  ["Amythest", 36, [["a", "add task"], ["A", "workspace"], ["f", "find"]]],
  ["Panes", 92, [["v %", "split right"], ["- \"", "split down"], ["h j k l", "focus, or arrows"], ["tab o", "next pane"], ["{ }", "swap prev / next"], ["z", "zoom"], ["x", "close pane"]]],
  ["Tabs", 70, [["c", "new tab"], ["n p", "next / previous"], ["L", "last tab (back)"], ["u", "agent needing you"], ["1 … 9", "go to tab"], ["T ,", "rename"], ["X &", "close tab"]]],
  ["Spaces", 48, [["w g", "go to…"], ["N", "new space"], ["G", "new worktree"], ["W $", "rename"], ["D", "close space"]]],
  ["App", 36, [["f", "find (amy)"], ["s", "settings"], [":", "commands"], ["b", "sidebar"], ["⌃B", "send ctrl-b"], ["esc", "cancel"]]],
];

// What shift types on a US keyboard, for when the event doesn't say.
const SHIFTED = { "5": "%", "'": "\"", "/": "?", "7": "&", "4": "$", "[": "{", "]": "}", ";": ":" };
const MODIFIER_KEYS = new Set(["", "shift", "control", "ctrl", "alt", "cmd", "fn", "function", "capslock"]);

// The name KEYS uses for a key press, or null for one that isn't ours (a cmd or alt chord).
function keyName(e) {
  const m = e.modifiers ?? {};
  const k = e.key ?? "";
  if (m.platform || m.alt || MODIFIER_KEYS.has(k)) return null;
  if (m.control) return `ctrl-${k.toLowerCase()}`;
  if (/^[a-z]$/i.test(k)) return m.shift || k !== k.toLowerCase() ? k.toUpperCase() : k;
  if (k === "tab") return m.shift ? "shift-tab" : "tab";
  if (k.length > 1) return k;
  if (e.key_char && e.key_char.length === 1 && e.key_char !== " ") return e.key_char;
  return m.shift && SHIFTED[k] ? SHIFTED[k] : k;
}

export default class TmuxPrefix extends View {
  init(_props, cx) {
    this.was = focused();
    this.expanded = false;
    this.handle = cx.focus_handle();
    this.handle.focus();
    cx.timer.after(120, () => { if (!this.handle.is_focused()) this.handle.focus(); });
    cx.timer.after(700, (cx) => { this.expanded = true; cx.notify(); });
  }

  // Where the keys act: the pane that had the keyboard when the prefix was pressed.
  target() {
    const f = focused() ?? this.was ?? {};
    return { pane: f.pane, tab: f.tab, space: f.space, terminal: f.terminal, cwd: f.cwd, on: f.pane ? { pane: f.pane } : {} };
  }

  key(e, cx) {
    if (e.is_held) return;
    const name = keyName(e);
    if (name === null) return;
    cx.stop_propagation();
    if (name === "?") {
      this.expanded = true;
      cx.notify();
      return;
    }
    const c = this.target();
    if (name === PREFIX && c.terminal) hc(["keys", c.terminal, PREFIX.replace("-", "+")]);
    closeOverlay(props().overlay);
    if (name === PREFIX || name === "escape" || name === "ctrl-c") return;
    const action = KEYS[name];
    if (action) action(c);
    else notify({ title: `Prefix: nothing bound to ${name}` });
  }

  render() {
    const t = theme();
    const chip = (text) =>
      h_flex().h(20).min_w(20).px(6).flex_none().items_center().justify_center().rounded(5).border_1().border_color(t.border).bg(t.raised).text_size(11.5).text_color(t.foreground).child(text);
    const pill = h_flex().flex_none().h(32).px(10).gap(8).items_center().rounded(9).border_1().border_color(t.accent).bg(t.popover).shadow_lg().text_size(12.5)
      .child(chip("⌃B"))
      .child(div().font_medium().text_color(t.foreground).child("prefix"))
      .child(div().text_color(t.dim).child(this.expanded ? "esc cancels" : "? keys · esc cancels"));
    const sheet = h_flex().flex_none().items_start().gap(22).p(16).rounded(10).border_1().border_color(t.border).bg(t.popover).shadow_lg().children(
      SHEET.map(([group, width, rows]) =>
        v_flex().flex_none().gap(5)
          .child(div().pb(2).text_size(11.5).font_medium().text_color(t.dim).child(group))
          .children(rows.map(([keys, label]) =>
            h_flex().gap(8).items_center()
              .child(h_flex().w(width).flex_none().gap(4).children(keys.split(" ").map(chip)))
              .child(div().text_size(12.5).text_color(t.muted).child(label))))));
    return v_flex()
      .id("tmux-prefix")
      .track_focus(this.handle)
      .on_key_down((e, cx) => this.key(e, cx))
      .size_full()
      .items_center()
      .gap(8)
      .child(pill)
      .when(this.expanded, (el) => el.child(sheet));
  }
}
