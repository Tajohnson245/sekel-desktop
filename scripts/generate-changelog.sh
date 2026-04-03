#!/usr/bin/env bash
# generate-changelog.sh — Build a version changelog from docs/features/
#
# Usage:
#   bash scripts/generate-changelog.sh <version>
#
# Examples:
#   bash scripts/generate-changelog.sh desktop/v1.9.0
#   bash scripts/generate-changelog.sh web/v1.5.0
#   bash scripts/generate-changelog.sh 2.0.0
#
# Scans docs/features/ for docs where:
#   - Status is `Complete`
#   - Target Version matches the given version exactly
#
# Output: docs/changelog/<version-slug>.md
# Source docs are never modified.

set -euo pipefail

# ── Argument validation ───────────────────────────────────────────────────────

if [ $# -ne 1 ]; then
  echo "Usage: bash scripts/generate-changelog.sh <version>" >&2
  echo "  e.g. bash scripts/generate-changelog.sh desktop/v1.9.0" >&2
  exit 1
fi

VERSION="$1"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "$(cd "$(dirname "$0")/.." && pwd)")"
FEATURES_DIR="$REPO_ROOT/docs/features"
CHANGELOG_DIR="$REPO_ROOT/docs/changelog"
TODAY="$(date +%Y-%m-%d)"

# Derive a filesystem-safe slug from the version (e.g. desktop/v1.9.0 → desktop-v1.9.0)
VERSION_SLUG="$(echo "$VERSION" | tr '/' '-')"
OUTPUT_PATH="$CHANGELOG_DIR/$VERSION_SLUG.md"

# ── Collect matching docs ─────────────────────────────────────────────────────

# Temp file to accumulate matching doc paths
MATCHES_FILE="$(mktemp)"
trap 'rm -f "$MATCHES_FILE"' EXIT

for DOC in "$FEATURES_DIR"/*.md; do
  # Skip the template
  BASENAME="$(basename "$DOC")"
  if [ "$BASENAME" = "_template.md" ]; then
    continue
  fi

  # Read Status field — must be `Complete`
  STATUS_LINE="$(grep -m1 '^\*\*Status:\*\*' "$DOC" 2>/dev/null || true)"
  if [[ "$STATUS_LINE" != *"\`Complete\`"* ]]; then
    continue
  fi

  # Read Target Version field — must match VERSION exactly
  TARGET_LINE="$(grep -m1 '^\*\*Target Version:\*\*' "$DOC" 2>/dev/null || true)"
  # Strip markdown formatting to get the raw value
  TARGET_VALUE="$(echo "$TARGET_LINE" | sed 's/\*\*Target Version:\*\*[[:space:]]*//' | sed 's/`//g' | sed 's/|.*//' | xargs)"
  if [ "$TARGET_VALUE" != "$VERSION" ]; then
    continue
  fi

  echo "$DOC" >> "$MATCHES_FILE"
done

MATCH_COUNT="$(wc -l < "$MATCHES_FILE" | xargs)"

if [ "$MATCH_COUNT" -eq 0 ]; then
  echo "No Complete docs found with Target Version: $VERSION" >&2
  echo "Check docs/features/ — docs must have Status: \`Complete\` and Target Version: $VERSION" >&2
  exit 1
fi

echo "Found $MATCH_COUNT matching doc(s) for $VERSION"

# ── Extract content from each matching doc ────────────────────────────────────

# Arrays: parallel indexed by entry number
declare -a ENTRY_TITLES
declare -a ENTRY_DESCS
declare -a ENTRY_OVERVIEWS
declare -a ENTRY_FILENAMES
declare -a ENTRY_CATEGORIES

i=0
while IFS= read -r DOC; do
  BASENAME="$(basename "$DOC" .md)"

  # H1 title (first line starting with # )
  TITLE="$(grep -m1 '^# ' "$DOC" | sed 's/^# //')"

  # One-line description (first line starting with > )
  DESC="$(grep -m1 '^> ' "$DOC" | sed 's/^> //')"

  # Overview section body — text between ## Overview and the next ## heading
  OVERVIEW="$(awk '/^## Overview/{found=1; next} found && /^## /{exit} found{print}' "$DOC" | sed '/^[[:space:]]*$/d' | head -6 | tr '\n' ' ' | xargs)"

  # Derive category from Target Version prefix (desktop/, web/, community/, survey/)
  if [[ "$VERSION" =~ ^([a-z]+)/ ]]; then
    RAW_CATEGORY="${BASH_REMATCH[1]}"
    # Title-case the category
    CATEGORY="$(echo "$RAW_CATEGORY" | awk '{print toupper(substr($0,1,1)) tolower(substr($0,2))}')"
  else
    CATEGORY="General"
  fi

  ENTRY_TITLES[$i]="$TITLE"
  ENTRY_DESCS[$i]="$DESC"
  ENTRY_OVERVIEWS[$i]="$OVERVIEW"
  ENTRY_FILENAMES[$i]="$BASENAME"
  ENTRY_CATEGORIES[$i]="$CATEGORY"

  i=$((i + 1))
done < "$MATCHES_FILE"

TOTAL=$i

# ── Write the changelog ───────────────────────────────────────────────────────

mkdir -p "$CHANGELOG_DIR"

{
  echo "# Changelog — $VERSION"
  echo "> Generated $TODAY from docs/features/ · $TOTAL feature(s)"
  echo ""
  echo "---"
  echo ""

  # Group by category: collect unique categories
  declare -A SEEN_CATEGORIES
  CATEGORY_ORDER=()
  for ((j=0; j<TOTAL; j++)); do
    CAT="${ENTRY_CATEGORIES[$j]}"
    if [ -z "${SEEN_CATEGORIES[$CAT]+x}" ]; then
      SEEN_CATEGORIES[$CAT]=1
      CATEGORY_ORDER+=("$CAT")
    fi
  done

  for CAT in "${CATEGORY_ORDER[@]}"; do
    echo "## $CAT"
    echo ""

    for ((j=0; j<TOTAL; j++)); do
      if [ "${ENTRY_CATEGORIES[$j]}" != "$CAT" ]; then
        continue
      fi

      echo "### ${ENTRY_TITLES[$j]}"
      if [ -n "${ENTRY_DESCS[$j]}" ]; then
        echo "> ${ENTRY_DESCS[$j]}"
      fi
      echo ""
      if [ -n "${ENTRY_OVERVIEWS[$j]}" ]; then
        echo "${ENTRY_OVERVIEWS[$j]}"
        echo ""
      fi
      echo "**Doc:** [${ENTRY_FILENAMES[$j]}.md](../features/${ENTRY_FILENAMES[$j]}.md)"
      echo ""
      echo "---"
      echo ""
    done
  done
} > "$OUTPUT_PATH"

echo "Written: $OUTPUT_PATH"
