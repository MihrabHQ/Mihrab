#!/usr/bin/env python3
"""
Does this APK keep the promises a hardened Android makes it keep?

    scripts/check-apk-hardening.py <app.apk> [--aapt2 <path>]

GrapheneOS (and, more quietly, every recent Android) restricts what an app
may do with code and memory. An app that quietly depends on the opposite
works on the phone it was tested on and breaks — or has to ask its users
to switch a protection off — on a hardened one. Each check below is one
such promise, read off the artifact, because a dependency update changes
none of this in the build log:

  no dynamic code   no class in the dex names a class loader that loads
                    code from a file or from memory (GrapheneOS: "Dynamic
                    code loading via storage / via memory"), and the
                    native libraries are used from inside the APK, never
                    unpacked (`extractNativeLibs=false`);
  W^X               no native library has a segment both writable and
                    executable, or an executable stack — the mark of a
                    JIT or of hand-rolled trampolines;
  16 KB pages       every loadable segment of every 64-bit library is
                    aligned for 16 KB pages;
  memory tagging    the manifest asks for hardware memory tagging (ARM
                    MTE), so a phone that has it — GrapheneOS on a Pixel 8
                    or later — tags this app's native heap.

Exit 0 when every promise holds, 1 with the list when one does not.
Pure Python but for `aapt2` (the manifest is binary XML); without it the
manifest checks are reported as skipped, not passed.
"""
import glob
import os
import re
import struct
import subprocess
import sys
import zipfile

LOADERS = (
    b'Ldalvik/system/DexClassLoader;',
    b'Ldalvik/system/InMemoryDexClassLoader;',
    b'Ldalvik/system/PathClassLoader;',
    b'Ldalvik/system/DelegateLastClassLoader;',
    b'Ldalvik/system/DexFile;',
)
PT_LOAD, PT_GNU_STACK = 1, 0x6474E551
PF_X, PF_W = 1, 2
PAGE_16K = 0x4000


def elf_segments(data):
    """(type, flags, align) of every program header of a 64-bit little-endian ELF, or None."""
    if data[:4] != b'\x7fELF' or data[4] != 2 or data[5] != 1:
        return None
    phoff, = struct.unpack_from('<Q', data, 0x20)
    phentsize, phnum = struct.unpack_from('<HH', data, 0x36)
    out = []
    for i in range(phnum):
        p_type, p_flags = struct.unpack_from('<II', data, phoff + i * phentsize)
        p_align, = struct.unpack_from('<Q', data, phoff + i * phentsize + 0x30)
        out.append((p_type, p_flags, p_align))
    return out


def check(apk, aapt2=None):
    """The broken promises, as sentences; and what could not be looked at."""
    broken, skipped = [], []
    with zipfile.ZipFile(apk) as z:
        names = z.namelist()
        dexes = [n for n in names if re.fullmatch(r'classes\d*\.dex', n)]
        if not dexes:
            broken.append('no classes*.dex could be read: nothing was checked for dynamic code')
        for n in dexes:
            data = z.read(n)
            for loader in LOADERS:
                if loader in data:
                    broken.append(f'{n} names {loader.decode()[1:-1].replace("/", ".")}: code loaded at run time')
        libs = [n for n in names if n.startswith('lib/arm64-v8a/') and n.endswith('.so')]
        if not libs:
            broken.append('no lib/arm64-v8a/*.so: the 64-bit libraries could not be checked')
        for n in libs:
            info = z.getinfo(n)
            if info.compress_type != zipfile.ZIP_STORED:
                broken.append(f'{n} is compressed in the APK: it would be unpacked to storage and loaded from there')
            segs = elf_segments(z.read(n))
            if segs is None:
                broken.append(f'{n} is not a 64-bit ELF')
                continue
            for p_type, p_flags, p_align in segs:
                if p_type == PT_LOAD and p_flags & PF_W and p_flags & PF_X:
                    broken.append(f'{n} has a segment both writable and executable')
                if p_type == PT_LOAD and p_align < PAGE_16K:
                    broken.append(f'{n} has a segment aligned to {p_align:#x}, under 16 KB')
                if p_type == PT_GNU_STACK and p_flags & PF_X:
                    broken.append(f'{n} asks for an executable stack')
            if not any(t == PT_GNU_STACK for t, _, _ in segs):
                broken.append(f'{n} does not mark its stack non-executable')

    aapt2 = aapt2 or next(iter(sorted(glob.glob(os.path.expanduser('~/Library/Android/sdk/build-tools/*/aapt2')), reverse=True)), None)
    manifest = None
    if aapt2 and os.path.exists(aapt2):
        r = subprocess.run([aapt2, 'dump', 'xmltree', '--file', 'AndroidManifest.xml', apk], capture_output=True, text=True)
        manifest = r.stdout if r.returncode == 0 else None
    if manifest is None:
        skipped.append('the manifest (extractNativeLibs, memtagMode): aapt2 not found or could not read it')
    else:
        if not re.search(r'extractNativeLibs\(0x[0-9a-f]+\)=false', manifest):
            broken.append('the manifest does not say extractNativeLibs=false')
        tag = re.search(r'memtagMode\(0x[0-9a-f]+\)=(\S+)', manifest)
        # 1 = async, 2 = sync. Absent, "default" (-1) and "off" (0) all leave the heap untagged.
        if not tag or tag.group(1) not in ('1', '2'):
            broken.append('the manifest does not ask for memory tagging (android:memtagMode async or sync)')
        if re.search(r'usesCleartextTraffic\(0x[0-9a-f]+\)=true', manifest):
            broken.append('the manifest allows cleartext traffic')
    return broken, skipped


if __name__ == '__main__':
    args = sys.argv[1:]
    aapt = None
    if '--aapt2' in args:
        i = args.index('--aapt2')
        aapt = args[i + 1]
        del args[i:i + 2]
    if len(args) != 1:
        sys.exit(__doc__)
    broken, skipped = check(args[0], aapt)
    for s in skipped:
        print(f'skipped: {s}')
    for b in broken:
        print(f'BROKEN: {b}')
    if not broken:
        print('hardening: no dynamic code, W^X, 16 KB pages' + ('' if skipped else ', memory tagging asked for'))
    sys.exit(1 if broken else 0)
