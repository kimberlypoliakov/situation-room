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

/* ---------- CYBER ---------- */
const CL = {heat: true, scan: true, c2: true};
const C_LAYERS = [["heat", "מדינות מקור", "var(--crit)"], ["scan", "כתובות שתוקפות עכשיו", "#ff4d6d"], ["c2", "שרתי שליטה של בוטנטים", "var(--site)"]];
let cmap = null;
function cyLevel(s){ return s >= 60 ? ["גל תקיפות", "var(--crit)"] : s >= 35 ? ["פעילות גבוהה", "var(--warn)"] : s >= 15 ? ["פעילות רגילה", "var(--accent)"] : ["שקט יחסית", "var(--ok)"]; }
function drawCyber(st){
  const cy = WORLD?.cyber; if (!cy) return;
  const geo = cy.geo || [];
  const per = {};
  const radar = cy.radar && cy.radar.origin && cy.radar.origin.length;
  if (radar) for (const o of cy.radar.origin) { const n = ISO2[o.cc]; if (n) per[n] = o.pct; }
  else for (const p of geo) { const n = ISO2[p.cc]; if (n) per[n] = (per[n] || 0) + (p.k === "scan" ? Math.log10(10 + (p.n || 0)) : 1); }
  const mx = Math.max(1e-6, ...Object.values(per));
  st.land.selectAll("path").attr("class", d => CL.heat && per[d.properties.name] ? "hot" : null)
    .style("--heat", d => per[d.properties.name] ? (0.2 + 0.75 * Math.sqrt(per[d.properties.name] / mx)).toFixed(2) : null)
    .on("pointerenter pointermove", (e, d) => { const n = d.properties.name; const ss = geo.filter(p => ISO2[p.cc] === n);
      st.showTip(e, `<b>${esc(cname(n))}</b><div class="tt dim">${radar ? `${(per[n] || 0).toFixed(1)}% מתקיפות האפליקציה בעולם יצאו מכאן (Cloudflare)` : ss.length ? `${ss.filter(p => p.k === "scan").length} כתובות תוקפות · ${ss.filter(p => p.k === "c2").length} שרתי שליטה` : "לא נמדדה פעילות"}</div>`); })
    .on("pointerleave", st.hideTip);
  const pts = [];
  for (const p of geo) {
    if (p.k === "scan" && CL.scan) pts.push({k: "scan", lon: p.lon, lat: p.lat, r: 2 + Math.min(6, Math.log10(1 + (p.n || 1)) * 1.1), c: "#ff4d6d", cls: "pulse",
      tip: `<b>כתובת שתוקפת עכשיו</b> · <span class="dim">${esc(cname(ISO2[p.cc] || p.cc || ""))}</span><div class="tt"><span class="num">${esc(p.ip)}</span> · ${(p.n || 0).toLocaleString("en-US")} דיווחים מחיישני DShield</div>`});
    if (p.k === "c2" && CL.c2) pts.push({k: "c2", lon: p.lon, lat: p.lat, r: 3.2, c: "var(--site)", cls: p.on ? "pulse" : "",
      tip: `<b>שרת שליטה של בוטנט</b> · <span class="dim">${esc(p.mw || "")} · ${p.on ? "פעיל" : "לא פעיל כרגע"}</span><div class="tt"><span class="num">${esc(p.ip)}</span> · ${esc(cname(ISO2[p.cc] || p.cc || ""))}</div>`});
  }
  renderPoints(st, pts);
  // animated arcs from the busiest attack sources toward the busiest target countries (Cloudflare only: real origin -> target pairs are not published, so arcs show volume, not specific attacks)
  st.g.selectAll("g.arcs").remove();
  if (radar && cy.radar.target && cy.radar.target.length) {
    const A = st.g.append("g").attr("class", "arcs");
    const T = cy.radar.target.slice(0, 5).map(t => centroid[ISO2[t.cc]]).filter(Boolean);
    const O = cy.radar.origin.slice(0, 6).map(o => centroid[ISO2[o.cc]]).filter(Boolean);
    let i = 0;
    for (const o of O) for (const t of T) { if (o === t) continue; const line = {type: "LineString", coordinates: [o, t]};
      A.append("path").attr("d", st.path(line)).attr("class", "arc").style("--dl", (i++ % 9) * 0.45 + "s"); }
  }
}
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
  $("cm-top").innerHTML = `<span class="lbl">מקורות מובילים:</span>` + topC.map(([n, v]) => `<span class="chip">${esc(cname(n))} <span class="num">${v}</span></span>`).join("");
  $("cm-note").textContent = cy.radar?.origin?.length
    ? "צבע המדינה: חלקה בתקיפות על אפליקציות ואתרים ביממה האחרונה לפי Cloudflare Radar. הקווים מחברים את מדינות המקור והיעד המובילות. נקודות: כתובות שתוקפות עכשיו (SANS DShield) ושרתי שליטה של בוטנטים (abuse.ch)."
    : "נקודות אדומות: 100 הכתובות ששלחו הכי הרבה תקיפות וסריקות לחיישני DShield ביממה האחרונה. נקודות סגולות: שרתי שליטה של בוטנטים (abuse.ch Feodo). מיקום הכתובת משוער לפי ip-api. ללא קווים: אין מקור פתוח שמפרסם זוגות מקור־יעד.";
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
document.addEventListener("click", e => {
  const b = e.target.closest("[data-cm]"); if (!b) return;
  document.querySelectorAll("[data-cm]").forEach(x => x.setAttribute("aria-pressed", x === b));
  const live = b.dataset.cm === "live";
  $("cm-ours").hidden = live; $("cm-live").hidden = !live;
  if (live && !$("cm-frame").src) $("cm-frame").src = "https://livethreatmap.radware.com/";
  if (!live && cmap) cmap.build();
});

/* ---------- views ---------- */
function regionNav(){
  if (!SNAP) return;
  const s = SNAP.score ?? 0, w = s >= 75 ? "חירום" : s >= 50 ? "הסלמה" : s >= 25 ? "מתיחות" : s >= 10 ? "ערנות" : "שגרה";
  $("nv-region").textContent = `${w} · ${s}/100`;
  $("ft-upd").textContent = "עודכן " + ago(SNAP.ts);
}
async function show(view){
  if (!["region", "world", "cyber"].includes(view)) view = "region";
  document.querySelectorAll(".view").forEach(v => v.hidden = v.id !== "view-" + view);
  document.querySelectorAll("[data-view]").forEach(a => a.setAttribute("aria-selected", a.dataset.view === view));
  if (view === "region") return;
  try { await getAtlas(); } catch (e) { for (const id of ["wm", "cm"]) $(id).innerHTML = `<div class="empty" style="padding:20px">המפה לא נטענה. בדקי את החיבור ורענני.</div>`; return; }
  if (view === "world") { if (!wmap) { wmap = makeMap($("wm"), {onDraw: drawWorld}); layerButtons("wm-layers", W_LAYERS, WL, () => drawWorld(wmap)); } wmap.build(); }
  if (view === "cyber") { if (!cmap) { cmap = makeMap($("cm"), {cls: "cy", onDraw: drawCyber}); layerButtons("cm-layers", C_LAYERS, CL, () => drawCyber(cmap)); } cmap.build(); }
}
const current = () => (location.hash || "#region").slice(1);
window.addEventListener("hashchange", () => show(current()));
window.addEventListener("world-data", () => { renderWorldPanels(); renderCyberPanels(); if (wmap?.svg) drawWorld(wmap); if (cmap?.svg) drawCyber(cmap); });
window.addEventListener("region-data", regionNav);
for (const id of ["tr-he", "tr-orig"]) document.getElementById(id)?.addEventListener("click", () => setTimeout(() => { renderWorldPanels(); renderCyberPanels(); }, 0));
show(current());
})();
