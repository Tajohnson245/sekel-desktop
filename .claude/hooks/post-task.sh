#!/usr/bin/env bash
# post-task.sh — Claude Code Stop hook
# Runs after every Claude Code task. On SEKEL-### branches, creates or updates
# the corresponding feature doc under docs/features/<app>/in-progress/ and commits it.

# Consume stdin (Claude Code Stop hook JSON payload)
cat > /dev/null

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
BRANCH="$(git -C "$REPO_ROOT" branch --show-current 2>/dev/null)" || exit 0

# Only run on SEKEL feature branches (SEKEL-###-description)
if [[ ! "$BRANCH" =~ ^SEKEL-[0-9]+-(.+)$ ]]; then
  exit 0
fi

FEATURE_NAME="${BASH_REMATCH[1]}"
TEMPLATE_PATH="$REPO_ROOT/docs/features/_template.md"
TODAY="$(date +%Y-%m-%d)"

# ── Detect which app this branch primarily touches ────────────────────────────

detect_app() {
  local changed
  changed="$(git -C "$REPO_ROOT" status --short 2>/dev/null | awk '{print $NF}')"
  if [ -z "$changed" ]; then
    changed="$(git -C "$REPO_ROOT" diff HEAD~1 HEAD --name-only 2>/dev/null)"
  fi

  local desktop_count web_count community_count survey_count
  desktop_count="$(echo "$changed" | grep -c "^apps/desktop/" 2>/dev/null || echo 0)"
  web_count="$(echo "$changed"     | grep -c "^apps/web/"     2>/dev/null || echo 0)"
  community_count="$(echo "$changed" | grep -c "^apps/community/" 2>/dev/null || echo 0)"
  survey_count="$(echo "$changed"  | grep -c "^apps/survey/"  2>/dev/null || echo 0)"

  local max_app="infrastructure"
  local max_count=0
  for pair in "desktop:$desktop_count" "web:$web_count" "community:$community_count" "survey:$survey_count"; do
    app="${pair%%:*}"
    count="${pair##*:}"
    if [ "$count" -gt "$max_count" ] 2>/dev/null; then
      max_count="$count"
      max_app="$app"
    fi
  done
  echo "$max_app"
}

APP="$(detect_app)"

# ── Find existing doc (search all status dirs, skip _archive) ─────────────────

DOC_PATH=""
for status_dir in in-progress ready shipped; do
  for app_dir in desktop web community infrastructure survey; do
    candidate="$REPO_ROOT/docs/features/$app_dir/$status_dir/$FEATURE_NAME.md"
    if [ -f "$candidate" ]; then
      DOC_PATH="$candidate"
      break 2
    fi
  done
done

# ── Build a summary line from working-tree changes ────────────────────────────

CHANGED_FILES="$(
  git -C "$REPO_ROOT" status --short 2>/dev/null \
    | awk '{print $NF}' \
    | grep -v "^docs/features/" \
    | head -8 \
    | tr '\n' ', ' \
    | sed 's/,$//' \
  || true
)"

if [ -z "$CHANGED_FILES" ]; then
  CHANGED_FILES="$(
    git -C "$REPO_ROOT" diff HEAD~1 HEAD --name-only 2>/dev/null \
      | grep -v "^docs/features/" \
      | head -8 \
      | tr '\n' ', ' \
      | sed 's/,$//' \
    || true
  )"
fi

SUMMARY="${CHANGED_FILES:-Task completed}"

# ── Create or update the doc ──────────────────────────────────────────────────

if [ -z "$DOC_PATH" ]; then
  # Create new doc in <app>/in-progress/
  if [ ! -f "$TEMPLATE_PATH" ]; then
    echo "[post-task] Template not found at $TEMPLATE_PATH — skipping." >&2
    exit 0
  fi

  mkdir -p "$REPO_ROOT/docs/features/$APP/in-progress"
  DOC_PATH="$REPO_ROOT/docs/features/$APP/in-progress/$FEATURE_NAME.md"
  cp "$TEMPLATE_PATH" "$DOC_PATH"

  TITLE="$(echo "$FEATURE_NAME" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2)); print}')"

  sed -i "s/^# Feature Name$/# $TITLE/" "$DOC_PATH"
  sed -i "s/^> One-line description.*$/> Auto-created by post-task hook. Update with intent and description./" "$DOC_PATH"
  sed -i "s/\`SEKEL-XXX-feature-name\`/\`$BRANCH\`/" "$DOC_PATH"
  sed -i "s/\*\*Created:\*\* YYYY-MM-DD/**Created:** $TODAY/" "$DOC_PATH"
  sed -i "s/\*\*Last Updated:\*\* YYYY-MM-DD/**Last Updated:** $TODAY/" "$DOC_PATH"
  printf "| %s | Doc created. %s |\n" "$TODAY" "$SUMMARY" >> "$DOC_PATH"

  COMMIT_MSG="docs($APP): create $FEATURE_NAME.md"
else
  # Update Last Updated and append changelog row
  sed -i "s/\*\*Last Updated:\*\* [0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}/**Last Updated:** $TODAY/" "$DOC_PATH"
  printf "| %s | %s |\n" "$TODAY" "$SUMMARY" >> "$DOC_PATH"

  COMMIT_MSG="docs($APP): update $FEATURE_NAME.md changelog"
fi

# ── Commit only the doc, preserving any other staged files ────────────────────

OTHER_STAGED="$(git -C "$REPO_ROOT" diff --cached --name-only 2>/dev/null \
  | grep -v "^docs/features/" || true)"

STASHED=0
if [ -n "$OTHER_STAGED" ]; then
  git -C "$REPO_ROOT" stash push --staged --message "hook: preserve staged files" 2>/dev/null && STASHED=1
fi

git -C "$REPO_ROOT" add "$DOC_PATH"

if ! git -C "$REPO_ROOT" diff --cached --quiet; then
  git -C "$REPO_ROOT" commit -m "$COMMIT_MSG"
  echo "[post-task] Committed: $COMMIT_MSG"
fi

if [ "$STASHED" -eq 1 ]; then
  git -C "$REPO_ROOT" stash pop 2>/dev/null || true
fi
