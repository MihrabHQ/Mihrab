#!/bin/sh
# Cold-start timings on a phone: N launches, one line each.
#   tools/startup-trace/cold.sh [serial] [count]
# Force-stops the app, waits for any widget-started process to settle,
# force-stops again, launches MainActivity with `am start -W` and reads
# the [boot]/[boot-native] lines. Columns: am start's TotalTime, the
# native marks, js0-nactivity (bundle load to the first JS line) and the
# JS marks.
S=${1:-5A250DLCH00166}
N=${2:-5}
i=0
while [ $i -lt $N ]; do
  i=$((i+1))
  adb -s "$S" shell am force-stop com.prayer_times
  sleep 3
  adb -s "$S" shell am force-stop com.prayer_times
  sleep 1
  adb -s "$S" logcat -c
  total=$(adb -s "$S" shell am start -W -n com.prayer_times/.MainActivity 2>/dev/null | grep TotalTime | tr -dc '0-9')
  sleep 5
  adb -s "$S" logcat -d | grep -E "\[boot\] js0|\[boot-native\]" | sed 's/^.*ReactNativeJS: //' | python3 -c "
import sys,re
d={}
for l in sys.stdin:
    for k,v in re.findall(r'([\w-]+)=(\d+)',l): d[k]=int(v)
g=lambda k: d.get(k,'-')
print('total',$total,'napp',g('napp'),'nrn',g('nrn'),'nactivity',g('nactivity'),'js0-nactivity',d['js0']-d['proc0']-d['nactivity'] if 'js0' in d and 'nactivity' in d else '-','app',g('app'),'settings',g('settings'),'home',g('home'),'commit',g('commit'),'raf',g('raf'),'paint',g('paint'))"
done
