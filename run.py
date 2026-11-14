#!/usr/bin/env python3
"""One full update round, used by the GitHub Actions schedule (and runnable locally).
Usage: python3 run.py SITE_DIR
 1. downloads the previous round from the live site (snapshot, world, history, translation cache)
 2. runs collector.py (Israel + region) and world.py (world + cyber)
 3. translates new foreign headlines to Hebrew with a free public endpoint, keeping a cache
 4. writes SITE_DIR/data/*.json next to a copy of index.html
Nothing here needs a key, an account or Claude.
"""
import json, os, re, shutil, subprocess, sys, time, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "_site"))
BASE = os.environ.get("SITE_URL", "https://kimbirdoors.github.io/situation-room/").rstrip("/") + "/"
WORK = os.path.join(SITE, "..", "_work")
PREV, OUT, DATA = os.path.join(WORK, "prev"), os.path.join(WORK, "out"), os.path.join(SITE, "data")
UA = {"User-Agent": "Mozilla/5.0 (situation-room updater)"}
HEB = re.compile(r"[֐-׿]")
HIST_DAYS, HIST_MAX, CACHE_MAX = 10, 1200, 4000

def fetch_prev(name):
    path = os.path.join(PREV, name)
    try:
        with urllib.request.urlopen(urllib.request.Request(BASE + "data/" + name + "?t=%d" % time.time(), headers=UA), timeout=30) as r:
            b = r.read()
        json.loads(b)
        open(path, "wb").write(b)
        return path
    except Exception as e:
        print("no previous", name, str(e)[:80])
        return None

def load(path, default):
    try: return json.load(open(path, encoding="utf8"))
    except Exception: return default

def dump(obj, path):
    with open(path, "w", encoding="utf8") as fh: json.dump(obj, fh, ensure_ascii=False, separators=(",", ":"))

# ---------------- translation ----------------
def gtx(text):
    q = urllib.parse.urlencode({"client": "gtx", "sl": "auto", "tl": "iw", "dt": "t", "q": text[:1500]})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request("https://translate.googleapis.com/translate_a/single?" + q, headers=UA), timeout=20) as r:
                d = json.loads(r.read())
            out = "".join(seg[0] for seg in d[0] if seg and seg[0]).strip()
            return out if HEB.search(out) else None
        except Exception:
            time.sleep(1.5 * (attempt + 1))
    return None

def translate(texts, cache):
    need = [t for t in dict.fromkeys(texts) if t and not HEB.search(t) and t not in cache][:220]
    if need:
        with ThreadPoolExecutor(5) as ex:
            for t, h in zip(need, ex.map(gtx, need)):
                if h: cache[t] = re.sub(r"\s+", " ", h)[:500]
    return len(need)

def run(cmd):
    t0 = time.time()
    p = subprocess.run([sys.executable] + cmd, cwd=HERE, capture_output=True, text=True, timeout=900)
    print("$", " ".join(cmd[:2]), "%.0fs" % (time.time() - t0), "exit", p.returncode)
    print((p.stdout or "")[-1500:]); print((p.stderr or "")[-1500:])
    return p.returncode == 0

def main():
    for d in (PREV, OUT, DATA): os.makedirs(d, exist_ok=True)
    with ThreadPoolExecutor(4) as ex:
        prev_snap, prev_world, prev_hist, prev_tr = ex.map(fetch_prev, ["snapshot.json", "world.json", "history.json", "tr.json"])
    cache = load(prev_tr, {}) if prev_tr else {}

    # ---- region: the original collector, then its translation hand-off
    ok_region = run(["collector.py", OUT] + ([prev_snap] if prev_snap else []))
    if ok_region:
        src = load(os.path.join(OUT, "translate.json"), [])
        n = translate(src, cache)
        dump([cache.get(t, "") for t in src], os.path.join(OUT, "he.json"))
        run(["collector.py", "--merge", OUT])
        print("region translated", n)
    elif prev_snap:
        shutil.copy(prev_snap, os.path.join(OUT, "snapshot.json"))   # keep the site up with the last good round

    # ---- world + cyber
    ok_world = run(["world.py", OUT] + ([prev_world] if prev_world else []))
    w = load(os.path.join(OUT, "world.json"), None) if ok_world else load(prev_world, None) if prev_world else None
    if w:
        cy = w.get("cyber") or {}
        texts = [e["title"] for e in w.get("events", [])] + [x["title"] for e in w.get("events", [])[:15] for x in e.get("items", [])[:3]]
        texts += [x["title"] for x in cy.get("news", [])] + [g["name"] for g in w.get("gdacs", [])] + [q["place"] for q in w.get("quakes", [])]
        texts += [k["name"] for k in (cy.get("kev") or {}).get("items", [])] + [e["title"] for e in w.get("eonet", [])]
        n = translate(texts, cache)
        for e in w.get("events", []) + w.get("major", []):
            e["he"] = cache.get(e["title"])
            for x in e.get("items", []): x["he"] = cache.get(x["title"])
        for x in cy.get("news", []): x["he"] = cache.get(x["title"])
        for g in w.get("gdacs", []): g["he_name"] = cache.get(g["name"])
        for q in w.get("quakes", []): q["he"] = cache.get(q["place"])
        for k in (cy.get("kev") or {}).get("items", []): k["he"] = cache.get(k["name"])
        for e in w.get("eonet", []): e["he"] = cache.get(e["title"])
        dump(w, os.path.join(DATA, "world.json"))
        print("world translated", n)

    # ---- history: one point per round, last 10 days
    hist = load(prev_hist, []) if prev_hist else []
    if not isinstance(hist, list): hist = []
    pt = load(os.path.join(OUT, "point.json"), None) if ok_region else None
    if pt:
        if w and w.get("cyber"): pt["cyber"] = w["cyber"].get("score"); pt["major"] = len(w.get("major", []))
        hist = [h for h in hist if isinstance(h, dict) and h.get("ts", 0) >= pt["ts"] - HIST_DAYS * 86400 and h.get("ts") != pt["ts"]] + [pt]
    dump(hist[-HIST_MAX:], os.path.join(DATA, "history.json"))

    snap = os.path.join(OUT, "snapshot.json")
    if os.path.exists(snap): shutil.copy(snap, os.path.join(DATA, "snapshot.json"))
    # the translation cache is trimmed to the newest entries (dicts keep insertion order)
    items = list(cache.items())[-CACHE_MAX:]
    dump(dict(items), os.path.join(DATA, "tr.json"))
    dump({"ts": int(time.time()), "region": ok_region, "world": ok_world}, os.path.join(DATA, "status.json"))
    for f in ("index.html", "global.js", "global.css"): shutil.copy(os.path.join(HERE, f), os.path.join(SITE, f))
    open(os.path.join(SITE, ".nojekyll"), "w").close()
    if not (ok_region or ok_world or prev_snap): sys.exit("nothing collected and nothing to fall back to")

if __name__ == "__main__":
    main()
