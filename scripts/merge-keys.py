#!/usr/bin/env python3
"""Merge key bindings from this repo into Herdr App's keys.json, keeping everything else.

Usage: merge-keys.py <herdr keys.json> <repo keys.json>
"""
import json
import os
import shutil
import sys
import time

target, fragment = sys.argv[1:3]
if not os.path.exists(target):
    # Herdr keeps a keys.json it didn't write as entirely the person's, so a file
    # holding only these bindings would drop every default shortcut.
    sys.exit(f"{target} is missing: open Herdr App once so it writes its defaults, then re-run.")
current = json.load(open(target))
wanted = json.load(open(fragment))
changed = False
for section, bindings in wanted.items():
    have = current.setdefault(section, {})
    for key, action in bindings.items():
        if have.get(key) == action:
            continue
        if key in have:
            print(f"  {section} {key}: {have[key]!r} -> {action!r}")
        have[key] = action
        changed = True
if not changed:
    print("  keys.json already has these bindings")
    sys.exit(0)
backup_dir = os.path.join(os.path.dirname(target), ".dotfiles-backup")
os.makedirs(backup_dir, exist_ok=True)
shutil.copy2(target, os.path.join(backup_dir, f"keys.json.{int(time.time())}"))
tmp = target + ".dotfiles-next"
with open(tmp, "w") as f:
    json.dump(current, f, indent=2, ensure_ascii=False)
    f.write("\n")
os.replace(tmp, target)
print("  keys.json updated (backup in .dotfiles-backup/)")
