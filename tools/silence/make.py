"""
The silent tracks the memorisation drill rests on.

Usage:  python3 tools/silence/make.py

"Pause between repeats" is silence played, not a paused player: a paused
app is one iOS suspends and Android stops waking, so a rest that waited on
a timer stopped the drill with the screen off. The queue puts silent
tracks after each ayah instead (src/quran/audio/rest.ts), composed from
these lengths, largest first.

Digital silence, MP3 like the recitations (44.1 kHz mono, 32 kb/s CBR), so
the player does not reopen its audio output at every rest. Needs ffmpeg
with libmp3lame.

Output: assets/audio/silence-<ms>ms.mp3
"""
import os
import subprocess

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OUT = os.path.join(ROOT, 'assets', 'audio')

# Keep in step with REST_PIECES in src/quran/audio/rest.ts.
LENGTHS_MS = [500, 1000, 2000, 4000, 8000]


def main():
    os.makedirs(OUT, exist_ok=True)
    for ms in LENGTHS_MS:
        path = os.path.join(OUT, f'silence-{ms}ms.mp3')
        subprocess.run(
            ['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi',
             '-i', 'anullsrc=r=44100:cl=mono', '-t', f'{ms / 1000:.3f}',
             '-c:a', 'libmp3lame', '-b:a', '32k', '-map_metadata', '-1', path],
            check=True)
        print(path, os.path.getsize(path))


if __name__ == '__main__':
    main()
