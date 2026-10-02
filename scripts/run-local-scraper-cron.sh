#!/bin/bash
set -euo pipefail

cd /Users/idoz/workspace/yad2-scraper

output_file="$(mktemp)"
trap 'rm -f "$output_file"' EXIT

if ! /usr/local/bin/node scraper.js >"$output_file" 2>&1; then
  echo "yad2-scraper local cron failed"
  echo
  cat "$output_file"
  exit 1
fi

python3 - <<'PY' "$output_file"
import json
import pathlib
import re
import sys
from collections import defaultdict
from datetime import datetime, timezone

text = pathlib.Path(sys.argv[1]).read_text(errors='replace')
lines = [line for line in text.splitlines() if line.strip()]

topic_summaries = {}
findings_by_topic = defaultdict(list)
notion_sync_by_topic = {}
warnings = []

for line in lines:
    if line.startswith('TOPIC_SUMMARY '):
        try:
            payload = json.loads(line[len('TOPIC_SUMMARY '):])
            topic_summaries[payload.get('topic') or 'Unknown'] = payload
        except json.JSONDecodeError:
            pass
        continue

    if line.startswith('NEW_LISTING '):
        try:
            payload = json.loads(line[len('NEW_LISTING '):])
            findings_by_topic[payload.get('topic') or 'Unknown'].append(payload)
        except json.JSONDecodeError:
            pass
        continue

    if line.startswith('NOTION_SYNC '):
        try:
            payload = json.loads(line[len('NOTION_SYNC '):])
            notion_sync_by_topic[payload.get('topic') or 'Unknown'] = payload
        except json.JSONDecodeError:
            pass
        continue

    if 'Skipping ' in line or 'Error scanning ' in line or 'Bot protection hit' in line:
        warnings.append(line)

report_topics = []
all_topics = set(topic_summaries) | set(findings_by_topic)
for topic in sorted(all_topics):
    summary = topic_summaries.get(topic, {})
    findings = findings_by_topic.get(topic, [])
    if not findings and not summary.get('new'):
        continue
    report_topics.append({
        'topic': topic,
        'telegramTarget': summary.get('telegramTarget', ''),
        'notionDatabaseId': summary.get('notionDatabaseId', ''),
        'scanned': summary.get('total'),
        'new': summary.get('new', len(findings)),
        'listings': findings,
        'notionSync': notion_sync_by_topic.get(topic),
    })

report = {
    'generatedAt': datetime.now(timezone.utc).isoformat(),
    'topics': report_topics,
    'warnings': warnings,
}

if report_topics or warnings:
    print(json.dumps(report, ensure_ascii=False, indent=2))
PY
