#!/usr/bin/env python3
"""World + cyber collector. Pulls open sources only (no keys needed), writes world.json.
Usage: python3 world.py OUT_DIR [PREV_world.json]
Optional env CF_RADAR_TOKEN adds Cloudflare Radar attack origin/target countries.
"""
import json, os, re, sys, time, calendar, html, urllib.request, urllib.parse, xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from email.utils import parsedate_to_datetime

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
PREV_PATH = sys.argv[2] if len(sys.argv) > 2 else None
sys.argv = [sys.argv[0], OUT]          # collector reads argv on import; keep it from loading a previous snapshot
import collector as C                   # reuse get(), cluster(), safe()

NOW = int(time.time())
get, safe = C.get, C.safe

# ---------------- countries: world-atlas names + what headlines call them ----------------
CTRY = {
 "United States of America": r"\bU\.?S\.?A?\b|United States|America(?!n Samoa)|Washington|White House|Pentagon|Trump|Biden",
 "Russia": r"Russia|Kremlin|Moscow|Putin", "Ukraine": r"Ukrain|Kyiv|Kiev|Zelensk|Kharkiv|Odesa|Donbas",
 "China": r"China|Chinese|Beijing|Xi Jinping", "Taiwan": r"Taiwan|Taipei", "Japan": r"Japan|Tokyo",
 "South Korea": r"South Korea|Seoul", "North Korea": r"North Korea|Pyongyang|Kim Jong", "India": r"India|New Delhi|Modi",
 "Pakistan": r"Pakistan|Islamabad", "Afghanistan": r"Afghan|Kabul|Taliban", "Bangladesh": r"Bangladesh|Dhaka",
 "Myanmar": r"Myanmar|Burma", "Thailand": r"Thailand|Thai\b|Bangkok", "Vietnam": r"Vietnam|Hanoi", "Philippines": r"Philippin|Manila",
 "Indonesia": r"Indonesia|Jakarta", "Malaysia": r"Malaysia", "Australia": r"Australia|Canberra|Sydney", "New Zealand": r"New Zealand",
 "Israel": r"Israel|Jerusalem|Tel Aviv|Netanyahu|IDF", "Palestine": r"Gaza|West Bank|Palestin|Hamas", "Lebanon": r"Leban|Beirut|Hezbollah",
 "Syria": r"Syria|Damascus", "Iran": r"Iran|Tehran|Khamenei|IRGC", "Iraq": r"Iraq|Baghdad", "Yemen": r"Yemen|Houthi|Sanaa",
 "Saudi Arabia": r"Saudi|Riyadh", "Jordan": r"Jordan|Amman", "Egypt": r"Egypt|Cairo", "Turkey": r"Turk(ey|iye|ish)|Ankara|Erdogan|Istanbul",
 "Qatar": r"Qatar|Doha", "United Arab Emirates": r"\bUAE\b|Emirat|Dubai|Abu Dhabi", "Libya": r"Libya|Tripoli",
 "Sudan": r"(?<!South )Sudan|Khartoum|Darfur", "S. Sudan": r"South Sudan|Juba", "Ethiopia": r"Ethiopia|Addis", "Somalia": r"Somali|Mogadishu",
 "Kenya": r"Kenya|Nairobi", "Nigeria": r"Nigeria|Abuja|Lagos", "Mali": r"\bMali\b|Bamako", "Niger": r"\bNiger\b|Niamey", "Burkina Faso": r"Burkina",
 "Dem. Rep. Congo": r"\bDRC\b|Congo|Kinshasa|Goma", "South Africa": r"South Africa|Johannesburg|Pretoria|Cape Town", "Mozambique": r"Mozambique",
 "United Kingdom": r"\bUK\b|Britain|British|London|Starmer|England|Scotland", "France": r"France|French|Paris|Macron", "Germany": r"German|Berlin|Merz",
 "Italy": r"Ital(y|ian)|Rome|Meloni", "Spain": r"Spain|Spanish|Madrid", "Poland": r"Poland|Polish|Warsaw", "Greece": r"Greece|Greek|Athens",
 "Netherlands": r"Netherlands|Dutch|Amsterdam", "Belgium": r"Belgi|Brussels", "Sweden": r"Swed", "Norway": r"Norw", "Finland": r"Finland|Finnish",
 "Denmark": r"Denmark|Danish|Copenhagen|Greenland", "Hungary": r"Hungar|Budapest|Orban", "Romania": r"Romania", "Serbia": r"Serbia|Belgrade",
 "Belarus": r"Belarus|Minsk|Lukashenko", "Georgia": r"Georgia(?!n Bay)|Tbilisi", "Armenia": r"Armenia|Yerevan", "Azerbaijan": r"Azerbaijan|Baku",
 "Moldova": r"Moldova", "Kazakhstan": r"Kazakh", "Canada": r"Canad|Ottawa|Carney", "Mexico": r"Mexic", "Cuba": r"Cuba|Havana", "Haiti": r"Haiti",
 "Venezuela": r"Venezuel|Caracas|Maduro", "Colombia": r"Colombia|Bogota", "Brazil": r"Brazil|Brasilia|Lula", "Argentina": r"Argentin|Buenos Aires|Milei",
 "Peru": r"\bPeru\b|Lima", "Chile": r"\bChile\b|Santiago", "Ecuador": r"Ecuador", "Bolivia": r"Bolivia", "Nepal": r"Nepal|Kathmandu", "Sri Lanka": r"Sri Lanka",
}
CRE = {k: re.compile(v, re.I if not v.startswith(r"\bU") else 0) for k, v in CTRY.items()}
CRE["United States of America"] = re.compile(CTRY["United States of America"])
def countries(text):
    hits = [k for k, r in CRE.items() if r.search(text)]
    return hits[:3]

# ---------------- topic + severity ----------------
TOPIC = {
 "war":      (r"\bwar\b|\bstrikes?\b(?! (deal|action by))|\bstruck\b|\battack(s|ed)?\b|airstrike|air strike|missile|shelling|drone strike|offensive|troops|invasion|ceasefire|frontline|bombard", 18),
 "terror":   (r"terror|bombing|suicide bomb|gunman|mass shooting|hostage|stabbing|explosion|\bblast(?!s? off|ed off)", 16),
 "disaster": (r"earthquake|tsunami|hurricane|typhoon|cyclone|flood|wildfire|landslide|volcano|eruption|tornado|heatwave", 15),
 "politics": (r"election|coup|resign|impeach|parliament|president|prime minister|protest|unrest|martial law|referendum|sanction", 8),
 "economy":  (r"market|stocks|recession|inflation|tariff|central bank|interest rate|oil price|currency|default|trade deal", 7),
 "health":   (r"outbreak|epidemic|pandemic|virus|cholera|ebola|measles|bird flu|mpox|WHO\b", 10),
 "cyber":    (r"cyber|hack|ransomware|data breach|DDoS|malware", 10),
 "diplomacy":(r"summit|talks|treaty|agreement|envoy|negotiat|visit", 5),
}
TRE = {k: re.compile(v[0], re.I) for k, v in TOPIC.items()}
DEATH = re.compile(r"(\d[\d,]*)\s+(?:people\s+)?(?:killed|dead|die[sd]?|deaths|casualties|wounded|injured)", re.I)
NUMW = {"dozens": 24, "scores": 40, "hundreds": 200, "thousands": 2000}
DEATHW = re.compile(r"\b(dozens|scores|hundreds|thousands)\s+(?:of\s+people\s+)?(?:killed|dead|wounded|injured)", re.I)
KILLS = re.compile(r"\bkill(?:s|ing|ed)?\s+(?:at least\s+|more than\s+|over\s+)?(\d[\d,]*)", re.I)
def topics(t): return [k for k, r in TRE.items() if r.search(t)]
def casualties(t):
    n = 0
    for m in DEATH.finditer(t):
        try: n = max(n, int(m.group(1).replace(",", "")))
        except ValueError: pass
    for m in KILLS.finditer(t):
        try: n = max(n, int(m.group(1).replace(",", "")))
        except ValueError: pass
    for m in DEATHW.finditer(t): n = max(n, NUMW[m.group(1).lower()])
    return n if n < 1_000_000 else 0

# ---------------- RSS ----------------
def rss(name, url, hours=30, gnews=False):
    root = ET.fromstring(get(url, 25, raw=True))
    out = []
    items = list(root.iter("item")) or list(root.iter("{http://purl.org/rss/1.0/}item"))
    for it in items:
        f = lambda tag: (it.findtext(tag) or it.findtext("{http://purl.org/rss/1.0/}" + tag) or "")
        title = html.unescape(f("title").strip())
        pub = f("pubDate") or it.findtext("{http://purl.org/dc/elements/1.1/}date") or ""
        try: ts = int(parsedate_to_datetime(pub).timestamp())
        except Exception:
            try: ts = calendar.timegm(time.strptime(pub[:19], "%Y-%m-%dT%H:%M:%S"))
            except Exception: ts = None
        if ts and ts < NOW - hours * 3600: continue
        outlet = name
        src = it.find("source")
        if gnews and src is not None and src.text:
            outlet = src.text.strip(); title = re.sub(r"\s+-\s+" + re.escape(outlet) + r"$", "", title)
        if not title: continue
        out.append({"title": title[:220], "link": f("link").strip(), "t": ts, "outlet": outlet, "via": name, "lang": "en"})
    return out[:60]

WORLD_FEEDS = [
 ("BBC", "https://feeds.bbci.co.uk/news/world/rss.xml", False),
 ("Al Jazeera", "https://www.aljazeera.com/xml/rss/all.xml", False),
 ("The Guardian", "https://www.theguardian.com/world/rss", False),
 ("New York Times", "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", False),
 ("DW", "https://rss.dw.com/rdf/rss-en-world", False),
 ("France 24", "https://www.france24.com/en/rss", False),
 ("Google News", "https://news.google.com/rss/headlines/section/topic/WORLD?hl=en-US&gl=US&ceid=US:en", True),
 ("Google News", "https://news.google.com/rss/headlines/section/topic/BUSINESS?hl=en-US&gl=US&ceid=US:en", True),
]
CYBER_FEEDS = [
 ("BleepingComputer", "https://www.bleepingcomputer.com/feed/", False),
 ("The Hacker News", "https://feeds.feedburner.com/TheHackersNews", False),
 ("The Record", "https://therecord.media/feed", False),
 ("SecurityWeek", "https://www.securityweek.com/feed/", False),
 ("Google News", "https://news.google.com/rss/search?q=" + urllib.parse.quote("cyberattack OR ransomware OR hackers when:1d") + "&hl=en-US&gl=US&ceid=US:en", True),
]

def score_event(c):
    text = " ".join([c["title"]] + [x["title"] for x in c.get("items", [])])
    tp = topics(text); dead = casualties(text)
    sev = max([TOPIC[t][1] for t in tp] or [0])
    age_h = max(0, (NOW - (c["t"] or NOW)) / 3600)
    s = c["n"] * 12 + sev + min(25, dead // 4) - min(20, age_h * 1.2)
    lvl = 3 if s >= 55 else 2 if s >= 38 else 1
    return {"title": c["title"], "link": c["link"], "t": c["t"], "outlets": c["outlets"], "n": c["n"],
            "items": c.get("items", [])[:5], "topics": tp, "dead": dead, "ctry": countries(text), "score": round(s), "lvl": lvl}

def world_news():
    jobs = [(n, u, g) for n, u, g in WORLD_FEEDS]
    with ThreadPoolExecutor(8) as ex:
        res = list(ex.map(lambda j: safe(lambda: rss(j[0], j[1], 30, j[2])), jobs))
    items, ok = [], {}
    for (n, u, g), r in zip(jobs, res):
        ok[n] = ok.get(n, False) or r["ok"]
        if r["ok"]: items += r["data"]
    if not items: raise Exception("no world feed answered")
    # cluster() returns the 30 biggest stories, ranked by number of outlets
    cl = C.cluster([dict(i) for i in items])
    ev = sorted((score_event(c) for c in cl), key=lambda e: -e["score"])
    return {"events": ev, "feeds": ok, "items": len(items)}

def cyber_news():
    with ThreadPoolExecutor(6) as ex:
        res = list(ex.map(lambda j: safe(lambda: rss(j[0], j[1], 48, j[2])), CYBER_FEEDS))
    items = []
    for r in res:
        if r["ok"]: items += r["data"]
    if not items: raise Exception("no cyber feed answered")
    cl = C.cluster([dict(i) for i in items])
    out = []
    for c in cl:
        text = " ".join([c["title"]] + [x["title"] for x in c.get("items", [])])
        out.append({"title": c["title"], "link": c["link"], "t": c["t"], "outlets": c["outlets"], "n": c["n"],
                    "ctry": countries(text), "il": bool(re.search(r"Israel|Iran", text, re.I))})
    out.sort(key=lambda x: (-min(x["n"], 3), -(x["t"] or 0)))
    return out[:30]

# ---------------- hazards ----------------
GD_TYPE = {"EQ": "רעידת אדמה", "TC": "סופה טרופית", "FL": "הצפות", "VO": "התפרצות הר געש", "WF": "שריפת ענק", "DR": "בצורת", "TS": "צונאמי"}
def gdacs():
    d = get("https://www.gdacs.org/gdacsapi/api/events/geteventlist/EVENTS4APP", 30)
    out = []
    for f in d.get("features", []):
        p = f.get("properties", {}); g = f.get("geometry") or {}
        if g.get("type") != "Point": continue
        lvl = p.get("alertlevel", "Green")
        try: ts = calendar.timegm(time.strptime((p.get("todate") or p.get("fromdate"))[:19], "%Y-%m-%dT%H:%M:%S"))
        except Exception: ts = None
        if ts and ts < NOW - 10 * 86400: continue
        if lvl == "Green" and p.get("eventtype") != "TC": continue   # green quakes are covered by USGS
        out.append({"type": p.get("eventtype"), "he": GD_TYPE.get(p.get("eventtype"), p.get("eventtype")), "lvl": lvl,
                    "name": (p.get("name") or "")[:120], "country": (p.get("country") or "")[:60], "t": ts,
                    "lon": round(g["coordinates"][0], 2), "lat": round(g["coordinates"][1], 2),
                    "link": (p.get("url") or {}).get("report") if isinstance(p.get("url"), dict) else None,
                    "sev": (p.get("severitydata") or {}).get("severitytext", "")[:120]})
    rank = {"Red": 0, "Orange": 1, "Green": 2}
    out.sort(key=lambda x: (rank.get(x["lvl"], 3), -(x["t"] or 0)))
    return out[:40]

def quakes_world():
    d = get("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson", 20)
    out = []
    for f in d["features"]:
        p = f["properties"]; c = f["geometry"]["coordinates"]
        out.append({"mag": p["mag"], "place": (p.get("place") or "")[:100], "t": int(p["time"] / 1000), "lon": round(c[0], 2), "lat": round(c[1], 2),
                    "tsunami": bool(p.get("tsunami")), "alert": p.get("alert"), "link": p.get("url")})
    out.sort(key=lambda q: -q["mag"])
    return out[:40]

EO_HE = {"Wildfires": "שריפה", "Severe Storms": "סופה", "Volcanoes": "הר געש", "Sea and Lake Ice": "קרח", "Floods": "הצפה", "Dust and Haze": "אובך", "Landslides": "מפולת"}
def eonet():
    d = get("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=7&limit=80", 25)
    out = []
    for e in d.get("events", []):
        g = (e.get("geometry") or [])[-1:] or []
        if not g or g[0].get("type") != "Point": continue
        cat = (e.get("categories") or [{}])[0].get("title", "")
        if cat == "Sea and Lake Ice": continue
        try: ts = calendar.timegm(time.strptime(g[0]["date"][:19], "%Y-%m-%dT%H:%M:%S"))
        except Exception: ts = None
        out.append({"cat": EO_HE.get(cat, cat), "title": e.get("title", "")[:120], "t": ts,
                    "lon": round(g[0]["coordinates"][0], 2), "lat": round(g[0]["coordinates"][1], 2)})
    return out[:60]

# ---------------- cyber data ----------------
def geo_ips(ips):
    """ip-api.com batch: free, no key, 100 IPs per request, 15 requests/min."""
    res = {}
    ips = [i for i in dict.fromkeys(ips) if i][:300]
    for k in range(0, len(ips), 100):
        body = json.dumps([{"query": ip, "fields": "query,countryCode,country,lat,lon,status"} for ip in ips[k:k+100]]).encode()
        req = urllib.request.Request("http://ip-api.com/batch", data=body, headers=dict(C.UA, **{"Content-Type": "application/json"}))
        with urllib.request.urlopen(req, timeout=25) as r:
            for x in json.loads(r.read()):
                if x.get("status") == "success": res[x["query"]] = x
        time.sleep(0.5)
    return res

def isc():
    info = get("https://isc.sans.edu/api/infocon?json", 20).get("status")
    tops = get("https://isc.sans.edu/api/topips/records/100?json", 25)
    ports = get("https://isc.sans.edu/api/topports/records/10?json", 25)
    ports = [v for k, v in sorted(ports.items(), key=lambda kv: int(kv[0]) if kv[0].isdigit() else 99) if isinstance(v, dict)]
    return {"infocon": info, "top": [{"ip": t["source"], "n": t["reports"], "targets": t.get("targets")} for t in tops if isinstance(t, dict)],
            "ports": [{"port": p.get("targetport"), "n": p.get("records"), "src": p.get("sources")} for p in ports]}

def feodo():
    d = get("https://feodotracker.abuse.ch/downloads/ipblocklist.json", 25)
    return [{"ip": x.get("ip_address"), "port": x.get("port"), "on": x.get("status") == "online", "mw": x.get("malware"),
             "cc": x.get("country"), "seen": x.get("last_online")} for x in d][:200]

def ransomware():
    d = get("https://www.ransomlook.io/api/recent", 25)
    out = []
    for x in d:
        try: ts = calendar.timegm(time.strptime(x["discovered"][:19], "%Y-%m-%d %H:%M:%S"))
        except Exception: continue
        out.append({"victim": (x.get("post_title") or "")[:120], "group": x.get("group_name"), "sector": (x.get("description") or "")[:60], "t": ts})
    out.sort(key=lambda v: -v["t"])
    groups = {}
    for v in out:
        if v["t"] >= NOW - 72 * 3600: groups[v["group"]] = groups.get(v["group"], 0) + 1
    return {"recent": out[:40], "n24": sum(1 for v in out if v["t"] >= NOW - 86400), "n72": sum(1 for v in out if v["t"] >= NOW - 3 * 86400),
            "groups": sorted(groups.items(), key=lambda kv: -kv[1])[:10],
            "il": [v for v in out if re.search(r"israel|\.il\b|ישראל", v["victim"], re.I)][:10]}

def kev():
    d = get("https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json", 40)
    lim = time.strftime("%Y-%m-%d", time.gmtime(NOW - 14 * 86400))
    v = [x for x in d.get("vulnerabilities", []) if x.get("dateAdded", "") >= lim]
    v.sort(key=lambda x: x["dateAdded"], reverse=True)
    return {"n14": len(v), "n7": sum(1 for x in v if x["dateAdded"] >= time.strftime("%Y-%m-%d", time.gmtime(NOW - 7 * 86400))),
            "items": [{"cve": x["cveID"], "vendor": x.get("vendorProject"), "product": x.get("product"), "name": (x.get("vulnerabilityName") or "")[:120],
                       "date": x["dateAdded"], "ransom": x.get("knownRansomwareCampaignUse") == "Known"} for x in v[:25]]}

def hibp():
    x = get("https://haveibeenpwned.com/api/v3/latestbreach", 20)
    return {"name": x.get("Title"), "date": x.get("BreachDate"), "added": x.get("AddedDate"), "n": x.get("PwnCount"), "classes": (x.get("DataClasses") or [])[:5]}

def cf_radar():
    tok = os.environ.get("CF_RADAR_TOKEN")
    if not tok: return None
    def q(path):
        req = urllib.request.Request("https://api.cloudflare.com/client/v4/radar/" + path, headers={"Authorization": "Bearer " + tok, **C.UA})
        with urllib.request.urlopen(req, timeout=25) as r: return json.loads(r.read())["result"]
    o = q("attacks/layer7/top/locations/origin?dateRange=1d&limit=15&format=json")
    t = q("attacks/layer7/top/locations/target?dateRange=1d&limit=15&format=json")
    pick = lambda r, k: [{"cc": x.get(k + "CountryAlpha2"), "name": x.get(k + "CountryName"), "pct": float(x.get("value", 0))} for x in r.get("top_0", [])]
    return {"origin": pick(o, "origin"), "target": pick(t, "target")}

WMK = [("^GSPC", "S&P 500", "ארה״ב"), ("^IXIC", "נאסד״ק", "ארה״ב"), ("^DJI", "דאו ג׳ונס", "ארה״ב"), ("^FTSE", "FTSE 100", "בריטניה"),
       ("^GDAXI", "DAX", "גרמניה"), ("^FCHI", "CAC 40", "צרפת"), ("^N225", "ניקיי", "יפן"), ("^HSI", "האנג סנג", "הונג קונג"),
       ("000001.SS", "שנגחאי", "סין"), ("TA35.TA", "ת״א 35", "ישראל"), ("EURUSD=X", "אירו / דולר", "מטבע"), ("JPY=X", "דולר / ין", "מטבע"),
       ("BZ=F", "נפט ברנט", "סחורה"), ("GC=F", "זהב", "סחורה"), ("BTC-USD", "ביטקוין", "קריפטו"), ("^VIX", "VIX · מדד הפחד", "תנודתיות")]
def world_markets():
    with ThreadPoolExecutor(6) as ex:
        res = list(ex.map(lambda s: safe(lambda: C.yahoo_one(s[0])), WMK))
    out = [{"sym": s, "name": n, "where": w, **{k: (r["data"] or {}).get(k) for k in ("price", "chg", "spark", "t")}, "ok": r["ok"]} for (s, n, w), r in zip(WMK, res)]
    if not any(m["ok"] for m in out): raise Exception("Yahoo Finance did not answer")
    for m in out: m["spark"] = (m.get("spark") or [])[::3]
    return out

def cyber_index(cy):
    """0-100: how busy the cyber picture is today. Every part is shown on the page with its points."""
    out = []
    def add(name, pts, mx, v): out.append({"name": name, "pts": int(min(mx, max(0, round(pts)))), "max": mx, "v": v})
    inf = (cy.get("isc") or {}).get("infocon")
    add("רמת איום עולמית (SANS)", {"green": 0, "yellow": 20, "orange": 35, "red": 50}.get(inf, 0), 50, {"green": "ירוק · שגרה", "yellow": "צהוב", "orange": "כתום", "red": "אדום"}.get(inf, "לא נמדד"))
    rw = cy.get("ransom")
    if rw: add("קורבנות כופרה · 24 ש׳", (rw["n24"] - 50) * 0.5, 20, f'{rw["n24"]} קורבנות חדשים · בדרך כלל 30–60 ביום')
    else: add("קורבנות כופרה · 24 ש׳", 0, 20, "לא נמדד")
    k = cy.get("kev")
    if k: add("פרצות שמנוצלות בפועל · 7 ימים", (k["n7"] - 8) * 1.5, 15, f'{k["n7"]} נוספו לרשימת CISA · בדרך כלל 4–10 בשבוע')
    else: add("פרצות שמנוצלות בפועל · 7 ימים", 0, 15, "לא נמדד")
    news = cy.get("news") or []
    big = [n for n in news if n["n"] >= 3 and (n["t"] or 0) >= NOW - 86400]
    add("אירועי סייבר שמדווחים בכמה מקורות", (len(big) - 3) * 4, 15, (f'{len(big)} אירועים ביממה' if big else "אין") + " · בדרך כלל 1–4")
    return min(100, sum(x["pts"] for x in out)), out

def main():
    prev = {}
    if PREV_PATH:
        try: prev = json.load(open(PREV_PATH, encoding="utf8"))
        except Exception: prev = {}
    jobs = {"news": world_news, "gdacs": gdacs, "quakes": quakes_world, "eonet": eonet,
            "cnews": cyber_news, "isc": isc, "feodo": feodo, "ransom": ransomware, "kev": kev, "hibp": hibp, "radar": cf_radar, "mk": world_markets}
    with ThreadPoolExecutor(10) as ex:
        futs = {k: ex.submit(safe, f) for k, f in jobs.items()}
        R = {k: f.result() for k, f in futs.items()}
    def keep(k, sec, sub=None):
        if R[k]["ok"]: return R[k]["data"]
        src = (prev.get(sub) or {}) if sub else prev
        v = src.get(sec)
        return v if v and NOW - prev.get("ts", 0) <= 6 * 3600 else None
    isc_d = keep("isc", "isc", "cyber")
    # geolocate attack sources (DShield) and botnet C2 servers (Feodo) for the cyber map
    fe = keep("feodo", "c2", "cyber") or []
    pts = []
    try:
        ips = [t["ip"] for t in (isc_d or {}).get("top", [])] + [c["ip"] for c in fe]
        old = {p["ip"]: p for p in ((prev.get("cyber") or {}).get("geo") or [])}
        need = [i for i in ips if i not in old]
        g = geo_ips(need) if need else {}
        for t in (isc_d or {}).get("top", []):
            x = g.get(t["ip"]) or old.get(t["ip"])
            if x: pts.append({"ip": t["ip"], "k": "scan", "n": t["n"], "cc": x.get("countryCode") or x.get("cc"), "lat": x["lat"], "lon": x["lon"]})
        for c in fe:
            x = g.get(c["ip"]) or old.get(c["ip"])
            if x: pts.append({"ip": c["ip"], "k": "c2", "mw": c["mw"], "on": c["on"], "cc": x.get("countryCode") or x.get("cc"), "lat": x["lat"], "lon": x["lon"]})
        geo_ok = True
    except Exception as e:
        geo_ok = False; pts = (prev.get("cyber") or {}).get("geo") or []
    cyber = {"news": keep("cnews", "news", "cyber") or [], "isc": isc_d, "c2": fe[:60], "ransom": keep("ransom", "ransom", "cyber"),
             "kev": keep("kev", "kev", "cyber"), "hibp": keep("hibp", "hibp", "cyber"), "radar": R["radar"]["data"] if R["radar"]["ok"] else None,
             "geo": [{"ip": p["ip"], "k": p["k"], "n": p.get("n"), "mw": p.get("mw"), "on": p.get("on"), "cc": p.get("cc"), "lat": p["lat"], "lon": p["lon"]} for p in pts]}
    cyber["score"], cyber["factors"] = cyber_index(cyber)
    wn = keep("news", "news") or {"events": [], "feeds": {}}
    names = {"news": "חדשות עולם (8 עורכים)", "gdacs": "GDACS · אסונות", "quakes": "USGS · רעידות בעולם", "eonet": "NASA EONET",
             "cnews": "חדשות סייבר", "isc": "SANS ISC · DShield", "feodo": "abuse.ch Feodo", "ransom": "RansomLook", "kev": "CISA KEV",
             "hibp": "Have I Been Pwned", "radar": "Cloudflare Radar", "mk": "Yahoo Finance · מדדים עולמיים"}
    sources = {k: {"name": names[k], "ok": v["ok"], "ms": v["ms"], "err": v.get("error")} for k, v in R.items() if not (k == "radar" and v["ok"] and v["data"] is None)}
    sources["geo"] = {"name": "ip-api · מיקום כתובות", "ok": geo_ok, "ms": 0, "err": None}
    ev = wn["events"]
    world = {"ts": NOW, "v": 1, "events": ev[:45], "major": [e for e in ev if e["lvl"] >= 2][:12],
             "gdacs": keep("gdacs", "gdacs") or [], "quakes": keep("quakes", "quakes") or [], "eonet": keep("eonet", "eonet") or [],
             "markets": keep("mk", "markets") or [], "cyber": cyber, "sources": sources}
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, "world.json"), "w", encoding="utf8") as fh:
        json.dump(world, fh, ensure_ascii=False, separators=(",", ":"))
    print(json.dumps({"ok": {k: v["ok"] for k, v in sources.items()}, "events": len(ev), "major": len(world["major"]),
                      "gdacs": len(world["gdacs"]), "quakes": len(world["quakes"]), "geo": len(cyber["geo"]), "cyber": cyber["score"],
                      "bytes": os.path.getsize(os.path.join(OUT, "world.json"))}, ensure_ascii=False))

if __name__ == "__main__":
    main()
