#!/bin/bash
# 把 ~/Downloads 里 Grok 页面下载的镜头（文件名 grok-E02-03-s1.mp4）收进 <work>/<dir>/E02-03/s1.mp4。
# 已有同名镜头时旧的改名为 s1.old.mp4（只留一版旧的），并记为一次返工。
# 每收一个镜头往 <work>/_logs/grok-gens.tsv 追加一行（时间、镜头、秒数、是否返工），复盘时直接统计。
# 用法：grok-ingest.sh <作品目录> [video]
set -e
WORK="$(cd "$1" && pwd)"; W="$WORK/${2:-video}"
LOG="$WORK/_logs/grok-gens.tsv"; mkdir -p "$WORK/_logs"
[ -f "$LOG" ] || printf 'at\tshot\tseconds\trework\n' > "$LOG"
shopt -s nullglob
for f in ~/Downloads/grok-E[0-9][0-9]-[0-9][0-9]-s[0-9].mp4; do
  b=$(basename "$f" .mp4); seg=${b:5:6}; shot=${b:12}
  [ "$(stat -f%z "$f")" -gt 100000 ] || { echo "✗ $b 太小（下载被打断？），跳过"; continue; }
  mkdir -p "$W/$seg"
  rework=0
  [ -f "$W/$seg/$shot.mp4" ] && { mv "$W/$seg/$shot.mp4" "$W/$seg/$shot.old.mp4"; rework=1; }
  mv "$f" "$W/$seg/$shot.mp4"
  sec=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$W/$seg/$shot.mp4" | cut -d. -f1)
  printf '%s\t%s/%s\t%s\t%s\n' "$(date +%FT%T)" "$seg" "$shot" "$sec" "$rework" >> "$LOG"
  echo "✓ $seg/$shot${rework:+$( [ $rework = 1 ] && echo '（返工）')}"
done
