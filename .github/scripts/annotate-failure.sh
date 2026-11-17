#!/usr/bin/env bash
# Usage: annotate-failure.sh <log-file> <title>
# Publishes the first failing lines of a test log as a GitHub Actions error annotation. Annotations are readable on the
# run page and through the public API without signing in, unlike the raw logs.
log="$1"
title="$2"
# from the first Jest failure marker (a bullet) onwards; fall back to the head of the log
body=$(awk '/^\s*\xE2\x97\x8F/{f=1} f' "$log" | head -60)
[ -z "$body" ] && body=$(head -60 "$log")
# GitHub workflow commands need %, CR and LF escaped
body=${body//'%'/'%25'}
body=${body//$'\r'/}
body=${body//$'\n'/'%0A'}
echo "::error title=${title}::${body}"
