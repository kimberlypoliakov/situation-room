#!/usr/bin/env python3
"""Situation-room collector. Pulls public sources, cross-checks them, writes snapshot.json + point.json.
Usage: python3 collector.py OUT_DIR
"""
import json, sys, time, calendar, re, math, html, os, urllib.request, urllib.parse, xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from email.utils import parsedate_to_datetime

UA = {"User-Agent": "Mozilla/5.0 (situation-room collector)"}
NOW = int(time.time())
OUT = sys.argv[1] if len(sys.argv) > 1 else "."

def get(url, timeout=20, raw=False, tries=2):
    # one quick retry for transient failures (reset, timeout, 429, 5xx); slow failures are not retried
    for attempt in range(tries):
        t0 = time.time()
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                b = r.read()
            return b if raw else json.loads(b)
        except Exception as e:
            code = getattr(e, "code", None)
            if attempt == tries - 1 or time.time() - t0 > 25 or (code and code not in (429, 500, 502, 503, 504)): raise
            time.sleep(4 if code == 429 else 1.5)

def safe(fn):
    t0 = time.time()
    try:
        v = fn()
        return {"ok": True, "ms": int((time.time()-t0)*1000), "data": v}
    except Exception as e:
        return {"ok": False, "ms": int((time.time()-t0)*1000), "error": str(e)[:160], "data": None}

# ---------------- geography ----------------
POLY = {
 "IL": [(34.27,31.22),(34.9,29.49),(35.0,29.5),(35.57,31.5),(35.55,32.4),(35.9,32.7),(35.82,33.28),(35.1,33.09),(34.2,33.05),(33.8,32.3),(33.8,31.5)],  # west edge ~90 km offshore: arrivals and departures fly over the sea
 "LB": [(35.1,33.09),(35.82,33.28),(36.6,34.2),(36.45,34.6),(35.98,34.65),(35.5,33.9)],
 "SY": [(35.9,32.7),(36.8,32.3),(38.79,33.38),(41.0,34.42),(41.4,35.6),(42.35,37.1),(41.2,37.07),(38.0,36.85),(36.6,36.7),(36.2,35.8),(35.9,35.4),(35.98,34.65),(36.45,34.6),(36.6,34.2),(35.82,33.28)],
 "JO": [(34.96,29.36),(36.5,29.5),(37.5,30.0),(38.0,30.5),(37.0,31.5),(39.0,32.0),(38.79,33.38),(36.8,32.3),(35.9,32.7),(35.55,32.4),(35.57,31.5),(35.0,29.5)],
 "IQ": [(38.79,33.38),(39.2,32.16),(42.0,31.1),(44.7,29.2),(46.57,29.1),(47.7,30.1),(48.0,30.0),(48.6,29.9),(47.9,31.0),(47.7,31.4),(46.1,32.9),(45.4,33.9),(46.0,35.0),(45.4,35.9),(46.0,35.8),(44.8,37.2),(42.35,37.1),(41.4,35.6),(41.0,34.42)],
 "IR": [(44.1,39.4),(44.8,37.2),(46.0,35.8),(45.4,35.9),(46.0,35.0),(45.4,33.9),(46.1,32.9),(47.7,31.4),(47.9,31.0),(48.6,29.9),(50.1,30.1),(51.5,27.9),(54.7,26.5),(56.3,27.1),(57.4,25.7),(61.5,25.1),(61.9,26.2),(63.3,27.2),(62.8,28.3),(61.4,29.3),(60.9,29.8),(61.7,31.4),(60.9,31.5),(60.5,33.1),(60.9,33.5),(61.2,35.6),(60.4,36.5),(59.2,37.4),(56.6,38.1),(54.8,37.4),(53.9,37.2),(53.0,36.9),(49.2,37.6),(48.0,38.9),(48.3,39.0),(47.7,39.5),(46.5,38.8),(44.8,39.7)],
}
def inpoly(x, y, p):
    c = False; j = len(p)-1
    for i in range(len(p)):
        xi, yi = p[i]; xj, yj = p[j]
        if (yi > y) != (yj > y) and x < (xj-xi)*(y-yi)/(yj-yi+1e-12)+xi: c = not c
        j = i
    return c
def country(lon, lat):
    for k, p in POLY.items():
        if inpoly(lon, lat, p): return k
    return None
BBOX = dict(lamin=12, lomin=25, lamax=42, lomax=65)

# ---------------- flights ----------------
def opensky():
    q = urllib.parse.urlencode(BBOX)
    d = get(f"https://opensky-network.org/api/states/all?{q}", 30)
    ac = []
    for s in d.get("states") or []:
        lon, lat, ground = s[5], s[6], s[8]
        if lon is None or lat is None or ground: continue
        ac.append({"h": s[0], "cs": (s[1] or "").strip(), "o": s[2], "lon": round(lon,3), "lat": round(lat,3),
                   "alt": int((s[7] or s[13] or 0)*3.281), "trk": int(s[10] or 0), "c": country(lon, lat)})
    return {"time": d.get("time"), "ac": ac}

def adsblol_points(points, gps=None):
    seen = {}
    for lat, lon in points:
        d = None
        for attempt in range(3):
            try:
                d = get(f"https://api.adsb.lol/v2/point/{lat}/{lon}/250", 25, tries=1); break
            except Exception:
                if attempt == 2: raise
                time.sleep(2 + attempt * 2)
        time.sleep(0.6)
        for a in d.get("ac", []):
            if gps is not None and str(a.get("type", "")).startswith("adsb") and a.get("alt_baro") != "ground":
                # GPS integrity as the aircraft itself reports it: lost position, NIC 0 or a very poor accuracy class
                bad = a.get("gpsOkBefore") is not None or a.get("nic") == 0 or (a.get("nac_p") is not None and a.get("nac_p") <= 4)
                gps[a["hex"]] = bad
            if a.get("lat") is None or a.get("alt_baro") == "ground": continue
            seen[a["hex"]] = a
    return list(seen.values())

def adsblol_check():
    # independent second ADS-B network, sampled over Israel and over Iran
    gi, gr = {}, {}
    il = adsblol_points([(31.8, 35.0)], gi)
    ir = adsblol_points([(35.7, 51.4), (32.6, 51.7), (29.6, 52.5), (27.2, 56.3), (36.3, 59.6), (34.3, 47.1)], gr)
    def cnt(lst, code): return sum(1 for a in lst if country(a["lon"], a["lat"]) == code)
    def gp(g): n = len(g); b = sum(1 for v in g.values() if v); return {"n": n, "bad": b, "pct": round(100 * b / n) if n >= 5 else None}
    return {"IL": cnt(il, "IL"), "IR": cnt(ir, "IR"), "gps": {"IL": gp(gi), "IR": gp(gr)}}

def military():
    d = get("https://api.adsb.lol/v2/mil", 25)
    out = []
    for a in d.get("ac", []):
        lat, lon = a.get("lat"), a.get("lon")
        if lat is None or not (BBOX["lamin"] < lat < BBOX["lamax"] and BBOX["lomin"] < lon < BBOX["lomax"]): continue
        out.append({"h": a.get("hex"), "cs": (a.get("flight") or "").strip(), "t": a.get("t"), "r": a.get("r"),
                    "lat": round(lat,3), "lon": round(lon,3), "alt": a.get("alt_baro") if isinstance(a.get("alt_baro"), int) else 0,
                    "trk": int(a.get("track") or 0), "c": country(lon, lat)})
    return out

# ---------------- Polymarket ----------------
PM_TERMS = ["iran", "israel", "hezbollah", "houthi", "gaza", "netanyahu"]
def polymarket():
    events = {}
    for t in PM_TERMS:
        d = get("https://gamma-api.polymarket.com/public-search?" + urllib.parse.urlencode({"q": t, "limit_per_type": 25, "events_status": "active"}), 25)
        for e in d.get("events", []) or []:
            if e.get("closed"): continue
            events[e["id"]] = e
    markets = []
    for e in events.values():
        for m in e.get("markets", []) or []:
            if m.get("closed") or not m.get("active", True): continue
            try:
                p = json.loads(m.get("outcomePrices") or "[]"); outs = json.loads(m.get("outcomes") or "[]")
            except Exception: continue
            if not p or not outs or outs[0] != "Yes": continue
            yes = float(p[0])
            if yes <= 0.004 or yes >= 0.996: continue  # effectively decided
            markets.append({"q": m.get("question"), "ev": e.get("title"), "yes": round(yes, 4),
                            "d1": m.get("oneDayPriceChange"), "vol": round(float(m.get("volumeNum") or m.get("volume") or 0)),
                            "vol24": round(float(m.get("volume24hr") or 0)), "end": m.get("endDate"),
                            "slug": e.get("slug"), "bid": m.get("bestBid"), "ask": m.get("bestAsk"),
                            "tok": tok0(m)})
    markets.sort(key=lambda x: -x["vol"])
    cf = [m for m in markets if CF_RE.search(m["q"] or "")]
    top = markets[:40]
    top += [m for m in cf if m not in top]
    # 7-day price history from the CLOB for security-related markets (public, no key)
    want = cf + [m for m in top if m not in cf and m["tok"] and SEC_RE.search((m["q"] or "") + " " + (m["ev"] or "")) and not NOSEC_RE.search(m["q"] or "")][:24]
    want = [m for m in want if m["tok"]][:26]
    with ThreadPoolExecutor(6) as ex:
        hs = list(ex.map(lambda m: safe(lambda: clob_hist(m["tok"]))["data"], want))
    for m, h in zip(want, hs):
        if h and len(h) > 1:
            m["h"] = h; m["d7"] = round(h[-1] - h[0], 4)
    for m in top: m.pop("tok", None); m["sec"] = pm_sec(m)
    return top

CF_RE = re.compile(r"israel x iran ceasefire continues", re.I)
SEC_RE = re.compile(r"iran|israel|hezbollah|houthi|gaza|lebanon|hormuz|war|strike|ceasefire|military|invade|nuclear|enrich|airspace|regime|leader", re.I)
NOSEC_RE = re.compile(r"prime minister|election|knesset|head of state|supreme leader|leadership change|\bout by\b|\bout as\b|pahlavi|resign|coalition|indict|pardon|trial", re.I)
def pm_sec(m):
    return bool(SEC_RE.search((m.get("q") or "") + " " + (m.get("ev") or "")) and not NOSEC_RE.search(m.get("q") or ""))
def tok0(m):
    try: return json.loads(m.get("clobTokenIds") or "[]")[0]
    except Exception: return None
def clob_hist(tok):
    d = get("https://clob.polymarket.com/prices-history?" + urllib.parse.urlencode({"market": tok, "interval": "1w", "fidelity": 180}), 20)
    h = [round(float(x["p"]), 4) for x in d.get("history", []) if x.get("p") is not None]
    if len(h) > 60: h = h[::-(-len(h)//60)] + [h[-1]]
    return h

# ---------------- markets ----------------
YF = [("TA35.TA","ת״א 35","idx"),("^TA125.TA","ת״א 125","idx"),("ILS=X","דולר / שקל","fx"),("EURILS=X","אירו / שקל","fx"),
      ("BZ=F","נפט ברנט","cmd"),("CL=F","נפט WTI","cmd"),("GC=F","זהב","cmd"),("^GSPC","S&P 500","idx"),("^VIX","VIX פחד","idx"),
      ("NG=F","גז טבעי (ארה״ב)","cmd"),("TTF=F","גז אירופי TTF","cmd"),("FRO","Frontline · מכליות נפט","eq"),
      ("LMT","לוקהיד מרטין","eq"),("ESLT","אלביט","eq"),("BTC-USD","ביטקוין","cry")]
def yahoo_one(sym):
    d = get(f"https://query2.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}?range=5d&interval=1h", 20)
    r = d["chart"]["result"][0]; m = r["meta"]
    closes = [c for c in (r["indicators"]["quote"][0].get("close") or []) if c is not None]
    price = m.get("regularMarketPrice"); prev = m.get("chartPreviousClose") or m.get("previousClose")
    # previous session close for 1D change
    pc = m.get("previousClose") or prev
    return {"price": price, "prev": pc, "chg": (price/pc-1)*100 if price and pc else None, "t": m.get("regularMarketTime"),
            "spark": [round(c, 4) for c in closes[-60:]], "cur": m.get("currency")}
def markets():
    out = []
    with ThreadPoolExecutor(6) as ex:
        res = list(ex.map(lambda s: safe(lambda: yahoo_one(s[0])), YF))
    for (sym, name, kind), r in zip(YF, res):
        out.append({"sym": sym, "name": name, "kind": kind, **(r["data"] or {}), "ok": r["ok"]})
    return out
def fx_check():
    d = get("https://open.er-api.com/v6/latest/USD", 20)
    return {"ILS": d["rates"]["ILS"], "EURILS": d["rates"]["ILS"]/d["rates"]["EUR"], "t": d.get("time_last_update_unix")}
def btc_check():
    try:
        d = get("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true", 20)
        return {"usd": d["bitcoin"]["usd"], "chg": d["bitcoin"]["usd_24h_change"], "src": "CoinGecko"}
    except Exception:
        d = get("https://api.coinbase.com/v2/prices/BTC-USD/spot", 20)
        return {"usd": float(d["data"]["amount"]), "chg": None, "src": "Coinbase"}

# ---------------- alerts (Israel) ----------------
THREAT = {0:"ירי רקטות וטילים",1:"חומרים מסוכנים",2:"חשש לחדירת מחבלים",3:"רעידת אדמה",4:"חשש לצונאמי",5:"חדירת כלי טיס עוין",6:"אירוע רדיולוגי",7:"אירוע בלתי קונבנציונלי",8:"התרעה",9:"תרגיל"}
def alerts():
    d = get("https://api.tzevaadom.co.il/alerts-history", 20)
    evs = []
    for g in d:
        for a in g.get("alerts", []):
            if a.get("isDrill"): continue
            evs.append({"t": a["time"], "th": a.get("threat", 8), "cities": a.get("cities", [])[:40], "n": len(a.get("cities", []))})
    evs.sort(key=lambda x: -x["t"])
    def win(h): return [e for e in evs if e["t"] >= NOW - h*3600]
    hours = [0]*24
    for e in win(24):
        hours[min(23, (NOW - e["t"])//3600)] += 1
    by = {}
    for e in win(24): by[THREAT.get(e["th"], "אחר")] = by.get(THREAT.get(e["th"], "אחר"), 0) + 1
    return {"last": evs[:25], "c1": len(win(1)), "c6": len(win(6)), "c24": len(win(24)), "c168": len(win(168)),
            "areas24": sum(e["n"] for e in win(24)), "hours": hours[::-1], "by": by,
            "lastT": evs[0]["t"] if evs else None, "threats": THREAT}

# ---------------- news + cross-verification ----------------
FEEDS = [
 ("BBC", "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml", "en"),
 ("Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml", "en"),
 ("Jerusalem Post", "https://www.jpost.com/rss/rssfeedsfrontpage.aspx", "en"),
 ("Google News", "https://news.google.com/rss/search?q=" + urllib.parse.quote("Iran OR Israel OR Hezbollah OR Houthi when:1d") + "&hl=en-US&gl=US&ceid=US:en", "en"),
 ("Iran International", "https://www.iranintl.com/en/feed", "en"),
 ("ynet מבזקים", "https://www.ynet.co.il/Integration/StoryRss1854.xml", "he"),
]
KEY = re.compile(r"iran|israel|idf|hezbollah|houthi|yemen|gaza|hamas|lebanon|syria|iraq|tehran|hormuz|missile|drone|strike|ceasefire|netanyahu|khamenei|irgc|nuclear|airspace", re.I)
KEY_HE = re.compile(r"איראן|טיל|כטב|יירוט|חיזבאללה|חות|עזה|לבנון|סוריה|צה\"ל|צה״ל|התרע|פיקוד העורף|תקיפ|רקט|מרחב האווירי|הפסקת אש|שיגור|חמאס|תימן")
STOP = set("the a an of to in on for and or with at by from as is are was were be after over into its it that this new says said say amid us u.s. will has have not but about than up out more what how why who".split())
def toks(s):
    return set(w for w in re.findall(r"[a-z0-9]+", s.lower()) if w not in STOP and len(w) > 2)
def feed(name, url, lang):
    root = ET.fromstring(get(url, 20, raw=True))
    items = []
    for it in root.iter("item"):
        title = html.unescape((it.findtext("title") or "").strip())
        link = (it.findtext("link") or "").strip()
        pub = it.findtext("pubDate")
        try: ts = int(parsedate_to_datetime(pub).timestamp())
        except Exception: ts = None
        outlet = name
        src = it.find("source")
        if name == "Google News" and src is not None and src.text:
            outlet = src.text.strip(); title = re.sub(r"\s+-\s+" + re.escape(outlet) + r"$", "", title)
        rel = bool((KEY_HE if lang == "he" else KEY).search(title))
        if not rel: continue
        if ts and ts < NOW - 36*3600: continue
        items.append({"title": title[:220], "link": link, "t": ts, "outlet": outlet, "via": name, "lang": lang})
    return items[:40]
def norm_outlet(o):
    o = re.sub(r"^the\s+", "", o.strip(), flags=re.I)
    o = re.sub(r"\s*\(.*?\)\s*$", "", o)
    return o
def cluster(items):
    en = [i for i in items if i["lang"] == "en"]
    for i in en: i["outlet"] = norm_outlet(i["outlet"])
    for i in en: i["_k"] = toks(i["title"])
    clusters = []
    for i in sorted(en, key=lambda x: -(x["t"] or 0)):
        best = None
        for c in clusters:
            ov = len(i["_k"] & c["k"]); j = ov / max(1, len(i["_k"] | c["k"]))
            if ov >= 3 or (ov >= 2 and j >= 0.25):
                best = c; break
        if best: best["items"].append(i); best["k"] |= i["_k"]
        else: clusters.append({"k": set(i["_k"]), "items": [i]})
    out = []
    for c in clusters:
        outlets = sorted(set(x["outlet"] for x in c["items"]))
        lead = c["items"][0]
        out.append({"title": lead["title"], "link": lead["link"], "t": max((x["t"] or 0) for x in c["items"]),
                    "outlets": outlets, "n": len(outlets),
                    "items": [{"title": x["title"], "outlet": x["outlet"], "link": x["link"], "t": x["t"]} for x in c["items"][:6]]})
    out.sort(key=lambda c: (-min(c["n"], 4), -c["t"]))
    return out[:30]

# ======================= v2 additions =======================
IL_CARRIERS = {"LY", "IZ", "6H", "5C", "ICL", "ELY"}
def ben_gurion():
    d = get("https://data.gov.il/api/3/action/datastore_search?resource_id=e83f763b-b7d7-479e-b172-ae981ddc6de5&limit=5000", 40)
    recs = d["result"]["records"]
    il_today = time.strftime("%Y-%m-%d", time.gmtime(NOW + 2*3600))
    today = [r for r in recs if (r.get("CHSTOL") or "").startswith(il_today)]
    canc = [r for r in today if (r.get("CHRMINE") or "").upper() in ("CANCELED", "CANCELLED")]
    foreign = [r for r in canc if (r.get("CHOPER") or "") not in IL_CARRIERS]
    by = {}
    for r in foreign: by[r.get("CHOPERD") or r.get("CHOPER")] = by.get(r.get("CHOPERD") or r.get("CHOPER"), 0) + 1
    return {"date": il_today, "total": len(today), "canc": len(canc), "foreign": len(foreign),
            "airlines": sorted(by.items(), key=lambda x: -x[1])[:12],
            "list": [{"op": r.get("CHOPERD"), "fl": f'{r.get("CHOPER")}{r.get("CHFLTN")}', "dir": r.get("CHAORD"), "city": r.get("CHLOC1TH") or r.get("CHLOC1D"), "t": r.get("CHSTOL")} for r in foreign[:20]]}

def ripe_internet():
    st = time.strftime("%Y-%m-%dT%H:00", time.gmtime(NOW - 7*86400))
    d = get(f"https://stat.ripe.net/data/country-routing-stats/data.json?resource=IR&resolution=1h&starttime={st}", 40)["data"]["stats"]
    s = [x["v4_prefixes_ris"] for x in d if x.get("v4_prefixes_ris", -1) > 0]
    if len(s) < 6: raise Exception("not enough RIPE data")
    base = sorted(s[:-1])[len(s[:-1])//2]; cur = s[-1]
    return {"pct": round(cur / base * 100, 1), "cur": cur, "base": base, "asns": d[-1].get("asns_ris"), "series": s[-72:],
            "t": d[-1]["timeline"][0]["starttime"]}

SITES = [("נתנז",33.724,51.727),("פורדו",34.885,50.996),("אספהאן · מתקן גרעין",32.60,51.70),("ערק",34.373,49.241),("בושהר",28.829,50.886),
 ("פרצ'ין",35.52,51.77),("טהרן · מהראבאד",35.689,51.313),("בנדר עבאס · בסיס ימי",27.15,56.21),("שיראז · בסיס אווירי",29.54,52.59),
 ("תבריז",38.10,46.22),("כרמאנשאה",34.39,47.12),("ח'רמאבאד",33.46,48.32),("שאהרוד",36.20,55.33),("סמנאן · אתר שיגור",35.234,53.921),
 ("המדאן · נוז'ה",35.21,48.65),("דזפול · וחדתי",32.43,48.40),("ג'אסק",25.65,57.77),("צ'בהאר",25.44,60.38),("קשם",26.75,55.85),
 ("אספהאן · בסיס אווירי",32.75,51.86),("בנדר אנזלי",37.47,49.46),("משהד",36.24,59.64)]
def _km(a, b, c, d):
    return math.hypot((a-c)*111, (b-d)*111*math.cos(math.radians(a)))
def firms():
    urls = ["https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_24h.csv",
            "https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv"]
    pts = []; ok = 0
    for u in urls:
        try: txt = get(u, 90, raw=True).decode()
        except Exception: continue
        ok += 1
        lines = txt.splitlines(); hdr = lines[0].split(",")
        ix = {k: hdr.index(k) for k in ("latitude","longitude","acq_date","acq_time","confidence","frp")}
        for l in lines[1:]:
            r = l.split(",")
            try: la, lo = float(r[ix["latitude"]]), float(r[ix["longitude"]])
            except Exception: continue
            if not (24 < la < 40 and 43 < lo < 64): continue
            at = r[ix["acq_time"]].zfill(4)
            ts = calendar.timegm(time.strptime(r[ix["acq_date"]] + at, "%Y-%m-%d%H%M"))
            pts.append({"la": la, "lo": lo, "t": int(ts), "c": r[ix["confidence"]].strip()[:1], "frp": float(r[ix["frp"]] or 0)})
    if not ok: raise Exception("FIRMS unavailable")
    ir = [p for p in pts if country(p["lo"], p["la"]) == "IR"]
    near = []
    for p in ir:
        best = min(SITES, key=lambda s: _km(p["la"], p["lo"], s[1], s[2]))
        dk = _km(p["la"], p["lo"], best[1], best[2])
        if dk <= 8: p["site"] = best[0]; near.append(p)
    six = [p for p in ir if p["t"] >= NOW - 6*3600]
    sites6 = {}
    for p in near:
        if p["t"] >= NOW - 6*3600: sites6[p["site"]] = sites6.get(p["site"], 0) + 1
    ir.sort(key=lambda p: -p["t"])
    return {"ir24": len(ir), "ir6": len(six), "near24": len(near), "near6": sum(sites6.values()), "sites6": sites6,
            "pts": ";".join(f'{p["lo"]:.3f},{p["la"]:.3f},{p["t"]},{p["c"]},{1 if p.get("site") else 0}' for p in ir[:900]),
            "siteList": [[s[0], s[1], s[2]] for s in SITES], "radiusKm": 8}

GEO_RE = re.compile(r"iran|israel|idf|hezbollah|houthi|ansarallah|yemen|gaza|hamas|lebanon|syria|iraq|tehran|hormuz|irgc|saudi|persian gulf|tel aviv|jerusalem|netanyahu|khamenei|qatar|uae|emirat|bahrain|kuwait|oman", re.I)
TG = [("MNnews7", "he", "עדכונים ביטחוניים 24/7"), ("ClashReport", "en", "Clash Report"), ("AMK_Mapping", "en", "AMK Mapping"),
      ("PikudHaOref_all", "he", "פיקוד העורף"), ("idfofficial", "en", "IDF"), ("kann_news", "he", "כאן חדשות"), ("abualiexpress", "he", "אבו עלי אקספרס"),
      ("IranIntl_En", "en", "Iran International"), ("OSINTdefender", "en", "OSINTdefender"), ("AuroraIntel", "en", "Aurora Intel"), ("farsna", "fa", "Fars")]
# Persian / Arabic items are kept only when they touch the security picture (keeps sport and lifestyle out of the feed and out of translation)
KEY_FA_AR = re.compile(r"موشک|پهپاد|حمله|انفجار|پدافند|آتش.?بس|هسته.?ای|هرمز|اسرائیل|اسراییل|صهیونیست|سپاه|جنگنده|إسرائيل|اسرائيل|إيران|ايران|صاروخ|صواريخ|مسي.?رة|غارة|غارات|قصف|هدنة|وقف إطلاق|نووي|الحوثي|حزب الله|غزة|طهران|الحرس الثوري")
RSS_FA_AR = [("https://feeds.bbci.co.uk/persian/rss.xml", "BBC فارسی", "fa"),
             ("https://www.aljazeera.net/aljazeerarss/a7c186be-1baa-4bd4-9d80-a84db769f779/73d0e1b4-532f-45ef-b135-bfdff8b8cab9", "الجزيرة", "ar")]
def telegram(ch, lang, label):
    b = get(f"https://t.me/s/{ch}", 25, raw=True).decode("utf8", "replace")
    out = []
    for blk in b.split('<div class="tgme_widget_message_wrap')[1:]:
        m = re.search(r'tgme_widget_message_text[^>]*>(.*?)</div>', blk, re.S)
        tm = re.search(r'<time datetime="([^"]+)"', blk)
        pid = re.search(r'data-post="([^"]+)"', blk)
        if not m or not tm: continue
        txt = html.unescape(re.sub(r"<br\s*/?>", " ", m.group(1))); txt = re.sub(r"<[^>]+>", "", txt); txt = re.sub(r"\s+", " ", txt).strip()
        try: ts = calendar.timegm(time.strptime(tm.group(1)[:19], "%Y-%m-%dT%H:%M:%S"))
        except Exception: continue
        if ts < NOW - 24*3600 or len(txt) < 12: continue
        if not (GEO_RE.search(txt) or KEY_HE.search(txt) or KEY_FA_AR.search(txt)): continue
        out.append({"src": label, "ch": ch, "lang": lang, "t": ts, "text": txt[:400], "link": f"https://t.me/{pid.group(1)}" if pid else f"https://t.me/{ch}"})
    return out[-25:]
def rss_lang(url, label, lang):
    root = ET.fromstring(get(url, 20, raw=True)); out = []
    for it in root.iter("item"):
        try: ts = int(parsedate_to_datetime(it.findtext("pubDate")).timestamp())
        except Exception: continue
        if ts < NOW - 24*3600: continue
        if not KEY_FA_AR.search(it.findtext("title") or ""): continue
        out.append({"src": label, "ch": label, "lang": lang, "t": ts, "text": html.unescape((it.findtext("title") or "").strip())[:300], "link": (it.findtext("link") or "").strip()})
    return out[:25]

# ---- classifiers (all languages). Negation/threat words keep a report out of "happened" categories.
CATS = {
 "launch":  r"שיגור|שוגר|שוגרו|ירי טילים|מטח|launch(ed|es)? (of )?(ballistic|missile|rocket)|missiles? (were |was )?(fired|launched)|ballistic missile attack|barrage|شلیک موشک|پرتاب موشک|إطلاق صواريخ|رشقة صاروخية",
 "intercept": r"יירוט|יורט|יירטו|intercept(ed|ion|s)?|رهگیری|اعتراض",
 "strike_ir": r"(תקיפ\S*|פיצוצ\S*|הפצצ\S*|תקף|תקפה|תקפו)\s.*(איראן|טהרן|אספהאן|שיראז|קשם|בנדר עבאס|נתנז|פורדו|תבריז)|((air)?strikes?|struck|explosions?|blasts?|bomb(ed|ing|s)?|attack(ed|s)?|hit|hits|raids?)\b.{0,50}\b(in|on|inside|across|near|over|at|against|rocks?|shakes?)\s+(the\s+)?((southern|northern|central|western|eastern|iran'?s|iranian)\s+){0,2}(city of |port of |province of |capital )?(iran\b|tehran|isfahan|esfahan|shiraz|qeshm|bandar abbas|natanz|fordow|tabriz|kharg|bushehr|jask|chabahar|sirik|hormozgan|khuzestan|kermanshah|karaj|parchin)|\b(israel|israeli|idf|iaf|us|u\.s\.|american|coalition)\b.{0,30}\b(strikes?|struck|bombs?|bombed|hits?|attacks?|attacked)\s+((the|a|an)\s+)?((iran'?s|iranian)\s+)?(iran\b|tehran|isfahan|esfahan|shiraz|qeshm|bandar abbas|natanz|fordow|tabriz|kharg|bushehr|jask|chabahar|sirik|hormozgan|khuzestan|kermanshah|karaj|parchin)|iranian (province|city|port|base|site|facility|island|town|airport|refinery)\b.{0,40}\b(hit|struck|bombed|attacked|rocked)\b|(iran\b|tehran|isfahan|esfahan|shiraz|qeshm|bandar abbas|natanz|fordow|tabriz|kharg|bushehr|jask|chabahar|sirik|hormozgan|khuzestan|kermanshah|karaj|parchin)\b.{0,25}\b(was|were|is|been|being|gets?|got)\s+(hit|struck|bombed|attacked|rocked)\b|انفجار.*(تهران|اصفهان|شیراز|قشم|بندرعباس)|حمله.*ایران|غارات?.*إيران",
 "warning": r"התרעה מקדימה|בדקות הקרובות צפויות|צפויות להתקבל התרעות|early warning (issued|alert|message|sirens?|for residents)|هشدار",
 "expected": r"צפויה תקיפה|מתקפה צפויה|נערכ\S* ל(תקיפה|מתקפה)|בכוננות (גבוהה|ספיגה)|imminent (attack|strike)|expected (to )?(attack|strike)|prepar\S* (for |to )?(a |an )?(strike|attack|military operation)|retaliat\S*|حمله قریب|هجوم وشيك",
 "diplomacy": r"משא ומתן|הסכם|שיחות|הצעה|ceasefire|talks|negotiat|deal|مذاکره|مفاوضات",
}
NEG = re.compile(r"\b(downplay\S*|unlikely|holds? off|vows?|threat\S*|warns?|could|may|might|would|should|if|whether|denies|denied|false|prevent\S*|avert\S*|avoid\S*|deter\S*|rules? out|ruled out|stave\S* off|postpon\S*|delay\S*|calls? off|called off|halt\S*|paus\S*|window|consider\S*|mull\S*|weigh\S*|plans?|planning|planned|prepar\S*|ready to|fears?|risk\S*|possible|potential|ahead of|deadline|ultimatum|anniversary|simulat\S*|drill\S*|exercise\S*)\b|לא סביר|נוכל ל|בקרוב|מתכנ\S*|תוכנית ל|נשקל\S*|نقشه|طرح|تهدید|تهديد|خطة|مخطط|מאיימ|איום|מכחיש|זיהוי שווא|ייתכן|עלול|למנוע|מניעת|לדחות|נדח|שוקל|אפשרות ל|תרגיל|יום השנה", re.I)
CREG = {k: re.compile(v, re.I) for k, v in CATS.items()}
def classify(text):
    tags = [k for k, r in CREG.items() if r.search(text)]
    neg = bool(NEG.search(text))
    hard = [t for t in tags if t in ("launch", "intercept", "strike_ir")]
    if neg and hard: tags = [t for t in tags if t not in hard] + ["unconfirmed"]
    return tags

def gdelt():
    q = urllib.parse.quote('(Iran OR Israel OR Hezbollah OR Houthi OR Hormuz)')
    last = None
    for attempt in range(3):
        try:
            d = get(f"https://api.gdeltproject.org/api/v2/doc/doc?query={q}&mode=artlist&format=json&timespan=24h&maxrecords=75&sort=datedesc", 40, tries=1)
            break
        except Exception as e:
            last = e; time.sleep(8)
    else: raise last
    if not d.get("articles"): raise Exception("GDELT answered with 0 articles")
    arts = []
    for a in d.get("articles", []):
        try: ts = calendar.timegm(time.strptime(a["seendate"], "%Y%m%dT%H%M%SZ"))
        except Exception: ts = None
        arts.append({"title": a.get("title", "")[:200], "url": a.get("url"), "dom": a.get("domain"), "lang": a.get("language"), "cc": a.get("sourcecountry"), "t": ts})
    return arts

def advisories():
    REG = re.compile(r"Israel|Iran|Iraq|Lebanon|Jordan|Syria|Yemen|Saudi|United Arab Emirates|Qatar|Bahrain|Kuwait|Oman|Egypt|Palestin|Gaza|West Bank", re.I)
    out = []
    root = ET.fromstring(get("https://travel.state.gov/_res/rss/TAsTWs.xml", 30, raw=True))
    for it in root.iter("item"):
        t = it.findtext("title") or ""
        try: ts = int(parsedate_to_datetime(it.findtext("pubDate")).timestamp())
        except Exception: continue
        if REG.search(t) and ts >= NOW - 30*86400: out.append({"who": "ארה״ב", "title": t, "t": ts, "link": it.findtext("link")})
    try:
        d = get("https://www.gov.uk/api/search.json?filter_format=travel_advice&order=-public_timestamp&count=60&fields=title,public_timestamp,link", 30)
        for r in d.get("results", []):
            ts = calendar.timegm(time.strptime(r["public_timestamp"][:19], "%Y-%m-%dT%H:%M:%S"))
            if REG.search(r["title"]) and ts >= NOW - 30*86400: out.append({"who": "בריטניה", "title": r["title"], "t": ts, "link": "https://www.gov.uk" + r.get("link", "")})
    except Exception: pass
    out.sort(key=lambda x: -x["t"])
    return out[:20]

def city_coords():
    d = get("https://www.tzevaadom.co.il/static/cities.json", 30)
    return {k: (v.get("lat"), v.get("lng"), v.get("countdown")) for k, v in d["cities"].items() if v.get("lat")}
def tz_live():
    return get("https://api.tzevaadom.co.il/notifications", 15)


# ======================= v4 additions: seismic, sea lanes, fleet, airspace risk, IAEA =======================
NUKE = {"נתנז", "פורדו", "אספהאן · מתקן גרעין", "ערק", "בושהר", "פרצ'ין"}
def quakes():
    st = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(NOW - 7*86400))
    d = get("https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&orderby=time&minmagnitude=2.5&minlatitude=24&maxlatitude=40&minlongitude=43&maxlongitude=64&starttime=" + st, 30)
    out = []
    for f in d.get("features", []):
        p = f["properties"]; lo, la, dep = (f["geometry"]["coordinates"] + [None])[:3]
        if country(lo, la) != "IR": continue
        best = min(SITES, key=lambda s: _km(la, lo, s[1], s[2])); km = _km(la, lo, best[1], best[2])
        q = {"m": p.get("mag"), "la": round(la, 2), "lo": round(lo, 2), "dep": dep, "t": int(p["time"] / 1000),
             "place": (p.get("place") or "")[:90], "type": p.get("type") or "earthquake", "url": p.get("url")}
        if km <= 60: q["site"] = best[0]; q["km"] = int(round(km)); q["nuke"] = best[0] in NUKE
        out.append(q)
    # EMSC sees smaller events inside Iran than USGS does; add what USGS does not already list
    try:
        e = get("https://www.seismicportal.eu/fdsnws/event/1/query?format=json&minlat=24&maxlat=40&minlon=43&maxlon=64&minmag=2.5&limit=200&start=" + st, 30)
        for f in e.get("features", []):
            p = f["properties"]; la, lo = p.get("lat"), p.get("lon")
            ts = calendar.timegm(time.strptime(p["time"][:19], "%Y-%m-%dT%H:%M:%S"))
            if la is None or country(lo, la) != "IR": continue
            if any(abs(o["t"] - ts) < 90 and _km(la, lo, o["la"], o["lo"]) < 120 for o in out): continue
            best = min(SITES, key=lambda s: _km(la, lo, s[1], s[2])); km = _km(la, lo, best[1], best[2])
            ev = p.get("evtype") or "ke"
            q = {"m": p.get("mag"), "la": round(la, 2), "lo": round(lo, 2), "dep": round(abs(p.get("depth") or 0)), "t": ts, "place": (p.get("flynn_region") or "").title()[:90],
                 "type": "earthquake" if ev in ("ke", "se", "") or ev.endswith("e") and "x" not in ev else "explosion (" + ev + ")", "url": "https://www.seismicportal.eu/eventdetails.html?unid=" + str(p.get("unid", "")), "net": "EMSC"}
            if km <= 60: q["site"] = best[0]; q["km"] = int(round(km)); q["nuke"] = best[0] in NUKE
            out.append(q)
    except Exception: pass
    out.sort(key=lambda q: -q["t"])
    return out[:60]

# IODA (Georgia Tech): active probing and Google-traffic view of Iran's internet, independent of the BGP count
def ioda():
    d = get(f"https://api.ioda.inetintel.cc.gatech.edu/v2/signals/raw/country/IR?from={NOW - 7*86400}&until={NOW}", 40)
    out = {}
    for sgn in d["data"][0]:
        if sgn["datasource"] == "ping-slash24":
            v = [x for x in sgn["values"] if isinstance(x, (int, float))]
            if len(v) > 20:
                base = _med(v[:-1]); out["ping"] = {"cur": v[-1], "base": base, "pct": round(v[-1] / base * 100, 1) if base else None, "series": v[-432::6]}
        if sgn["datasource"] == "ping-slash24-loss":
            for x in reversed(sgn["values"]):
                lp = (x or [{}])[0].get("agg_values", {}).get("loss_pct") if isinstance(x, list) else None
                if lp is not None: out["loss"] = lp; break
    try:
        a = get(f"https://api.ioda.inetintel.cc.gatech.edu/v2/outages/alerts?entityType=country&entityCode=IR&from={NOW - 3*86400}&until={NOW}", 30)["data"]
        g = [x for x in a if x.get("datasource") == "gtr"]
        if g:
            x = max(g, key=lambda x: x["time"])
            out["gtr"] = {"level": x.get("level"), "t": x["time"], "pct": round(100 * x["value"] / x["historyValue"]) if x.get("historyValue") else None}
        out["alerts72"] = sum(1 for x in a if x.get("level") == "critical")
    except Exception: pass
    if not out: raise Exception("IODA returned no usable signal")
    return out

# Manifold: play-money forecasting site, used only as a second opinion next to Polymarket
def manifold():
    seen = {}
    for term in ("iran", "israel"):
        for m in get("https://api.manifold.markets/v0/search-markets?" + urllib.parse.urlencode({"term": term, "filter": "open", "sort": "liquidity", "limit": 15, "contractType": "BINARY"}), 25):
            if m.get("probability") is None or (m.get("uniqueBettorCount") or 0) < 25: continue
            if not SEC_RE.search(m.get("question") or ""): continue
            seen[m["id"]] = {"q": m["question"][:200], "yes": round(m["probability"], 3), "n": m.get("uniqueBettorCount"), "end": m.get("closeTime"), "url": m.get("url")}
    return sorted(seen.values(), key=lambda m: -(m["n"] or 0))[:10]

# IMF PortWatch: daily ship transits through chokepoints, derived from satellite AIS (open, no key, a few days behind)
CHOKE = [("chokepoint6", "hormuz", "מצר הורמוז", 26.57, 56.25), ("chokepoint4", "bab", "באב אל־מנדב", 12.6, 43.35), ("chokepoint1", "suez", "תעלת סואץ", 30.45, 32.35)]
def _med(v): v = sorted(v); return v[len(v) // 2] if v else None
def portwatch_one(pid):
    q = urllib.parse.urlencode({"where": f"portid='{pid}'", "outFields": "date,n_total,n_tanker", "orderByFields": "date DESC", "resultRecordCount": 400, "f": "json"})
    d = get("https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query?" + q, 30)
    rows = []
    for f in d.get("features", []):
        a = f["attributes"]; dt = a.get("date")
        ts = int(dt / 1000) if isinstance(dt, (int, float)) else calendar.timegm(time.strptime(str(dt)[:10], "%Y-%m-%d"))
        rows.append((ts, a.get("n_total") or 0, a.get("n_tanker") or 0))
    if not rows: raise Exception("PortWatch returned no rows")
    rows.sort(key=lambda r: -r[0]); t0 = rows[0][0]
    yr = [r[1] for r in rows if t0 - 380*86400 <= r[0] <= t0 - 350*86400]
    avg7 = round(sum(r[1] for r in rows[:7]) / len(rows[:7]), 1)
    prev7 = round(sum(r[1] for r in rows[7:14]) / len(rows[7:14]), 1) if len(rows) >= 14 else None
    base = _med(yr) if len(yr) >= 10 else None
    return {"t": t0, "total": rows[0][1], "tanker": rows[0][2], "avg7": avg7, "prev7": prev7, "tanker7": round(sum(r[2] for r in rows[:7]) / len(rows[:7]), 1),
            "base": base, "pct": round(100 * avg7 / base) if base else None, "series": [r[1] for r in rows[:60]][::-1]}
def portwatch():
    out = {}
    with ThreadPoolExecutor(3) as ex:
        res = list(ex.map(lambda c: safe(lambda: portwatch_one(c[0])), CHOKE))
    for (pid, key, name, la, lo), r in zip(CHOKE, res):
        if r["ok"]: out[key] = dict(r["data"], name=name, la=la, lo=lo)
    if not out: raise Exception(res[0].get("error") or "PortWatch unavailable")
    return out

# USNI News Fleet Tracker (weekly): which US carriers and amphibious assault ships are in the theatre
SEAS = [("Persian Gulf", "המפרץ הפרסי", 27.0, 51.2), ("Gulf of Oman", "מפרץ עומאן", 24.6, 59.0), ("Arabian Sea", "הים הערבי", 18.5, 61.0), ("Gulf of Aden", "מפרץ עדן", 12.7, 47.5),
        ("Red Sea", "הים האדום", 19.5, 38.9), ("Mediterranean", "הים התיכון", 33.6, 29.5)]
SHIPT = {"CVN": "נושאת מטוסים", "LHD": "ספינת תקיפה אמפיבית", "LHA": "ספינת תקיפה אמפיבית"}
def fleet():
    root = ET.fromstring(get("https://news.usni.org/category/fleet-tracker/feed", 40, raw=True))
    it = next(root.iter("item"))
    body = it.findtext("{http://purl.org/rss/1.0/modules/content/}encoded") or ""
    txt = re.sub(r"<h[1-6][^>]*>", "\n## ", body); txt = re.sub(r"</h[1-6]>", "\n", txt)
    txt = html.unescape(re.sub(r"<[^>]+>", " ", txt))
    ships, sea = {}, None
    for line in txt.split("\n"):
        line = re.sub(r"\s+", " ", line).strip()
        if line.startswith("## "):
            sea = next((x for x in SEAS if x[0].lower() in line.lower()), None) if re.match(r"## In ", line) else sea
            continue
        if not sea: continue
        for m in re.finditer(r"USS ([A-Z][A-Za-z\.' ]{2,40}?) ?\((CVN|LHD|LHA)-(\d+)\)", line):
            hull = f"{m.group(2)}-{m.group(3)}"
            ships.setdefault(hull, {"n": "USS " + m.group(1).strip(), "hull": hull, "type": SHIPT[m.group(2)], "sea": sea[1], "la": sea[2], "lo": sea[3]})
    return {"t": int(parsedate_to_datetime(it.findtext("pubDate")).timestamp()), "title": (it.findtext("title") or "").strip(),
            "link": (it.findtext("link") or "").strip(), "ships": list(ships.values())}

# Safe Airspace (OPSGROUP): published conflict-zone risk level per country, the open stand-in for NOTAM
AIRC = [("iran", "IR", "איראן"), ("israel", "IL", "ישראל"), ("iraq", "IQ", "עיראק"), ("lebanon", "LB", "לבנון"), ("syria", "SY", "סוריה"), ("jordan", "JO", "ירדן"), ("yemen", "YE", "תימן")]
LVL = {"one": 1, "two": 2, "three": 3}
def safeair_one(slug):
    x = get(f"https://safeairspace.net/{slug}/", 30, raw=True).decode("utf8", "replace")
    t = re.sub(r"<script.*?</script>|<style.*?</style>", " ", x, flags=re.S); t = html.unescape(re.sub(r"<[^>]+>", " ", t)); t = re.sub(r"\s+", " ", t)
    m = re.search(r"Risk Level:\s*(One|Two|Three)\s*-\s*([^\[]{3,60}?)\s*\[[^\]]*\]\s*(.{0,400})", t, re.I)
    if not m: raise Exception("risk level not found")
    note = re.split(r"\s+See OPSGROUP|\s+Major events:", m.group(3))[0]
    cut = re.match(r"(.{30,260}?[.!?])(\s|$)", note)
    return {"lvl": LVL[m.group(1).lower()], "word": m.group(2).strip(), "note": (cut.group(1) if cut else note[:200]).strip()}
def safeair():
    with ThreadPoolExecutor(4) as ex:
        res = list(ex.map(lambda c: safe(lambda: safeair_one(c[0])), AIRC))
    out = [dict(r["data"], c=code, name=name, link=f"https://safeairspace.net/{slug}/") for (slug, code, name), r in zip(AIRC, res) if r["ok"]]
    if len(out) < 3: raise Exception(next((r.get("error") for r in res if not r["ok"]), "Safe Airspace unavailable"))
    return out

IAEA_RE = re.compile(r"\biran|israel|middle east|natanz|fordow|isfahan|esfahan|bushehr|JCPOA|dimona|syria", re.I)
def iaea():
    root = ET.fromstring(get("https://www.iaea.org/feeds/topnews", 25, raw=True)); out = []; n = 0
    for it in root.iter("item"):
        t = html.unescape((it.findtext("title") or "").strip()); d = re.sub(r"<[^>]+>", " ", html.unescape(it.findtext("description") or ""))
        pd = (it.findtext("pubDate") or "").strip(); m = re.match(r"(\d\d)-(\d\d)-(\d\d)\s+(\d\d):(\d\d)", pd)
        try: ts = calendar.timegm((2000 + int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4)), int(m.group(5)), 0)) - 3600 if m else int(parsedate_to_datetime(pd).timestamp())
        except Exception: continue
        n += 1
        if IAEA_RE.search(t + " " + d) and ts >= NOW - 45*86400: out.append({"title": t[:220], "t": ts, "link": (it.findtext("link") or "").strip()})
    out.sort(key=lambda x: -x["t"])
    return {"items": out[:8], "seen": n}

# ---- anomalies: plain "this is outside its normal range" flags, shown on top of the page
LEVELS = [(0, "שגרה"), (10, "ערנות"), (25, "מתיחות"), (50, "הסלמה"), (75, "חירום")]
def level(x): return [n for v, n in LEVELS if x >= v][-1]
def fl_dev(past, cur):
    if cur is None or len(past) < 6: return None
    same = [v for t, v in past if abs(((t - NOW + 43200) % 86400) - 43200) <= 2 * 3600]
    base = same if len(same) >= 4 else [v for t, v in past]
    m = sorted(base)[len(base) // 2]
    return jsround((cur / m - 1) * 100) if m else None
def anomalies(s, fdev, milpast):
    A = []
    def add(k, sev, title, v, **kw): A.append(dict({"k": k, "sev": sev, "title": title, "v": v}, **kw))
    mk = {m["sym"]: m for m in s.get("markets") or [] if m.get("ok") and m.get("chg") is not None and not m.get("stale")}
    def mv(sym, warn, crit, way=0):
        m = mk.get(sym)
        if not m: return
        c = m["chg"]; a = abs(c) if way == 0 else c * way
        if a >= warn: add("mk:" + sym, "crit" if a >= crit else "warn", f'{m["name"]}: {"זינוק" if c > 0 else "צניחה"} חריג{"" if c > 0 else "ה"}', f'{c:+.1f}% מול הסגירה הקודמת')
    mv("BZ=F", 4, 8); mv("GC=F", 2.5, 5); mv("^VIX", 15, 30, 1); mv("ILS=X", 1.2, 2.5); mv("TA35.TA", 2.5, 5, -1); mv("TTF=F", 8, 15, 1)
    if fdev is not None and fdev <= -40: add("air", "crit" if fdev <= -60 else "warn", "המרחב האווירי באזור מתרוקן", f"{fdev}% מטוסים מול הרגיל בשעה הזו")
    n = s.get("net"); io = s.get("ioda") or {}; ip = (io.get("ping") or {}).get("pct")
    np_ = [x for x in (n["pct"] if n else None, ip) if x is not None]
    if np_ and min(np_) < 97: add("net", "crit" if min(np_) < 90 else "warn", "ירידה בחיבוריות האינטרנט באיראן", f'{min(np_)}% מהרגיל')
    g = io.get("gtr")
    if g and g.get("level") == "critical" and g.get("pct") is not None and g["t"] >= NOW - 12*3600: add("gtr", "warn", "צניחה בגלישה מאיראן לגוגל", f'{g["pct"]}% מהצפוי לפי IODA · סימן לחסימה או לניתוק מבפנים')
    for c, nm in (("IL", "ישראל"), ("IR", "איראן")):
        g = ((s.get("gps") or {}).get(c) or {})
        if g.get("pct") is not None and g["pct"] >= 25:
            add("gps:" + c, "crit" if g["pct"] >= 50 else "warn", f"שיבושי GPS מעל {nm}", f'{g["bad"]} מתוך {g["n"]} מטוסים מדווחים על מיקום לא אמין ({g["pct"]}%)')
    for q in s.get("quakes") or []:
        if q["t"] < NOW - 48*3600: continue
        if q.get("type") != "earthquake": add("qk:" + str(q["t"]), "crit", "אירוע סייסמי שאינו רעידת אדמה רגילה", f'עוצמה {q["m"]} · {q.get("place")} · סיווג USGS: {q["type"]}')
        elif q.get("nuke") and (q.get("m") or 0) >= 3.5: add("qk:" + str(q["t"]), "warn", f'רעידת אדמה ליד {q["site"]}', f'עוצמה {q["m"]} · {q["km"]} ק״מ מהאתר · עומק {q.get("dep")} ק״מ')
    for key in ("hormuz", "bab"):
        c = (s.get("sea") or {}).get(key)
        if c and c.get("pct") is not None and c["pct"] <= 50:
            add("sea:" + key, "crit" if c["pct"] <= 20 else "warn", f'תנועת אוניות דלה ב{c["name"]}', f'{c["avg7"]} מעברים ביום בממוצע שבועי, {c["pct"]}% מהתקופה המקבילה אשתקד ({c["base"]})')
    b = s.get("bgn")
    if b and b["foreign"] >= 5: add("bgn", "crit" if b["foreign"] >= 15 else "warn", "גל ביטולים של חברות זרות בנתב״ג", f'{b["foreign"]} ביטולים היום')
    mil = len(s.get("mil") or []); mm = _med([v for t, v in milpast])
    if len(milpast) >= 6 and mil >= max(6, 2 * (mm or 0)): add("mil", "warn", "ריבוי מטוסים צבאיים מזוהים", f"{mil} עכשיו מול {mm} בדרך כלל")
    f = s.get("firms")
    if f and f["near6"]: add("firms", "warn", "מוקדי חום ליד אתרים רגישים באיראן", f'{f["near6"]} מוקדים ב־6 ש׳ · {", ".join((f.get("sites6") or {}).keys())}')
    for m in s.get("pm") or []:
        if m.get("sec") and m.get("d1") is not None and abs(m["d1"]) >= 0.10:
            add("pm:" + (m["q"] or "")[:60], "warn", f'שוק תחזית זז {"+" if m["d1"] > 0 else "−"}{abs(jsround(m["d1"] * 100))} נק׳ ביממה', m["q"], q=m["q"])
    pa = {a["c"]: a["lvl"] for a in PREV.get("airspace") or []}
    for a in s.get("airspace") or []:
        if a["c"] in pa and a["lvl"] < pa[a["c"]]: add("asp:" + a["c"], "crit", f'הוחמרה דרגת הסיכון למרחב האווירי של {a["name"]}', f'דרגה {a["lvl"]} (הייתה {pa[a["c"]]})')
    A.sort(key=lambda a: a["sev"] != "crit")
    return A[:12]

# ---- event timeline (48 h): dated events only, carried from run to run so nothing is lost between hourly snapshots
HARD = ("launch", "intercept", "strike_ir", "warning", "expected")
def timeline(snap, osint, al):
    T = {}
    def put(i, t, k, text, src, link="", corr=1, lang="he"):
        if t and t >= NOW - 48*3600 and i not in T and not any(x["text"][:120] == text[:120] and x["src"] == src for x in T.values()): T[i] = {"id": i, "t": int(t), "k": k, "text": text[:260], "src": src, "link": link, "corr": corr, "lang": lang}
    for x in PREV.get("timeline") or []:
        if isinstance(x, dict) and x.get("id") and x.get("t", 0) >= NOW - 48*3600: T[x["id"]] = {k: v for k, v in x.items() if k != "he"}
    for o in osint:
        k = next((t for t in HARD if t in o["tags"]), None)
        if k: put("o:" + (o.get("link") or o["text"][:80]), o["t"], k, o["text"], o["src"], o.get("link") or "", o.get("corr", 1), o.get("lang", "he"))
    grp = {}
    for e in (al or {}).get("last") or []:
        g = grp.setdefault((e["t"] // 600, e["th"]), {"t": e["t"], "n": 0, "c": []})
        g["t"] = min(g["t"], e["t"]); g["n"] += e["n"]; g["c"] += [c for c in e["cities"] if c not in g["c"]]
    for (b, th), g in grp.items():
        put(f"al:{b}:{th}", g["t"], "alert", f'{THREAT.get(th, "התרעה")} · {g["n"]} יישובים · {", ".join(g["c"][:5])}', "צבע אדום", "https://www.oref.org.il", 1)
    for q in snap.get("quakes") or []:
        if q.get("site") or (q.get("m") or 0) >= 5:
            put("q:" + str(q["t"]), q["t"], "quake", f'רעידת אדמה {q["m"]}' + (f' · {q["km"]} ק״מ מ{q["site"]}' if q.get("site") else " באיראן") + f' · עומק {q.get("dep")} ק״מ', "USGS", q.get("url") or "")
    for i in (snap.get("iaea") or {}).get("items") or []:
        put("ia:" + i["link"], i["t"], "nuke", i["title"], "סבא״א", i["link"], 1, "en")
    was = {a["k"] for a in PREV.get("anoms") or []}
    for a in snap.get("anoms") or []:
        if PREV and a["k"] not in was: put(f'an:{a["k"]}:{NOW}', NOW, "anom", f'{a["title"]} · {a["v"]}', "זיהוי חריגה", "", 1, "he" if not a.get("q") else "en")
    if PREV.get("score") is not None and level(PREV["score"]) != level(snap["score"]):
        up = snap["score"] > PREV["score"]
        put(f"lv:{NOW}", NOW, "level", f'מדד המתיחות {"עלה" if up else "ירד"} לרמת "{level(snap["score"])}" ({PREV["score"]} ← {snap["score"]})', "מדד מתיחות")
    return sorted(T.values(), key=lambda x: -x["t"])[:140]

# ======================= v3 additions =======================
# previous snapshot (optional 2nd argument): last good values, flight baseline, cached translations
def load_prev(path):
    try:
        d = json.load(open(path, encoding="utf8"))
        return d if isinstance(d, dict) and d.get("ts") else {}
    except Exception:
        return {}
PREV = load_prev(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[1] != "--merge" else {}
CARRY_MAX = 6 * 3600   # a failed source may show its previous value for up to 6 hours, marked as stale

# ---- tension index (0-100). The page shows these numbers as-is; history keeps the total for the trend chart.
FWD_RE = re.compile(r"invade|airspace closure|military action|strike on iran|strikes? iran|declare war|ground (troops|operation)|bomb", re.I)
FWD_NO = re.compile(r"countries|ceasefire|peace|deal|agreement", re.I)
def jsround(x): return int(math.floor(x + 0.5))
def score(s, past, cur):
    L = s.get("launch") or {}; out = []
    def add(name, pts, mx, v): out.append({"name": name, "pts": min(mx, max(0, jsround(pts))), "max": mx, "v": v})
    ev = L.get("event")
    add("אירוע שיגור פעיל", 30 if ev and ev["on"] else 0, 30,
        (f'התרעות טילים/כטב״ם ב־15 הדקות האחרונות · {ev["areas"]} אזורים' if ev["on"] else "אין") if ev else "לא נמדד")
    w = L.get("warning") or {"n": 0}
    add("התרעה מקדימה של פיקוד העורף", 15 if w["n"] else 0, 15, f'{w["n"]} דיווחים בשעה האחרונה' if w["n"] else "אין")
    l1 = L.get("launch1") or {"n": 0, "src": 0}; l24 = L.get("launch24") or {"n": 0}
    add("דיווחי שיגור · שעה", 15 if l1["src"] >= 2 else 8 if l1["src"] else 0, 15, f'{l1["n"]} דיווחים מ־{l1["src"]} מקורות' if l1["n"] else "אין")
    add("דיווחי שיגור · 24 ש׳", l24["n"] * 2, 6, f'{l24["n"]} דיווחים' if l24["n"] else "אין")
    st = L.get("strike6") or {"n": 0, "src": 0}
    # a single outlet is capped at 5 points; the full 15 needs at least two independent sources
    add("תקיפות באיראן · 6 ש׳", st["n"] * 5, 15 if st.get("src", 0) >= 2 else 5,
        (f'{st["n"]} דיווחים מ־{st["src"]} מקורות' + ("" if st["src"] >= 2 else " · מקור יחיד, ניקוד מוגבל")) if st["n"] else "אין")
    out[-1]["max"] = 15
    a = s.get("alerts")
    add("התרעות בישראל · 24 ש׳", a["c24"] if a else 0, 10, (f'{a["c24"]} התרעות' + (f', {a["c1"]} בשעה האחרונה' if a["c1"] else "")) if a else "לא נמדד")
    ex = L.get("expected6") or {"n": 0}
    add("דיווחים על מתקפה צפויה · 6 ש׳", ex["n"] * 3, 8, f'{ex["n"]} דיווחים' if ex["n"] else "אין")
    bg = s.get("bgn")
    add("ביטולי חברות זרות בנתב״ג · היום", bg["foreign"] if bg else 0, 8,
        (f'{bg["foreign"]} ביטולים' + (" · " + ", ".join(x[0] for x in bg["airlines"][:3]) if bg.get("airlines") else "")) if bg else "לא נמדד")
    if cur is not None and len(past) >= 6:
        # compare with the same time of day (+-2 h) when there are enough samples: night traffic is always thinner
        same = [v for t, v in past if abs(((t - NOW + 43200) % 86400) - 43200) <= 2 * 3600]
        base = same if len(same) >= 4 else [v for t, v in past]
        m = sorted(base)[len(base) // 2]; d = jsround((cur / m - 1) * 100) if m else 0
        add("ירידה בתנועה האווירית באזור", 8 if d <= -50 else 4 if d <= -20 else 0, 8,
            f'{cur} מטוסים, {"+" if d > 0 else ""}{d}% מול הרגיל' + (" בשעה הזו" if len(same) >= 4 else ""))
    else:
        add("ירידה בתנועה האווירית באזור", 0, 8, "צובר נתוני השוואה" if cur is not None else "לא נמדד")
    n = s.get("net"); io = ((s.get("ioda") or {}).get("ping") or {}).get("pct")
    np_ = [x for x in (n["pct"] if n else None, io) if x is not None]
    add("אינטרנט באיראן", (8 if min(np_) < 90 else 4 if min(np_) < 97 else 0) if np_ else 0, 8,
        " · ".join(([f'ניתוב BGP {n["pct"]}%'] if n else []) + ([f'רשתות שעונות לבדיקה {io}%'] if io is not None else [])) + " מהרגיל" if np_ else "לא נמדד")
    f = s.get("firms")
    add("מוקדי חום ליד אתרים באיראן · 6 ש׳", f["near6"] * 2 if f else 0, 6,
        (f'{f["near6"]} מוקדים · {", ".join((f.get("sites6") or {}).keys())}' if f["near6"] else "אין") if f else "לא נמדד")
    fm = sorted([m for m in s.get("pm") or [] if FWD_RE.search(m["q"] or "") and not FWD_NO.search(m["q"] or "")], key=lambda m: -m["yes"])[:1]
    add("שוק תחזית · הסלמה קדימה", (6 if fm[0]["yes"] > .4 else 3 if fm[0]["yes"] >= .15 else 0) if fm else 0, 6,
        f'{jsround(fm[0]["yes"] * 100)}% · {fm[0]["q"]}' if fm else "אין שוק פעיל")
    gp = [g["pct"] for g in (s.get("gps") or {}).values() if g and g.get("pct") is not None]
    add("שיבושי GPS למטוסים באזור", (4 if max(gp) >= 50 else 2 if max(gp) >= 25 else 0) if gp else 0, 4, f'{max(gp)}% מהמטוסים מדווחים על מיקום לא אמין' if gp else "לא נמדד")
    bz = next((m for m in s.get("markets") or [] if m.get("sym") == "BZ=F" and m.get("ok") and m.get("chg") is not None and not m.get("stale")), None)
    add("זינוק במחיר הנפט", (4 if bz["chg"] >= 8 else 2 if bz["chg"] >= 4 else 0) if bz else 0, 4, f'ברנט {bz["chg"]:+.1f}% מול הסגירה הקודמת' if bz else "לא נמדד")
    hz = (s.get("sea") or {}).get("hormuz")
    if hz and hz.get("prev7") and hz["prev7"] >= 8:
        dh = jsround((hz["avg7"] / hz["prev7"] - 1) * 100)
        add("ירידה במעבר אוניות בהורמוז", 4 if dh <= -40 else 2 if dh <= -20 else 0, 4, f'{hz["avg7"]} ביום, {"+" if dh > 0 else ""}{dh}% מול השבוע הקודם')
    else:
        add("ירידה במעבר אוניות בהורמוז", 0, 4, (f'{hz["avg7"]} מעברים ביום · התנועה דלה מכדי למדוד שינוי שבועי' if hz else "לא נמדד"))
    return min(100, sum(x["pts"] for x in out)), out

# ---- Hebrew translations. The collector never calls a translation service: it lists what is new in
# translate.json, the scheduled run writes he.json, and "--merge" folds it in. Old translations are reused.
HEB = re.compile(r"[֐-׿]")
def needs_tr(t): return bool(t) and not HEB.search(t)
def tr_cache(prev):
    c = {}
    for n in prev.get("news") or []:
        if n.get("he"): c[n["title"]] = n["he"]
    for o in prev.get("osint") or []:
        if o.get("he"): c[o["text"]] = o["he"]
    for m in prev.get("pm") or []:
        if m.get("q_he"): c[m["q"]] = m["q_he"]
    for x in prev.get("timeline") or []:
        if x.get("he"): c[x["text"]] = x["he"]
    for x in (prev.get("iaea") or {}).get("items") or []:
        if x.get("he"): c[x["title"]] = x["he"]
    for x in prev.get("airspace") or []:
        if x.get("he"): c[x["note"]] = x["he"]
    for x in prev.get("manifold") or []:
        if x.get("he"): c[x["q"]] = x["he"]
    return c
def apply_tr(snap, cache):
    short = {k[:200]: v for k, v in cache.items()}
    pending = []
    def want(t):
        if needs_tr(t) and t not in cache and t not in pending: pending.append(t)
    for n in snap.get("news") or []:
        if n["title"] in cache: n["he"] = cache[n["title"]]
        else: want(n["title"])
    for m in snap.get("pm") or []:
        if m.get("q") in cache: m["q_he"] = cache[m["q"]]
        elif m.get("sec"): want(m.get("q"))
    for o in snap.get("osint") or []:
        if o["text"] in cache: o["he"] = cache[o["text"]]
        else: want(o["text"])
    for x in snap.get("timeline") or []:
        h = cache.get(x["text"]) or short.get(x["text"])
        if h: x["he"] = h
        elif x.get("lang") != "he": want(x["text"])
    for x in (snap.get("iaea") or {}).get("items") or []:
        if x["title"] in cache: x["he"] = cache[x["title"]]
        else: want(x["title"])
    for x in snap.get("airspace") or []:
        if x["note"] in cache: x["he"] = cache[x["note"]]
        else: want(x["note"])
    for x in snap.get("manifold") or []:
        if x["q"] in cache: x["he"] = cache[x["q"]]
        else: want(x["q"])
    pq = {m.get("q"): m.get("q_he") for m in snap.get("pm") or []}
    for a in snap.get("anoms") or []:
        if a.get("q") and pq.get(a["q"]): a["v"] = pq[a["q"]]
    for m in snap.get("pm") or []:
        if not m.get("sec") and m.get("q") not in cache: want(m.get("q"))
    for v in (snap.get("launch") or {}).values():
        if isinstance(v, dict):
            for i in v.get("items") or []:
                h = cache.get(i["text"]) or short.get(i["text"])
                if h: i["he"] = h
    return pending[:60]
def dump(obj, path):
    with open(path, "w", encoding="utf8") as fh: json.dump(obj, fh, ensure_ascii=False, separators=(",", ":"))
def merge(out):
    sp = os.path.join(out, "snapshot.json")
    snap = json.load(open(sp, encoding="utf8"))
    src = json.load(open(os.path.join(out, "translate.json"), encoding="utf8"))
    he = json.load(open(os.path.join(out, "he.json"), encoding="utf8"))
    if not (isinstance(he, list) and len(he) == len(src)):
        raise SystemExit("he.json must be a JSON array of exactly %d strings, same order as translate.json" % len(src))
    cache = tr_cache(snap); n = 0
    for a, b in zip(src, he):
        if isinstance(b, str) and HEB.search(b):
            cache[a] = re.sub(r"\s+", " ", b).strip()[:500]; n += 1
    left = apply_tr(snap, cache)
    dump(snap, sp)
    dump(left, os.path.join(out, "translate.json"))   # what is still untranslated; the next run picks it up
    print(json.dumps({"translated": n, "left": len(left), "bytes": os.path.getsize(sp)}))

# ---------------- run ----------------
def main():
    if len(sys.argv) > 2 and sys.argv[1] == "--merge":
        return merge(sys.argv[2])
    jobs = {
        "opensky": opensky, "adsblol": adsblol_check, "mil": military, "pm": polymarket,
        "mk": markets, "fx": fx_check, "btc": btc_check, "al": alerts,
        "bgn": ben_gurion, "net": ripe_internet, "firms": firms, "adv": advisories, "cities": city_coords, "tzlive": tz_live,
        "quakes": quakes, "sea": portwatch, "fleet": fleet, "air": safeair, "iaea": iaea, "ioda": ioda, "manifold": manifold,
    }
    for name, url, lang in FEEDS:
        jobs["feed:" + name] = (lambda n=name, u=url, l=lang: feed(n, u, l))
    for ch, lang, label in TG:
        jobs["tg:" + ch] = (lambda c=ch, l=lang, b=label: telegram(c, l, b))
    for url, label, lang in RSS_FA_AR:
        jobs["rss:" + lang] = (lambda u=url, b=label, l=lang: rss_lang(u, b, l))
    with ThreadPoolExecutor(12) as ex:
        futs = {k: ex.submit(safe, f) for k, f in jobs.items()}
        R = {k: f.result() for k, f in futs.items()}
    R["gdelt"] = safe(gdelt)   # GDELT allows 1 request / 5 s, so run it alone

    def srcname(k):
        return k.replace("feed:", "").replace("tg:", "טלגרם · ").replace("rss:fa", "BBC فارسی").replace("rss:ar", "الجزيرة")
    sources = {re.sub(r"[^A-Za-z0-9_]", "_", k): {"name": srcname(k), "ok": v["ok"], "ms": v["ms"], "err": v.get("error")} for k, v in R.items() if k != "cities"}

    # a failed source keeps showing its last good value (max 6 h) and is listed in snap["stale"]
    stale = {}
    def keep(src, sec):
        if R[src]["ok"]: return R[src]["data"]
        pv = PREV.get(sec); t = (PREV.get("stale") or {}).get(sec, PREV.get("ts", 0))
        if pv in (None, [], {}, "") or NOW - t > CARRY_MAX: return None
        stale[sec] = t; sources[src]["stale"] = t
        return pv

    # flights
    fl = None
    if R["opensky"]["ok"]:
        ac = R["opensky"]["data"]["ac"]
        counts = {k: 0 for k in POLY}
        for a in ac:
            if a["c"]: counts[a["c"]] += 1
        cross = R["adsblol"]["data"] if R["adsblol"]["ok"] else None
        agree = {}
        if cross:
            for k in ("IL", "IR"):
                a, b = counts[k], cross[k]; m = max(a, b)
                agree[k] = {"opensky": a, "adsblol": b, "pct": round(100 * min(a, b) / m) if m else 100}
        inside = [a for a in ac if a["c"]]
        rest = [a for a in ac if not a["c"]][:350]
        fl = {"total": len(ac), "counts": counts, "agree": agree, "ac": ";".join(",".join(str(v).replace(",", " ").replace(";", " ") for v in (a["lon"], a["lat"], a["trk"], a["alt"], a["cs"], a["o"] or "", a["c"] or "")) for a in inside + rest)}

    if fl is None: fl = keep("opensky", "flights")
    mk = R["mk"]["data"] if R["mk"]["ok"] else []
    pmk = {m["sym"]: m for m in PREV.get("markets") or [] if m.get("ok") and m.get("price") is not None}
    for i, m in enumerate(mk):
        p = pmk.get(m["sym"])
        if not m["ok"] and p and NOW - (p.get("stale") or PREV.get("ts", 0)) <= CARRY_MAX:
            mk[i] = dict(p, stale=p.get("stale") or PREV["ts"])
    xc = []
    if R["fx"]["ok"]:
        for m in mk:
            if m["sym"] == "ILS=X" and m.get("price"): xc.append({"name": "דולר/שקל", "a": m["price"], "b": R["fx"]["data"]["ILS"], "srcA": "Yahoo Finance", "srcB": "ExchangeRate-API"})
            if m["sym"] == "EURILS=X" and m.get("price"): xc.append({"name": "אירו/שקל", "a": m["price"], "b": R["fx"]["data"]["EURILS"], "srcA": "Yahoo Finance", "srcB": "ExchangeRate-API"})
    if R["btc"]["ok"]:
        for m in mk:
            if m["sym"] == "BTC-USD" and m.get("price"): xc.append({"name": "ביטקוין", "a": m["price"], "b": R["btc"]["data"]["usd"], "srcA": "Yahoo Finance", "srcB": R["btc"]["data"].get("src", "CoinGecko")})
    for x in xc: x["diff"] = round(abs(x["a"] - x["b"]) / x["b"] * 100, 3)

    items = []
    for k, v in R.items():
        if k.startswith("feed:") and v["ok"]: items += v["data"]
    clusters = cluster([dict(i) for i in items])
    he = sorted([i for i in items if i["lang"] == "he"], key=lambda x: -(x["t"] or 0))[:15]

    # ---- OSINT feed: telegram + FA/AR + ynet + news headlines, all classified
    osint = []
    for k, v in R.items():
        if (k.startswith("tg:") or k.startswith("rss:")) and v["ok"]: osint += v["data"]
    for i in he: osint.append({"src": "ynet מבזקים", "ch": "ynet", "lang": "he", "t": i["t"], "text": i["title"], "link": i["link"]})
    for c in clusters: osint.append({"src": " · ".join(c["outlets"][:3]), "ch": "news", "lang": "en", "t": c["t"], "text": c["title"], "link": c["link"], "n": c["n"], "outs": c["outlets"]})
    for o in osint: o["tags"] = classify(o["text"])
    osint = [o for o in osint if o["t"]]
    osint.sort(key=lambda o: -o["t"])
    # corroboration: how many distinct sources carry the same tag in the same 2-hour window
    for o in osint:
        same = {p["ch"] for p in osint if set(p["tags"]) & set(o["tags"]) - {"diplomacy", "unconfirmed"} and abs(p["t"] - o["t"]) <= 7200}
        o["corr"] = max(len(same), o.get("n", 1))
    def ind(tag, hours, min_src=1):
        hits = [o for o in osint if tag in o["tags"] and o["t"] >= NOW - hours*3600]
        srcs = set()
        for o in hits: srcs |= set(o.get("outs") or [o["ch"]])
        return {"n": len(hits), "src": len(srcs), "ok": len(srcs) >= min_src, "last": hits[0]["t"] if hits else None,
                "items": [{"text": o["text"][:200], "src": o["src"], "t": o["t"], "link": o["link"]} for o in hits[:6]]}

    al = R["al"]["data"] if R["al"]["ok"] else None
    coords = R["cities"]["data"] if R["cities"]["ok"] else {}
    if al:
        pts = {}
        for e in al["last"]:
            if e["t"] < NOW - 24*3600: continue
            for c in e["cities"]:
                if c in coords: pts[c] = [coords[c][0], coords[c][1], e["t"], e["th"]]
        al["pts"] = pts
        recent = [e for e in al["last"] if e["t"] >= NOW - 15*60 and e["th"] in (0, 5)]
        al["active"] = {"on": bool(recent), "since": min(e["t"] for e in recent) if recent else None, "areas": sum(e["n"] for e in recent)}
    tzl = R["tzlive"]
    live_n = None
    if tzl["ok"]:
        try: live_n = len(json.loads(tzl["data"]))
        except Exception: live_n = None

    launch = {
        "event": al["active"] if al else None,
        "live": live_n,
        "warning": ind("warning", 1),
        "launch1": ind("launch", 1), "launch24": ind("launch", 24),
        "intercept6": ind("intercept", 6),
        "strike6": ind("strike_ir", 6),
        "expected6": ind("expected", 6),
    }

    mil = keep("mil", "mil") or []
    gd = keep("gdelt", "gdelt") or []
    snap = {"ts": NOW, "v": 3, "sources": sources, "flights": fl, "mil": mil, "pm": keep("pm", "pm") or [], "markets": mk, "xcheck": xc,
            "alerts": al, "news": clusters, "he": he,
            "osint": [{k: o[k] for k in ("src", "lang", "t", "text", "link", "tags", "corr")} for o in osint[:70]],
            "launch": launch, "bgn": keep("bgn", "bgn"), "net": keep("net", "net"), "firms": keep("firms", "firms"),
            "adv": keep("adv", "adv"), "gdelt": gd[:60],
            "quakes": keep("quakes", "quakes") or [], "sea": keep("sea", "sea"), "fleet": keep("fleet", "fleet"),
            "airspace": keep("air", "airspace") or [], "iaea": keep("iaea", "iaea"),
            "ioda": keep("ioda", "ioda"), "manifold": keep("manifold", "manifold") or [],
            "gps": (R["adsblol"]["data"] or {}).get("gps") if R["adsblol"]["ok"] else None}
    snap["v"] = 4
    # tension index, computed here so the page and the history agree on one number
    fresh_fl = fl if R["opensky"]["ok"] else None
    past = [x for x in (PREV.get("flHist") or []) if isinstance(x, list) and len(x) == 2][-239:]   # [ts, aircraft in the six countries]
    cur = sum(fresh_fl["counts"].values()) if fresh_fl else None
    total, facs = score(snap, past, cur)
    pf = {f["name"]: f["pts"] for f in PREV.get("factors") or []}
    for f in facs: f["d"] = f["pts"] - pf.get(f["name"], f["pts"]) if pf else 0   # change since the previous run
    snap["score"], snap["factors"], snap["stale"] = total, facs, stale
    snap["scorePrev"], snap["prevTs"] = PREV.get("score"), PREV.get("ts")
    milpast = [x for x in (PREV.get("milHist") or []) if isinstance(x, list) and len(x) == 2][-239:]
    snap["milHist"] = milpast + ([[NOW, len(R["mil"]["data"])]] if R["mil"]["ok"] else [])
    snap["anoms"] = anomalies(snap, fl_dev(past, cur), milpast)
    snap["timeline"] = timeline(snap, osint, al)
    snap["flHist"] = past + ([[NOW, cur]] if cur is not None else [])
    pending = apply_tr(snap, tr_cache(PREV))
    fl = fresh_fl; mil = R["mil"]["data"] if R["mil"]["ok"] else []; gd = R["gdelt"]["data"] if R["gdelt"]["ok"] else []   # history keeps measured values only
    fi = R["firms"]["data"]; nt = R["net"]["data"]; bg = R["bgn"]["data"]
    point = {"ts": NOW, "fl": fl["counts"] if fl else None, "flTotal": fl["total"] if fl else None, "mil": len(mil),
             "al24": al["c24"] if al else None, "al1": al["c1"] if al else None,
             "confirmed": sum(1 for c in clusters if c["n"] >= 2),
             "firms24": fi["ir24"] if fi else None, "firmsNear6": fi["near6"] if fi else None,
             "net": nt["pct"] if nt else None, "bgnCanc": bg["foreign"] if bg else None,
             "launch24": launch["launch24"]["n"], "strike6": launch["strike6"]["n"], "gdelt3h": len(gd) if R["gdelt"]["ok"] else None,
             "score": total, "anoms": len(snap["anoms"]),
             "brent": next((m.get("price") for m in mk if m["sym"] == "BZ=F" and m.get("ok") and not m.get("stale")), None),
             "hormuz": (R["sea"]["data"] or {}).get("hormuz", {}).get("avg7") if R["sea"]["ok"] else None,
             "gpsIL": ((snap.get("gps") or {}).get("IL") or {}).get("pct"), "gpsIR": ((snap.get("gps") or {}).get("IR") or {}).get("pct"),
             "quakes24": sum(1 for q in (R["quakes"]["data"] or []) if q["t"] >= NOW - 86400) if R["quakes"]["ok"] else None,
             "pm": [{"q": m["q"], "yes": m["yes"]} for m in (R["pm"]["data"] or []) if m.get("sec")][:12]}
    os.makedirs(OUT, exist_ok=True)
    dump(snap, os.path.join(OUT, "snapshot.json"))
    dump(point, os.path.join(OUT, "point.json"))
    dump(pending, os.path.join(OUT, "translate.json"))
    dump({"before": NOW - 10*86400}, os.path.join(OUT, "prune.json"))   # history older than 10 days can be deleted
    print(json.dumps({"ok": {k: v["ok"] for k, v in sources.items()}, "bytes": os.path.getsize(os.path.join(OUT, "snapshot.json")),
                      "flights": fl and fl["counts"], "mil": len(mil), "pm": len(snap["pm"]), "news": len(clusters),
                      "confirmed": point["confirmed"], "al24": point["al24"], "firms24": point["firms24"], "firmsNear6": point["firmsNear6"],
                      "net": point["net"], "bgnCanc": point["bgnCanc"], "launch24": point["launch24"], "strike6": point["strike6"],
                      "event": bool(al and al["active"]["on"]), "osint": len(snap["osint"]), "gdelt": len(gd),
                      "score": total, "anoms": len(snap["anoms"]), "timeline": len(snap["timeline"]), "stale": sorted(stale), "toTranslate": len(pending)}, ensure_ascii=False))

if __name__ == "__main__":
    main()
