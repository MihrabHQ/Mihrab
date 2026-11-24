# The Arabic the check reads: the bundled Tanzil Uthmani text, one line an ayah.
# python3 tools/transliteration-check/prep.py <work dir>
import json, sys, os
root = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'quran', 'surahs')
out = {}
for s in range(1, 115):
    for i, a in enumerate(json.load(open(os.path.join(root, f'{s:03d}.json')))['arabic']):
        out[f'{s}:{i + 1}'] = a
assert len(out) == 6236
json.dump(out, open(os.path.join(sys.argv[1], 'arabic.json'), 'w'), ensure_ascii=False)
