#!/usr/bin/env bash
# generate-changelog.sh — Build a version changelog from docs/features/<app>/ready/
#
# Usage:
#   bash scripts/generate-changelog.sh <app> <version>
#
# Examples:
#   bash scripts/generate-changelog.sh desktop v1.9.0
#   bash scripts/generate-changelog.sh web v1.5.0
#   bash scripts/generate-changelog.sh community v0.2.0
#
# Scans docs/features/<app>/ready/ for all docs, compiles them into a
# changelog at docs/changelog/<app>-<version>.md, then moves each doc
# from ready/ to shipped/.
#
# Source docs are the only input — no manual changelog writing needed.

set -euo pipefail

# ── Argument validation ───────────────────────────────────────────────────────

if [ $# -ne 2 ]; then
  echo "Usage: bash scripts/generate-changelog.sh <app> <version>" >&2
  echo "  e.g. bash scripts/generate-changelog.sh desktop v1.9.0" >&2
  echo "  Apps: desktop, web, community, infrastructure" >&2
  exit 1
fi

APP="$1"
VERSION="$2"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$(cd "$(dirname "$0")/.." && pwd)")"
READY_DIR="$REPO_ROOT/docs/features/$APP/ready"
SHIPPED_DIR="$REPO_ROOT/docs/features/$APP/shipped"
CHANGELOG_DIR="$REPO_ROOT/docs/changelog"
TODAY="$(date +%Y-%m-%d)"
OUTPUT_PATH="$CHANGELOG_DIR/$APP-$VERSION.md"

# ── Validate ──────────────────────────────────────────────────────────────────

if [ ! -d "$READY_DIR" ]; then
  echo "No ready/ directory found at $READY_DIR" >&2
  echo "Either the app name is wrong or no features have been moved to ready/ yet." >&2
  exit 1
fi

DOCS=("$READY_DIR"/*.md)
if [ ! -f "${DOCS[0]}" ]; then
  echo "No docs found in $READY_DIR" >&2
  echo "Move feature docs from in-progress/ to ready/ before generating a changelog." >&2
  exit 1
fi

echo "Found ${#DOCS[@]} doc(s) in $READY_DIR"

# ── Extract content from each doc ────────────────────────────────────────────

declare -a TITLES DESCS OVERVIEWS FILENAMES

i=0
for DOC in "${DOCS[@]}"; do
  BASENAME="$(basename "$DOC" .md)"

  TITLE="$(grep -m1 '^# ' "$DOC" | sed 's/^# //')"
  DESC="$(grep -m1 '^> ' "$DOC" | sed 's/^> //')"
  OVERVIEW="$(awk '/^## Overview/{found=1; next} found && /^## /{exit} found{print}' "$DOC" \
    | sed '/^[[:space:]]*$/d' | head -6 | tr '\n' ' ' | xargs)"

  TITLES[$i]="$TITLE"
  DESCS[$i]="$DESC"
  OVERVIEWS[$i]="$OVERVIEW"
  FILENAMES[$i]="$BASENAME"
  i=$((i + 1))
done

TOTAL=$i

# ── Write changelog ───────────────────────────────────────────────────────────

mkdir -p "$CHANGELOG_DIR"

{
  echo "# Changelog — $APP $VERSION"
  echo "> Released $TODAY · $TOTAL feature(s)"
  echo ""
  echo "---"
  echo ""

  for ((j=0; j<TOTAL; j++)); do
    echo "### ${TITLES[$j]}"
    [ -n "${DESCS[$j]}" ] && echo "> ${DESCS[$j]}"
    echo ""
    [ -n "${OVERVIEWS[$j]}" ] && echo "${OVERVIEWS[$j]}" && echo ""
    echo "**Doc:** [${FILENAMES[$j]}.md](../features/$APP/shipped/${FILENAMES[$j]}.md)"
    echo ""
    echo "---"
    echo ""
  done
} > "$OUTPUT_PATH"

echo "Written: $OUTPUT_PATH"

# ── Move docs from ready/ to shipped/ ────────────────────────────────────────

mkdir -p "$SHIPPED_DIR"

for DOC in "${DOCS[@]}"; do
  BASENAME="$(basename "$DOC")"

  # Update Status, Shipped date, and append changelog row before moving
  sed -i "s/\*\*Status:\*\* \`.*\`/**Status:** \`Shipped\`/" "$DOC"
  sed -i "s/\*\*Shipped:\*\* —/**Shipped:** $TODAY/" "$DOC"
  sed -i "s/\*\*Last Updated:\*\* [0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}/**Last Updated:** $TODAY/" "$DOC"
  printf "| %s | Shipped in %s %s |\n" "$TODAY" "$APP" "$VERSION" >> "$DOC"

  git -C "$REPO_ROOT" mv "$DOC" "$SHIPPED_DIR/$BASENAME"
  echo "Moved to shipped/: $BASENAME"
done

# Commit the changelog + moves
git -C "$REPO_ROOT" add "$OUTPUT_PATH"
git -C "$REPO_ROOT" commit -m "release($APP): $VERSION changelog — ${TOTAL} feature(s)"
echo ""
echo "Done. Commit created. Push when ready."
