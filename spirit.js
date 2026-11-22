/* Spiritual forecast view. Everything here is computed in the browser from the date and the planets' positions
   (astronomy-engine), then set beside the measured data of the other views (SNAP, WORLD). No server, no tokens. */
(() => {
"use strict";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const norm = x => ((x % 360) + 360) % 360;
const SIGNS = ["טלה", "שור", "תאומים", "סרטן", "אריה", "בתולה", "מאזניים", "עקרב", "קשת", "גדי", "דלי", "דגים"];
const SIGN_EL = ["אש", "אדמה", "אוויר", "מים"];
const SIGN_SAY = ["יוזמה, דחף וחוסר סבלנות", "יציבות, חומר ועקשנות", "דיבור, סקרנות ופיזור", "בית, רגש והגנה", "גאווה, יצירה ובמה", "דיוק, ביקורת ושירות", "איזון, יחסים והסכמים", "עומק, שליטה וסודות", "אמונה, מרחב והגזמה", "אחריות, מבנה ושאפתנות", "חידוש, קהילה וריחוק", "חמלה, דמיון וטשטוש"];
const B = [["Sun", "שמש", "זהות, הנהגה ומנהיגים"], ["Moon", "ירח", "רגש, ציבור ומצב רוח"], ["Mercury", "מרקורי", "תקשורת, מסחר וטכנולוגיה"], ["Venus", "ונוס", "יחסים, ערכים וכסף"], ["Mars", "מאדים", "עימות, צבא ופעולה"], ["Jupiter", "צדק", "התרחבות, אמונה ומשפט"], ["Saturn", "שבתאי", "מגבלות, מבנים וממשל"], ["Uranus", "אורנוס", "זעזוע, מרד וטכנולוגיה"], ["Neptune", "נפטון", "ערפל, אשליה ואידאלים"], ["Pluto", "פלוטו", "כוח, שליטה ותמורה עמוקה"]];
const HE = Object.fromEntries(B.map(b => [b[0], b[1]])), KW = Object.fromEntries(B.map(b => [b[0], b[2]]));
const ASP = [[0, "conj", "צמידות", 7], [60, "sext", "משושה", 3.5], [90, "sq", "ריבוע", 6], [120, "tri", "משולש", 5], [180, "opp", "ניגוד", 7]];
const NUM = {1: "התחלות, יוזמה ומנהיגות", 2: "שותפות, סבלנות ודיפלומטיה", 3: "ביטוי, יצירה ותקשורת", 4: "סדר, עבודה ויסודות", 5: "שינוי, תנועה וחופש", 6: "אחריות, בית וריפוי", 7: "התבוננות, לימוד ואמת פנימית", 8: "כוח, כסף והישג", 9: "סיום, שחרור וחמלה", 11: "אינטואיציה והארה (מספר מאסטר)", 22: "בנייה בקנה מידה גדול (מספר מאסטר)", 33: "הוראה וריפוי (מספר מאסטר)"};
const TAROT = [["השוטה", "קפיצה אל הלא נודע"], ["הקוסם", "כוח רצון וכלים ביד"], ["הכוהנת הגדולה", "ידע נסתר ואינטואיציה"], ["הקיסרית", "שפע, גוף ויצירה"], ["הקיסר", "סמכות, סדר וגבולות"], ["הכוהן הגדול", "מסורת, הוראה ואמונה"], ["האוהבים", "בחירה מהלב וחיבור"], ["המרכבה", "ניצחון דרך שליטה עצמית"], ["הכוח", "עדינות שמרסנת את החיה"], ["הנזיר", "בדידות, חיפוש ואור פנימי"], ["גלגל המזל", "תפנית, מחזוריות וגורל"], ["הצדק", "אמת, איזון ותוצאה"], ["התלוי", "השהיה ונקודת מבט הפוכה"], ["המוות", "סוף הכרחי ולידה מחדש"], ["האיפוק", "מזיגה, מתינות וריפוי"], ["השטן", "כבילה, תאווה וצל"], ["המגדל", "קריסה פתאומית של השקר"], ["הכוכב", "תקווה וריפוי אחרי הסערה"], ["הירח", "פחדים, אשליות ותת־מודע"], ["השמש", "בהירות, שמחה והצלחה"], ["יום הדין", "התעוררות וקריאה"], ["העולם", "השלמה וסגירת מעגל"]];
const STEM = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"], BRANCH = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
const ELEM = ["עץ", "אש", "אדמה", "מתכת", "מים"], ELEM_SAY = ["צמיחה, התחלה ודחיפה קדימה", "התלהבות, חשיפה ומהירות", "ייצוב, האטה ועיכול", "חיתוך, סדר והחלטות חדות", "זרימה, חוכמה וסיכון"];
const ANIMAL = ["עכברוש", "שור", "נמר", "ארנב", "דרקון", "נחש", "סוס", "עז", "קוף", "תרנגול", "כלב", "חזיר"];
const GATES = [41, 19, 13, 49, 30, 55, 37, 63, 22, 36, 25, 17, 21, 51, 42, 3, 27, 24, 2, 23, 8, 20, 16, 35, 45, 12, 15, 52, 39, 53, 62, 56, 31, 33, 7, 4, 29, 59, 40, 64, 47, 6, 46, 18, 48, 57, 32, 50, 28, 44, 1, 43, 14, 34, 9, 5, 26, 11, 10, 58, 38, 54, 61, 60];
const HEX = ["היוצר", "המקבל", "קושי ההתחלה", "סכלות הנעורים", "המתנה", "סכסוך", "הצבא", "התלכדות", "כוח הריסון של הקטן", "הדריכה", "שלום", "קיפאון", "אחוות אנשים", "רכוש רב", "ענווה", "התלהבות", "הליכה בעקבות", "תיקון המקולקל", "התקרבות", "התבוננות", "נשיכה חודרת", "חן", "התפוררות", "שיבה", "תמימות", "כוח הריסון של הגדול", "הזנה", "עודף הגדול", "התהום", "האש הנאחזת", "השפעה", "התמדה", "נסיגה", "כוח הגדול", "התקדמות", "האפלת האור", "המשפחה", "ניגוד", "מכשול", "שחרור", "הפחתה", "תוספת", "פריצה", "מפגש", "התכנסות", "עלייה", "מצוקה", "הבאר", "מהפכה", "הקלחת", "הרעם המעורר", "ההר השקט", "התפתחות הדרגתית", "הנערה הנישאת", "שפע", "הנודד", "הרוח העדינה", "השמחה", "פיזור", "הגבלה", "אמת פנימית", "עודף הקטן", "אחרי ההשלמה", "לפני ההשלמה"];
const HMONTH = [["ניסן", "ה", "טלה", "יהודה", "דיבור"], ["אייר", "ו", "שור", "יששכר", "הרהור"], ["סיו", "ז", "תאומים", "זבולון", "הילוך"], ["תמוז", "ח", "סרטן", "ראובן", "ראייה"], ["אב", "ט", "אריה", "שמעון", "שמיעה"], ["אלול", "י", "בתולה", "גד", "מעשה"], ["תשרי", "ל", "מאזניים", "אפרים", "מגע"], ["חשו", "נ", "עקרב", "מנשה", "ריח"], ["כסל", "ס", "קשת", "בנימין", "שינה"], ["טבת", "ע", "גדי", "דן", "רוגז"], ["שבט", "צ", "דלי", "אשר", "אכילה"], ["אדר", "ק", "דגים", "נפתלי", "שחוק"]];
const WDAY = [["ראשון", "שמש", "חסד"], ["שני", "ירח", "גבורה"], ["שלישי", "מאדים", "תפארת"], ["רביעי", "כוכב חמה", "נצח"], ["חמישי", "צדק", "הוד"], ["שישי", "נוגה", "יסוד"], ["שבת", "שבתאי", "מלכות"]];
const N72 = "והו ילי סיט עלם מהש ללה אכא כהת הזי אלד לאו ההע יזל מבה הרי הקם לאו כלי לוו פהל נלך ייי מלה חהו נתה האא ירת שאה ריי אום לכב ושר יחו להח כוק מנד אני חעם רהע ייז ההה מיכ וול ילה סאל ערי עשל מיה והו דני החש עמם ננא נית מבה פוי נמם ייל הרח מצר ומב יהה ענו מחי דמב מנק איע חבו ראה יבמ היי מום".split(" ");
const NAK = ["אשוויני", "בהרני", "קריטיקה", "רוהיני", "מריגשירה", "ארדרה", "פונרווסו", "פושיה", "אשלשה", "מגהה", "פורווה פלגוני", "אוטרה פלגוני", "הסטה", "צ׳יטרה", "סוואטי", "וישאקה", "אנורדהה", "ג׳יישטה", "מולה", "פורווה אשדה", "אוטרה אשדה", "שרוונה", "דנישטה", "שטבהישה", "פורווה בהדרפדה", "אוטרה בהדרפדה", "רוואטי"];

const digits = n => String(n).split("").reduce((s, c) => s + +c, 0);
const reduce = n => { while (n > 9 && n !== 11 && n !== 22 && n !== 33) n = digits(n); return n; };
function lonOf(A, b, d){ return b === "Sun" ? A.SunPosition(d).elon : b === "Moon" ? A.EclipticGeoMoon(d).lon : A.Ecliptic(A.GeoVector(b, d, true)).elon; }
const pos = l => `${Math.floor(norm(l) % 30)}° ${SIGNS[Math.floor(norm(l) / 30)]}`;

function compute(now){
  const A = window.Astronomy, later = new Date(now.getTime() + 6 * 3600e3);
  const pl = B.map(([k]) => { const l = norm(lonOf(A, k, now)), l2 = norm(lonOf(A, k, later)); let d = l2 - l; if (d > 180) d -= 360; if (d < -180) d += 360;
    return {k, lon: l, sign: Math.floor(l / 30), retro: d < 0 && k !== "Sun" && k !== "Moon"}; });
  const P = Object.fromEntries(pl.map(p => [p.k, p]));
  const asp = [];
  for (let i = 0; i < pl.length; i++) for (let j = i + 1; j < pl.length; j++) {
    let sep = Math.abs(pl[i].lon - pl[j].lon); if (sep > 180) sep = 360 - sep;
    for (const [ang, t, he, orb0] of ASP) { const orb = pl[i].k === "Moon" ? Math.min(orb0, 5) : orb0, off = Math.abs(sep - ang);
      if (off <= orb) asp.push({a: pl[i].k, b: pl[j].k, t, he, orb: off, str: 1 - off / orb, hard: t === "sq" || t === "opp" || (t === "conj" && [pl[i].k, pl[j].k].some(x => ["Mars", "Saturn", "Uranus", "Pluto"].includes(x)))}); }
  }
  asp.sort((x, y) => y.str - x.str);
  const HEAVY = ["Mars", "Saturn", "Uranus", "Pluto"];
  let tension = 0;
  for (const a of asp) { if (!a.hard || a.a === "Moon" || a.b === "Moon") continue; const n = HEAVY.includes(a.a) + HEAVY.includes(a.b); tension += (n === 2 ? 34 : n === 1 ? 13 : 5) * a.str; }
  tension = Math.round(Math.min(100, tension));
  const elong = norm(P.Moon.lon - P.Sun.lon), illum = Math.round((1 - Math.cos(elong * Math.PI / 180)) / 2 * 100);
  const phase = elong < 12 || elong > 348 ? ["מולד (ירח חדש)", "new"] : elong < 80 ? ["סהר מתמלא", "wax"] : elong < 100 ? ["רבע ראשון", "wax"] : elong < 168 ? ["ירח גדל, כמעט מלא", "wax"] : elong < 192 ? ["ירח מלא", "full"] : elong < 260 ? ["ירח מתמעט", "wane"] : elong < 280 ? ["רבע אחרון", "wane"] : ["סהר מתמעט", "wane"];
  const nextNew = A.SearchMoonPhase(0, now, 40)?.date, nextFull = A.SearchMoonPhase(180, now, 40)?.date;
  // civil date in Israel
  const pp = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {timeZone: "Asia/Jerusalem", year: "numeric", month: "numeric", day: "numeric", weekday: "short"}).formatToParts(now).map(x => [x.type, x.value]));
  const y = +pp.year, m = +pp.month, d = +pp.day, wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(pp.weekday);
  // numerology
  const uy = reduce(digits(y)), um = reduce(uy + m), ud = reduce(digits(y) + digits(m) + digits(d));
  let tc = digits(y) + digits(m) + digits(d); while (tc > 22) tc = digits(tc); if (tc === 22) tc = 0;
  let ty = digits(y); while (ty > 22) ty = digits(ty); if (ty === 22) ty = 0;
  const ds = `${String(d).padStart(2, "0")}${String(m).padStart(2, "0")}${y}`, cnt = {}; for (const c of ds) if (c !== "0") cnt[c] = (cnt[c] || 0) + 1;
  // Chinese pillars
  const a14 = Math.floor((14 - m) / 12), yy = y + 4800 - a14, mm = m + 12 * a14 - 3;
  const jdn = d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
  const dayI = (jdn + 49) % 60;
  const cy = m >= 3 || (m === 2 && P.Sun.lon >= 315) ? y : y - 1;   // the Chinese solar year turns at Lichun, Sun at 315°
  const yearI = ((cy - 4) % 60 + 60) % 60, mi = Math.floor(norm(P.Sun.lon - 315) / 30);
  const monthStem = (((yearI % 10) % 5) * 2 + 2 + mi) % 10, monthBranch = (2 + mi) % 12;
  const pil = (s, b) => ({s, b, txt: `${STEM[s]}${BRANCH[b]}`, el: Math.floor(s / 2), yy: s % 2 ? "יין" : "יאנג", an: ANIMAL[b]});
  const cn = {year: pil(yearI % 10, yearI % 12), month: pil(monthStem, monthBranch), day: pil(dayI % 10, dayI % 12)};
  let lunar = ""; try { lunar = new Intl.DateTimeFormat("en-u-ca-chinese", {timeZone: "Asia/Jerusalem", month: "numeric", day: "numeric"}).format(now); } catch (e) {}
  const goff = norm(P.Sun.lon - 302), gate = GATES[Math.floor(goff / 5.625)], line = Math.floor((goff % 5.625) / 0.9375) + 1;
  // Hebrew calendar
  let heb = "", hm = null; try { const f = new Intl.DateTimeFormat("he-IL-u-ca-hebrew", {timeZone: "Asia/Jerusalem", day: "numeric", month: "long", year: "numeric"}); heb = f.format(now);
    const mn = f.formatToParts(now).find(x => x.type === "month")?.value || ""; hm = HMONTH.find(h => mn.replace(/^ב/, "").startsWith(h[0])) || HMONTH.find(h => mn.includes(h[0])); } catch (e) {}
  // Vedic (sidereal, Lahiri)
  const ayan = 23.853 + (y + (m - 1) / 12 - 2000) * 0.013969, sSun = norm(P.Sun.lon - ayan), sMoon = norm(P.Moon.lon - ayan);
  const tithi = Math.floor(elong / 12) + 1;
  return {now, pl, P, asp, tension, elong, illum, phase, nextNew, nextFull, y, m, d, wd, uy, um, ud, tc, ty, cnt, cn, lunar, gate, line, heb, hm, name72: N72[Math.floor(P.Sun.lon / 5)],
    ved: {sun: Math.floor(sSun / 30), moon: Math.floor(sMoon / 30), nak: NAK[Math.floor(sMoon / (360 / 27))], pada: Math.floor((sMoon % (360 / 27)) / (360 / 108)) + 1, tithi: tithi > 15 ? tithi - 15 : tithi, paksha: tithi > 15 ? "קרישנה (חצי מתמעט)" : "שוקלה (חצי מתמלא)", ayan}};
}

const aspText = a => `${HE[a.a]} ב${a.he} ל${HE[a.b]}`;
const aspSay = a => a.t === "conj" ? `מיזוג של ${KW[a.a]} עם ${KW[a.b]}` : a.hard ? `מתח בין ${KW[a.a]} לבין ${KW[a.b]}` : `זרימה בין ${KW[a.a]} לבין ${KW[a.b]}`;
const dfmt = dt => dt ? new Intl.DateTimeFormat("he-IL", {timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit"}).format(dt) : "";
const row = (l, v, c) => `<div class="gpr"${c ? ` style="--c:${c}"` : ""}><span>${l}</span><b>${v}</b></div>`;
const verdict = (sky, ground) => sky && ground ? ["התאמה: מתוח גם בשמיים וגם בשטח", "crit"] : !sky && !ground ? ["התאמה: אין מתח חריג, לא בשמיים ולא בשטח", "ok"] : sky ? ["אין התאמה: מתח בשמיים, שקט בשטח", "warn"] : ["אין התאמה: סוער בשטח, שקט בשמיים", "warn"];

function render(){
  const v = $("view-sky"); if (!v || v.hidden) return;
  if (!window.Astronomy) { $("sk-say").textContent = "ספריית החישוב האסטרונומי לא נטענה. בדקי את החיבור ורענני."; return; }
  let S; try { S = compute(new Date()); } catch (e) { $("sk-say").textContent = "החישוב נכשל: " + e.message; return; }
  const {P, asp, cn} = S, sunS = SIGNS[P.Sun.sign], moonS = SIGNS[P.Moon.sign], retro = S.pl.filter(p => p.retro);
  const tw = S.tension >= 70 ? "מתוחים מאוד" : S.tension >= 45 ? "מתוחים" : S.tension >= 20 ? "מתוחים במידה" : "רגועים";
  const col = S.tension >= 70 ? "var(--crit)" : S.tension >= 45 ? "var(--warn)" : "#b9a6ff";
  $("sk-hero").style.setProperty("--hc", col);
  $("h-sk").textContent = `התחזית הרוחנית · שמיים ${tw}`;
  $("sk-meta").textContent = `מתח שמיים ${S.tension}/100 · מחושב לרגע זה`;
  $("nv-sky").textContent = `שמש ב${sunS} · ירח ב${moonS}`;
  const top = asp.filter(a => a.a !== "Moon" && a.b !== "Moon")[0];
  $("sk-say").textContent = `${S.heb ? S.heb + ". " : ""}השמש ב${sunS} (${SIGN_SAY[P.Sun.sign]}) והירח ב${moonS}, ${S.phase[0]}. `
    + `יום ${S.ud} בנומרולוגיה: ${NUM[S.ud]}. ביומן הסיני זה יום ${ELEM[cn.day.el]} ${cn.day.yy} של ה${cn.day.an}. `
    + (top ? `ההיבט החזק ביותר עכשיו: ${aspText(top)}, ${aspSay(top)}. ` : "")
    + (retro.length ? `בנסיגה: ${retro.map(p => HE[p.k]).join(", ")}.` : "אין כוכב בנסיגה.");
  $("sk-tiles").innerHTML = [
    ["שמש", `${sunS}`, `${pos(P.Sun.lon)} · יסוד ${SIGN_EL[P.Sun.sign % 4]}`],
    ["ירח", `${moonS}`, `${S.phase[0]} · ${S.illum}% מואר`],
    ["מספר היום", S.ud, NUM[S.ud]],
    ["עמוד היום הסיני", `${cn.day.txt}`, `${ELEM[cn.day.el]} ${cn.day.yy} · ${cn.day.an}`],
  ].map(([q, val, a]) => `<div class="tile"><span class="q">${q}</span><b>${val}</b><span class="a">${a}</span></div>`).join("");

  // ---- sky beside the ground ----
  const HEAVY = ["Mars", "Saturn", "Uranus", "Pluto"], inv = (a, set) => set.includes(a.a) || set.includes(a.b), noMoon = asp.filter(a => a.a !== "Moon" && a.b !== "Moon");
  const list = arr => arr.length ? arr.slice(0, 3).map(a => `${aspText(a)} (${a.orb.toFixed(1)}°)`).join(" · ") : "";
  const blocks = [];
  const snap = typeof SNAP !== "undefined" ? SNAP : null, world = typeof WORLD !== "undefined" ? WORLD : null;
  { const hs = noMoon.filter(a => a.hard && inv(a, HEAVY)), sky = S.tension >= 45;
    const sc = snap?.score, w = sc == null ? null : sc >= 75 ? "חירום" : sc >= 50 ? "הסלמה" : sc >= 25 ? "מתיחות" : sc >= 10 ? "ערנות" : "שגרה", maj = world?.major?.length;
    const g = sc == null && maj == null ? null : (sc ?? 0) >= 50 || (maj ?? 0) >= 6;
    blocks.push({t: "עימות וביטחון", sky: `מאדים ב${SIGNS[P.Mars.sign]}${P.Mars.retro ? " בנסיגה" : ""}, שבתאי ב${SIGNS[P.Saturn.sign]}, פלוטו ב${SIGNS[P.Pluto.sign]}. ` + (hs.length ? `היבטים קשים: ${list(hs)}.` : "אין היבט קשה פעיל בין הכוכבים הכבדים."),
      ground: sc == null && maj == null ? null : `${sc != null ? `מדד המתיחות בישראל ובאזור ${sc}/100 (${w})` : ""}${sc != null && maj != null ? " · " : ""}${maj != null ? `${maj} אירועים עולמיים משמעותיים` : ""}.`, v: g == null ? null : verdict(sky, g)}); }
  { const hs = noMoon.filter(a => a.hard && inv(a, ["Mercury", "Uranus"])), sky = P.Mercury.retro || hs.some(a => a.str > 0.4);
    const cs = world?.cyber?.score, rw = world?.cyber?.ransom?.n24;
    blocks.push({t: "תקשורת, טכנולוגיה וסייבר", sky: `מרקורי ב${SIGNS[P.Mercury.sign]}${P.Mercury.retro ? ", בנסיגה: לפי המסורת זמן של תקלות, אי־הבנות ועיכובים" : ", בתנועה ישרה"}. אורנוס ב${SIGNS[P.Uranus.sign]}${P.Uranus.retro ? " בנסיגה" : ""}. ` + (hs.length ? `היבטים קשים: ${list(hs)}.` : "אין היבט קשה למרקורי או לאורנוס."),
      ground: cs == null ? null : `מדד הסייבר העולמי ${cs}/100${rw != null ? ` · ${rw} קורבנות כופרה ביממה` : ""}.`, v: cs == null ? null : verdict(sky, cs >= 35)}); }
  { const set = ["Venus", "Jupiter", "Saturn"], hs = noMoon.filter(a => a.hard && inv(a, ["Venus", "Jupiter"]) && (set.includes(a.a) || a.a === "Pluto" || a.a === "Uranus") ), soft = noMoon.filter(a => !a.hard && set.includes(a.a) && set.includes(a.b));
    const mk = (world?.markets || []).filter(x => x.ok !== false && Number.isFinite(x.chg)), avg = mk.length ? mk.reduce((s, x) => s + x.chg, 0) / mk.length : null, worst = mk.length ? mk.reduce((p, x) => x.chg < p.chg ? x : p) : null;
    blocks.push({t: "כסף ושווקים", sky: `ונוס ב${SIGNS[P.Venus.sign]}${P.Venus.retro ? " בנסיגה" : ""}, צדק ב${SIGNS[P.Jupiter.sign]}${P.Jupiter.retro ? " בנסיגה" : ""}. ` + (hs.length ? `לחץ: ${list(hs)}. ` : "") + (soft.length ? `זרימה: ${list(soft)}.` : hs.length ? "" : "אין היבט בולט בין ונוס, צדק ושבתאי."),
      ground: avg == null ? null : `שינוי ממוצע ב־${mk.length} מדדי מניות וסחורות: ${avg > 0 ? "+" : ""}${avg.toFixed(1)}%${worst ? ` · החלש ביותר: ${esc(worst.name)} ${worst.chg.toFixed(1)}%` : ""}.`, v: avg == null ? null : verdict(hs.some(a => a.str > 0.3), avg <= -1.5)}); }
  { const ph = S.phase[1], say = {new: "זמן פנימי ושקט, אנרגיה נמוכה. מתאים לזריעת כוונה (סאנקאלפה) ולכתיבה אינטואיטיבית.", wax: "האנרגיה נבנית. מתאים לפעולה, לדמיון מודרך ולעבודה עם חוק ההנחה.", full: "שיא רגשי, דברים יוצאים לאור. מתאים להכרת תודה ולשחרור.", wane: "האנרגיה יורדת. מתאים לסיכום, לניקוי ולעבודת צללים."}[ph];
    const ma = asp.filter(a => a.a === "Moon" || a.b === "Moon").slice(0, 2);
    blocks.push({t: "מצב הרוח הציבורי", sky: `ירח ב${moonS} (${SIGN_SAY[P.Moon.sign]}), ${S.phase[0]}. ${say}` + (ma.length ? ` היבטי הירח עכשיו: ${ma.map(aspText).join(" · ")}.` : ""), ground: null, v: null}); }
  $("sk-link").innerHTML = blocks.map(b => `<article class="skb"><h3>${b.t}${b.v ? ` <span class="chip ${b.v[1]}">${b.v[0]}</span>` : ""}</h3>
    <p><span class="lbl">בשמיים</span>${esc(b.sky)}</p>${b.ground ? `<p><span class="lbl">בשטח</span>${b.ground}</p>` : ""}</article>`).join("");
  const vs = blocks.filter(b => b.v), hit = vs.filter(b => b.v[0].startsWith("התאמה")).length;
  $("sk-link-meta").innerHTML = vs.length ? `<span class="chip">${hit} מתוך ${vs.length} תחומים תואמים</span>` : `<span class="chip">ממתין לנתוני השטח</span>`;

  // ---- planets ----
  $("sk-pl").innerHTML = S.pl.map(p => row(`${HE[p.k]}${p.retro ? ` <span class="chip warn">נסיגה</span>` : ""}`, `<span class="num">${Math.floor(p.lon % 30)}°</span> ${SIGNS[p.sign]}`)).join("")
    + `<div class="lbl" style="margin:10px 0 4px">היבטים פעילים, מהחזק לחלש</div>` + (asp.length ? asp.slice(0, 9).map(a => `<div class="skr"><b>${aspText(a)}</b> <span class="num lbl">${a.orb.toFixed(1)}°</span><div class="lbl">${aspSay(a)}</div></div>`).join("") : `<div class="empty">אין היבט פעיל.</div>`);
  $("sk-pl-meta").innerHTML = retro.length ? `<span class="chip warn">${retro.length} בנסיגה</span>` : `<span class="chip ok">אין נסיגות</span>`;
  // ---- numbers & tarot ----
  const LS = [4, 9, 2, 3, 5, 7, 8, 1, 6], miss = LS.filter(n => !S.cnt[n]).sort();
  $("sk-num").innerHTML = row("שנה אוניברסלית", `<span class="num">${S.uy}</span>`) + `<div class="lbl skn">${NUM[S.uy]}</div>` + row("חודש אוניברסלי", `<span class="num">${S.um}</span>`) + `<div class="lbl skn">${NUM[S.um]}</div>` + row("יום אוניברסלי", `<span class="num">${S.ud}</span>`) + `<div class="lbl skn">${NUM[S.ud]}</div>`
    + row("קלף השנה בטארוט", `${TAROT[S.ty][0]} <span class="num lbl">${S.ty}</span>`) + `<div class="lbl skn">${TAROT[S.ty][1]}</div>` + row("קלף היום בטארוט", `${TAROT[S.tc][0]} <span class="num lbl">${S.tc}</span>`) + `<div class="lbl skn">${TAROT[S.tc][1]}</div>`
    + `<div class="lbl" style="margin:10px 0 6px">ריבוע לו־שו של התאריך ${S.d}.${S.m}.${S.y}</div><div class="loshu">${LS.map(n => `<span class="${S.cnt[n] ? "on" : ""}"><b class="num">${n}</b>${S.cnt[n] > 1 ? `<i class="num">×${S.cnt[n]}</i>` : ""}</span>`).join("")}</div>`
    + `<div class="lbl" style="margin-top:6px">${miss.length ? `חסרים היום: ${miss.join(", ")}. לפי השיטה, אלה האיכויות שדורשות מאמץ מודע.` : "כל הספרות נוכחות."}</div>`;
  // ---- China & I-Ching ----
  const rel = (a, b) => a === b ? "זהה ל" : (a + 1) % 5 === b ? "מזין את " : (a + 2) % 5 === b ? "שולט על " : (b + 1) % 5 === a ? "ניזון מ" : "נשלט בידי ";
  const pr = (l, p) => row(l, `<span class="cjk">${p.txt}</span> ${ELEM[p.el]} ${p.yy} · ${p.an}`);
  $("sk-cn").innerHTML = pr("עמוד השנה", cn.year) + pr("עמוד החודש", cn.month) + pr("עמוד היום", cn.day)
    + `<div class="lbl skn">יסוד היום, ${ELEM[cn.day.el]} (${ELEM_SAY[cn.day.el]}), ${rel(cn.day.el, cn.year.el)}יסוד השנה, ${ELEM[cn.year.el]}. היום מתנגש עם חיית ה${ANIMAL[(cn.day.b + 6) % 12]}.</div>`
    + (S.lunar ? row("תאריך ירחי סיני", `<span class="num">${esc(S.lunar)}</span>`) : "")
    + row("הקסגרמת השמש", `<span class="cjk">${String.fromCodePoint(0x4DC0 + S.gate - 1)}</span> ${S.gate} · ${HEX[S.gate - 1]}`) + `<div class="lbl skn">קו ${S.line}. זה השער שהשמש עוברת בו עכשיו בגלגל 64 ההקסגרמות, השיטה שעליה נשען העיצוב האנושי. להטלת אי־צ׳ינג אישית צריך שאלה והטלת מטבעות.</div>`;
  // ---- Kabbalah ----
  const wdv = WDAY[S.wd];
  $("sk-kb").innerHTML = (S.heb ? row("תאריך עברי", esc(S.heb)) : "") + (S.hm ? row("אות החודש", `<span class="cjk">${S.hm[1]}</span>`) + row("מזל החודש", S.hm[2]) + row("שבט", S.hm[3]) + row("חוש", S.hm[4]) + `<div class="lbl skn">לפי ספר יצירה, כל חודש נברא באות אחת ושולט על חוש אחד. זה החוש שמתקנים החודש.</div>` : "")
    + row(`יום ${wdv[0]}`, `${wdv[1]} · ספירת ${wdv[2]}`) + row("השם מע״ב השמות", `<span class="cjk">${S.name72}</span>`) + `<div class="lbl skn">השם ששייך לחמש המעלות שהשמש נמצאת בהן עכשיו. משמש להתבוננות, לא להגייה.</div>`;
  // ---- Jyotish ----
  $("sk-vd").innerHTML = row("שמש (מזל כוכבי)", SIGNS[S.ved.sun]) + row("ירח (ראשי)", SIGNS[S.ved.moon]) + row("נקשטרה של הירח", `${S.ved.nak} · פאדה ${S.ved.pada}`) + row("טיטהי", `${S.ved.tithi} · ${S.ved.paksha}`)
    + `<div class="lbl skn">האסטרולוגיה ההודית מודדת מול הכוכבים עצמם, ולכן המזלות מוסטים כ־${S.ved.ayan.toFixed(1)}° לעומת המערבית. הנקשטרה היא אחת מ־27 תחנות הירח וקובעת את אופי היום.</div>`
    + row("המולד הבא", `<span class="num">${dfmt(S.nextNew)}</span>`) + row("הירח המלא הבא", `<span class="num">${dfmt(S.nextFull)}</span>`);
}
window.addEventListener("hashchange", () => setTimeout(render, 0));
window.addEventListener("world-data", render); window.addEventListener("region-data", render);
setInterval(render, 60000);
function boot(){ if (window.Astronomy) { // nav label even when the view is closed
    try { const S = compute(new Date()); $("nv-sky").textContent = `שמש ב${SIGNS[S.P.Sun.sign]} · ירח ב${SIGNS[S.P.Moon.sign]}`; } catch (e) { $("nv-sky").textContent = "לא חושב"; } } else $("nv-sky").textContent = "לא נטען";
  setTimeout(render, 0); }
boot();
})();
