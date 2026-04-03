#!/usr/bin/env bash
# post-task.sh — Claude Code Stop hook
# Runs after every Claude Code task. On SEKEL-### branches, creates or updates
# the corresponding feature doc in docs/features/ and commits it.

# Consume stdin (Claude Code Stop hook JSON payload)
cat > /dev/null

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
BRANCH="$(git -C "$REPO_ROOT" branch --show-current 2>/dev/null)" || exit 0

# Only run on SEKEL feature branches (SEKEL-###-description)
if [[ ! "$BRANCH" =~ ^SEKEL-[0-9]+-(.+)$ ]]; then
  exit 0
fi

FEATURE_NAME="${BASH_REMATCH[1]}"
DOC_PATH="$REPO_ROOT/docs/features/$FEATURE_NAME.md"
TEMPLATE_PATH="$REPO_ROOT/docs/features/_template.md"
TODAY="$(date +%Y-%m-%d)"

# Build a summary line from uncommitted working-tree changes (exclude the doc itself)
CHANGED_FILES="$(
  git -C "$REPO_ROOT" status --short 2>/dev/null \
    | awk '{print $NF}' \
    | grep -v "^docs/features/${FEATURE_NAME}\.md$" \
    | head -8 \
    | tr '\n' ', ' \
    | sed 's/,$//' \
  || true
)"

# Fall back to last commit's changed files if the working tree is clean
if [ -z "$CHANGED_FILES" ]; then
  CHANGED_FILES="$(
    git -C "$REPO_ROOT" diff HEAD~1 HEAD --name-only 2>/dev/null \
      | grep -v "^docs/features/${FEATURE_NAME}\.md$" \
      | head -8 \
      | tr '\n' ', ' \
      | sed 's/,$//' \
    || true
  )"
fi

if [ -z "$CHANGED_FILES" ]; then
  SUMMARY="Task completed"
else
  SUMMARY="Modified: $CHANGED_FILES"
fi

if [ ! -f "$DOC_PATH" ]; then
  # ── Create new doc from template ─────────────────────────────────────────
  if [ ! -f "$TEMPLATE_PATH" ]; then
    echo "[post-task] Template not found at $TEMPLATE_PATH — skipping doc creation." >&2
    exit 0
  fi

  cp "$TEMPLATE_PATH" "$DOC_PATH"

  # Derive a readable title from kebab-case feature name
  TITLE="$(echo "$FEATURE_NAME" | sed 's/-/ /g' | awk '{for(i=1;i<=NF;i++) $i=toupper(substr($i,1,1)) tolower(substr($i,2)); print}')"

  # Populate template placeholders
  sed -i "s/^# Feature Name$/# $TITLE/" "$DOC_PATH"
  sed -i "s/^> One-line description.*$/> Auto-created by post-task hook. Update with intent and description./" "$DOC_PATH"
  sed -i "s/\`SEKEL-XXX-feature-name\`/\`$BRANCH\`/" "$DOC_PATH"
  sed -i "s/\*\*Created:\*\* YYYY-MM-DD/**Created:** $TODAY/" "$DOC_PATH"
  sed -i "s/\*\*Last Updated:\*\* YYYY-MM-DD/**Last Updated:** $TODAY/" "$DOC_PATH"

  # Append initial changelog row
  printf "| %s | Doc created. %s |\n" "$TODAY" "$SUMMARY" >> "$DOC_PATH"

  COMMIT_MSG="docs: create $FEATURE_NAME.md"
else
  # ── Update existing doc ───────────────────────────────────────────────────

  # Update Last Updated date
  sed -i "s/\*\*Last Updated:\*\* [0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}/**Last Updated:** $TODAY/" "$DOC_PATH"

  # Append changelog row
  printf "| %s | %s |\n" "$TODAY" "$SUMMARY" >> "$DOC_PATH"

  COMMIT_MSG="docs: update $FEATURE_NAME.md changelog"
fi

# Stage only the doc file. If other files are already staged, stash them
# temporarily so the hook commit contains only the doc update.
OTHER_STAGED="$(git -C "$REPO_ROOT" diff --cached --name-only 2>/dev/null \
  | grep -v "^docs/features/${FEATURE_NAME}\.md$" || true)"

STASHED=0
if [ -n "$OTHER_STAGED" ]; then
  git -C "$REPO_ROOT" stash push --staged --message "hook: preserve staged files" 2>/dev/null && STASHED=1
fi

git -C "$REPO_ROOT" add "$DOC_PATH"

if ! git -C "$REPO_ROOT" diff --cached --quiet; then
  git -C "$REPO_ROOT" commit -m "$COMMIT_MSG"
  echo "[post-task] Committed: $COMMIT_MSG"
fi

# Restore any previously staged files
if [ "$STASHED" -eq 1 ]; then
  git -C "$REPO_ROOT" stash pop 2>/dev/null || true
fi
