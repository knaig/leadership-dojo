#!/bin/bash
# Push to remote, deploy worker to Railway, notify Slack
# Usage: ./scripts/deploy.sh

set -e

SLACK_WEBHOOK="${SLACK_WEBHOOK:-}"
BRANCH=$(git rev-parse --abbrev-ref HEAD)
COMMIT=$(git log -1 --pretty=format:"%h %s")

echo "Pushing to $BRANCH..."
git push

if [ -n "$SLACK_WEBHOOK" ]; then
  curl -s -X POST "$SLACK_WEBHOOK" \
    -H 'Content-type: application/json' \
    -d "{\"text\":\"*Pushed to \`${BRANCH}\`* — ${COMMIT}\"}" \
    > /dev/null 2>&1
fi

echo "Deploying worker to Railway..."
DEPLOY_OUTPUT=$(railway up -d 2>&1) || true

if echo "$DEPLOY_OUTPUT" | grep -qi "Build Logs\|Uploading"; then
  echo "Railway build started. Vercel auto-deploys from push."
  sleep 5
  for i in $(seq 1 30); do
    STATUS=$(railway service status 2>&1 | grep Status | awk '{print $2}')
    if [ "$STATUS" = "SUCCESS" ]; then
      if [ -n "$SLACK_WEBHOOK" ]; then
        curl -s -X POST "$SLACK_WEBHOOK" \
          -H 'Content-type: application/json' \
          -d "{\"text\":\"*Deployed* — \`${BRANCH}\` is live (Vercel + Railway)\"}" \
          > /dev/null 2>&1
      fi
      echo "Deployed."
      exit 0
    elif [ "$STATUS" = "FAILED" ]; then
      if [ -n "$SLACK_WEBHOOK" ]; then
        curl -s -X POST "$SLACK_WEBHOOK" \
          -H 'Content-type: application/json' \
          -d "{\"text\":\"*Railway deploy failed* — check logs\n\`${COMMIT}\`\"}" \
          > /dev/null 2>&1
      fi
      echo "Railway deploy failed."
      exit 1
    fi
    sleep 10
  done
  echo "Deploy timed out. Check Railway dashboard."
else
  if [ -n "$SLACK_WEBHOOK" ]; then
    curl -s -X POST "$SLACK_WEBHOOK" \
      -H 'Content-type: application/json' \
      -d "{\"text\":\"*Deploy may have failed* — check Railway\n\`${COMMIT}\`\"}" \
      > /dev/null 2>&1
  fi
  echo "Deploy failed to start. Check Railway."
fi
