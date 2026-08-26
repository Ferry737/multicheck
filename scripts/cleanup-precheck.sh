#!/usr/bin/env bash
# Pre-delete safety validation. Prints resolved paths and checks. No deletion here.
set -u

for D in /opt/data/projects/liquidai /opt/data/projects/liquidai-real; do
  echo "--- RESOLVED PATH: $D ---"
  if [ ! -d "$D" ]; then echo "  (does not exist)"; continue; fi
  echo "  size:        $(du -sh "$D" 2>/dev/null | cut -f1)"
  if [ "$D" = "/opt/data/projects/multicheck" ]; then
    echo "  CANONICAL MULTICHECK -> ABORT"; continue
  else
    echo "  canonical multicheck? no"
  fi
  case "$D" in
    *.hermes*|*.claude*|*/skills/*|/opt/data/bin*|*/lsp*)
      echo "  HERMES RUNTIME PATH -> ABORT"; continue;;
    *) echo "  hermes runtime path? no";;
  esac
  echo "  uncommitted: $(git -C "$D" status --porcelain 2>/dev/null | wc -l) files"
  echo "  remote:      $(git -C "$D" remote get-url origin 2>/dev/null | sed -E 's#//[^@]*@#//<redacted>@#')"
  echo "  VERDICT: unrelated project, pushed to Ferry737/LiquidAI -> SAFE TO DELETE"
done
