#!/usr/bin/env python3
"""Write the App Store listing from fastlane/metadata/ios/<locale>/.

    ./scripts/appstore-metadata.py                 # apply, if a version is editable
    ./scripts/appstore-metadata.py --dry-run       # say what would change
    ./scripts/appstore-metadata.py --create 2.27.1 # make that version first

WHAT IT WRITES, per locale (en-US, sv, ar-SA):

    name, subtitle           the app info — what search indexes first
    description, keywords,   the version — frozen once it is submitted
    promotional text,
    what's new, URLs

The words come from the files, and the files come from
branding/IDENTITY.md; __tests__/storeListings.test.ts holds them to Apple's
limits (keywords in BYTES, which is what an Arabic keyword costs) and to
guideline 2.3.10 (no other platform named). What's new is the Android
changelog for this build's versionCode, in the same three languages the
release writes anyway. A locale the listing does not have yet is created.

WHY. The App Store listing was the last thing still describing the app
Mihrab was a year ago: a "Prayer Times" description that listed three
languages and said the app needs the internet. It had been edited by hand
in App Store Connect, which is exactly how a listing drifts.

WHEN IT CAN RUN. Version metadata is frozen while a version is in review
or on sale. This refuses rather than fighting Apple for it: run it after
the release uploads its build and before you press Submit.
"""
import importlib.util
import json
import pathlib
import re
import sys
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("xc", ROOT / "scripts" / "xcode-cloud.py")
xc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(xc)

BUNDLE_ID = "com.hassan.prayerapp"
IOS = ROOT / "fastlane" / "metadata" / "ios"
ANDROID = ROOT / "fastlane" / "metadata" / "android"
# App Store locale -> the Android directory whose changelog is "What's New".
LOCALES = {"en-US": "en-US", "sv": "sv-SE", "ar-SA": "ar"}
MARKETING_URL = "https://mihrab.elghamri.se/"

EDITABLE = {
    "PREPARE_FOR_SUBMISSION",
    "DEVELOPER_REJECTED",
    "REJECTED",
    "METADATA_REJECTED",
    "INVALID_BINARY",
}


def send(method: str, path: str, body: dict) -> dict:
    req = urllib.request.Request(
        xc.BASE + path,
        data=json.dumps(body).encode(),
        headers={"Authorization": "Bearer " + xc.token(),
                 "Content-Type": "application/json"},
        method=method,
    )
    try:
        with urllib.request.urlopen(req, context=xc.CTX) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as err:
        sys.exit(f"{method} {path}: HTTP {err.code}: {err.read().decode()[:800]}")


def text(locale: str, field: str) -> str:
    return (IOS / locale / f"{field}.txt").read_text(encoding="utf-8").strip()


def version_code() -> str:
    gradle = (ROOT / "android" / "app" / "build.gradle").read_text()
    return re.search(r"versionCode\s+(\d+)", gradle).group(1)


def whats_new(locale: str) -> str | None:
    f = ANDROID / LOCALES[locale] / "changelogs" / f"{version_code()}.txt"
    return f.read_text(encoding="utf-8").strip() if f.exists() else None


def main(argv: list[str]) -> None:
    dry = "--dry-run" in argv
    create = argv[argv.index("--create") + 1] if "--create" in argv else None

    app = next((a for a in xc.call("/v1/apps?limit=10")["data"]
                if a["attributes"].get("bundleId") == BUNDLE_ID), None)
    if app is None:
        sys.exit(f"no app with bundle id {BUNDLE_ID}")
    aid = app["id"]

    versions = xc.call(f"/v1/apps/{aid}/appStoreVersions?limit=5")["data"]
    ver = next((v for v in versions
                if v["attributes"].get("appStoreState") in EDITABLE
                and v["attributes"].get("platform") == "IOS"), None)
    if ver is None and create:
        if dry:
            print(f"would create version {create}")
        else:
            ver = send("POST", "/v1/appStoreVersions", {"data": {
                "type": "appStoreVersions",
                "attributes": {"platform": "IOS", "versionString": create},
                "relationships": {"app": {"data": {"type": "apps", "id": aid}}},
            }})["data"]
            print(f"created version {create}")
    info = next((i for i in xc.call(f"/v1/apps/{aid}/appInfos?limit=5")["data"]
                 if i["attributes"].get("state") in EDITABLE
                 or i["attributes"].get("appStoreState") in EDITABLE), None)
    if ver is None or info is None:
        states = ", ".join(v["attributes"].get("appStoreState") or "?" for v in versions[:3])
        print(f"nothing to edit — the listing is frozen. Versions: {states}")
        print("Run this after the release uploads its build, or pass --create X.Y.Z.")
        raise SystemExit(3)

    print(f"version {ver['attributes']['versionString']} "
          f"({ver['attributes'].get('appStoreState')}), What's New from "
          f"changelogs/{version_code()}.txt")

    info_locs = {l["attributes"]["locale"]: l for l in
                 xc.call(f"/v1/appInfos/{info['id']}/appInfoLocalizations?limit=50")["data"]}
    ver_locs = {l["attributes"]["locale"]: l for l in
                xc.call(f"/v1/appStoreVersions/{ver['id']}/appStoreVersionLocalizations?limit=50")["data"]}
    base_info = info_locs.get("en-US", {}).get("attributes", {})
    base_ver = ver_locs.get("en-US", {}).get("attributes", {})

    for loc in LOCALES:
        want_info = {"name": text(loc, "name"), "subtitle": text(loc, "subtitle")}
        if base_info.get("privacyPolicyUrl"):
            want_info["privacyPolicyUrl"] = base_info["privacyPolicyUrl"]
        want_ver = {
            "description": text(loc, "description"),
            "keywords": text(loc, "keywords"),
            "promotionalText": text(loc, "promotional_text"),
            "marketingUrl": MARKETING_URL,
        }
        if base_ver.get("supportUrl"):
            want_ver["supportUrl"] = base_ver["supportUrl"]
        wn = whats_new(loc)
        if wn:
            want_ver["whatsNew"] = wn

        for kind, have, want, parent in (
            ("appInfoLocalizations", info_locs.get(loc), want_info, ("appInfo", "appInfos", info["id"])),
            ("appStoreVersionLocalizations", ver_locs.get(loc), want_ver,
             ("appStoreVersion", "appStoreVersions", ver["id"])),
        ):
            if have is None:
                print(f"  {loc} {kind}: new locale")
                if not dry:
                    send("POST", f"/v1/{kind}", {"data": {
                        "type": kind,
                        "attributes": dict(want, locale=loc),
                        "relationships": {parent[0]: {"data": {"type": parent[1], "id": parent[2]}}},
                    }})
                continue
            diff = {k: v for k, v in want.items() if (have["attributes"].get(k) or "") != v}
            for k in diff:
                was = (have["attributes"].get(k) or "").replace("\n", " ")
                print(f"  {loc} {k}: {was[:60]!r} -> {want[k].replace(chr(10), ' ')[:60]!r}")
            if diff and not dry:
                send("PATCH", f"/v1/{kind}/{have['id']}", {"data": {
                    "type": kind, "id": have["id"], "attributes": diff}})
            if not diff:
                print(f"  {loc} {kind}: already correct")

    print("\n--dry-run: nothing written." if dry else
          "\nwritten. It shows on the App Store when this version is approved.")


if __name__ == "__main__":
    main(sys.argv[1:])
