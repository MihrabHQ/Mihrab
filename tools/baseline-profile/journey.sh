#!/bin/bash
# journey.sh — walks the paths the Baseline Profile should cover: cold starts, every tab,
# the reader, the settings pages, and the same in the other layout (Full and Minimal are
# two navigators), then back to the layout it began in.
#
# For a device that RECORDS profiles — an emulator, or a phone whose `dalvik.vm.usejit` is
# true — running the `-PprofileBuild` APK, onboarded, in English. Set ANDROID_SERIAL.
# Every touch first checks that Mihrab is in front and stops if it is not. Nothing is
# tapped that changes what is saved: no tasbih count, no surah opened other than
# "Continue reading", and a page turned forward is turned back.
export PATH=$PATH:~/Library/Android/sdk/platform-tools
[ -z "$ANDROID_SERIAL" ] && { echo "set ANDROID_SERIAL"; exit 2; }
P=com.prayer_times
read W H <<<"$(adb shell wm size | tail -1 | sed 's/.*: //; s/x/ /')"
X() { echo $(( $1 * W / 1280 )); }; Y() { echo $(( $1 * H / 2856 )); }
infocus() { adb shell dumpsys window | grep -m1 mCurrentFocus | grep -q "$P/"; }
guard() { infocus || { echo "ABORT: Mihrab is not in front"; exit 3; }; }
t() { guard; adb shell input tap "$1" "$2"; }
sw() { guard; adb shell input swipe $(X $1) $(Y $2) $(X $3) $(Y $4) "${5:-200}"; }
back() { guard; adb shell input keyevent KEYCODE_BACK; }
open() { adb shell am start -n $P/.MainActivity >/dev/null 2>&1; sleep "${1:-2}"; guard; }
# The dump fails while the page is animating ("could not get idle state"); it is asked
# again rather than an old one read.
dumpui() { for try in 1 2 3 4 5 6; do adb shell rm -f /sdcard/u.xml; adb shell uiautomator dump /sdcard/u.xml 2>&1 | grep -q "dumped to" && break; sleep 0.7; done; adb shell cat /sdcard/u.xml 2>/dev/null; }
# at <label> [bar]: the centre of the node so named (a trailing * matches a prefix) — in the
# page, or with `bar` in the tab row at the foot.
at() { dumpui | python3 -c "
import sys,re,html
want,bar,H=sys.argv[1],sys.argv[2]=='bar',int(sys.argv[3]); x=sys.stdin.read()
for n in re.findall(r'<node[^>]*>',x):
    t=html.unescape(re.search(r'text=\"([^\"]*)\"',n).group(1)); d=html.unescape(re.search(r'content-desc=\"([^\"]*)\"',n).group(1))
    a,b,c,e=map(int,re.search(r'bounds=\"\[(\d+),(\d+)\]\[(\d+),(\d+)\]\"',n).groups())
    hit=want in (t,d) or (want.endswith('*') and d.startswith(want[:-1]))
    where=(b>H*0.92) if bar else (b>H*0.07 and e<H*0.945)
    if hit and where and e>b and c>a: print((a+c)//2,(b+e)//2); break
" "$1" "${2:-page}" "$H"; }
tapon() { p=$(at "$1"); [ -z "$p" ] && { echo "ABORT: no '$1' on screen"; exit 5; }; t $p; }
has() { [ -n "$(at "$1")" ]; }
tab() { p=$(at "$1" bar); [ -z "$p" ] && { echo "ABORT: no tab '$1'"; exit 5; }; t $p; sleep "${2:-1.5}"; }
scroll() { sw 640 2000 640 900 300; sleep 0.8; sw 640 900 640 2000 300; sleep 0.8; }
cold() { adb shell am force-stop $P; sleep 1; open 6; }
minimal() { ! dumpui | grep -q 'text="Tasbih"'; }   # the full bar writes its tabs' names

pages() {
  echo " today"; tab Today; scroll; scroll
  echo " quran"; tab Quran 2.5; scroll
  if has "Continue reading*"; then
    tapon "Continue reading*"; sleep 3.5
    sw 300 1400 1000 1400 150; sleep 1.2; sw 300 1400 1000 1400 150; sleep 1.2
    sw 1000 1400 300 1400 150; sleep 1.2; sw 1000 1400 300 1400 150; sleep 1.2
    back; sleep 1.5
  fi
  echo " tasbih, duas, log"; tab Tasbih 2; tab Duas 2; scroll; tab Log 3; scroll
  echo " settings"; tab Settings
  for page in "Prayer times" "Notifications" "Widgets" "Quran" "About"; do tapon "$page"; sleep 2; scroll; back; sleep 1.2; done
}
swipes() {
  echo " swipes, sheet"; tab Today
  for i in 1 2 3 4 5; do sw 1000 1500 250 1500 120; sleep 1.2; done
  for i in 1 2 3 4 5; do sw 250 1500 1000 1500 120; sleep 1.2; done
  sw 640 1900 640 1300 220; sleep 2; sw 640 1750 640 2500 250; sleep 1.5
}
layout() {   # layout Full|Minimal — through Settings, with the restart it asks for
  echo "to $1"; tab Settings; tapon "Appearance & language"; sleep 1.8
  n=0; until has "$1" || [ $n -ge 4 ]; do sw 640 2000 640 1400 400; sleep 1.2; n=$((n+1)); done
  tapon "$1"; sleep 1.5; tapon "Restart"; sleep 8; infocus || open 6
}

echo "cold starts"; cold; cold; cold
if minimal; then began=Minimal other=Full; else began=Full other=Minimal; fi
echo "in $began"; [ $began = Minimal ] && swipes; pages
layout $other; [ $other = Minimal ] && swipes; pages; cold
layout $began; cold; cold
adb shell rm -f /sdcard/u.xml
echo "JOURNEY DONE"
