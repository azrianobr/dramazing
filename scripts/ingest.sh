#!/bin/bash
# 把下载下来的镜头收进 <作品目录>/<dir>/E02-03/s1.mp4。和用哪个视频工具无关：
# 文件名里带「E02-03-s1」就认，比如 grok-E02-03-s1.mp4、E02-03-s1.mp4、kling_E02-03-s1 (1).mp4。
# 已有同名镜头时旧的改名为 s1.old.mp4（只留一版旧的），并记为一次返工。
# 每收一个镜头往 <作品目录>/_logs/gens.tsv 追加一行（时间、镜头、秒数、是否返工），复盘时直接统计。
# 用法：ingest.sh <作品目录> [下载目录，默认 ~/Downloads] [dir，默认 video]
set -e
WORK="$(cd "$1" && pwd)"; FROM="${2:-$HOME/Downloads}"; W="$WORK/${3:-video}"
LOG="$WORK/_logs/gens.tsv"; mkdir -p "$WORK/_logs"
# 界面语言：DRAMAZING_LANG > project.json 的 language > 中文
UI="${DRAMAZING_LANG:-$(python3 -c "import json,sys;print(json.load(open(sys.argv[1])).get('language','zh'))" "$WORK/project.json" 2>/dev/null || echo zh)}"
case "$UI" in en) SMALL='too small (interrupted download?), skipped'; REDO=' (rework)';; ko) SMALL='너무 작음(다운로드 중단?), 건너뜀'; REDO=' (재작업)';; *) SMALL='太小（下载被打断？），跳过'; REDO='（返工）';; esac
[ -f "$LOG" ] || printf 'at\tshot\tseconds\trework\n' > "$LOG"
shopt -s nullglob
for f in "$FROM"/*E[0-9][0-9]-[0-9][0-9]-s[0-9]*.mp4; do
  id=$(basename "$f" | grep -oE 'E[0-9]{2}-[0-9]{2}-s[0-9]+' | head -1)
  seg=${id%-s*}; shot=s${id##*-s}
  [ "$(wc -c < "$f")" -gt 100000 ] || { echo "✗ $(basename "$f") $SMALL"; continue; }
  mkdir -p "$W/$seg"
  rework=0
  [ -f "$W/$seg/$shot.mp4" ] && { mv "$W/$seg/$shot.mp4" "$W/$seg/$shot.old.mp4"; rework=1; }
  mv "$f" "$W/$seg/$shot.mp4"
  sec=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$W/$seg/$shot.mp4" | cut -d. -f1)
  printf '%s\t%s/%s\t%s\t%s\n' "$(date +%FT%T)" "$seg" "$shot" "$sec" "$rework" >> "$LOG"
  [ $rework = 1 ] && echo "✓ ${seg}/${shot}${REDO}" || echo "✓ ${seg}/${shot}"
done
