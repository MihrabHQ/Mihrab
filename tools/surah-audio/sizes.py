#!/usr/bin/env python3
"""
Add each surah file's exact size to tables written before align.py did.

Asks the server for every file's Content-Length (no audio is downloaded),
checks the sizes add up to the table's own `bytes` — measured when the
audio was decoded — and writes `z` (big-endian uint32, base64) and v2.
A table whose sizes do not add up is left alone and reported: the files
on the server are no longer the ones it was measured on.

Usage: sizes.py [<id> ...]   (all tables when none are given)
"""
import concurrent.futures as cf
import json
import os
import re
import subprocess
import sys

from align import OUT, server_of, uint32, UA


def size_of(url):
    for _ in range(3):
        r = subprocess.run(["curl", "-sIL", "-A", UA, "--max-time", "60", url], capture_output=True)
        m = re.findall(rb"(?i)content-length: (\d+)", r.stdout)
        if r.returncode == 0 and m:
            return int(m[-1])
    raise RuntimeError(f"no size: {url}")


def run(rid):
    path = os.path.join(OUT, f"{rid}.json")
    doc = json.load(open(path))
    server, _ = server_of(doc["src"])
    with cf.ThreadPoolExecutor(16) as ex:
        sizes = list(ex.map(size_of, [f"{server}{s:03d}.mp3" for s in range(1, 115)]))
    if sum(sizes) != doc["bytes"]:
        print(f"{rid}: sizes add up to {sum(sizes)}, the table says {doc['bytes']} — left alone")
        return False
    doc["z"] = uint32(sizes)
    doc["v"] = 2
    with open(path, "w") as f:
        json.dump(doc, f, separators=(",", ":"))
    print(f"{rid}: ok")
    return True


if __name__ == "__main__":
    ids = sys.argv[1:] or sorted(f[:-5] for f in os.listdir(OUT) if f.endswith(".json"))
    ok = all([run(i) for i in ids])
    sys.exit(0 if ok else 1)
