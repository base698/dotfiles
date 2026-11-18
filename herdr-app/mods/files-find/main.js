// Files: a keyboard file browser + finder for the focused pane's folder.
// Opened as a dialog (ctrl-cmd-f). Three modes:
//   tree  NERDTree-style: j/k move, l/h open/close, - root up, C root here, g git root
//   name  fuzzy file names (fd, filtered here as you type)
//   text  content search (rg, fixed strings; ctrl-r for regex)
// On a file: enter/e = $HERDR_EDITOR or $EDITOR in a split, t = in a new tab, ctrl-i/i = type path into the pane,
// ctrl-y/y = copy path, ctrl-o/o = show in Finder, ctrl-g/c = cd the pane there.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState, InputState, Input, ScrollHandle } from "gpui-base";
import { spaces, panes, agents, focused, exec, hc, run, readTextFile, theme, settings, props, closeOverlay, checking, home } from "herdr";

const LANG = { ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", toml: "yaml", jsonc: "json", svelte: "html", vue: "html", py: "python", rs: "rust", sh: "bash", zsh: "bash", md: "markdown" };
const PER_FOLDER = 1000, MAX_ROWS = 4000, MAX_FILES = 150000, MAX_HITS = 800, SHOW = 300, PREVIEW_BYTES = 300000;
const ICON = (n) => `mods/files-find/${n}.svg`;

function origin() {
  const f = focused();
  const space = spaces().find((s) => s.id === f?.space) ?? spaces().find((s) => s.active);
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f?.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  const agent = f?.agent || agents().some((a) => (f?.terminal && a.address === f.terminal) || (f?.pane && a.pane === f.pane));
  return { cwd: pane?.cwd || f?.cwd || space?.folder || home(), on, pane: f?.pane ?? null, terminal: f?.terminal ?? null, agent: Boolean(agent) };
}

const q = (s) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${s.replace(/'/g, `'\\''`)}'`);
const dirname = (p) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) || "/" : "");
const tilde = (p) => (p && p.startsWith(home()) ? "~" + p.slice(home().length) : p);

async function listDir(path, on) {
  const script = 'n=0; for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -e "$p" ] || [ -L "$p" ] || continue; name=${p##*/}; [ "$name" = .git ] && continue; if [ -d "$p" ]; then kind=d; else kind=f; fi; printf "%s\\0%s\\0" "$kind" "$name"; n=$((n+1)); [ "$n" -gt 1000 ] && break; done; test -d "$1"';
  const r = await exec("sh", ["-c", script, "files", path], { on });
  if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
  const f = r.stdout.split("\0"), out = [];
  for (let i = 0; i + 1 < f.length; i += 2) out.push({ name: f[i + 1], dir: f[i] === "d" });
  return out.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name));
}

// Subsequence match with bonuses for basename hits, word starts and runs.
function score(hay, needle, base) {
  const inBase = hay.indexOf(needle, base);
  if (inBase >= 0) return 200 + (inBase === base ? 40 : 0) + needle.length * 4;
  const any = hay.indexOf(needle);
  if (any >= 0) return 100 + (any === 0 || hay[any - 1] === "/" ? 20 : 0) + needle.length * 3;
  let i = 0, s = 0, prev = -2;
  for (let j = 0; j < hay.length && i < needle.length; j++) {
    if (hay[j] !== needle[i]) continue;
    s += j === prev + 1 ? 5 : 1;
    if (j === 0 || "/_-. ".includes(hay[j - 1])) s += 4;
    if (j >= base) s += 2;
    prev = j; i++;
  }
  return i === needle.length ? s : -1;
}
function fuzzy(query, paths) {
  const terms = query.trim().split(/\s+/).filter(Boolean).map((t) => ({ t: t === t.toLowerCase() ? t : t, ci: t === t.toLowerCase() }));
  const out = [];
  for (const p of paths) {
    const lower = p.toLowerCase(), base = p.lastIndexOf("/") + 1;
    let total = 0;
    for (const { t, ci } of terms) {
      const s = score(ci ? lower : p, t, base);
      if (s < 0) { total = -1; break; }
      total += s;
    }
    if (total >= 0) out.push({ path: p, score: total - p.length * 0.1 });
  }
  return out.sort((a, b) => b.score - a.score);
}

export default class FilesFind extends View {
  init(_props, cx) {
    this.o = checking() ? { cwd: home(), on: null, pane: null, terminal: null, agent: false } : origin();
    this.on = this.o.on;
    this.mode = "tree";
    this.hidden = false;
    this.regex = false;
    this.entries = new Map(); this.open = new Set(); this.pending = new Set();
    this.sel = null; this.marks = {};
    this.files = null; this.pool = null; this.poolQuery = null;
    this.hits = []; this.at = 0; this.busy = false; this.note = "";
    this.preview = { key: null, code: null, lines: null, error: null };
    this.width = 1000;
    this.ctx = 0; this.gseq = 0; this.pseq = 0;
    this.handle = cx.focus_handle();
    this.scroll = ScrollHandle.new();
    this.input = InputState.new({ placeholder: "" });
    this.input.on("change", (_e, cx) => this.search(cx));
    this.input.on("submit", (_e, cx) => this.act("open", cx));
    this.setRoot(this.o.cwd, cx);
    this.handle.focus();
    cx.timer.after(400, () => (this.mode === "tree" ? this.handle : this.input).focus());
  }

  // ---------- tree ----------
  setRoot(root, cx, keepSel) {
    this.root = root.length > 1 ? root.replace(/\/+$/, "") : root;
    this.entries = new Map(); this.open = new Set(); this.pending = new Set(); this.marks = {};
    this.files = null; this.pool = null; this.poolQuery = null;
    this.sel = keepSel ?? null; this.note = "";
    const ctx = ++this.ctx;
    if (checking()) return;
    cx.spawn(async (cx) => {
      try {
        await this.loadFolder("", ctx);
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd: this.root, on: this.on }).catch(() => null);
        this.gitTop = top?.code === 0 ? top.stdout.trim() : null;
        if (this.gitTop) {
          const st = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=normal"], { cwd: this.root, on: this.on }).catch(() => null);
          const marks = {};
          if (st?.code === 0) for (const e of st.stdout.split("\0").filter(Boolean).slice(0, 5000)) {
            const xy = e.slice(0, 2), abs = `${this.gitTop}/${e.slice(3).replace(/\/$/, "")}`;
            marks[abs] = xy === "??" || xy.includes("A") ? "A" : xy.includes("D") ? "D" : xy.includes("U") ? "U" : "M";
          }
          if (ctx === this.ctx) this.marks = marks;
        }
      } catch (e) { if (ctx === this.ctx) this.note = String(e.message || e); }
      if (ctx !== this.ctx) return;
      if (this.mode !== "tree" && this.input.value()) this.search(cx);
      this.showPreview(cx);
      cx.notify();
    });
  }

  async loadFolder(rel, ctx) {
    const list = await listDir(rel ? `${this.root}/${rel}` : this.root, this.on);
    if (ctx !== this.ctx) return;
    this.entries.set(rel, list.slice(0, PER_FOLDER));
  }

  toggle(rel, cx, want) {
    const isOpen = this.open.has(rel);
    if (want === isOpen) return;
    if (isOpen) {
      for (const f of [...this.open]) if (f === rel || f.startsWith(rel + "/")) this.open.delete(f);
    } else {
      this.open.add(rel);
      if (!this.entries.has(rel) && !this.pending.has(rel)) {
        const ctx = this.ctx;
        this.pending.add(rel);
        cx.spawn(async (cx) => {
          try { await this.loadFolder(rel, ctx); } catch (e) { this.note = String(e.message || e); }
          this.pending.delete(rel);
          cx.notify();
        });
      }
    }
    cx.notify();
  }

  // Expand every ancestor of rel, then select it.
  reveal(rel, cx) {
    const ctx = this.ctx, parts = rel.split("/");
    this.mode = "tree"; this.handle.focus();
    cx.spawn(async (cx) => {
      let acc = "";
      for (const part of parts.slice(0, -1)) {
        acc = acc ? `${acc}/${part}` : part;
        this.open.add(acc);
        if (!this.entries.has(acc)) { try { await this.loadFolder(acc, ctx); } catch { break; } }
      }
      if (ctx !== this.ctx) return;
      if (parts.slice(0, -1).some((p) => p.startsWith("."))) this.hidden = true;
      this.sel = rel;
      const i = this.rows().findIndex((r) => r.path === rel);
      if (i >= 0) this.scroll.scroll_to_item(i, "center");
      this.showPreview(cx);
      cx.notify();
    });
  }

  rows() {
    const out = [];
    const walk = (prefix, depth) => {
      for (const e of this.entries.get(prefix) ?? []) {
        if (out.length >= MAX_ROWS) return;
        if (!this.hidden && e.name.startsWith(".")) continue;
        const path = prefix ? `${prefix}/${e.name}` : e.name;
        out.push({ path, name: e.name, dir: e.dir, depth });
        if (e.dir && this.open.has(path)) walk(path, depth + 1);
      }
    };
    walk("", 0);
    return out;
  }

  // ---------- search ----------
  setMode(mode, cx) {
    this.mode = mode;
    this.at = 0;
    if (mode === "tree") { this.handle.focus(); }
    else {
      this.input.focus();
      if (mode === "name") this.loadFiles(cx);
      this.search(cx);
    }
    this.showPreview(cx);
    cx.notify();
  }

  loadFiles(cx) {
    if (this.files || this.filesLoading || checking()) return;
    const ctx = this.ctx;
    this.filesLoading = true;
    cx.spawn(async (cx) => {
      try {
        const r = await exec("fd", ["--type", "f", "--hidden", "--exclude", ".git", "--color", "never", "--strip-cwd-prefix", "--max-results", String(MAX_FILES)], { cwd: this.root, on: this.on, timeout: 30000 });
        if (ctx !== this.ctx) return;
        if (r.code !== 0) throw new Error(r.stderr || "fd failed");
        this.files = r.stdout.split("\n").filter(Boolean);
        if (this.files.length >= MAX_FILES) this.note = `Stopped at ${MAX_FILES.toLocaleString()} files; set a narrower root`;
      } catch (e) { if (ctx === this.ctx) this.note = String(e.message || e); }
      finally { if (ctx === this.ctx) this.filesLoading = false; }
      if (this.mode === "name") this.search(cx);
      cx.notify();
    });
  }

  search(cx) {
    const query = this.input.value();
    this.at = 0;
    if (this.mode === "name") {
      if (!this.files) { this.hits = []; cx.notify(); return; }
      if (!query.trim()) { this.hits = this.files.slice(0, SHOW).map((p) => ({ path: p })); this.pool = null; }
      else {
        // Typing more narrows the previous matches instead of rescanning everything.
        const src = this.pool && this.poolQuery && query.startsWith(this.poolQuery) && !query.slice(this.poolQuery.length).includes(" ") ? this.pool : this.files;
        const found = fuzzy(query, src);
        this.pool = found.map((f) => f.path); this.poolQuery = query;
        this.hits = found.slice(0, SHOW).map((f) => ({ path: f.path }));
        this.total = found.length;
      }
      this.scroll.scroll_to_item(0);
      this.showPreview(cx);
      cx.notify();
      return;
    }
    if (this.mode === "text") {
      const id = ++this.gseq, ctx = this.ctx;
      if (query.length < 2) { this.hits = []; this.busy = false; this.showPreview(cx); cx.notify(); return; }
      this.busy = true; cx.notify();
      cx.timer.after(180, (cx) => {
        if (id !== this.gseq) return;
        cx.spawn(async (cx) => {
          const args = ["--no-heading", "--with-filename", "--line-number", "--null", "--smart-case", "--max-count", "20", "--max-columns", "300", "--max-columns-preview", "--max-filesize", "2M", "--hidden", "--glob", "!.git", "--color", "never", ...(this.regex ? [] : ["--fixed-strings"]), "--", query, "."];
          let hits = [], note = "";
          try {
            const r = await exec("sh", ["-c", `rg "$@" 2>&1 | head -n ${MAX_HITS}`, "rg", ...args], { cwd: this.root, on: this.on, timeout: 20000 });
            for (const line of r.stdout.split("\n")) {
              const z = line.indexOf("\0");
              if (z < 0) { if (line.startsWith("rg:") || line.includes("regex parse error")) note = line.slice(0, 200); continue; }
              const rest = line.slice(z + 1), c = rest.indexOf(":");
              hits.push({ path: line.slice(0, z).replace(/^\.\//, ""), line: Number(rest.slice(0, c)), text: rest.slice(c + 1) });
            }
          } catch (e) { note = String(e.message || e); }
          if (id !== this.gseq || ctx !== this.ctx) return;
          this.hits = hits; this.busy = false; this.note = note; this.at = 0;
          this.scroll.scroll_to_item(0);
          this.showPreview(cx);
          cx.notify();
        });
      });
    }
  }

  // ---------- selection + preview ----------
  list() { return this.mode === "tree" ? this.rows() : this.hits; }

  index(list) {
    if (this.mode !== "tree") return Math.min(this.at, Math.max(0, list.length - 1));
    const i = list.findIndex((r) => r.path === this.sel);
    return i >= 0 ? i : 0;
  }

  target() {
    const list = this.list(), r = list[this.index(list)];
    if (!r) return null;
    return { rel: r.path, abs: `${this.root}/${r.path}`, dir: Boolean(r.dir), line: r.line ?? null };
  }

  move(delta, cx, absolute) {
    const list = this.list();
    if (!list.length) return;
    let i = absolute != null ? absolute : this.index(list) + delta;
    i = Math.max(0, Math.min(list.length - 1, i));
    if (this.mode === "tree") this.sel = list[i].path; else this.at = i;
    this.scroll.scroll_to_item(i);
    this.showPreview(cx);
    cx.notify();
  }

  showPreview(cx) {
    const t = this.target();
    const key = t && !t.dir ? `${t.abs}:${t.line ?? ""}` : null;
    if (key === this.preview.key) return;
    this.preview.code?.release();
    this.preview = { key, code: null, lines: null, error: null, dir: t?.dir ? t.rel : null };
    if (!key || checking()) return;
    const id = ++this.pseq;
    cx.spawn(async (cx) => {
      try {
        const text = await readTextFile(t.abs, { on: this.on });
        if (id !== this.pseq) return;
        if (text === null) this.preview.error = "File is gone";
        else if (text.slice(0, 8000).includes("\0")) this.preview.error = "Binary file";
        else if (t.line) {
          const all = text.split("\n"), start = Math.max(1, t.line - 10);
          this.preview.lines = { start, at: t.line, rows: all.slice(start - 1, start + 90) };
        } else {
          const th = theme(), ext = t.rel.includes(".") ? t.rel.split(".").pop().toLowerCase() : "txt";
          this.preview.code = EditorState.new({ language: LANG[ext] ?? ext, readonly: true, folding: false,
            value: text.length > PREVIEW_BYTES ? text.slice(0, PREVIEW_BYTES) + "\n… (truncated)" : text,
            font_family: settings().font_family, font_size: 12,
            syntax: { keyword: th.ansi5, string: th.ansi2, comment: th.dim, function: th.ansi4, type: th.ansi3, number: th.ansi1, constant: th.ansi6 } });
        }
      } catch { if (id === this.pseq) this.preview.error = "Cannot preview (binary, too large, or unreadable)"; }
      cx.notify();
    });
  }

  // ---------- actions ----------
  close() { const id = props()?.overlay; if (id) closeOverlay(id); }

  async copy(text) { await exec("sh", ["-c", 'printf %s "$1" | pbcopy', "copy", text]); }

  shown(abs) { // path as the origin pane would want it typed
    const base = this.o.cwd?.replace(/\/+$/, "");
    return base && abs.startsWith(base + "/") ? abs.slice(base.length + 1) : abs;
  }

  act(what, cx) {
    const t = this.target();
    if (!t) return;
    const focusBack = () => { if (this.o.pane) run("pane.focus", { pane: this.o.pane }); else if (this.o.terminal) run("pane.focus", { terminal: this.o.terminal }); };
    if (what === "open" && t.dir && this.mode === "tree") { this.toggle(t.rel, cx); return; }
    if (what === "open" || what === "edit" || what === "edit-tab") {
      // HERDR_EDITOR overrides $VISUAL/$EDITOR just for this; folders open in the editor too (netrw etc).
      const argv = ["zsh", "-ic", 'exec ${HERDR_EDITOR:-${VISUAL:-${EDITOR:-vim}}} "$@"', "edit", ...(t.line ? [`+${t.line}`] : []), t.abs];
      const folder = t.dir ? t.abs : dirname(t.abs);
      this.close();
      if (what === "edit-tab") run("tab.new", { argv, folder, name: t.rel.split("/").pop() });
      else if (this.o.pane) run("pane.split", { direction: "right", pane: this.o.pane, argv });
      else run("terminal.open", { argv, place: "right", folder });
      return;
    }
    if (this.on && what !== "insert") { this.note = "Only for this computer's files"; cx.notify(); return; }
    cx.spawn(async (cx) => {
      try {
        if (what === "copy") { await this.copy(t.abs); this.close(); }
        else if (what === "finder") { await exec("open", ["-R", t.abs]); this.close(); }
        else if (what === "insert") {
          if (!this.o.terminal) throw new Error("No terminal to type into");
          await this.copy(q(this.shown(t.abs)) + " ");
          this.close(); focusBack(); run("terminal.paste", {});
        } else if (what === "cd") {
          if (!this.o.terminal) throw new Error("No terminal to cd");
          if (this.o.agent) throw new Error("That pane runs an agent; not sending cd");
          await hc(["send", this.o.terminal, `cd ${q(t.dir ? t.abs : dirname(t.abs))}`]);
          this.close(); focusBack();
        }
      } catch (e) { this.note = String(e.message || e); cx.notify(); }
    });
  }

  key(e, cx) {
    const k = e.key, ch = e.key_char ?? "", m = e.modifiers ?? {};
    const ctrl = m.control && !m.platform && !m.alt;
    const stop = () => { cx.stop_propagation(); cx.notify(); };

    // Keys that work in every mode.
    if (ctrl && k === "y") { this.act("copy", cx); return stop(); }
    if (ctrl && k === "o") { this.act("finder", cx); return stop(); }
    if (ctrl && k === "i") { this.act("insert", cx); return stop(); }
    if (ctrl && k === "g") { this.act("cd", cx); return stop(); }
    if (ctrl && k === "e") { this.act("edit", cx); return stop(); }

    if (this.mode !== "tree") {
      if (k === "down" || (ctrl && (k === "n" || k === "j"))) { this.move(1, cx); return stop(); }
      if (k === "up" || (ctrl && (k === "p" || k === "k"))) { this.move(-1, cx); return stop(); }
      if (k === "pagedown") { this.move(15, cx); return stop(); }
      if (k === "pageup") { this.move(-15, cx); return stop(); }
      if (k === "tab" && !m.shift) { this.setMode(this.mode === "name" ? "text" : "name", cx); return stop(); }
      if (m.platform && k === "enter") { this.act("edit-tab", cx); return stop(); }
      if (k === "escape" || (k === "tab" && m.shift)) { this.setMode("tree", cx); return stop(); }
      if (ctrl && k === "t") { const t = this.target(); if (t) this.reveal(t.rel, cx); return stop(); }
      if (ctrl && k === "r" && this.mode === "text") { this.regex = !this.regex; this.search(cx); return stop(); }
      return; // everything else types into the search box
    }

    if (m.platform || m.control || m.alt) return;
    const t = this.target();
    if (k === "down" || ch === "j") this.move(1, cx);
    else if (k === "up" || ch === "k") this.move(-1, cx);
    else if (k === "pagedown" || ch === "J") this.move(15, cx);
    else if (k === "pageup" || ch === "K") this.move(-15, cx);
    else if (k === "home") this.move(0, cx, 0);
    else if (k === "end" || ch === "G") this.move(0, cx, Number.MAX_SAFE_INTEGER);
    else if (k === "right" || ch === "l") { if (t?.dir) this.toggle(t.rel, cx, true); }
    else if (k === "enter") this.act("open", cx);
    else if (ch === "e" || ch === "v") this.act("edit", cx);
    else if (ch === "t") this.act("edit-tab", cx);
    else if (k === "left" || ch === "h") {
      if (t?.dir && this.open.has(t.rel)) this.toggle(t.rel, cx, false);
      else if (t && t.rel.includes("/")) { this.sel = dirname(t.rel); this.move(0, cx); }
    }
    else if (ch === "-" || ch === "u") { const from = this.root.split("/").pop(); this.setRoot(dirname(this.root) || "/", cx, from); }
    else if (ch === "C") { if (t) this.setRoot(t.dir ? t.abs : dirname(t.abs), cx); }
    else if (ch === "g") { if (this.gitTop && this.gitTop !== this.root) { const rel = this.root.slice(this.gitTop.length + 1); this.setRoot(this.gitTop, cx); this.reveal(rel, cx); } }
    else if (ch === "~") this.setRoot(home(), cx);
    else if (ch === "R") this.setRoot(this.root, cx, this.sel);
    else if (ch === ".") { this.hidden = !this.hidden; this.move(0, cx); }
    else if (ch === "/") { this.input.set_value(""); this.setMode("name", cx); }
    else if (ch === "?") { this.input.set_value(""); this.setMode("text", cx); }
    else if (ch === "y") this.act("copy", cx);
    else if (ch === "o") this.act("finder", cx);
    else if (ch === "i") this.act("insert", cx);
    else if (ch === "c") this.act("cd", cx);
    else if (ch === "q") this.close();
    else return;
    stop();
  }

  // ---------- view ----------
  render(cx) {
    const t = theme(), mono = settings().font_family;
    const list = this.list(), sel = this.index(list);
    const listW = Math.max(280, Math.round(this.width * 0.42));

    const chip = (id, label, on) => div().id(`ff-mode-${id}`).px(8).py(2).rounded(6).text_size(11.5).cursor_pointer()
      .when(on, (el) => el.bg(t.selected).text_color(t.foreground)).when(!on, (el) => el.text_color(t.dim).hover((s) => s.bg(t.hover)))
      .on_click((_e, cx) => { if (id !== "tree") this.input.set_value(this.input.value()); this.setMode(id, cx); })
      .child(label);

    const header = h_flex().h(38).flex_none().px(14).gap(6).items_center().border_b(1).border_color(t.border)
      .child(div().font_semibold().text_color(t.foreground).mr(6).child("Files"))
      .child(chip("tree", "Tree", this.mode === "tree"))
      .child(chip("name", "Name  /", this.mode === "name"))
      .child(chip("text", "Text  ?", this.mode === "text"))
      .child(div().flex_1().min_w(0).truncate().text_right().text_size(12).text_color(t.dim)
        .child(tilde(this.root) + (this.gitTop && this.gitTop !== this.root ? `   (repo: ${tilde(this.gitTop).split("/").pop()})` : "")));

    const searchBar = h_flex().h(34).flex_none().mx(10).mt(8).px(10).gap(8).items_center().rounded(8).border_1().border_color(t.accent).bg(t.background)
      .child(svg(ICON("search")).size(14).text_color(t.dim))
      .child(div().text_size(11).text_color(t.dim).child(this.mode === "name" ? "name" : this.regex ? "text · regex" : "text"))
      .child(Input.new(this.input).flex_1().h_full().text_size(13).text_color(t.foreground))
      .child(div().text_size(11).text_color(t.dim).child(
        this.mode === "name" ? (this.filesLoading ? "indexing…" : this.files ? `${(this.input.value().trim() ? this.total ?? 0 : this.files.length).toLocaleString()} files` : "")
          : this.busy ? "searching…" : this.input.value().length >= 2 ? `${this.hits.length}${this.hits.length >= MAX_HITS ? "+" : ""} hits` : ""));

    const row = (r, i) => {
      const on = i === sel;
      const base = h_flex().id(`ff-r-${i}`).h(24).flex_none().pr(8).gap(6).items_center().rounded(6).cursor_pointer()
        .when(on, (el) => el.bg(t.selected)).when(!on, (el) => el.hover((s) => s.bg(t.hover)))
        .on_click((_e, cx) => {
          if (this.mode === "tree") { this.sel = r.path; if (r.dir) this.toggle(r.path, cx); } else this.at = i;
          this.showPreview(cx); cx.notify();
        });
      if (this.mode === "tree") {
        const mark = this.marks[`${this.root}/${r.path}`], open = this.open.has(r.path);
        return base.pl(6 + r.depth * 16)
          .child(r.dir ? svg(ICON(open ? "chevron-down" : "chevron-right")).size(11).flex_none().text_color(t.dim) : div().w(11).flex_none())
          .child(svg(ICON(r.dir ? "folder" : "file")).size(13).flex_none().text_color(r.dir ? t.ansi4 : t.muted))
          .child(div().flex_1().min_w(0).truncate().text_color(r.name.startsWith(".") ? t.dim : t.foreground).child(r.name))
          .when(Boolean(mark), (el) => el.child(div().text_size(11).text_color(mark === "A" ? t.ansi2 : mark === "D" || mark === "U" ? t.ansi1 : t.blocked).child(mark)));
      }
      const slash = r.path.lastIndexOf("/"), name = r.path.slice(slash + 1), dir = slash >= 0 ? r.path.slice(0, slash + 1) : "";
      if (this.mode === "name") return base.pl(8)
        .child(svg(ICON("file")).size(13).flex_none().text_color(t.muted))
        .child(div().text_color(t.foreground).flex_none().child(name))
        .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child(dir));
      return base.pl(8).h(36).child(v_flex().flex_1().min_w(0)
        .child(h_flex().gap(4).text_size(11.5).child(div().text_color(t.foreground).flex_none().child(name)).child(div().text_color(t.dim).flex_none().child(`:${r.line}`)).child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(dir ? `  ${dir}` : "")))
        .child(div().truncate().font_family(mono).text_size(11.5).text_color(t.muted).child(r.text.trim())));
    };

    const empty = this.mode === "tree" ? (this.note || (this.entries.has("") ? "Empty folder" : "Loading…"))
      : this.mode === "name" ? (this.filesLoading ? "Indexing files…" : this.note || "No matches")
      : this.input.value().length < 2 ? "Type at least 2 characters" : this.busy ? "Searching…" : this.note || "No matches";

    const listEl = v_flex().id("ff-list").w(listW).flex_none().min_h(0).h_full().overflow_y_scrollbar().track_scroll(this.scroll).p(6).text_size(13)
      .children(list.map(row))
      .when(!list.length, (el) => el.child(div().p(10).text_size(12).text_color(t.dim).child(empty)));

    const p = this.preview;
    let body;
    if (p.code) body = Editor.new(p.code).flex_1().min_h(0);
    else if (p.lines) body = v_flex().flex_1().min_h(0).overflow_hidden().py(6).font_family(mono).text_size(12)
      .children(p.lines.rows.map((line, i) => {
        const n = p.lines.start + i, hit = n === p.lines.at;
        return h_flex().flex_none().h(18).items_center().when(hit, (el) => el.bg(t.selection))
          .child(div().w(52).flex_none().pr(10).text_right().text_color(hit ? t.foreground : t.dim).child(String(n)))
          .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(line.replace(/\t/g, "    ") || " "));
      }));
    else body = div().p(14).text_size(12).text_color(t.dim).child(p.error || (p.dir ? `${p.dir}/   l to open · C to make it the root` : p.key ? "Loading…" : ""));

    const previewEl = v_flex().flex_1().min_w(0).min_h(0).h_full().border_l(1).border_color(t.border).bg(t.background)
      .child(h_flex().h(28).flex_none().px(12).items_center().border_b(1).border_color(t.border).text_size(11.5).text_color(t.dim)
        .child(div().flex_1().min_w(0).truncate().child(this.target()?.rel ?? ""))
        .when(Boolean(this.target()), (el) => el
          .child(div().id("ff-edit").ml(8).px(8).py(1).rounded(5).border_1().border_color(t.border).text_color(t.foreground).cursor_pointer().hover((s) => s.bg(t.hover))
            .on_click((_e, cx) => this.act("edit", cx)).child("Edit  e"))
          .child(div().id("ff-edit-tab").ml(6).px(8).py(1).rounded(5).border_1().border_color(t.border).text_color(t.foreground).cursor_pointer().hover((s) => s.bg(t.hover))
            .on_click((_e, cx) => this.act("edit-tab", cx)).child("Tab  t"))))
      .child(body);

    const hints = this.mode === "tree"
      ? "j/k move · l/h open/close · enter/e edit · t edit in tab · / name · ? text · - up · C root · g repo · . hidden · y copy · i insert · c cd · o finder"
      : `↑/↓ move · enter edit · cmd-enter edit in tab · tab ${this.mode === "name" ? "text" : "name"} · esc tree · ctrl-t show in tree · ctrl-y copy · ctrl-i insert · ctrl-g cd${this.mode === "text" ? " · ctrl-r regex" : ""}`;

    return v_flex().id("ff-root").size_full().min_h(0).bg(t.popover).text_color(t.foreground).text_size(13)
      .track_focus(this.handle)
      .on_size_change((size, cx) => { const w = size.width; if (Math.abs(w - this.width) > 4) { this.width = w; cx.notify(); } })
      .on_key_down((e, cx) => this.key(e, cx))
      .child(header)
      .when(this.mode !== "tree", (el) => el.child(searchBar))
      .child(h_flex().flex_1().min_h(0).mt(this.mode === "tree" ? 0 : 8).border_t(this.mode === "tree" ? 0 : 1).border_color(t.border).child(listEl).child(previewEl))
      .child(h_flex().h(26).flex_none().px(12).gap(10).items_center().border_t(1).border_color(t.border).text_size(11).text_color(t.dim)
        .child(div().flex_1().min_w(0).truncate().child(hints))
        .when(Boolean(this.note) && list.length > 0, (el) => el.child(div().flex_none().text_color(t.blocked).child(this.note.slice(0, 80)))));
  }
}
