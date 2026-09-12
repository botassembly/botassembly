#!/bin/sh
# Brand review loop. Build, serve dist, capture every page in both modes and widths.
# Usage: sh docs/review.sh [output-dir]
set -eu
OUT=${1:-/tmp/brand-review}
URL=${URL:-http://localhost:8899}
mkdir -p "$OUT"
for page in "home:/" "first-assembly:/guides/first-assembly/" "graph:/specification/graph/" "inspection:/reference/inspection/" "format-and-runtime:/format-and-runtime/" "blog:/blog/"; do
	name=${page%%:*}
	path=${page#*:}
	shot-scraper shot "$URL$path" -o "$OUT/$name-desktop-light.png" --width 1440 --wait 1500
	shot-scraper shot "$URL$path" -o "$OUT/$name-phone-light.png" --width 400 --wait 1500
	shot-scraper shot "$URL$path" -o "$OUT/$name-desktop-dark.png" --width 1440 --wait 1500 \
		-j "document.documentElement.dataset.theme='dark'"
	shot-scraper shot "$URL$path" -o "$OUT/$name-phone-dark.png" --width 400 --wait 1500 \
		-j "document.documentElement.dataset.theme='dark'"
done
