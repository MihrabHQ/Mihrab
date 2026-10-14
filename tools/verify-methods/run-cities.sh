#!/bin/bash
# Run the Congress model on the Swedish cities whose Diyanet coordinates have been fitted (fit-coords.py).
cd "$(dirname "$0")"
while read -r slug lat lon; do
  [ -z "$slug" ] && continue
  printf '%-12s %-8s %-8s ' "$slug" "$lat" "$lon"
  python3 congress-model.py "$slug" "$lat" "$lon" --as-year 2026 "$@" | grep -E '^exact' | sed 's/exact share, all days: //' | cut -c1-150
done <<'EOF'
malmo 55.6 13.0
goteborg 57.7167 12.0
linkoping 58.5 15.6167
stockholm 59.3333 18.0333
vasteras 59.6167 16.55
norrtalje 59.7667 18.7
uppsala 59.8667 17.6333
sala 59.9333 16.5833
fagersta 60.0 15.8
avesta 60.15 16.1833
tierp 60.35 17.5167
borlange 60.4833 15.4333
gavle 60.6833 17.1167
mora 61.0167 14.55
soderhamn 61.3167 17.0833
bollnas 61.35 16.3833
hudiksvall 61.7333 17.1
sundsvall 62.4 17.3167
harnosand 62.6333 17.9333
ostersund 63.1833 14.65
ornskoldsvik 63.3 18.7167
umea 63.8333 20.2333
skelleftea 64.75 20.95
pitea 65.3167 21.5167
lulea 65.6 22.1667
boden 65.8333 21.7
EOF
