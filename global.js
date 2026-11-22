/* World + cyber views. Reads WORLD (data/world.json) and SNAP from the main script; draws two d3 maps. */
(() => {
"use strict";
const ATLAS = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json";
const HEC = {"United States of America":"ארה״ב","Russia":"רוסיה","Ukraine":"אוקראינה","China":"סין","Taiwan":"טייוואן","Japan":"יפן","South Korea":"דרום קוריאה","North Korea":"צפון קוריאה","India":"הודו","Pakistan":"פקיסטן","Afghanistan":"אפגניסטן","Bangladesh":"בנגלדש","Myanmar":"מיאנמר","Thailand":"תאילנד","Vietnam":"וייטנאם","Philippines":"הפיליפינים","Indonesia":"אינדונזיה","Malaysia":"מלזיה","Australia":"אוסטרליה","New Zealand":"ניו זילנד","Israel":"ישראל","Palestine":"השטחים הפלסטיניים","Lebanon":"לבנון","Syria":"סוריה","Iran":"איראן","Iraq":"עיראק","Yemen":"תימן","Saudi Arabia":"ערב הסעודית","Jordan":"ירדן","Egypt":"מצרים","Turkey":"טורקיה","Qatar":"קטאר","United Arab Emirates":"איחוד האמירויות","Libya":"לוב","Sudan":"סודן","S. Sudan":"דרום סודן","Ethiopia":"אתיופיה","Somalia":"סומליה","Kenya":"קניה","Nigeria":"ניגריה","Mali":"מאלי","Niger":"ניז׳ר","Burkina Faso":"בורקינה פאסו","Dem. Rep. Congo":"קונגו","South Africa":"דרום אפריקה","Mozambique":"מוזמביק","United Kingdom":"בריטניה","France":"צרפת","Germany":"גרמניה","Italy":"איטליה","Spain":"ספרד","Poland":"פולין","Greece":"יוון","Netherlands":"הולנד","Belgium":"בלגיה","Sweden":"שוודיה","Norway":"נורווגיה","Finland":"פינלנד","Denmark":"דנמרק","Hungary":"הונגריה","Romania":"רומניה","Serbia":"סרביה","Belarus":"בלארוס","Georgia":"גאורגיה","Armenia":"ארמניה","Azerbaijan":"אזרבייג׳ן","Moldova":"מולדובה","Kazakhstan":"קזחסטן","Canada":"קנדה","Mexico":"מקסיקו","Cuba":"קובה","Haiti":"האיטי","Venezuela":"ונצואלה","Colombia":"קולומביה","Brazil":"ברזיל","Argentina":"ארגנטינה","Peru":"פרו","Chile":"צ׳ילה","Ecuador":"אקוודור","Bolivia":"בוליביה","Nepal":"נפאל","Sri Lanka":"סרי לנקה","Oman":"עומאן","Kuwait":"כווית","Cyprus":"קפריסין","Algeria":"אלג׳יריה","Morocco":"מרוקו","Tunisia":"תוניסיה","Ireland":"אירלנד","Portugal":"פורטוגל","Switzerland":"שווייץ","Austria":"אוסטריה","Czechia":"צ׳כיה","Bulgaria":"בולגריה","Croatia":"קרואטיה","Lithuania":"ליטא","Latvia":"לטביה","Estonia":"אסטוניה","Mongolia":"מונגוליה","Greenland":"גרינלנד","Turkmenistan":"טורקמניסטן","Uzbekistan":"אוזבקיסטן"};
const ISO2 = {US:"United States of America",RU:"Russia",UA:"Ukraine",CN:"China",TW:"Taiwan",JP:"Japan",KR:"South Korea",KP:"North Korea",IN:"India",PK:"Pakistan",BD:"Bangladesh",TH:"Thailand",VN:"Vietnam",PH:"Philippines",ID:"Indonesia",MY:"Malaysia",AU:"Australia",NZ:"New Zealand",IL:"Israel",IR:"Iran",IQ:"Iraq",SA:"Saudi Arabia",TR:"Turkey",EG:"Egypt",AE:"United Arab Emirates",GB:"United Kingdom",FR:"France",DE:"Germany",IT:"Italy",ES:"Spain",PL:"Poland",NL:"Netherlands",BE:"Belgium",SE:"Sweden",NO:"Norway",FI:"Finland",DK:"Denmark",HU:"Hungary",RO:"Romania",RS:"Serbia",BY:"Belarus",GE:"Georgia",AM:"Armenia",AZ:"Azerbaijan",MD:"Moldova",KZ:"Kazakhstan",CA:"Canada",MX:"Mexico",BR:"Brazil",AR:"Argentina",CO:"Colombia",VE:"Venezuela",CL:"Chile",PE:"Peru",ZA:"South Africa",NG:"Nigeria",KE:"Kenya",SG:"Singapore",HK:"China",CH:"Switzerland",AT:"Austria",CZ:"Czechia",BG:"Bulgaria",UZ:"Uzbekistan",SC:"Seychelles",IE:"Ireland",PT:"Portugal",GR:"Greece",LT:"Lithuania",LV:"Latvia",EE:"Estonia",HR:"Croatia",MA:"Morocco",DZ:"Algeria",TN:"Tunisia",PA:"Panama",CR:"Costa Rica",EC:"Ecuador",BO:"Bolivia",UY:"Uruguay",PY:"Paraguay",LK:"Sri Lanka",NP:"Nepal",KH:"Cambodia",LA:"Laos",MN:"Mongolia",KW:"Kuwait",QA:"Qatar",OM:"Oman",JO:"Jordan",LB:"Lebanon",SY:"Syria",YE:"Yemen",LY:"Libya",SD:"Sudan",ET:"Ethiopia",SO:"Somalia",TZ:"Tanzania",UG:"Uganda",GH:"Ghana",CI:"Côte d'Ivoire",SN:"Senegal",CM:"Cameroon",AO:"Angola",MZ:"Mozambique",ZW:"Zimbabwe",ZM:"Zambia",BW:"Botswana",NA:"Namibia",MG:"Madagascar",IS:"Iceland",LU:"Luxembourg",MT:"Malta",CY:"Cyprus",SK:"Slovakia",SI:"Slovenia",BA:"Bosnia and Herz.",ME:"Montenegro",MK:"Macedonia",AL:"Albania",XK:"Kosovo",AF:"Afghanistan",TM:"Turkmenistan",KG:"Kyrgyzstan",TJ:"Tajikistan",MM:"Myanmar"};
const cname = n => HEC[n] || n;
const TOP = {war:["מלחמה ולחימה","var(--crit)"],terror:["טרור ופיגועים","#ff7a9a"],disaster:["אסונות","var(--fire)"],politics:["פוליטיקה","var(--accent)"],economy:["כלכלה","var(--ok)"],health:["בריאות","var(--sea)"],cyber:["סייבר","var(--site)"],diplomacy:["דיפלומטיה","#b9a6ff"]};
const LVLW = {3:["משמעותי מאוד","crit"],2:["משמעותי","warn"],1:["רגיל","acc"]};
const BOXES = {world:null, me:[25,10,63,43], eu:[-12,34,42,62], as:[60,-10,150,55], am:[-130,-40,-30,60]};
const U = u => /^https?:\/\//i.test(u || "") ? esc(u) : "#";
const H = t => t ? `<span class="lbl">${ago(t)}</span>` : "";
const heTitle = (x, k="title") => (typeof trMode === "undefined" || trMode === "he") && x.he ? x.he : x[k];

let atlas = null, countries = null, centroid = {}, worldView = false;
async function getAtlas(){
  if (atlas) return atlas;
  const r = await fetch(ATLAS); atlas = await r.json();
  countries = topojson.feature(atlas, atlas.objects.countries).features;
  for (const f of countries) centroid[f.properties.name] = d3.geoCentroid(f);
  centroid["Palestine"] = [34.6, 31.6]; centroid["United States of America"] = [-98, 39]; centroid["France"] = [2.4, 46.6]; centroid["Norway"] = [9, 61];
  return atlas;
}

/* ---------- shared map builder ---------- */
function makeMap(el, {cls, onDraw}){
  const st = {el, svg:null, g:null, proj:null, path:null, zoom:null, k:1, w:0, h:0, draw:onDraw, cls};
  st.build = () => {
    const w = el.clientWidth; if (!w) return;
    const h = Math.max(300, Math.min(620, Math.round(w * 0.52)));
    if (st.svg && Math.abs(w - st.w) < 4) return st.draw(st);
    st.w = w; st.h = h;
    el.innerHTML = ""; el.style.height = h + "px";
    st.proj = d3.geoNaturalEarth1().fitExtent([[6, 6], [w - 6, h - 6]], {type: "Sphere"});
    st.path = d3.geoPath(st.proj);
    st.svg = d3.select(el).append("svg").attr("viewBox", `0 0 ${w} ${h}`).attr("width", w).attr("height", h).attr("class", "gsvg " + (cls || ""));
    st.g = st.svg.append("g");
    st.g.append("path").attr("class", "sphere").attr("d", st.path({type: "Sphere"}));
    st.g.append("path").attr("class", "grat").attr("d", st.path(d3.geoGraticule10()));
    st.land = st.g.append("g").attr("class", "land");
    st.land.selectAll("path").data(countries).join("path").attr("d", st.path).attr("data-n", d => d.properties.name);
    st.marks = st.g.append("g").attr("class", "marks");
    st.zoom = d3.zoom().scaleExtent([1, 14]).translateExtent([[0, 0], [w, h]])
      .filter(ev => ev.type !== "wheel" || ev.ctrlKey || ev.metaKey || st.k > 1 || !ev.shiftKey)
      .on("zoom", ev => { st.k = ev.transform.k; st.g.attr("transform", ev.transform); st.g.style("--k", st.k); st.marks.selectAll("[data-r]").attr("r", function(){ return +this.dataset.r / Math.sqrt(st.k); }); });
    st.svg.call(st.zoom).on("dblclick.zoom", null);
    const tip = document.createElement("div"); tip.className = "tip"; tip.hidden = true; el.appendChild(tip); st.tip = tip;
    el.style.position = "relative";
    st.draw(st);
  };
  st.zoomTo = box => {
    if (!st.svg) return;
    if (!box) return st.svg.transition().duration(700).call(st.zoom.transform, d3.zoomIdentity);
    const [[x0, y0], [x1, y1]] = [st.proj([box[0], box[3]]), st.proj([box[2], box[1]])];
    const k = Math.min(14, 0.92 / Math.max((x1 - x0) / st.w, (y1 - y0) / st.h));
    const t = d3.zoomIdentity.translate(st.w / 2, st.h / 2).scale(k).translate(-(x0 + x1) / 2, -(y0 + y1) / 2);
    st.svg.transition().duration(800).call(st.zoom.transform, t);
  };
  st.showTip = (ev, html) => {
    const r = el.getBoundingClientRect();
    st.tip.innerHTML = html; st.tip.hidden = false;
    st.tip.style.left = (ev.clientX - r.left) + "px"; st.tip.style.top = (ev.clientY - r.top) + "px";
  };
  st.hideTip = () => { st.tip.hidden = true; };
  new ResizeObserver(() => { if (!el.closest(".view").hidden) st.build(); }).observe(el);
  return st;
}
function bindTips(st, sel){
  sel.on("pointerenter pointermove", function(ev, d){ st.showTip(ev, d.tip); }).on("pointerleave", st.hideTip)
     .on("click", function(ev, d){ st.showTip(ev, d.tip); if (d.link && /^https?:/i.test(d.link) && ev.detail === 2) window.open(d.link, "_blank", "noopener"); });
}
function layerButtons(id, layers, state, redraw){
  const box = $(id); if (!box || box.dataset.done) return;
  box.dataset.done = "1";
  box.innerHTML = layers.map(([k, name, color]) => `<button type="button" class="lay" data-l="${k}" aria-pressed="${state[k]}" style="--lc:${color}"><i></i>${name}</button>`).join("");
  box.addEventListener("click", e => { const b = e.target.closest("[data-l]"); if (!b) return; state[b.dataset.l] = !state[b.dataset.l]; b.setAttribute("aria-pressed", state[b.dataset.l]); redraw(); });
}

/* ---------- WORLD ---------- */
const WL = {news: true, gdacs: true, quakes: true, eonet: false};
const W_LAYERS = [["news", "אירועי חדשות", "var(--accent)"], ["gdacs", "אסונות", "var(--crit)"], ["quakes", "רעידות אדמה", "var(--quake)"], ["eonet", "שריפות וסופות", "var(--fire)"]];
let wmap = null, weTopic = "all";
function drawWorld(st){
  if (!WORLD) return;
  const ev = WORLD.events || [];
  const per = {};
  for (const e of ev) for (const c of e.ctry || []) per[c] = (per[c] || 0) + e.n;
  const mx = Math.max(1, ...Object.values(per));
  st.land.selectAll("path").attr("class", d => per[d.properties.name] ? "hot" : null)
    .style("--heat", d => per[d.properties.name] ? (0.18 + 0.7 * Math.sqrt(per[d.properties.name] / mx)).toFixed(2) : null)
    .on("pointerenter pointermove", (e, d) => { const n = d.properties.name; const list = ev.filter(x => (x.ctry || []).includes(n)).slice(0, 3);
      st.showTip(e, `<b>${esc(cname(n))}</b>${list.length ? list.map(x => `<div class="tt">${esc(heTitle(x))}</div>`).join("") : `<div class="tt dim">אין אירועים בולטים</div>`}`); })
    .on("pointerleave", st.hideTip);
  const pts = [];
  if (WL.news) {
    const seen = {};
    for (const e of ev.slice(0, 30)) for (const c of (e.ctry || []).slice(0, 2)) {
      const p = centroid[c]; if (!p) continue;
      const i = seen[c] = (seen[c] || 0) + 1; if (i > 4) continue;
      const a = i * 2.1, off = i > 1 ? 1.6 : 0;
      const col = TOP[(e.topics || [])[0]]?.[1] || "var(--accent)";
      pts.push({k: "news", lon: p[0] + Math.cos(a) * off, lat: p[1] + Math.sin(a) * off, r: 3 + Math.min(7, e.n * 1.3), c: col, cls: e.lvl >= 3 ? "pulse" : "",
        link: e.link, tip: `<b>${esc(cname(c))}</b> · <span class="dim">${LVLW[e.lvl][0]} · ${e.n} מקורות · ${ago(e.t)}</span><div class="tt">${esc(heTitle(e))}</div>`});
    }
  }
  if (WL.gdacs) for (const g of WORLD.gdacs || []) pts.push({k: "gdacs", lon: g.lon, lat: g.lat, r: g.lvl === "Red" ? 8 : 6, c: g.lvl === "Red" ? "var(--crit)" : g.lvl === "Orange" ? "var(--warn)" : "var(--ok)", cls: g.lvl === "Red" ? "pulse" : "", link: g.link,
    tip: `<b>${esc(g.he)}</b> · <span class="dim">התרעה ${g.lvl === "Red" ? "אדומה" : g.lvl === "Orange" ? "כתומה" : "ירוקה"}</span><div class="tt">${esc(g.he_name || g.name)}</div><div class="tt dim">${esc(g.sev || "")}</div>`});
  if (WL.quakes) for (const q of WORLD.quakes || []) pts.push({k: "quakes", lon: q.lon, lat: q.lat, r: Math.max(2.5, (q.mag - 4) * 3.2), c: "var(--quake)", cls: "ring" + (q.mag >= 6.5 ? " pulse" : ""), link: q.link,
    tip: `<b>רעידת אדמה ${q.mag.toFixed(1)}</b> · <span class="dim">${ago(q.t)}${q.tsunami ? " · אזהרת צונאמי" : ""}</span><div class="tt">${esc(q.he || q.place)}</div>`});
  if (WL.eonet) for (const e of WORLD.eonet || []) pts.push({k: "eonet", lon: e.lon, lat: e.lat, r: 2.4, c: "var(--fire)", cls: "", tip: `<b>${esc(e.cat)}</b><div class="tt">${esc(e.he || e.title)}</div>`});
  renderPoints(st, pts);
}
function renderPoints(st, pts){
  const vis = pts.filter(p => Number.isFinite(p.lon) && Number.isFinite(p.lat)).map(p => { const xy = st.proj([p.lon, p.lat]); return xy ? {...p, x: xy[0], y: xy[1]} : null; }).filter(Boolean);
  const sel = st.marks.selectAll("g.pt").data(vis).join(enter => { const g = enter.append("g").attr("class", "pt"); g.append("circle").attr("class", "halo"); g.append("circle").attr("class", "dotc"); return g; });
  sel.attr("class", d => "pt " + d.k + " " + d.cls).style("--c", d => d.c).style("--dl", (d, i) => (i % 11) * 0.27 + "s");
  sel.select(".halo").attr("cx", d => d.x).attr("cy", d => d.y).attr("data-r", d => d.r * 2.4).attr("r", d => d.r * 2.4 / Math.sqrt(st.k));
  sel.select(".dotc").attr("cx", d => d.x).attr("cy", d => d.y).attr("data-r", d => d.r).attr("r", d => d.r / Math.sqrt(st.k));
  bindTips(st, sel);
}
function renderWorldPanels(){
  if (!WORLD) return;
  const ev = WORLD.events || [], maj = WORLD.major || [];
  const top = ev.filter(e => e.lvl >= 2).slice(0, 5);
  $("wh-meta").textContent = `עודכן ${ago(WORLD.ts)} · ${tIL(WORLD.ts)}`;
  $("wh-say").textContent = maj.length ? `${maj.length} אירועים מדווחים עכשיו בהרחבה בכמה כלי תקשורת. החשובים ביותר:` : "אין כרגע אירוע עולמי שמדווח בהרחבה. אלה הסיפורים הבולטים:";
  $("wh-major").innerHTML = (top.length ? top : ev.slice(0, 4)).map(e => `<li class="lv${e.lvl}"><a href="${U(e.link)}" target="_blank" rel="noopener">${esc(heTitle(e))}</a>
    <span class="s">${(e.ctry || []).slice(0, 2).map(c => `<span class="chip">${esc(cname(c))}</span>`).join("")}${(e.topics || []).slice(0, 1).map(t => `<span class="ktag" style="--kc:${TOP[t][1]}">${TOP[t][0]}</span>`).join("")}<span class="lbl">${e.n} מקורות · ${ago(e.t)}${e.dead ? ` · ${e.dead.toLocaleString("en-US")} נפגעים שדווחו` : ""}</span></span></li>`).join("");
  $("nv-world").textContent = maj.length ? `${maj.length} אירועים משמעותיים` : "שקט יחסית";
  // topic tabs
  const tc = {}; for (const e of ev) for (const t of e.topics || []) tc[t] = (tc[t] || 0) + 1;
  $("we-tabs").innerHTML = [["all", "הכול"]].concat(Object.keys(TOP).filter(t => tc[t]).map(t => [t, TOP[t][0]])).map(([k, n]) => `<button type="button" data-wt="${k}" aria-pressed="${weTopic === k}">${n}</button>`).join("");
  const list = ev.filter(e => weTopic === "all" || (e.topics || []).includes(weTopic));
  $("we").innerHTML = list.length ? list.map(e => `<article class="ev lv${e.lvl}">
      <div class="h"><span class="chip ${LVLW[e.lvl][1]}">${LVLW[e.lvl][0]}</span>${(e.topics || []).slice(0, 2).map(t => `<span class="ktag" style="--kc:${TOP[t][1]}">${TOP[t][0]}</span>`).join("")}${(e.ctry || []).map(c => `<span class="chip">${esc(cname(c))}</span>`).join("")}<span class="lbl">${ago(e.t)}</span></div>
      <h3 class="${e.he && trMode === "he" ? "he" : ""}"><a href="${U(e.link)}" target="_blank" rel="noopener">${esc(heTitle(e))}</a></h3>
      <div class="lbl">${e.n} כלי תקשורת: ${esc((e.outlets || []).slice(0, 6).join(", "))}${e.dead ? ` · ${e.dead.toLocaleString("en-US")} נפגעים שדווחו` : ""}</div>
      ${(e.items || []).length > 1 ? `<details><summary>איך כל מקור כתב את זה</summary><ul class="list">${e.items.map(i => `<li><a href="${U(i.link)}" target="_blank" rel="noopener">${esc(heTitle(i))}</a><span class="s">${esc(i.outlet)}</span></li>`).join("")}</ul></details>` : ""}
    </article>`).join("") : `<div class="empty">אין אירועים בנושא הזה.</div>`;
  // hazards
  const hz = [...(WORLD.gdacs || []).filter(g => g.lvl !== "Green").map(g => ({t: g.t, k: g.lvl === "Red" ? "crit" : "warn", h: `${g.he} · ${g.lvl === "Red" ? "התרעה אדומה" : "התרעה כתומה"}`, x: g.he_name || g.name, s: g.sev, l: g.link})),
    ...(WORLD.quakes || []).filter(q => q.mag >= 5).map(q => ({t: q.t, k: q.mag >= 6.5 ? "crit" : q.mag >= 6 ? "warn" : "", h: `רעידת אדמה ${q.mag.toFixed(1)}${q.tsunami ? " · אזהרת צונאמי" : ""}`, x: q.he || q.place, l: q.link})),
    ...(WORLD.gdacs || []).filter(g => g.lvl === "Green").slice(0, 6).map(g => ({t: g.t, k: "", h: g.he, x: g.he_name || g.name, s: g.sev, l: g.link}))].sort((a, b) => (b.t || 0) - (a.t || 0));
  $("hz").innerHTML = hz.length ? hz.map(x => `<li><span class="t"><span class="chip ${x.k}">${esc(x.h)}</span> ${x.l ? `<a href="${U(x.l)}" target="_blank" rel="noopener">${esc(x.x)}</a>` : esc(x.x)}</span><span class="s">${ago(x.t)}${x.s ? " · " + esc(x.s) : ""}</span></li>`).join("") : `<li class="empty">אין אסונות פעילים בדרגת התרעה כתומה ומעלה, ואין רעידות מעוצמה 5 ביממה האחרונה.</li>`;
  $("hz-meta").innerHTML = `<span class="chip">GDACS</span><span class="chip">USGS</span>`;
  // markets
  const mk = (WORLD.markets || []).filter(m => m.ok && m.price != null);
  $("wmk").innerHTML = mk.length ? mk.map(m => `<div class="mki"><span class="lbl">${esc(m.where)}</span><b>${esc(m.name)}</b><span class="num">${fmt(m.price, m.price > 1000 ? 0 : m.price > 20 ? 2 : 4)}</span><span class="num ${m.chg > 0.05 ? "up" : m.chg < -0.05 ? "down" : "flat"}">${m.chg == null ? "" : (m.chg > 0 ? "▲" : m.chg < 0 ? "▼" : "") + fmt(Math.abs(m.chg), 2) + "%"}</span>${m.spark && m.spark.length > 2 ? spark(m.spark, m.chg >= 0 ? "var(--ok)" : "var(--crit)", 90, 22) : ""}</div>`).join("") : `<div class="empty">אין נתוני שוק בסבב הזה.</div>`;
  $("wmk-meta").innerHTML = `<span class="chip">Yahoo Finance</span>`;
}
document.addEventListener("click", e => {
  const b = e.target.closest("[data-wt]"); if (b) { weTopic = b.dataset.wt; renderWorldPanels(); }
  const z = e.target.closest("[data-wz]"); if (z && wmap) { document.querySelectorAll("[data-wz]").forEach(x => x.setAttribute("aria-pressed", x === z)); wmap.zoomTo(BOXES[z.dataset.wz]); }
});

/* ---------- CYBER: rotating globe, country panel, counters bar ---------- */
const CL = {scan: true, beam: true, c2: true, heat: true};
let cmap = null;
function cyLevel(s){ return s >= 60 ? ["גל תקיפות", "var(--crit)"] : s >= 35 ? ["פעילות גבוהה", "var(--warn)"] : s >= 15 ? ["פעילות רגילה", "var(--accent)"] : ["שקט יחסית", "var(--ok)"]; }
function makeGlobe(el){
  const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const st = {flat: false, k: 1, rot: [-30, -24], ty: 0, auto: !RM, hold: 0, sel: undefined, pts: [], agg: null, rank: [], hot: [], arcs: [], w: 0, h: 0, raf: 0, last: 0};
  const GRAT = d3.geoGraticule10(), nf = v => Number(v || 0).toLocaleString("en-US");
  let cv, ctx, stage, tip, panel, bar, land, borders, proj, path, hover = null, tween = null, drag = null, site = "#b18cff", lastMove = 0;
  const feat = n => countries.find(f => f.properties.name === n);
  function init(){
    site = getComputedStyle(document.documentElement).getPropertyValue("--site").trim() || site;
    land = topojson.feature(atlas, atlas.objects.land); borders = topojson.mesh(atlas, atlas.objects.countries, (a, b) => a !== b);
    el.innerHTML = `<div class="gstage"><canvas aria-label="גלובוס תקיפות סייבר. גרירה מסובבת, לחיצה על מדינה פותחת את הנתונים שלה." role="img"></canvas>
      <div class="gctl" role="group" aria-label="שליטה במפה">
        <button type="button" data-g="flat" aria-pressed="false" title="מפה שטוחה / גלובוס" aria-label="מעבר בין גלובוס למפה שטוחה">▭</button>
        <button type="button" data-g="in" title="הגדלה" aria-label="הגדלה">+</button>
        <button type="button" data-g="out" title="הקטנה" aria-label="הקטנה">−</button>
        <button type="button" data-g="auto" aria-pressed="${st.auto}" title="סיבוב אוטומטי" aria-label="סיבוב אוטומטי">⟳</button>
      </div><div class="tip" hidden></div></div>
      <aside class="gpanel" hidden aria-live="polite"></aside><div class="gbar" role="group" aria-label="סוגי נתונים"></div>`;
    stage = el.querySelector(".gstage"); cv = el.querySelector("canvas"); ctx = cv.getContext("2d");
    tip = el.querySelector(".tip"); panel = el.querySelector(".gpanel"); bar = el.querySelector(".gbar");
    el.addEventListener("click", e => {
      const g = e.target.closest("[data-g]"), l = e.target.closest("[data-gl]");
      if (l) { CL[l.dataset.gl] = !CL[l.dataset.gl]; l.setAttribute("aria-pressed", CL[l.dataset.gl]); return kick(); }
      if (!g) return;
      const a = g.dataset.g;
      if (a === "flat") { st.flat = !st.flat; st.ty = 0; g.setAttribute("aria-pressed", st.flat); g.textContent = st.flat ? "◍" : "▭"; }
      if (a === "in") st.k = Math.min(6, st.k * 1.5);
      if (a === "out") { st.k = Math.max(1, st.k / 1.5); if (st.k === 1) st.ty = 0; }
      if (a === "auto") { st.auto = !st.auto; st.hold = 0; g.setAttribute("aria-pressed", st.auto); }
      if (a === "close") { st.sel = null; renderPanel(); }
      kick();
    });
    cv.addEventListener("pointerdown", e => { drag = {x: e.clientX, y: e.clientY, moved: 0}; cv.setPointerCapture(e.pointerId); tween = null; });
    cv.addEventListener("pointermove", e => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; drag.moved += Math.abs(dx) + Math.abs(dy);
        if (drag.moved > 4) { tip.hidden = true;
          if (st.flat) { st.rot[0] += dx * 360 / (st.w * st.k); const m = st.h * (st.k - 1) / 2; st.ty = Math.max(-m, Math.min(m, st.ty + dy)); }
          else { const s = 57.3 / proj.scale(); st.rot[0] += dx * s; st.rot[1] = Math.max(-80, Math.min(80, st.rot[1] - dy * s)); }
          st.hold = performance.now() + 5000; kick(); }
        return;
      }
      const now = performance.now(); if (now - lastMove < 40) return; lastMove = now;
      const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, h = pick(x, y);
      hover = h && h.f ? h.f : null; cv.style.cursor = h ? "pointer" : "grab";
      if (h) { tip.innerHTML = h.html; tip.hidden = false; tip.style.left = x + "px"; tip.style.top = y + "px"; } else tip.hidden = true;
      if (RM) kick();
    });
    cv.addEventListener("pointerup", e => { const d = drag; drag = null; if (!d || d.moved > 4) return;
      const r = cv.getBoundingClientRect(), h = pick(e.clientX - r.left, e.clientY - r.top);
      if (h && h.name) st.select(h.name); });
    cv.addEventListener("pointerleave", () => { tip.hidden = true; hover = null; });
    cv.addEventListener("wheel", e => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); st.k = Math.max(1, Math.min(6, st.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); kick(); }, {passive: false});
    new ResizeObserver(() => { if (!el.closest(".view").hidden && Math.abs(el.clientWidth - st.w) > 3) st.build(); }).observe(el);
  }
  function setProj(){
    const {w, h} = st;
    if (st.flat) { proj = d3.geoNaturalEarth1().fitExtent([[8, 8], [w - 8, h - 8]], {type: "Sphere"}); const t = proj.translate(); proj.scale(proj.scale() * st.k).translate([t[0], t[1] + st.ty]).rotate([st.rot[0], 0]); }
    else proj = d3.geoOrthographic().scale((Math.min(w, h) / 2 - 14) * st.k).translate([w / 2, h / 2]).rotate([st.rot[0], st.rot[1]]).clipAngle(90);
    path = d3.geoPath(proj, ctx);
  }
  const vis = ll => st.flat || d3.geoDistance(ll, [-st.rot[0], -st.rot[1]]) < 1.53;
  function pick(x, y){
    let best = null, bd = 100;
    for (const p of st.pts) { if (!p._v || !CL[p.k]) continue; const d = (p._x - x) ** 2 + (p._y - y) ** 2; if (d < bd) { bd = d; best = p; } }
    if (best) { const n = ISO2[best.cc] || best.cc || "";
      return {name: centroid[n] ? n : null, html: best.k === "scan"
        ? `<b>כתובת שתוקפת עכשיו</b> · <span class="dim">${esc(cname(n))}</span><div class="tt"><span class="num">${esc(best.ip)}</span> · ${nf(best.n)} דיווחים מחיישני DShield</div>`
        : `<b>שרת שליטה של בוטנט</b> · <span class="dim">${esc(best.mw || "")} · ${best.on ? "פעיל" : "לא פעיל כרגע"}</span><div class="tt"><span class="num">${esc(best.ip)}</span> · ${esc(cname(n))}</div>`}; }
    const c = proj.translate();
    if (!st.flat && (x - c[0]) ** 2 + (y - c[1]) ** 2 > proj.scale() ** 2) return null;
    const ll = proj.invert([x, y]); if (!ll || !Number.isFinite(ll[0])) return null;
    const f = countries.find(f => d3.geoContains(f, ll)); if (!f) return null;
    const n = f.properties.name, a = st.agg && st.agg[n];
    return {name: n, f, html: `<b>${esc(cname(n))}</b><div class="tt dim">${a ? (a.pct != null ? `${a.pct.toFixed(1)}% מתקיפות האפליקציה בעולם · ` : "") + `${a.scan} כתובות תוקפות · ${a.c2on + a.c2off} שרתי שליטה` : "לא נמדדה פעילות"}</div>`};
  }
  function draw(now){
    const {w, h} = st, t = RM ? 0 : now / 1000;
    ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0); ctx.clearRect(0, 0, w, h); setProj();
    const c = proj.translate(), R = proj.scale();
    if (!st.flat) { const g = ctx.createRadialGradient(c[0], c[1], R * .97, c[0], c[1], R * 1.14); g.addColorStop(0, "rgba(255,77,109,.22)"); g.addColorStop(1, "rgba(255,77,109,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c[0], c[1], R * 1.14, 0, 7); ctx.fill(); }
    ctx.beginPath(); path({type: "Sphere"});
    if (st.flat) ctx.fillStyle = "#07080f"; else { const g = ctx.createRadialGradient(c[0] - R * .35, c[1] - R * .4, R * .05, c[0], c[1], R); g.addColorStop(0, "#171c30"); g.addColorStop(1, "#05060b"); ctx.fillStyle = g; }
    ctx.fill(); ctx.strokeStyle = "#2f2b47"; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); path(GRAT); ctx.strokeStyle = "rgba(130,120,190,.12)"; ctx.lineWidth = .5; ctx.stroke();
    ctx.beginPath(); path(land); ctx.fillStyle = "#1c1e33"; ctx.fill();
    if (CL.heat) for (const [f, a] of st.hot) { ctx.beginPath(); path(f); ctx.fillStyle = `rgba(255,59,92,${a})`; ctx.fill(); }
    ctx.beginPath(); path(borders); ctx.strokeStyle = "rgba(160,150,215,.28)"; ctx.lineWidth = .5; ctx.stroke();
    if (hover) { ctx.beginPath(); path(hover); ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1; ctx.stroke(); }
    const sf = st.sel && feat(st.sel); if (sf) { ctx.beginPath(); path(sf); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.4; ctx.stroke(); }
    // arcs between leading origin and target countries (only when Cloudflare Radar data exists)
    for (const a of st.arcs) {
      const A = proj(a.a), B = proj(a.b), len = A && B ? Math.hypot(A[0] - B[0], A[1] - B[1]) : 0, seg = [];
      for (let i = 0; i <= 28; i++) { const f = i / 28, ll = a.ip(f); if (!vis(ll)) { seg.push(null); continue; } const p = proj(ll); if (!p) { seg.push(null); continue; }
        const lift = Math.sin(Math.PI * f); seg.push(st.flat ? [p[0], p[1] - lift * len * .18] : [c[0] + (p[0] - c[0]) * (1 + .22 * lift), c[1] + (p[1] - c[1]) * (1 + .22 * lift)]); }
      ctx.beginPath(); let pen = false; for (const p of seg) { if (!p) { pen = false; continue; } pen ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); pen = true; }
      ctx.strokeStyle = "rgba(255,77,109,.35)"; ctx.lineWidth = 1; ctx.stroke();
      const hp = seg[Math.floor(((t * .28 + a.ph) % 1) * 28)]; if (hp) { ctx.beginPath(); ctx.arc(hp[0], hp[1], 2.2, 0, 7); ctx.fillStyle = "#ffd0d8"; ctx.shadowColor = "#ff4d6d"; ctx.shadowBlur = 8; ctx.fill(); ctx.shadowBlur = 0; }
    }
    for (const p of st.pts) {
      p._v = false; const ll = [p.lon, p.lat]; if (!vis(ll)) continue; const xy = proj(ll); if (!xy) continue; p._x = xy[0]; p._y = xy[1]; p._v = true;
      const f = (t * .35 + p.ph) % 1;
      if (p.k === "scan") {
        if (CL.beam) { const L = p.hh * (st.flat ? Math.min(w, h) * .5 : R), ux = st.flat ? 0 : (xy[0] - c[0]) / R, uy = st.flat ? -1 : (xy[1] - c[1]) / R, tx = xy[0] + ux * L, ty = xy[1] + uy * L;
          const g = ctx.createLinearGradient(xy[0], xy[1], tx, ty); g.addColorStop(0, "rgba(255,150,90,.9)"); g.addColorStop(1, "rgba(255,150,90,0)");
          ctx.beginPath(); ctx.moveTo(xy[0], xy[1]); ctx.lineTo(tx, ty); ctx.strokeStyle = g; ctx.lineWidth = 1.3; ctx.stroke();
          if (!RM) { ctx.beginPath(); ctx.arc(tx + (xy[0] - tx) * f, ty + (xy[1] - ty) * f, 1.5, 0, 7); ctx.fillStyle = "#fff1dc"; ctx.fill(); } }
        if (CL.scan) { if (!RM) { ctx.beginPath(); ctx.arc(xy[0], xy[1], p.r * (1 + 2.2 * f), 0, 7); ctx.strokeStyle = `rgba(255,77,109,${(.6 * (1 - f)).toFixed(2)})`; ctx.lineWidth = 1; ctx.stroke(); }
          ctx.beginPath(); ctx.arc(xy[0], xy[1], p.r, 0, 7); ctx.fillStyle = "#ff4d6d"; ctx.shadowColor = "#ff4d6d"; ctx.shadowBlur = 6; ctx.fill(); ctx.shadowBlur = 0; }
        else p._v = false;
      } else if (CL.c2) { const s = 4.2; ctx.beginPath(); ctx.moveTo(xy[0], xy[1] - s); ctx.lineTo(xy[0] + s, xy[1]); ctx.lineTo(xy[0], xy[1] + s); ctx.lineTo(xy[0] - s, xy[1]); ctx.closePath();
        ctx.fillStyle = p.on ? site : "rgba(0,0,0,.5)"; ctx.strokeStyle = site; ctx.lineWidth = 1.3; ctx.shadowColor = site; ctx.shadowBlur = p.on ? 8 : 0; ctx.fill(); ctx.shadowBlur = 0; ctx.stroke(); }
      else p._v = false;
    }
  }
  function frame(now){
    st.raf = 0; if (!el.isConnected || el.offsetParent === null) return;
    const dt = Math.min(64, now - (st.last || now)); st.last = now;
    if (tween) { const f = Math.min(1, (now - tween.t0) / 800), e = d3.easeCubicInOut(f); st.rot = [tween.a[0] + tween.d[0] * e, tween.a[1] + tween.d[1] * e]; if (f >= 1) tween = null; }
    else if (st.auto && !drag && now > st.hold) st.rot[0] += dt * .006;
    draw(now);
    if (!RM || tween) st.raf = requestAnimationFrame(frame);
  }
  function kick(){ if (!st.raf && cv) { st.last = 0; st.raf = requestAnimationFrame(frame); } }
  function renderBar(){
    const cy = WORLD.cyber, scan = st.pts.filter(p => p.k === "scan"), c2 = st.pts.filter(p => p.k === "c2");
    const items = [["scan", "כתובות תוקפות", scan.length, "#ff4d6d"], ["beam", "דיווחי תקיפה מחיישנים", scan.reduce((s, p) => s + (p.n || 0), 0), "#ff965a"], ["c2", "שרתי שליטה", c2.length, site], ["heat", "מדינות מקור", st.rank.length, "#ff3b5c"],
      [null, "קורבנות כופרה · 24 ש׳", cy.ransom?.n24, "#8f98a8"], [null, "פרצות מנוצלות · 7 ימים", cy.kev?.n7, "#8f98a8"]];
    bar.innerHTML = items.filter(i => i[2] != null).map(([k, l, v, c]) => k
      ? `<button type="button" data-gl="${k}" aria-pressed="${CL[k]}" style="--c:${c}" title="הצגה או הסתרה במפה"><b class="num">${nf(v)}</b><span>${l}</span></button>`
      : `<div style="--c:${c}"><b class="num">${nf(v)}</b><span>${l}</span></div>`).join("");
  }
  function renderPanel(){
    const n = st.sel; if (!n) { panel.hidden = true; return; }
    const a = st.agg[n], r = st.rank.indexOf(n) + 1, row = (l, v, c) => `<div class="gpr" style="--c:${c}"><span>${l}</span><b class="num">${v}</b></div>`;
    panel.hidden = false;
    panel.innerHTML = `<div class="gph"><b>${esc(cname(n))}</b><button type="button" data-g="close" aria-label="סגירת הפאנל">×</button></div>
      <div class="lbl">${a ? `מקום ${r} מתוך ${st.rank.length} מדינות מקור` : "לא נמדדה מכאן פעילות תקיפה ביממה האחרונה"}</div>` + (a ? `<div class="gprs">`
      + (a.pct != null ? row("חלק מתקיפות האפליקציה בעולם", a.pct.toFixed(1) + "%", "#ff3b5c") : "")
      + row("כתובות תוקפות", nf(a.scan), "#ff4d6d") + row("דיווחי תקיפה מחיישנים", nf(a.rep), "#ff965a") + row("שרתי שליטה פעילים", nf(a.c2on), site) + row("שרתי שליטה לא פעילים", nf(a.c2off), "#8f98a8") + `</div>`
      + (a.ips.length ? `<div class="lbl" style="margin-top:8px">הכתובות הפעילות ביותר</div>` + a.ips.slice(0, 3).map(p => `<div class="gpr ip"><span class="num">${esc(p.ip)}</span><b class="num">${nf(p.n)}</b></div>`).join("") : "") : "")
      + `<div class="lbl gpf">נתוני היממה האחרונה · SANS DShield, abuse.ch${a && a.pct != null ? ", Cloudflare Radar" : ""}</div>`;
  }
  st.select = (n, jump) => {
    st.sel = n; renderPanel(); const ce = centroid[n];
    if (ce) { let d0 = (-ce[0] - st.rot[0]) % 360; if (d0 > 180) d0 -= 360; if (d0 < -180) d0 += 360; const b1 = Math.max(-60, Math.min(60, -ce[1] * .8));
      if (jump) st.rot = [st.rot[0] + d0, b1]; else tween = {a: st.rot.slice(), d: [d0, st.flat ? 0 : b1 - st.rot[1]], t0: performance.now()}; }
    st.hold = performance.now() + 9000; kick();
  };
  st.data = () => {
    const cy = WORLD?.cyber; if (!cy || !cv) return;
    const geo = (cy.geo || []).filter(p => Number.isFinite(p.lon) && Number.isFinite(p.lat)), radar = cy.radar?.origin?.length ? cy.radar : null, agg = {};
    const A = n => agg[n] || (agg[n] = {scan: 0, rep: 0, c2on: 0, c2off: 0, ips: [], heat: 0});
    for (const p of geo) { const a = A(ISO2[p.cc] || p.cc || "?"); if (p.k === "scan") { a.scan++; a.rep += p.n || 0; a.ips.push(p); a.heat += Math.log10(10 + (p.n || 0)); } else { p.on ? a.c2on++ : a.c2off++; a.heat += 1; } }
    if (radar) for (const o of radar.origin) { const n = ISO2[o.cc]; if (n) A(n).pct = o.pct; }
    for (const a of Object.values(agg)) a.ips.sort((x, y) => (y.n || 0) - (x.n || 0));
    const val = a => radar ? (a.pct || 0) : a.heat, mx = Math.max(1e-6, ...Object.values(agg).map(val));
    st.agg = agg; st.rank = Object.keys(agg).sort((x, y) => radar ? (agg[y].pct || 0) - (agg[x].pct || 0) || agg[y].rep - agg[x].rep : agg[y].rep - agg[x].rep || agg[y].heat - agg[x].heat);
    st.hot = countries.filter(f => agg[f.properties.name] && val(agg[f.properties.name]) > 0).map(f => [f, +(0.14 + 0.6 * Math.sqrt(val(agg[f.properties.name]) / mx)).toFixed(2)]);
    const mxn = Math.log10(1 + Math.max(1, ...geo.map(p => p.n || 0)));
    st.pts = geo.map((p, i) => ({...p, ph: (i * .618) % 1, r: p.k === "scan" ? 1.8 + Math.min(3.2, Math.log10(1 + (p.n || 1)) * .6) : 4, hh: p.k === "scan" ? .05 + .27 * Math.log10(1 + (p.n || 1)) / mxn : 0}));
    st.arcs = [];
    if (radar && radar.target?.length) { let i = 0; for (const o of radar.origin.slice(0, 6)) for (const tg of radar.target.slice(0, 5)) { const a = centroid[ISO2[o.cc]], b = centroid[ISO2[tg.cc]]; if (a && b && a !== b) st.arcs.push({a, b, ip: d3.geoInterpolate(a, b), ph: (i++ * .137) % 1}); } }
    renderBar();
    if (st.sel === undefined) { const first = st.rank.find(n => centroid[n]); if (first) st.select(first, true); st.hold = 0; } else renderPanel();
    kick();
  };
  st.build = () => {
    const w = el.clientWidth; if (!w) return; if (!cv) init();
    const h = Math.round(Math.max(340, Math.min(660, w * (w < 640 ? .95 : .58))));
    st.w = w; st.h = h; st.dpr = Math.min(2, window.devicePixelRatio || 1);
    stage.style.height = h + "px"; cv.width = Math.round(w * st.dpr); cv.height = Math.round(h * st.dpr); cv.style.width = w + "px"; cv.style.height = h + "px";
    if (!st.agg) st.data(); kick();
  };
  return st;
}
document.addEventListener("click", e => { const b = e.target.closest("[data-gc]"); if (b && cmap) { cmap.select(b.dataset.gc); $("cm").scrollIntoView({block: "nearest", behavior: "smooth"}); } });
function renderCyberPanels(){
  const cy = WORLD?.cyber; if (!cy) return;
  const [w, col] = cyLevel(cy.score || 0);
  const hero = $("cy-hero"); hero.style.setProperty("--hc", col);
  $("h-cy").textContent = `סייבר עולמי · ${w}`;
  $("cy-score").textContent = `מדד ${cy.score}/100 · עודכן ${ago(WORLD.ts)}`;
  const rw = cy.ransom, k = cy.kev, inf = cy.isc?.infocon;
  const infHe = {green: "ירוקה", yellow: "צהובה", orange: "כתומה", red: "אדומה"}[inf] || "לא ידועה";
  const ilN = (cy.news || []).filter(n => n.il).length;
  $("cy-say").textContent = `רמת האיום העולמית של מרכז SANS ${inf ? "היא " + infHe : "לא נמדדה"}. ${rw ? `קבוצות כופרה פרסמו ${rw.n24} קורבנות חדשים ביממה האחרונה.` : ""} ${k ? `${k.n7} פרצות נוספו השבוע לרשימת הפרצות שמנוצלות בפועל.` : ""}${ilN ? ` ${ilN} ידיעות סייבר נוגעות לישראל או לאיראן.` : ""}`;
  $("nv-cyber").textContent = `${w} · ${cy.score}/100`;
  const scan = (cy.geo || []).filter(p => p.k === "scan"), c2on = (cy.geo || []).filter(p => p.k === "c2" && p.on).length;
  const tiles = [
    ["רמת איום עולמית", infHe, "SANS Internet Storm Center", inf === "red" || inf === "orange" ? "hot" : inf === "yellow" ? "mid" : ""],
    ["קורבנות כופרה · 24 ש׳", rw ? rw.n24 : "—", rw ? `${rw.n72} ב־3 ימים · מובילה: ${esc((rw.groups[0] || [""])[0])}` : "", rw && rw.n24 > 80 ? "hot" : rw && rw.n24 > 55 ? "mid" : ""],
    ["פרצות שמנוצלות · 7 ימים", k ? k.n7 : "—", k ? `${k.items.filter(x => x.ransom).length} מהן בשימוש של כופרה` : "", k && k.n7 > 14 ? "hot" : k && k.n7 > 9 ? "mid" : ""],
    ["תוקפים פעילים על המפה", scan.length + c2on, `${scan.length} כתובות סורקות · ${c2on} שרתי שליטה פעילים`, ""],
  ];
  $("cy-tiles").innerHTML = tiles.map(([q, v, a, c]) => `<div class="tile ${c}"><span class="q">${q}</span><b>${v}</b><span class="a">${a}</span></div>`).join("");
  // map footer: top countries
  const byC = {}; for (const p of scan) { const n = ISO2[p.cc] || p.cc; byC[n] = (byC[n] || 0) + (p.n || 0); }
  const topC = cy.radar?.origin?.length ? cy.radar.origin.slice(0, 6).map(o => [ISO2[o.cc] || o.name, o.pct.toFixed(1) + "%"]) : Object.entries(byC).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n, v]) => [n, v.toLocaleString("en-US")]);
  $("cm-top").innerHTML = `<span class="lbl">מקורות מובילים:</span>` + topC.map(([n, v]) => `<button type="button" class="chip" data-gc="${esc(n)}">${esc(cname(n))} <span class="num">${v}</span></button>`).join("");
  $("cm-note").textContent = (cy.radar?.origin?.length
    ? "צבע המדינה: חלקה בתקיפות על אפליקציות ואתרים ביממה האחרונה לפי Cloudflare Radar. הקשתות מחברות את מדינות המקור והיעד המובילות ומראות נפח, לא תקיפה מסוימת. "
    : "צבע המדינה: כמה תקיפות יצאו ממנה. אין קשתות בין מדינות, כי אין מקור פתוח שמפרסם זוגות מקור־יעד. ")
    + "עמוד כתום: כתובת שתוקפת עכשיו, וגובהו לפי מספר הדיווחים לחיישני SANS DShield. מעוין סגול: שרת שליטה של בוטנט (abuse.ch). מיקום הכתובות משוער. לחיצה על מדינה פותחת את הנתונים שלה.";
  // ransomware
  if (rw) {
    const gmx = Math.max(1, ...rw.groups.map(g => g[1]));
    $("rw-groups").innerHTML = `<div class="lbl" style="margin-bottom:6px">קבוצות פעילות · 3 ימים</div>` + rw.groups.slice(0, 7).map(([g, n]) => `<div class="bar"><span>${esc(g)}</span><i style="--w:${(n / gmx * 100).toFixed(0)}%"></i><b class="num">${n}</b></div>`).join("");
    $("rw").innerHTML = rw.recent.slice(0, 30).map(v => `<li><span class="t">${esc(v.victim)}</span><span class="s"><span class="chip crit">${esc(v.group)}</span>${v.sector ? `<span>${esc(v.sector)}</span>` : ""}<span>${ago(v.t)}</span></span></li>`).join("");
    $("rw-meta").innerHTML = `<span class="chip">${rw.n24} ב־24 ש׳</span>` + (rw.il.length ? `<span class="chip crit">${rw.il.length} קשורים לישראל</span>` : "");
  }
  // news
  $("cn").innerHTML = (cy.news || []).length ? cy.news.map(n => `<li><a class="t ${n.he && trMode === "he" ? "" : "ltr"}" href="${U(n.link)}" target="_blank" rel="noopener">${esc(heTitle(n))}</a><span class="s">${n.il ? `<span class="chip warn">ישראל / איראן</span>` : ""}${n.n >= 2 ? `<span class="chip ok">${n.n} מקורות</span>` : ""}<span>${esc((n.outlets || []).slice(0, 3).join(", "))}</span><span>${ago(n.t)}</span></span></li>`).join("") : `<li class="empty">אין ידיעות.</li>`;
  $("cn-meta").innerHTML = `<span class="chip">${(cy.news || []).length} סיפורים</span>`;
  // kev
  $("kv").innerHTML = k && k.items.length ? k.items.map(x => `<li><span class="t"><span class="num">${esc(x.cve)}</span> · ${esc(x.vendor)} ${esc(x.product)}</span><span class="s">${esc(x.he || x.name)}</span><span class="s"><span>נוסף ${esc(x.date)}</span>${x.ransom ? `<span class="chip crit">בשימוש כופרה</span>` : ""}</span></li>`).join("") : `<li class="empty">אין נתונים.</li>`;
  // ports
  const PN = {22: "SSH", 23: "Telnet", 80: "HTTP", 443: "HTTPS", 445: "SMB", 3389: "RDP (שולחן עבודה מרוחק)", 8080: "HTTP חלופי", 5555: "ADB", 3306: "MySQL", 1433: "MSSQL", 5900: "VNC", 25: "SMTP", 8443: "HTTPS חלופי", 6379: "Redis", 2323: "Telnet חלופי", 81: "HTTP חלופי", 8000: "HTTP חלופי", 9200: "Elasticsearch", 53: "DNS"};
  const ports = cy.isc?.ports || [], pmx = Math.max(1, ...ports.map(p => p.n || 0));
  $("pt").innerHTML = ports.length ? `<div class="lbl" style="margin-bottom:6px">הפורטים שהכי הרבה תוקפים מנסים לפרוץ</div>` + ports.slice(0, 8).map(p => `<div class="bar"><span><span class="num">${p.port}</span> ${esc(PN[p.port] || "")}</span><i style="--w:${((p.n || 0) / pmx * 100).toFixed(0)}%"></i><b class="num">${(p.n || 0).toLocaleString("en-US")}</b></div>`).join("") : `<div class="empty">אין נתונים.</div>`;
  const hb = cy.hibp;
  $("hibp").innerHTML = hb ? `דליפת המידע האחרונה שנרשמה ב־Have I Been Pwned: <b style="color:var(--fg)">${esc(hb.name)}</b>, ${Number(hb.n || 0).toLocaleString("en-US")} חשבונות${hb.date ? ` · ${esc(hb.date)}` : ""}.` : "";
  // sources
  const ss = Object.values(WORLD.sources || {});
  $("ws").innerHTML = ss.map(s => `<span class="dot ${s.ok ? "ok" : "crit"}"></span><span>${esc(s.name)}</span><span class="lbl num">${s.ok ? (s.ms / 1000).toFixed(1) + "s" : "לא ענה"}</span>`).join("");
  $("ws-meta").innerHTML = `<span class="chip ${ss.every(s => s.ok) ? "ok" : "warn"}">${ss.filter(s => s.ok).length}/${ss.length} עונים</span>`;
}
const LIVE_MAPS = {
  radware: ["https://livethreatmap.radware.com/", "מפה חיה של Radware, מרשת החיישנים שלה. נטענת מהאתר שלהם ומתעדכנת שם בזמן אמת.", "https://livethreatmap.radware.com/"],
  kaspersky: ["https://cybermap.kaspersky.com/en/widget/dynamic/dark", "מפה חיה של Kaspersky: נוזקות, סריקות ותקיפות רשת שהמוצרים שלה מזהים בעולם, בזמן אמת. המפה המלאה (תלת־ממד, סטטיסטיקה לפי מדינה) נפתחת רק באתר שלהם.", "https://cybermap.kaspersky.com/"],
};
document.addEventListener("click", e => {
  const b = e.target.closest("[data-cm]"); if (!b) return;
  document.querySelectorAll("[data-cm]").forEach(x => x.setAttribute("aria-pressed", x === b));
  const m = LIVE_MAPS[b.dataset.cm];
  $("cm-ours").hidden = !!m; $("cm-live").hidden = !m;
  if (m) { if ($("cm-frame").getAttribute("src") !== m[0]) $("cm-frame").src = m[0];
    $("cm-live-note").innerHTML = `${esc(m[1])} <a href="${m[2]}" target="_blank" rel="noopener">לפתיחת המפה המלאה ↗</a>`; }
  else if (cmap) cmap.build();
});

/* ---------- live platform outages: official status pages, fetched by the browser every minute ---------- */
const SP = [["ChatGPT", "status.openai.com"], ["Claude", "status.claude.com"], ["GitHub", "www.githubstatus.com"], ["Cloudflare", "www.cloudflarestatus.com"],
  ["Discord", "discordstatus.com"], ["Reddit", "www.redditstatus.com"], ["Zoom", "www.zoomstatus.com"], ["Shopify", "www.shopifystatus.com"],
  ["Atlassian", "status.atlassian.com"], ["Twitch", "status.twitch.com"], ["Epic Games", "status.epicgames.com"], ["Figma", "status.figma.com"],
  ["Coinbase", "status.coinbase.com"], ["Vercel", "www.vercel-status.com"], ["DigitalOcean", "status.digitalocean.com"], ["npm", "status.npmjs.org"]];
const IMP = {none: 0, minor: 1, major: 2, critical: 3, maintenance: 0};
const ST_HE = {operational: "תקין", degraded_performance: "איטי", partial_outage: "תקלה חלקית", major_outage: "קריסה", under_maintenance: "תחזוקה"};
const getJ = (u, ms = 9000) => fetch(u, {signal: AbortSignal.timeout(ms), cache: "no-store"}).then(r => r.ok ? r.json() : Promise.reject(r.status));
async function pollStatus(){
  const out = await Promise.all([
    ...SP.map(([name, host]) => getJ(`https://${host}/api/v2/summary.json`).then(j => {
      const bad = (j.components || []).filter(c => c.status && c.status !== "operational" && !c.group);
      const inc = (j.incidents || []).filter(i => i.status !== "resolved" && i.status !== "postmortem");
      const lvl = Math.max(IMP[j.status?.indicator] ?? 0, ...inc.map(i => IMP[i.impact] ?? 1), ...bad.map(c => c.status === "major_outage" ? 3 : c.status === "partial_outage" ? 2 : c.status === "under_maintenance" ? 0 : 1));
      return {name, url: j.page?.url || `https://${host}`, ok: true, lvl, bad, inc: inc.map(i => ({name: i.name, t: i.updated_at || i.created_at, imp: i.impact, st: i.status, url: i.shortlink || j.page?.url}))};
    }).catch(() => ({name, url: `https://${host}`, ok: false, lvl: -1, bad: [], inc: []}))),
    getJ("https://slack-status.com/api/v2.0.0/current").then(j => {
      const inc = (j.active_incidents || []);
      return {name: "Slack", url: "https://slack-status.com", ok: true, lvl: inc.some(i => i.type === "outage") ? 3 : inc.length ? 1 : 0, bad: [], inc: inc.map(i => ({name: i.title, t: i.date_updated, imp: i.type, st: i.status, url: i.url}))};
    }).catch(() => ({name: "Slack", url: "https://slack-status.com", ok: false, lvl: -1, bad: [], inc: []})),
    getJ("https://www.google.com/appsstatus/dashboard/incidents.json").then(j => {
      const inc = (j || []).filter(i => !i.end);
      return {name: "Google Workspace", url: "https://www.google.com/appsstatus/dashboard/", ok: true, lvl: inc.some(i => i.severity === "high") ? 3 : inc.length ? 1 : 0, bad: [],
        inc: inc.map(i => ({name: (i.affected_products || []).map(p => p.title).join(", ") + " · " + (i.external_desc || "").split("\n")[0], t: i.modified, imp: i.severity, st: "", url: "https://www.google.com/appsstatus/dashboard/" + (i.uri || "")}))};
    }).catch(() => ({name: "Google Workspace", url: "https://www.google.com/appsstatus/dashboard/", ok: false, lvl: -1, bad: [], inc: []})),
  ]);
  out.sort((a, b) => b.lvl - a.lvl || a.name.localeCompare(b.name));
  const cls = l => l >= 3 ? "crit" : l >= 1 ? "warn" : l === 0 ? "ok" : "off";
  const word = r => !r.ok ? "לא ענה" : r.lvl >= 3 ? "קריסה" : r.lvl === 2 ? "תקלה" : r.lvl === 1 ? "תקלה קלה" : "תקין";
  $("up").innerHTML = out.map(r => `<a class="up ${r.lvl >= 3 ? "crit" : r.lvl >= 1 ? "warn" : ""}" href="${U(r.url)}" target="_blank" rel="noopener" title="${esc(r.bad.map(c => c.name + ": " + (ST_HE[c.status] || c.status)).join(" · "))}"><span class="dot ${cls(r.lvl)}"></span><span>${esc(r.name)}</span><small>${word(r)}</small></a>`).join("");
  const incs = out.flatMap(r => r.inc.map(i => ({...i, p: r.name}))).sort((a, b) => String(b.t).localeCompare(String(a.t)));
  $("up-inc").innerHTML = incs.length ? incs.map(i => `<li><a class="t ltr" href="${U(i.url)}" target="_blank" rel="noopener">${esc(i.name)}</a><span class="s"><span class="chip ${i.imp === "critical" || i.imp === "major" || i.imp === "outage" || i.imp === "high" ? "crit" : "warn"}">${esc(i.p)}</span>${i.st ? `<span>${esc(i.st)}</span>` : ""}${i.t ? `<span>${ago(Date.parse(i.t) / 1000)}</span>` : ""}</span></li>`).join("") : `<li class="empty">אין כרגע תקלות פתוחות באף פלטפורמה.</li>`;
  const down = out.filter(r => r.lvl >= 1).length, mute = out.filter(r => !r.ok).length;
  if (mute === out.length) $("up-inc").innerHTML = `<li class="empty">הבדיקה לא הצליחה מהדפדפן הזה. אין מידע על תקלות.</li>`;
  $("up-meta").innerHTML = `<span class="chip ${down || mute === out.length ? "warn" : "ok"}">${mute === out.length ? "אין מענה" : down ? down + " עם תקלה" : mute ? `תקין · ${mute} לא ענו` : "הכול תקין"}</span><span class="chip">נבדק ${new Date().toLocaleTimeString("he-IL", {hour: "2-digit", minute: "2-digit"})}</span>`;
}
let upTimer = null;
function startStatus(){ if (upTimer) return; pollStatus(); upTimer = setInterval(() => { if (!document.hidden && !$("view-cyber").hidden) pollStatus(); }, 60000); }

/* ---------- views ---------- */
function regionNav(){
  if (!SNAP) return;
  const s = SNAP.score ?? 0, w = s >= 75 ? "חירום" : s >= 50 ? "הסלמה" : s >= 25 ? "מתיחות" : s >= 10 ? "ערנות" : "שגרה";
  $("nv-region").textContent = `${w} · ${s}/100`;
  $("ft-upd").textContent = "עודכן " + ago(SNAP.ts);
}
async function show(view){
  if (!["region", "world", "cyber", "sky"].includes(view)) view = "region";
  document.querySelectorAll(".view").forEach(v => v.hidden = v.id !== "view-" + view);
  document.querySelectorAll("[data-view]").forEach(a => a.setAttribute("aria-selected", a.dataset.view === view));
  if (view === "region" || view === "sky") return;
  if (view === "cyber") startStatus();
  try { await getAtlas(); } catch (e) { for (const id of ["wm", "cm"]) $(id).innerHTML = `<div class="empty" style="padding:20px">המפה לא נטענה. בדקי את החיבור ורענני.</div>`; return; }
  if (view === "world") { if (!wmap) { wmap = makeMap($("wm"), {onDraw: drawWorld}); layerButtons("wm-layers", W_LAYERS, WL, () => drawWorld(wmap)); } wmap.build(); }
  if (view === "cyber") { if (!cmap) cmap = makeGlobe($("cm")); cmap.build(); }
}
const current = () => (location.hash || "#region").slice(1);
window.addEventListener("hashchange", () => show(current()));
window.addEventListener("world-data", () => { renderWorldPanels(); renderCyberPanels(); if (wmap?.svg) drawWorld(wmap); cmap?.data(); });
window.addEventListener("region-data", regionNav);
for (const id of ["tr-he", "tr-orig"]) document.getElementById(id)?.addEventListener("click", () => setTimeout(() => { renderWorldPanels(); renderCyberPanels(); }, 0));
show(current());
})();
