/* HK-dir Grunndata dashboard
 * Vanilla JS, ECharts, Lucide.
 */

const COLORS = {
  primary: "#c4502b",
  primary2: "#e06a3d",
  ink: "#1d2930",
  ink2: "#3a4a54",
  muted: "#6b7b85",
  teal: "#2d6d7a",
  teal2: "#4c8f9d",
  gold: "#e0a34a",
  forest: "#4a7c59",
  rose: "#b44b7a",
  line: "#e6ded4",
};

const SERIES_COLORS = [
  "#c4502b", "#2d6d7a", "#e0a34a", "#4a7c59", "#b44b7a",
  "#6c6fa6", "#3a4a54", "#a77c45",
];

const FMT = {
  int: (n) => n == null ? "—" : Math.round(n).toLocaleString("nb-NO"),
  pct: (n, digits = 1) => n == null ? "—" : `${n.toFixed(digits).replace(".", ",")} %`,
  ratio: (n) => n == null ? "—" : n.toFixed(2).replace(".", ","),
  delta: (n) => {
    if (n == null || !isFinite(n)) return "";
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(1).replace(".", ",")} %`;
  },
};

const state = {
  data: null,
  sector: "uh",
  year: 2026,
  yearIdx: 5,
  tab: "overview",
  search: "",
  filters: { inst: -1, field: -1, loc: -1 },
  sort: "fv-desc",
  listLimit: 60,
  compare: [],
  charts: {},
  pg: { round: "hov", quota: "ord", year: 2025, drawerRound: "hov" },
  pages: { top: 0, pgHard: 0, pgChange: 0 },
  topMetric: "fv",
  table: {
    search: "",
    sortKey: "fv",
    sortDir: -1,
    page: 0,
    perPage: 200,
    colFilters: {},      // {colKey: {text?: string, min?: number, max?: number}}
    showFilters: true,
  },
};

const PAGE_SIZE = 10;

const PG_YEARS = [2020, 2021, 2022, 2023, 2024, 2025];
const PG_SERIES_META = {
  hov_ord: { label: "Hovedopptak · ordinær",        color: "#c4502b", dash: false },
  hov_fgv: { label: "Hovedopptak · førstegangsvit.", color: "#e0a34a", dash: false },
  sup_ord: { label: "Suppleringsopptak · ordinær",   color: "#2d6d7a", dash: true },
  sup_fgv: { label: "Suppleringsopptak · førstegang.",color: "#4a7c59", dash: true },
};

const els = {};

/* ---------- Boot ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  cacheEls();
  renderIcons();
  wireStatic();

  try {
    const resp = await fetch("data/grunndata.json", { cache: "no-cache" });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    state.data = await resp.json();
  } catch (err) {
    document.getElementById("app").innerHTML = `<section class="card"><h2>Kunne ikke laste data</h2><p class="muted">${err.message}</p></section>`;
    return;
  }

  const footYear = document.getElementById("foot-year");
  if (footYear) footYear.textContent = new Date().getFullYear();

  // Honour URL params: ?sector=uh|fag  and hash: #explore|#compare|…
  const params = new URLSearchParams(location.search);
  const sectorParam = params.get("sector");
  if (sectorParam && state.data.sectors[sectorParam]) state.sector = sectorParam;
  syncSectorYear();
  document.querySelectorAll(".sector-toggle button").forEach(b => b.classList.toggle("active", b.dataset.sector === state.sector));
  renderAll();

  const applyHash = () => {
    const h = (location.hash || "").replace(/^#/, "");
    if (["overview", "explore", "compare", "institutions", "fields", "poeng", "data"].includes(h)) setTab(h);
  };
  applyHash();
  window.addEventListener("hashchange", applyHash);

  // Fade the loader out once the first paint is settled
  requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove("is-loading")));
});

function cacheEls() {
  [
    "search", "result-count", "study-list", "list-more", "reset-filters",
    "f-inst", "f-field", "f-loc", "f-sort",
    "kpi-applicants", "kpi-applicants-delta",
    "kpi-first", "kpi-first-delta",
    "kpi-seats", "kpi-seats-delta",
    "kpi-ratio", "kpi-ratio-delta",
    "kpi-women", "kpi-women-delta",
    "m-studies", "m-institutions", "m-locations", "m-fields",
    "year-label-fields", "year-label-top", "year-label-growth-from", "year-label-growth-to",
    "inst-grid", "field-cards",
    "drawer", "d-field", "d-name", "d-inst", "d-loc", "d-code", "d-kpis", "d-chart", "d-table",
    "compare-add", "compare-suggest", "compare-chips",
    "year-toggle", "year-menu", "toast", "d-add-compare",
  ].forEach(id => els[id] = document.getElementById(id));
}

function renderIcons() {
  if (window.lucide) window.lucide.createIcons();
}

/* ---------- Header + sector ---------- */
function syncSectorYear() {
  const sector = state.data.sectors[state.sector];
  const years = sector.years;
  if (!years.includes(state.year)) state.year = years[years.length - 1];
  state.yearIdx = years.indexOf(state.year);

  // rewrite year labels
  ["year-label-fields", "year-label-top", "year-label-growth-to"].forEach(id => {
    if (els[id]) els[id].textContent = state.year;
  });
  if (els["year-label-growth-from"]) els["year-label-growth-from"].textContent = years[0];
  if (els["year-toggle"]) els["year-toggle"].querySelector("span").textContent = state.year;
}

function wireStatic() {
  // Brand logo → hard refresh (cache-busted) back to the overview landing state.
  const brand = document.getElementById("brand-home");
  if (brand) {
    brand.addEventListener("click", (e) => {
      e.preventDefault();
      document.body.classList.add("is-loading");
      // Cache-bust the main doc so reloading picks up any new deploy.
      const url = location.pathname + "?_r=" + Date.now();
      location.replace(url);
    });
  }

  // Tabs
  document.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => setTab(btn.dataset.view));
  });

  // Sector toggle — injected after brand
  const topActions = document.querySelector(".topbar-actions");
  const sectorWrap = document.createElement("div");
  sectorWrap.className = "sector-toggle";
  sectorWrap.innerHTML = `
    <button data-sector="uh" class="active">Universitet &amp; høgskole</button>
    <button data-sector="fag">Fagskoler</button>`;
  sectorWrap.querySelectorAll("button").forEach(b => b.style.whiteSpace = "nowrap");
  topActions.insertBefore(sectorWrap, topActions.firstChild);
  sectorWrap.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    setSector(b.dataset.sector);
  });

  // Year picker
  els["year-toggle"].addEventListener("click", (e) => openYearMenu(e));
  document.addEventListener("click", (e) => {
    if (!els["year-menu"].contains(e.target) && !els["year-toggle"].contains(e.target)) {
      els["year-menu"].hidden = true;
    }
  });

  // Trend metric segmented
  document.querySelectorAll('.seg[data-group="trend-metric"] .seg-btn').forEach(b => {
    b.addEventListener("click", () => {
      setSegActive(b);
      renderTrendChart(b.dataset.value);
    });
  });
  // Field metric segmented
  document.querySelectorAll('.seg[data-group="field-metric"] .seg-btn').forEach(b => {
    b.addEventListener("click", () => {
      setSegActive(b);
      renderFieldsChart(b.dataset.value);
    });
  });
  // Top metric segmented
  document.querySelectorAll('.seg[data-group="top-metric"] .seg-btn').forEach(b => {
    b.addEventListener("click", () => {
      setSegActive(b);
      state.topMetric = b.dataset.value;
      state.pages.top = 0;
      renderTopList(b.dataset.value);
    });
  });

  // Data table wiring
  const dataSearch = document.getElementById("data-search");
  if (dataSearch) dataSearch.addEventListener("input", e => {
    state.table.search = e.target.value.trim().toLowerCase();
    state.table.page = 0;
    renderDataTable();
  });
  const dataExport = document.getElementById("data-export");
  if (dataExport) dataExport.addEventListener("click", exportDataCsv);

  // Search + filters
  els["search"].addEventListener("input", (e) => {
    state.search = e.target.value.trim().toLowerCase();
    state.listLimit = 60;
    renderStudyList();
  });
  els["search"].addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const first = document.querySelector(".study-card");
      if (first) first.click();
    } else if (e.key === "Escape") {
      e.target.value = ""; state.search = ""; renderStudyList();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement.tagName !== "INPUT" && document.activeElement.tagName !== "TEXTAREA") {
      e.preventDefault();
      setTab("explore");
      els["search"].focus();
    } else if (e.key === "Escape") {
      if (els["drawer"].getAttribute("aria-hidden") === "false") closeDrawer();
    }
  });

  els["f-inst"].addEventListener("change", e => { state.filters.inst = +e.target.value; state.listLimit = 60; renderStudyList(); });
  els["f-field"].addEventListener("change", e => { state.filters.field = +e.target.value; state.listLimit = 60; renderStudyList(); });
  els["f-loc"].addEventListener("change", e => { state.filters.loc = +e.target.value; state.listLimit = 60; renderStudyList(); });
  els["f-sort"].addEventListener("change", e => { state.sort = e.target.value; renderStudyList(); });
  els["reset-filters"].addEventListener("click", () => {
    els["search"].value = ""; state.search = "";
    state.filters = { inst: -1, field: -1, loc: -1 };
    state.sort = "fv-desc"; els["f-sort"].value = "fv-desc";
    [els["f-inst"], els["f-field"], els["f-loc"]].forEach(s => s.value = "-1");
    state.listLimit = 60;
    renderStudyList();
  });

  // Drawer
  document.getElementById("drawer-close").addEventListener("click", closeDrawer);
  els["drawer"].querySelector(".drawer-backdrop").addEventListener("click", closeDrawer);

  // Compare
  els["compare-add"].addEventListener("input", renderCompareSuggest);
  els["compare-add"].addEventListener("focus", renderCompareSuggest);
  els["compare-add"].addEventListener("blur", () => setTimeout(() => els["compare-suggest"].classList.remove("open"), 180));

  // Resize
  window.addEventListener("resize", () => {
    Object.values(state.charts).forEach(c => c && c.resize && c.resize());
  });
}

function setSegActive(btn) {
  const group = btn.closest(".seg");
  group.querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
}

function setTab(name) {
  state.tab = name;
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.view === name));
  document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === `view-${name}`));
  if (name === "institutions") renderInstitutions();
  if (name === "fields") renderFields();
  if (name === "compare") { renderCompareChips(); renderCompareCharts(); }
  if (name === "poeng") renderPoengView();
  if (name === "data") renderDataTable();
  // Resize after the view is visible so ECharts picks up real dimensions
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      Object.values(state.charts).forEach(c => c && c.resize && c.resize());
    });
  });
}

function setSector(sector) {
  if (sector === state.sector) return;
  state.sector = sector;
  document.querySelectorAll(".sector-toggle button").forEach(b => b.classList.toggle("active", b.dataset.sector === sector));
  // reset sector-scoped state
  state.filters = { inst: -1, field: -1, loc: -1 };
  state.compare = [];
  syncSectorYear();
  // Poenggrenser tab: disabled for fagskoler (Samordna publiserer ikke disse)
  const pgTab = document.querySelector('.tab[data-view="poeng"]');
  if (pgTab) {
    pgTab.style.opacity = sector === "fag" ? 0.45 : 1;
    pgTab.title = sector === "fag" ? "Samordna opptak publiserer ikke poenggrenser for fagskoler" : "";
    if (sector === "fag" && state.tab === "poeng") setTab("overview");
  }
  renderAll();
  showToast(`Skiftet til ${state.data.meta.sectors[sector]}`);
}

function openYearMenu(e) {
  const menu = els["year-menu"];
  const years = state.data.sectors[state.sector].years;
  menu.innerHTML = `<div class="label">Referanseår</div>` + years.map(y => `
    <button class="${y === state.year ? "active" : ""}" data-year="${y}">${y}</button>
  `).join("");
  menu.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
    state.year = +b.dataset.year;
    syncSectorYear();
    renderAll();
    menu.hidden = true;
  }));
  const r = els["year-toggle"].getBoundingClientRect();
  menu.style.top = `${r.bottom + window.scrollY + 6}px`;
  menu.style.left = `${r.right + window.scrollX - menu.offsetWidth}px`;
  menu.hidden = false;
  // reposition after layout
  setTimeout(() => {
    menu.style.left = `${r.right + window.scrollX - menu.offsetWidth}px`;
  }, 0);
  e.stopPropagation();
}

/* ---------- Render all ---------- */
function renderAll() {
  const s = state.data.sectors[state.sector];

  els["m-studies"].textContent = s.studies.length.toLocaleString("nb-NO");
  els["m-institutions"].textContent = s.institutions.length;
  els["m-locations"].textContent = s.locations.length;
  els["m-fields"].textContent = s.fields.length;

  // Always render overview (the default visible tab)
  renderKpis();
  renderTrendChart("abs");
  renderFieldsChart("fv");
  renderTopList("fv");
  renderGrowthChart();

  fillFilters();
  renderStudyList();

  // Re-render visible non-overview tab; other tabs render on switch
  if (state.tab === "institutions") renderInstitutions();
  if (state.tab === "fields") renderFields();
  if (state.tab === "compare") { renderCompareChips(); renderCompareCharts(); }

  renderIcons();
}

/* ---------- Totals & helpers ---------- */
function sectorTotals(sectorKey = state.sector) {
  const s = state.data.sectors[sectorKey];
  const Y = s.years.length;
  const s_total = new Array(Y).fill(0);
  const fv_total = new Array(Y).fill(0);
  const p_total  = new Array(Y).fill(0);
  // kv weighted by first-choice count
  const kv_num = new Array(Y).fill(0);
  const kv_den = new Array(Y).fill(0);

  for (const x of s.studies) {
    for (let i = 0; i < Y; i++) {
      if (x.s[i]  != null) s_total[i]  += x.s[i];
      if (x.fv[i] != null) fv_total[i] += x.fv[i];
      if (x.p[i]  != null) p_total[i]  += x.p[i];
      if (x.fv[i] != null && x.kv[i] != null) {
        kv_num[i] += (x.fv[i] * x.kv[i]) / 100;
        kv_den[i] += x.fv[i];
      }
    }
  }
  const kv_total = kv_num.map((n, i) => kv_den[i] > 0 ? (n / kv_den[i]) * 100 : null);
  return { s: s_total, fv: fv_total, p: p_total, kv: kv_total, years: s.years };
}

function yoyDelta(arr, idx) {
  if (idx <= 0) return null;
  const a = arr[idx - 1], b = arr[idx];
  if (a == null || b == null || a === 0) return null;
  return ((b - a) / a) * 100;
}

function deltaHTML(v, invert = false) {
  if (v == null || !isFinite(v)) return "";
  const cls = invert ? (v < 0 ? "up" : v > 0 ? "down" : "") : (v > 0 ? "up" : v < 0 ? "down" : "");
  const icon = v > 0 ? "trending-up" : v < 0 ? "trending-down" : "minus";
  return `<i data-lucide="${icon}"></i> ${FMT.delta(v)} YoY`;
}

/* ---------- KPI ---------- */
function renderKpis() {
  const t = sectorTotals();
  const i = state.yearIdx;
  els["kpi-applicants"].textContent = FMT.int(t.s[i]);
  els["kpi-applicants-delta"].innerHTML = deltaHTML(yoyDelta(t.s, i));
  const d1 = els["kpi-applicants-delta"]; d1.className = "kpi-delta " + (yoyDelta(t.s, i) > 0 ? "up" : yoyDelta(t.s, i) < 0 ? "down" : "");

  els["kpi-first"].textContent = FMT.int(t.fv[i]);
  els["kpi-first-delta"].innerHTML = deltaHTML(yoyDelta(t.fv, i));
  els["kpi-first-delta"].className = "kpi-delta " + (yoyDelta(t.fv, i) > 0 ? "up" : yoyDelta(t.fv, i) < 0 ? "down" : "");

  els["kpi-seats"].textContent = FMT.int(t.p[i]);
  els["kpi-seats-delta"].innerHTML = deltaHTML(yoyDelta(t.p, i));
  els["kpi-seats-delta"].className = "kpi-delta " + (yoyDelta(t.p, i) > 0 ? "up" : yoyDelta(t.p, i) < 0 ? "down" : "");

  const ratio = t.p[i] > 0 ? t.fv[i] / t.p[i] : null;
  const ratioPrev = (i > 0 && t.p[i-1] > 0) ? t.fv[i-1] / t.p[i-1] : null;
  els["kpi-ratio"].textContent = FMT.ratio(ratio);
  const ratioDelta = (ratio != null && ratioPrev != null && ratioPrev !== 0) ? ((ratio - ratioPrev) / ratioPrev) * 100 : null;
  els["kpi-ratio-delta"].innerHTML = deltaHTML(ratioDelta);
  els["kpi-ratio-delta"].className = "kpi-delta " + (ratioDelta > 0 ? "up" : ratioDelta < 0 ? "down" : "");

  els["kpi-women"].textContent = FMT.pct(t.kv[i]);
  const kvDelta = (i > 0 && t.kv[i] != null && t.kv[i-1] != null) ? t.kv[i] - t.kv[i-1] : null;
  els["kpi-women-delta"].innerHTML = kvDelta == null ? "" : `<i data-lucide="${kvDelta > 0 ? "trending-up" : kvDelta < 0 ? "trending-down" : "minus"}"></i> ${kvDelta > 0 ? "+" : ""}${kvDelta.toFixed(1).replace(".", ",")} pp`;
  els["kpi-women-delta"].className = "kpi-delta " + (kvDelta > 0 ? "up" : kvDelta < 0 ? "down" : "");

  renderIcons();
}

/* ---------- Charts: trend ---------- */
function makeChart(id) {
  const el = document.getElementById(id);
  if (!el) return null;
  if (state.charts[id]) { state.charts[id].dispose(); }
  const chart = echarts.init(el, null, { renderer: "canvas" });
  state.charts[id] = chart;
  return chart;
}

const baseAxis = {
  axisLine: { lineStyle: { color: COLORS.line } },
  axisTick: { show: false },
  axisLabel: { color: COLORS.muted, fontSize: 11 },
  splitLine: { lineStyle: { color: COLORS.line, type: [2, 4] } },
};

const baseTooltip = {
  backgroundColor: COLORS.ink,
  borderColor: COLORS.ink,
  textStyle: { color: "#fff", fontSize: 12 },
  padding: [8, 10],
};

function renderTrendChart(mode) {
  const chart = makeChart("chart-trend");
  if (!chart) return;
  const t = sectorTotals();
  const index = arr => {
    const base = arr[0];
    if (!base) return arr.map(() => 0);
    return arr.map(v => v == null ? null : (v / base) * 100);
  };
  const data = mode === "idx"
    ? { s: index(t.s), fv: index(t.fv), p: index(t.p) }
    : t;

  chart.setOption({
    grid: { top: 28, left: 48, right: 16, bottom: 28 },
    legend: {
      top: 0, left: 0,
      icon: "circle",
      itemWidth: 8, itemHeight: 8,
      textStyle: { color: COLORS.ink2, fontSize: 12 },
    },
    tooltip: {
      ...baseTooltip,
      trigger: "axis",
      axisPointer: { lineStyle: { color: COLORS.muted, type: "dashed" } },
      valueFormatter: v => mode === "idx" ? (v != null ? `${v.toFixed(1)}` : "—") : FMT.int(v),
    },
    xAxis: { type: "category", data: t.years, ...baseAxis },
    yAxis: { type: "value", ...baseAxis, axisLabel: { ...baseAxis.axisLabel, formatter: v => v >= 10000 ? `${v/1000}k` : v } },
    series: [
      { name: "Alle søkere",   type: "line", smooth: true, symbol: "circle", symbolSize: 6, lineStyle: { width: 2.5 }, color: COLORS.primary, data: data.s, areaStyle: mode === "abs" ? { color: "rgba(196,80,43,0.08)" } : null },
      { name: "Førstevalg",    type: "line", smooth: true, symbol: "circle", symbolSize: 6, lineStyle: { width: 2.5 }, color: COLORS.teal,    data: data.fv },
      { name: "Studieplasser", type: "line", smooth: true, symbol: "circle", symbolSize: 6, lineStyle: { width: 2.5 }, color: COLORS.gold,    data: data.p },
    ],
  });
}

/* ---------- Chart: fields ---------- */
function renderFieldsChart(metric) {
  const chart = makeChart("chart-fields");
  if (!chart) return;
  const s = state.data.sectors[state.sector];
  const i = state.yearIdx;
  const byField = new Map();
  for (const x of s.studies) {
    const v = x[metric] && x[metric][i];
    if (v == null) continue;
    byField.set(x.f, (byField.get(x.f) || 0) + v);
  }
  const rows = [...byField.entries()]
    .map(([fIdx, v]) => ({ name: s.fields[fIdx], value: v }))
    .sort((a, b) => b.value - a.value);

  chart.setOption({
    grid: { top: 8, left: 180, right: 30, bottom: 8 },
    tooltip: { ...baseTooltip, valueFormatter: FMT.int },
    xAxis: { type: "value", ...baseAxis, axisLabel: { ...baseAxis.axisLabel, formatter: v => v >= 10000 ? `${v/1000}k` : v } },
    yAxis: {
      type: "category",
      data: rows.map(r => r.name).reverse(),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: COLORS.ink2, fontSize: 11.5 },
    },
    series: [{
      type: "bar",
      data: rows.map(r => r.value).reverse(),
      itemStyle: {
        color: metric === "p" ? COLORS.gold : metric === "s" ? COLORS.primary2 : COLORS.primary,
        borderRadius: [0, 4, 4, 0],
      },
      barCategoryGap: "35%",
      label: { show: true, position: "right", formatter: p => FMT.int(p.value), color: COLORS.ink2, fontSize: 11 },
    }],
  });
}

/* ---------- Top list ---------- */
function renderTopList(metric) {
  const s = state.data.sectors[state.sector];
  const i = state.yearIdx;
  const all = s.studies
    .map(x => {
      const fv = x.fv[i], sAll = x.s[i], p = x.p[i], kv = x.kv[i];
      let value = null;
      if (metric === "fv") value = fv;
      else if (metric === "ratio") value = (p > 0 && fv != null) ? fv / p : null;
      else if (metric === "kv") value = kv;
      return { x, fv, sAll, p, kv, value };
    })
    .filter(r => r.value != null && (metric !== "ratio" || (r.p >= 10)))
    .filter(r => metric !== "kv" || r.fv >= 30)
    .sort((a, b) => b.value - a.value);

  const fmtVal = metric === "fv" ? FMT.int : metric === "ratio" ? FMT.ratio : FMT.pct;
  els["year-label-top"].textContent = state.year;

  const totalPages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  if (state.pages.top >= totalPages) state.pages.top = totalPages - 1;
  const page = state.pages.top;
  const start = page * PAGE_SIZE;
  const slice = all.slice(start, start + PAGE_SIZE);

  const rows = slice.map((r, idx) => `
    <div class="top-row" data-code="${r.x.c}" data-inst="${r.x.i}">
      <div class="rank">${start + idx + 1}</div>
      <div>
        <div class="title">${escapeHtml(r.x.n)}</div>
        <div class="sub">${escapeHtml(s.institutions[r.x.i])} · ${escapeHtml(s.locations[r.x.l])}</div>
      </div>
      <div class="value">${fmtVal(r.value)}</div>
    </div>
  `).join("");

  const pager = pagerHTML(page, totalPages, all.length);
  const wrap = document.getElementById("top-list");
  wrap.innerHTML = (rows || `<div class="muted small" style="padding:16px">Ingen data.</div>`) + pager;
  wrap.querySelectorAll(".top-row").forEach(el => {
    el.addEventListener("click", () => openDrawer(findStudy(el.dataset.code, +el.dataset.inst)));
  });
  wirePager(wrap, (dir) => { state.pages.top = clampPage(state.pages.top + dir, totalPages); renderTopList(state.topMetric); });
  renderIcons();
}

function pagerHTML(page, totalPages, totalItems) {
  const from = page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, totalItems);
  return `
    <div class="top-pager">
      <div class="pg-info">${from}–${to} av ${totalItems.toLocaleString("nb-NO")}</div>
      <div class="pg-btns">
        <button data-pg="first" ${page === 0 ? "disabled" : ""} title="Første side"><i data-lucide="chevrons-left"></i></button>
        <button data-pg="prev"  ${page === 0 ? "disabled" : ""}><i data-lucide="chevron-left"></i> Forrige</button>
        <button data-pg="next"  ${page >= totalPages - 1 ? "disabled" : ""}>Neste <i data-lucide="chevron-right"></i></button>
        <button data-pg="last"  ${page >= totalPages - 1 ? "disabled" : ""} title="Siste side"><i data-lucide="chevrons-right"></i></button>
      </div>
    </div>`;
}

function wirePager(wrap, handler) {
  wrap.querySelectorAll(".top-pager button").forEach(b => {
    b.addEventListener("click", () => {
      const action = b.dataset.pg;
      if (action === "next") handler(1);
      else if (action === "prev") handler(-1);
      else if (action === "first") handler(-Infinity);
      else if (action === "last") handler(Infinity);
    });
  });
}

function clampPage(p, totalPages) {
  if (p < 0) return 0;
  if (p >= totalPages) return totalPages - 1;
  return p;
}

/* ---------- Growth chart ---------- */
function renderGrowthChart() {
  const chart = makeChart("chart-growth");
  if (!chart) return;
  const s = state.data.sectors[state.sector];
  const Y = s.years.length;
  const byInst = s.institutions.map((name, idx) => ({ name, idx, start: 0, end: 0 }));
  for (const x of s.studies) {
    if (x.fv[0] != null)     byInst[x.i].start += x.fv[0];
    if (x.fv[Y-1] != null)   byInst[x.i].end   += x.fv[Y-1];
  }
  const rows = byInst
    .filter(r => r.start > 0)
    .map(r => ({ ...r, delta: r.end - r.start, pct: ((r.end - r.start) / r.start) * 100 }))
    .sort((a, b) => b.delta - a.delta);
  const top = [...rows.slice(0, 6), ...rows.slice(-4)];

  chart.setOption({
    grid: { top: 8, left: 200, right: 60, bottom: 8 },
    tooltip: {
      ...baseTooltip,
      formatter: p => {
        const r = rows.find(x => x.name === p.name);
        if (!r) return "";
        return `<b>${escapeHtml(r.name)}</b><br/>${s.years[0]}: ${FMT.int(r.start)}<br/>${s.years[Y-1]}: ${FMT.int(r.end)}<br/>Δ ${r.delta > 0 ? "+" : ""}${FMT.int(r.delta)} (${FMT.delta(r.pct)})`;
      }
    },
    xAxis: { type: "value", ...baseAxis },
    yAxis: {
      type: "category",
      data: top.map(r => r.name).reverse(),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: COLORS.ink2, fontSize: 11.5 },
    },
    series: [{
      type: "bar",
      data: top.map(r => ({ value: r.delta, itemStyle: { color: r.delta >= 0 ? COLORS.teal : COLORS.primary } })).reverse(),
      barCategoryGap: "35%",
      label: {
        show: true,
        position: "right",
        formatter: p => `${p.value > 0 ? "+" : ""}${FMT.int(p.value)}`,
        color: COLORS.ink2, fontSize: 11
      },
    }],
  });
}

/* ---------- Explore ---------- */
function fillFilters() {
  const s = state.data.sectors[state.sector];
  const withAll = (arr, label) => `<option value="-1">Alle ${label}</option>` + arr.map((v, i) => `<option value="${i}">${escapeHtml(v)}</option>`).join("");
  els["f-inst"].innerHTML  = withAll(s.institutions, "institusjoner");
  els["f-field"].innerHTML = withAll(s.fields,       "fagområder");
  els["f-loc"].innerHTML   = withAll(s.locations,    "steder");
  els["f-inst"].value = state.filters.inst;
  els["f-field"].value = state.filters.field;
  els["f-loc"].value = state.filters.loc;
}

function filterStudies() {
  const s = state.data.sectors[state.sector];
  const q = state.search;
  const f = state.filters;
  const i = state.yearIdx;
  const Y = s.years.length;

  let filtered = s.studies.filter(x => {
    if (f.inst  >= 0 && x.i !== f.inst)  return false;
    if (f.field >= 0 && x.f !== f.field) return false;
    if (f.loc   >= 0 && x.l !== f.loc)   return false;
    if (!q) return true;
    const hay = `${x.n} ${s.institutions[x.i]} ${s.locations[x.l]} ${s.fields[x.f]} ${x.c}`.toLowerCase();
    return hay.includes(q);
  });

  // sort
  const key = state.sort;
  filtered.sort((a, b) => {
    const dir = key.endsWith("asc") ? 1 : -1;
    const metric = key.split("-")[0];
    const getval = (x) => {
      if (metric === "name")   return x.n.toLowerCase();
      if (metric === "fv")     return x.fv[i] ?? -Infinity;
      if (metric === "s")      return x.s[i]  ?? -Infinity;
      if (metric === "kv")     return x.kv[i] ?? -Infinity;
      if (metric === "ratio")  { return (x.p[i] > 0 && x.fv[i] != null) ? x.fv[i] / x.p[i] : -Infinity; }
      if (metric === "growth") {
        const a0 = x.fv[0], a1 = x.fv[Y-1];
        return (a0 > 0 && a1 != null) ? ((a1 - a0) / a0) * 100 : -Infinity;
      }
      if (metric === "pg") {
        if (!x.pg) return dir === 1 ? Infinity : -Infinity;  // push nulls to end
        const arr = x.pg.hov_ord || [];
        for (let j = arr.length - 1; j >= 0; j--) if (arr[j] != null && arr[j] > 0) return arr[j];
        return dir === 1 ? Infinity : -Infinity;
      }
      return 0;
    };
    const av = getval(a), bv = getval(b);
    if (av < bv) return -1 * dir;
    if (av > bv) return  1 * dir;
    return 0;
  });

  return filtered;
}

function renderStudyList() {
  const s = state.data.sectors[state.sector];
  const i = state.yearIdx;
  const list = filterStudies();
  els["result-count"].textContent = list.length.toLocaleString("nb-NO");
  const shown = list.slice(0, state.listLimit);

  const html = shown.map(x => studyCardHTML(x, s, i)).join("");
  els["study-list"].innerHTML = html;

  attachStudyCardEvents(s, i);

  if (list.length > state.listLimit) {
    els["list-more"].innerHTML = `<button class="ghost-btn" id="load-more"><i data-lucide="chevrons-down"></i><span>Vis flere (${list.length - state.listLimit} igjen)</span></button>`;
    document.getElementById("load-more").addEventListener("click", () => {
      state.listLimit += 60;
      renderStudyList();
    });
  } else {
    els["list-more"].innerHTML = "";
  }
  renderIcons();
}

function latestPg(x) {
  if (!x.pg) return null;
  const arr = x.pg.hov_ord || [];
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null && arr[i] > 0) return { v: arr[i], y: PG_YEARS[i] };
  return null;
}

function studyCardHTML(x, s, i) {
  const fv = x.fv[i], sAll = x.s[i], p = x.p[i], kv = x.kv[i];
  const ratio = (p > 0 && fv != null) ? fv / p : null;
  const pg = latestPg(x);
  const pgPill = pg
    ? `<span class="pg-pill" title="Poenggrense ordinær hovedopptak ${pg.y}"><i data-lucide="medal"></i>${pg.v.toFixed(1).replace(".", ",")}</span>`
    : "";
  return `
    <article class="study-card" data-code="${x.c}" data-inst="${x.i}">
      <div class="card-top">
        <div class="tag">${escapeHtml(s.fields[x.f])}</div>
        ${pgPill}
      </div>
      <div class="name">${escapeHtml(x.n)}</div>
      <div class="sub"><i data-lucide="landmark"></i>${escapeHtml(s.institutions[x.i])} · <i data-lucide="map-pin"></i>${escapeHtml(s.locations[x.l])}</div>
      <div class="stats">
        <div><div class="stat-l">Søkere</div><div class="stat-v">${FMT.int(sAll)}</div></div>
        <div><div class="stat-l">Førstevalg</div><div class="stat-v primary">${FMT.int(fv)}</div></div>
        <div><div class="stat-l">Plasser</div><div class="stat-v">${FMT.int(p)}</div></div>
        <div><div class="stat-l">Søk/plass</div><div class="stat-v">${FMT.ratio(ratio)}</div></div>
      </div>
      <div class="spark" id="spark-${x.i}-${x.c}"></div>
    </article>`;
}

function attachStudyCardEvents(s, i) {
  document.querySelectorAll("#study-list .study-card").forEach(el => {
    const code = el.dataset.code; const iIdx = +el.dataset.inst;
    el.addEventListener("click", () => openDrawer(findStudy(code, iIdx)));
    const sp = el.querySelector(".spark");
    const study = findStudy(code, iIdx);
    if (sp && study) drawSparkline(sp, study.fv);
  });
}

function drawSparkline(container, data) {
  container.innerHTML = "";
  const chart = echarts.init(container, null, { renderer: "canvas" });
  const valid = data.map(v => v == null ? 0 : v);
  const max = Math.max(...valid, 1);
  chart.setOption({
    grid: { top: 2, left: 2, right: 2, bottom: 2 },
    xAxis: { type: "category", show: false, data: valid.map((_, i) => i) },
    yAxis: { type: "value", show: false, min: 0, max: max * 1.05 },
    tooltip: {
      ...baseTooltip,
      trigger: "axis",
      formatter: p => {
        const years = state.data.sectors[state.sector].years;
        return p.map(pp => `${years[pp.dataIndex]}: <b>${FMT.int(data[pp.dataIndex])}</b>`).join("<br/>");
      }
    },
    series: [{
      type: "line", data: valid,
      symbol: "none", smooth: true,
      lineStyle: { width: 1.8, color: COLORS.primary },
      areaStyle: { color: "rgba(196,80,43,0.15)" },
    }]
  });
}

function findStudy(code, instIdx) {
  const s = state.data.sectors[state.sector];
  return s.studies.find(x => x.c === code && x.i === instIdx);
}

/* ---------- Drawer ---------- */
function openDrawer(study) {
  if (!study) return;
  const s = state.data.sectors[state.sector];
  const i = state.yearIdx;
  els["d-field"].textContent = s.fields[study.f];
  els["d-name"].textContent = study.n;
  els["d-inst"].textContent = s.institutions[study.i];
  els["d-loc"].textContent  = s.locations[study.l];
  els["d-code"].textContent = study.c;

  const fv = study.fv[i], sAll = study.s[i], p = study.p[i], kv = study.kv[i];
  const ratio = (p > 0 && fv != null) ? fv / p : null;
  els["d-kpis"].innerHTML = `
    <div class="d-kpi"><div class="l">Søkere ${state.year}</div><div class="v">${FMT.int(sAll)}</div></div>
    <div class="d-kpi"><div class="l">Førstevalg</div><div class="v">${FMT.int(fv)}</div></div>
    <div class="d-kpi"><div class="l">Plasser</div><div class="v">${FMT.int(p)}</div></div>
    <div class="d-kpi"><div class="l">Søk/plass</div><div class="v">${FMT.ratio(ratio)}</div></div>
  `;

  // chart: show all four metrics over time (dual axis for ratio/kv)
  const ch = makeChart("d-chart");
  ch.setOption({
    grid: { top: 30, left: 48, right: 40, bottom: 28 },
    legend: { top: 0, icon: "circle", itemWidth: 8, itemHeight: 8, textStyle: { color: COLORS.ink2, fontSize: 12 } },
    tooltip: { ...baseTooltip, trigger: "axis" },
    xAxis: { type: "category", data: s.years, ...baseAxis },
    yAxis: [
      { type: "value", ...baseAxis },
      { type: "value", ...baseAxis, max: 100, axisLabel: { ...baseAxis.axisLabel, formatter: v => `${v}%` } }
    ],
    series: [
      { name: "Alle søkere",   type: "line", smooth: true, symbolSize: 5, color: COLORS.primary, data: study.s,  lineStyle: { width: 2.5 }, areaStyle: { color: "rgba(196,80,43,0.08)" } },
      { name: "Førstevalg",    type: "line", smooth: true, symbolSize: 5, color: COLORS.teal,    data: study.fv, lineStyle: { width: 2.5 } },
      { name: "Plasser",       type: "line", smooth: true, symbolSize: 5, color: COLORS.gold,    data: study.p,  lineStyle: { width: 2.5 } },
      { name: "Kvinneandel",   type: "line", smooth: true, symbolSize: 5, color: COLORS.rose,    data: study.kv, yAxisIndex: 1, lineStyle: { width: 2, type: "dashed" } },
    ],
  });

  // table
  els["d-table"].innerHTML = renderStudyTable(study, s);

  // poenggrenser section
  const pgSection = document.getElementById("d-pg-section");
  if (study.pg) {
    pgSection.hidden = false;
    renderDrawerPgChart(study);
  } else {
    pgSection.hidden = true;
  }

  els["d-add-compare"].onclick = () => { addToCompare(study); showToast("Lagt til i sammenligning"); };
  els["drawer"].setAttribute("aria-hidden", "false");
  renderIcons();
  setTimeout(() => { ch.resize(); if (study.pg && state.charts["d-pg-chart"]) state.charts["d-pg-chart"].resize(); }, 280);
}

function renderStudyTable(study, s) {
  const rows = [
    ["Alle søkere", "s", FMT.int],
    ["Førstevalg", "fv", FMT.int],
    ["Plasser", "p", FMT.int],
    ["Kvinneandel", "kv", FMT.pct],
    ["Søkere per plass", "ratio", FMT.ratio],
  ];
  return `
    <table>
      <thead><tr><th>Nøkkeltall</th>${s.years.map(y => `<th>${y}</th>`).join("")}</tr></thead>
      <tbody>
        ${rows.map(([label, key, fmt]) => {
          const cells = s.years.map((y, i) => {
            if (key === "ratio") {
              const v = (study.p[i] > 0 && study.fv[i] != null) ? study.fv[i] / study.p[i] : null;
              return `<td>${fmt(v)}</td>`;
            }
            return `<td>${fmt(study[key][i])}</td>`;
          }).join("");
          return `<tr><td>${label}</td>${cells}</tr>`;
        }).join("")}
      </tbody>
    </table>`;
}

function closeDrawer() {
  els["drawer"].setAttribute("aria-hidden", "true");
}

/* ---------- Institutions view ---------- */
function renderInstitutions() {
  const s = state.data.sectors[state.sector];
  const Y = s.years.length;
  const i = state.yearIdx;
  const agg = s.institutions.map((name, idx) => ({
    idx, name,
    s: new Array(Y).fill(0), fv: new Array(Y).fill(0), p: new Array(Y).fill(0),
    programs: 0, kv_n: new Array(Y).fill(0), kv_d: new Array(Y).fill(0),
  }));
  for (const x of s.studies) {
    const a = agg[x.i];
    a.programs += 1;
    for (let j = 0; j < Y; j++) {
      if (x.s[j]  != null) a.s[j]  += x.s[j];
      if (x.fv[j] != null) a.fv[j] += x.fv[j];
      if (x.p[j]  != null) a.p[j]  += x.p[j];
      if (x.fv[j] != null && x.kv[j] != null) { a.kv_n[j] += (x.fv[j] * x.kv[j]) / 100; a.kv_d[j] += x.fv[j]; }
    }
  }
  // Replace with official institution totals when available
  s.institutionTotals && s.institutionTotals.forEach((t, idx) => {
    if (!t) return;
    if (t.s)  agg[idx].s  = t.s.slice();
    if (t.fv) agg[idx].fv = t.fv.slice();
    if (t.p)  agg[idx].p  = t.p.slice();
    if (t.kv) agg[idx].kv_total = t.kv.slice();
  });

  agg.sort((a, b) => (b.fv[i] ?? 0) - (a.fv[i] ?? 0));
  const html = agg.map(a => {
    const ratio = (a.p[i] > 0 && a.fv[i] != null) ? a.fv[i] / a.p[i] : null;
    return `
      <article class="inst-card" data-inst="${a.idx}">
        <div class="name">${escapeHtml(a.name)}</div>
        <div class="meta">${a.programs} studieprogram</div>
        <div class="stats">
          <div><div class="stat-l">Søkere</div><div class="stat-v">${FMT.int(a.s[i])}</div></div>
          <div><div class="stat-l">Førstevalg</div><div class="stat-v primary">${FMT.int(a.fv[i])}</div></div>
          <div><div class="stat-l">Søk/plass</div><div class="stat-v">${FMT.ratio(ratio)}</div></div>
        </div>
        <div class="spark" id="inst-spark-${a.idx}"></div>
      </article>`;
  }).join("");
  els["inst-grid"].innerHTML = html;
  agg.forEach(a => {
    const c = document.getElementById(`inst-spark-${a.idx}`);
    if (c) drawSparkline(c, a.fv);
  });
  document.querySelectorAll(".inst-card").forEach(card => {
    card.addEventListener("click", () => {
      const idx = +card.dataset.inst;
      setTab("explore");
      state.filters.inst = idx; els["f-inst"].value = idx;
      els["search"].value = ""; state.search = "";
      renderStudyList();
    });
  });
  renderIcons();
}

/* ---------- Fields view ---------- */
function renderFields() {
  const s = state.data.sectors[state.sector];
  const Y = s.years.length;
  const agg = s.fields.map((name, idx) => ({
    idx, name,
    s: new Array(Y).fill(0), fv: new Array(Y).fill(0), p: new Array(Y).fill(0),
  }));
  for (const x of s.studies) {
    const a = agg[x.f];
    for (let j = 0; j < Y; j++) {
      if (x.s[j]  != null) a.s[j]  += x.s[j];
      if (x.fv[j] != null) a.fv[j] += x.fv[j];
      if (x.p[j]  != null) a.p[j]  += x.p[j];
    }
  }
  s.fieldTotals && s.fieldTotals.forEach((t, idx) => {
    if (!t) return;
    if (t.s)  agg[idx].s  = t.s.slice();
    if (t.fv) agg[idx].fv = t.fv.slice();
    if (t.p)  agg[idx].p  = t.p.slice();
  });
  agg.sort((a, b) => (b.fv[state.yearIdx] ?? 0) - (a.fv[state.yearIdx] ?? 0));

  // Heatmap: rows = fields, cols = years, colour = førstevalg-antall.
  // Sequential warm scale; scaled to √(value) so mid-sized fields still get
  // readable colour instead of being washed out by the biggest ones.
  const heatEl = document.getElementById("chart-fields-heat");
  if (heatEl) {
    const rowH = 28;
    heatEl.style.height = `${Math.max(360, agg.length * rowH + 110)}px`;
  }
  const chart = makeChart("chart-fields-heat");
  if (chart) {
    const ordered = [...agg].sort((a, b) => (b.fv[state.yearIdx] ?? 0) - (a.fv[state.yearIdx] ?? 0));

    // Log-scale the color dimension so huge and tiny fields both get readable hues.
    const allVals = [];
    const data = [];
    ordered.forEach((a, row) => {
      s.years.forEach((_, col) => {
        const val = a.fv[col];
        if (val != null && val > 0) allVals.push(val);
        const colorVal = (val == null || val <= 0) ? null : Math.log10(val);
        data.push([col, row, colorVal, val]);
      });
    });
    const logMin = allVals.length ? Math.log10(Math.min(...allVals)) : 0;
    const logMax = allVals.length ? Math.log10(Math.max(...allVals)) : 1;

    chart.setOption({
      animation: false,
      tooltip: {
        ...baseTooltip,
        formatter: p => {
          const [col, rowIdx, , abs] = p.value;
          const name = ordered[(ordered.length - 1) - rowIdx].name;
          const base = ordered[(ordered.length - 1) - rowIdx].fv[0];
          const pct = (base && base > 0 && abs != null) ? ((abs - base) / base) * 100 : null;
          const deltaTxt = pct == null ? "" : `<br/>Endring fra ${s.years[0]}: ${pct > 0 ? "+" : ""}${pct.toFixed(1).replace(".", ",")} %`;
          return `<b>${escapeHtml(name)}</b><br/>${s.years[col]}: ${FMT.int(abs)} førstevalg${deltaTxt}`;
        }
      },
      grid: { top: 30, left: 260, right: 30, bottom: 20 },
      xAxis: {
        type: "category",
        data: s.years,
        position: "top",
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: COLORS.ink, fontSize: 12.5, fontWeight: 500 },
      },
      yAxis: {
        type: "category",
        data: ordered.map(a => a.name).reverse(),
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: COLORS.ink, fontSize: 12 },
      },
      visualMap: {
        show: true,
        min: logMin, max: logMax,
        orient: "horizontal",
        left: "center", bottom: -6,
        itemWidth: 12, itemHeight: 220,
        text: ["mange søkere", "få søkere"],
        textStyle: { color: COLORS.muted, fontSize: 11 },
        formatter: v => FMT.int(Math.round(Math.pow(10, v))),
        inRange: {
          // Light green → yellow → red. Deliberately lighter at both ends
          // so the constant black cell text always reads cleanly.
          color: [
            "#d9ecc8",
            "#b8db98",
            "#e8e29a",
            "#f6d87a",
            "#f3b05b",
            "#ea8a4a",
            "#e16a43",
            "#d04a35",
          ],
        },
      },
      series: [{
        type: "heatmap",
        data: data.map(([col, row, c, abs]) => [col, (ordered.length - 1) - row, c, abs]),
        label: {
          show: true,
          formatter: p => p.value[3] == null ? "—" : FMT.int(p.value[3]),
          color: "#1d2930",
          fontSize: 11.5,
          fontWeight: 500,
        },
        itemStyle: { borderColor: "#fbf7f1", borderWidth: 2, borderRadius: 4 },
        emphasis: {
          itemStyle: { borderColor: COLORS.ink, borderWidth: 2 },
          label: { fontWeight: 700 },
        },
      }],
    });
  }

  // cards
  const i = state.yearIdx;
  const html = agg.map(a => {
    const ratio = (a.p[i] > 0 && a.fv[i] != null) ? a.fv[i] / a.p[i] : null;
    const growth = (a.fv[0] > 0 && a.fv[Y-1] != null) ? ((a.fv[Y-1] - a.fv[0]) / a.fv[0]) * 100 : null;
    return `
      <article class="field-card" data-field="${a.idx}">
        <div class="name">${escapeHtml(a.name)}</div>
        <div class="muted small">${FMT.int(a.fv[i])} førstevalg · søk/plass ${FMT.ratio(ratio)}${growth != null ? ` · <span style="color:${growth > 0 ? COLORS.forest : COLORS.primary}">${FMT.delta(growth)}</span> siden ${s.years[0]}` : ""}</div>
        <div class="spark" id="field-spark-${a.idx}"></div>
      </article>`;
  }).join("");
  els["field-cards"].innerHTML = html;
  agg.forEach(a => {
    const c = document.getElementById(`field-spark-${a.idx}`);
    if (c) drawSparkline(c, a.fv);
  });
  document.querySelectorAll(".field-card").forEach(card => {
    card.addEventListener("click", () => {
      const idx = +card.dataset.field;
      setTab("explore");
      state.filters.field = idx; els["f-field"].value = idx;
      els["search"].value = ""; state.search = "";
      renderStudyList();
    });
  });
}

/* ---------- Poenggrenser view ---------- */
function wirePoengControls() {
  if (wirePoengControls._done) return;
  wirePoengControls._done = true;
  document.querySelectorAll('.seg[data-group="pg-controls"] .seg-btn').forEach(b => {
    b.addEventListener("click", () => { setSegActive(b); state.pg.round = b.dataset.round; renderPoengView(); });
  });
  document.querySelectorAll('.seg[data-group="pg-quota"] .seg-btn').forEach(b => {
    b.addEventListener("click", () => { setSegActive(b); state.pg.quota = b.dataset.quota; renderPoengView(); });
  });
  document.querySelectorAll('.seg[data-group="pg-year"] .seg-btn').forEach(b => {
    b.addEventListener("click", () => { setSegActive(b); state.pg.year = +b.dataset.year; renderPoengView(); });
  });
  document.querySelectorAll('.seg[data-group="d-pg-round"] .seg-btn').forEach(b => {
    b.addEventListener("click", () => { setSegActive(b); state.pg.drawerRound = b.dataset.round; /* need current study — find from drawer dom */
      const code = document.getElementById("d-code").textContent.trim();
      const instName = document.getElementById("d-inst").textContent.trim();
      const s = state.data.sectors[state.sector];
      const iIdx = s.institutions.indexOf(instName);
      const study = findStudy(code, iIdx);
      if (study) renderDrawerPgChart(study);
    });
  });
}

function pgValueFor(study, round, quota, yearIdx) {
  if (!study.pg) return null;
  const arr = study.pg[`${round}_${quota}`];
  return arr ? arr[yearIdx] : null;
}

function renderPoengView() {
  wirePoengControls();
  const s = state.data.sectors[state.sector];
  if (state.sector !== "uh") {
    document.getElementById("view-poeng").innerHTML = `
      <section class="card">
        <h2>Ingen poenggrensedata for fagskoler</h2>
        <p class="muted">Samordna opptak publiserer ikke poenggrenser for fagskoler. Bytt til Universitet &amp; høgskole.</p>
      </section>`;
    return;
  }
  document.getElementById("pg-top-year").textContent = state.pg.year;

  const { round, quota, year } = state.pg;
  const yearIdx = PG_YEARS.indexOf(year);
  const studiesWithPg = s.studies.filter(x => x.pg);
  const valid = studiesWithPg
    .map(x => ({ x, v: pgValueFor(x, round, quota, yearIdx) }))
    .filter(r => r.v != null);

  // KPI 1: median among programs where someone didn't get in (pg > 0)
  const withCutoff = valid.filter(r => r.v > 0).map(r => r.v).sort((a, b) => a - b);
  const median = withCutoff.length ? withCutoff[Math.floor(withCutoff.length / 2)] : null;
  document.getElementById("pg-kpi-median").textContent = median != null ? median.toFixed(1).replace(".", ",") : "—";

  // delta vs previous year
  const prevIdx = yearIdx - 1;
  let prevMedian = null;
  if (prevIdx >= 0) {
    const pv = studiesWithPg.map(x => pgValueFor(x, round, quota, prevIdx)).filter(v => v != null && v > 0).sort((a, b) => a - b);
    if (pv.length) prevMedian = pv[Math.floor(pv.length / 2)];
  }
  const mDeltaEl = document.getElementById("pg-kpi-median-delta");
  if (median != null && prevMedian != null) {
    const d = median - prevMedian;
    mDeltaEl.innerHTML = `<i data-lucide="${d > 0 ? "trending-up" : d < 0 ? "trending-down" : "minus"}"></i> ${d > 0 ? "+" : ""}${d.toFixed(1).replace(".", ",")} poeng vs ${year - 1}`;
    mDeltaEl.className = "kpi-delta " + (d > 0 ? "up" : d < 0 ? "down" : "");
  } else {
    mDeltaEl.innerHTML = ""; mDeltaEl.className = "kpi-delta";
  }

  // KPI 2: count with pg data
  document.getElementById("pg-kpi-count").textContent = FMT.int(valid.length);
  document.getElementById("pg-kpi-count-note").textContent = `av ${FMT.int(studiesWithPg.length)} programmer`;

  // KPI 3: open programs (pg = 0)
  const open = valid.filter(r => r.v === 0).length;
  document.getElementById("pg-kpi-open").textContent = FMT.int(open);
  document.getElementById("pg-kpi-open-note").textContent = `${valid.length ? ((open / valid.length) * 100).toFixed(0) : 0} % av disse`;

  // Hardest — ordinary programs (≤80) paginated; særskilt opptak appended once on last page.
  const PG_NORMAL_MAX = 80;
  const sortedHard = valid.filter(r => r.v > 0).sort((a, b) => b.v - a.v);
  const normal   = sortedHard.filter(r => r.v <= PG_NORMAL_MAX);
  const special  = sortedHard.filter(r => r.v >  PG_NORMAL_MAX);

  const hardPages = Math.max(1, Math.ceil(normal.length / PAGE_SIZE));
  if (state.pages.pgHard >= hardPages) state.pages.pgHard = hardPages - 1;
  const hp = state.pages.pgHard;
  const hardStart = hp * PAGE_SIZE;
  const hardSlice = normal.slice(hardStart, hardStart + PAGE_SIZE);

  const rowHTML = (r, rank, isSpecial) => `
    <div class="top-row${isSpecial ? " top-row-special" : ""}" data-code="${r.x.c}" data-inst="${r.x.i}">
      <div class="rank">${rank}</div>
      <div>
        <div class="title">${escapeHtml(r.x.n)}${isSpecial ? ' <span class="badge-special" title="Opptaksprøve / tilleggspoeng — ikke direkte sammenlignbar">særskilt opptak</span>' : ""}</div>
        <div class="sub">${escapeHtml(s.institutions[r.x.i])} · ${escapeHtml(s.locations[r.x.l])}</div>
      </div>
      <div class="value">${r.v.toFixed(1).replace(".", ",")}</div>
    </div>`;

  let html = hardSlice.map((r, idx) => rowHTML(r, hardStart + idx + 1, false)).join("");
  if (hp === hardPages - 1 && special.length) {
    html += `<div class="top-divider"><i data-lucide="info"></i> Særskilt opptak — opptaksprøve / tilleggspoeng</div>`;
    html += special.slice(0, 5).map(r => rowHTML(r, "★", true)).join("");
  }
  html += pagerHTML(hp, hardPages, normal.length);
  const hardWrap = document.getElementById("pg-top-hard");
  hardWrap.innerHTML = html || `<div class="muted small" style="padding:16px">Ingen data.</div>`;
  hardWrap.querySelectorAll(".top-row").forEach(el => {
    el.addEventListener("click", () => openDrawer(findStudy(el.dataset.code, +el.dataset.inst)));
  });
  wirePager(hardWrap, (dir) => {
    state.pages.pgHard = (dir === Infinity) ? hardPages - 1 : (dir === -Infinity) ? 0 : clampPage(hp + dir, hardPages);
    renderPoengView();
  });

  // Top change: sort by abs change 2020 -> 2025 (or first->last valid)
  const changes = studiesWithPg
    .map(x => {
      const arr = x.pg[`${round}_${quota}`] || [];
      const firstValid = arr.findIndex(v => v != null && v > 0);
      let lastValid = -1;
      for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null && arr[i] > 0) { lastValid = i; break; }
      if (firstValid < 0 || lastValid < 0 || firstValid === lastValid) return null;
      return { x, from: arr[firstValid], to: arr[lastValid], fromYr: PG_YEARS[firstValid], toYr: PG_YEARS[lastValid] };
    })
    .filter(Boolean);
  changes.forEach(c => c.delta = c.to - c.from);
  // Sorted by absolute delta descending — biggest movers first (either direction)
  const changeSorted = [...changes].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const changePages = Math.max(1, Math.ceil(changeSorted.length / PAGE_SIZE));
  if (state.pages.pgChange >= changePages) state.pages.pgChange = changePages - 1;
  const cp = state.pages.pgChange;
  const cStart = cp * PAGE_SIZE;
  const cSlice = changeSorted.slice(cStart, cStart + PAGE_SIZE);
  const changeHtml = cSlice.map(c => `
    <div class="top-row" data-code="${c.x.c}" data-inst="${c.x.i}">
      <div class="rank" style="color:${c.delta > 0 ? COLORS.teal : COLORS.primary}">${c.delta > 0 ? "↑" : "↓"}</div>
      <div>
        <div class="title">${escapeHtml(c.x.n)}</div>
        <div class="sub">${escapeHtml(s.institutions[c.x.i])} · ${c.fromYr}: ${c.from.toFixed(1).replace(".", ",")} → ${c.toYr}: ${c.to.toFixed(1).replace(".", ",")}</div>
      </div>
      <div class="value" style="color:${c.delta > 0 ? COLORS.teal : COLORS.primary}">${c.delta > 0 ? "+" : ""}${c.delta.toFixed(1).replace(".", ",")}</div>
    </div>
  `).join("") + pagerHTML(cp, changePages, changeSorted.length);
  const changeWrap = document.getElementById("pg-top-change");
  changeWrap.innerHTML = changeHtml || `<div class="muted small" style="padding:16px">Ingen data.</div>`;
  changeWrap.querySelectorAll(".top-row").forEach(el => {
    el.addEventListener("click", () => openDrawer(findStudy(el.dataset.code, +el.dataset.inst)));
  });
  wirePager(changeWrap, (dir) => {
    state.pages.pgChange = (dir === Infinity) ? changePages - 1 : (dir === -Infinity) ? 0 : clampPage(cp + dir, changePages);
    renderPoengView();
  });

  // Chart: median poenggrense per field over years
  renderPoengFieldsChart(s);

  renderIcons();
}

function renderPoengFieldsChart(s) {
  const { round, quota } = state.pg;
  const chart = makeChart("chart-pg-fields");
  if (!chart) return;

  // Build median per field per year
  const byField = new Map();
  for (const x of s.studies) {
    if (!x.pg) continue;
    const arr = x.pg[`${round}_${quota}`];
    if (!arr) continue;
    for (let i = 0; i < PG_YEARS.length; i++) {
      if (arr[i] == null || arr[i] <= 0) continue;
      if (!byField.has(x.f)) byField.set(x.f, PG_YEARS.map(() => []));
      byField.get(x.f)[i].push(arr[i]);
    }
  }
  const medianOf = (arr) => {
    if (!arr.length) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  // Keep only top 12 fields by total studies
  const fieldSizes = s.fields.map((_, i) => ({ i, c: s.studies.filter(x => x.f === i && x.pg).length }));
  fieldSizes.sort((a, b) => b.c - a.c);
  const keep = fieldSizes.slice(0, 14).map(x => x.i);

  const series = keep.map((fIdx, i) => ({
    name: s.fields[fIdx],
    type: "line",
    smooth: true,
    symbolSize: 5,
    lineStyle: { width: 2 },
    color: SERIES_COLORS[i % SERIES_COLORS.length],
    data: (byField.get(fIdx) || PG_YEARS.map(() => [])).map(medianOf),
  }));

  chart.setOption({
    grid: { top: 50, left: 48, right: 20, bottom: 24 },
    legend: { top: 0, type: "scroll", icon: "circle", itemWidth: 8, itemHeight: 8, textStyle: { color: COLORS.ink2, fontSize: 11.5 } },
    tooltip: { ...baseTooltip, trigger: "axis", valueFormatter: v => v == null ? "—" : v.toFixed(1).replace(".", ",") },
    xAxis: { type: "category", data: PG_YEARS, ...baseAxis },
    yAxis: { type: "value", ...baseAxis, axisLabel: { ...baseAxis.axisLabel, formatter: v => v.toFixed(0) } },
    series,
  });
}

function renderDrawerPgChart(study) {
  const chart = makeChart("d-pg-chart");
  if (!chart) return;
  const round = state.pg.drawerRound;
  const series = ["ord", "fgv"].map(quota => {
    const key = `${round}_${quota}`;
    const meta = PG_SERIES_META[key];
    return {
      name: meta.label,
      type: "line",
      smooth: true,
      symbolSize: 6,
      lineStyle: { width: 2.5, type: meta.dash ? "dashed" : "solid" },
      color: meta.color,
      data: (study.pg[key] || []).map(v => v == null ? null : v),
      connectNulls: true,
    };
  });
  chart.setOption({
    grid: { top: 34, left: 44, right: 16, bottom: 28 },
    legend: { top: 0, icon: "circle", itemWidth: 8, itemHeight: 8, textStyle: { color: COLORS.ink2, fontSize: 11.5 } },
    tooltip: { ...baseTooltip, trigger: "axis", valueFormatter: v => v == null ? "—" : v.toFixed(1).replace(".", ",") + " poeng" },
    xAxis: { type: "category", data: PG_YEARS, ...baseAxis },
    yAxis: { type: "value", ...baseAxis, axisLabel: { ...baseAxis.axisLabel, formatter: v => v.toFixed(0) } },
    series,
  });
}

/* ---------- Compare ---------- */
function renderCompareSuggest() {
  const q = els["compare-add"].value.trim().toLowerCase();
  const s = state.data.sectors[state.sector];
  if (!q) {
    els["compare-suggest"].classList.remove("open");
    return;
  }
  const matches = s.studies
    .filter(x => `${x.n} ${s.institutions[x.i]} ${s.locations[x.l]} ${x.c}`.toLowerCase().includes(q))
    .slice(0, 8);
  if (!matches.length) {
    els["compare-suggest"].innerHTML = `<div><span class="muted">Ingen treff.</span></div>`;
    els["compare-suggest"].classList.add("open");
    return;
  }
  els["compare-suggest"].innerHTML = matches.map(x => `
    <div data-code="${x.c}" data-inst="${x.i}">
      <div class="s-name">${escapeHtml(x.n)}</div>
      <div class="s-sub">${escapeHtml(s.institutions[x.i])} · ${escapeHtml(s.locations[x.l])}</div>
    </div>
  `).join("");
  els["compare-suggest"].classList.add("open");
  els["compare-suggest"].querySelectorAll("div[data-code]").forEach(d => {
    d.addEventListener("mousedown", () => {
      addToCompare(findStudy(d.dataset.code, +d.dataset.inst));
      els["compare-add"].value = "";
      els["compare-suggest"].classList.remove("open");
    });
  });
}

function addToCompare(study) {
  if (!study) return;
  if (state.compare.find(x => x.c === study.c && x.i === study.i)) return;
  if (state.compare.length >= 6) { showToast("Maks 6 studier i sammenligning"); return; }
  state.compare.push(study);
  renderCompareChips();
  renderCompareCharts();
}
function removeFromCompare(code, instIdx) {
  state.compare = state.compare.filter(x => !(x.c === code && x.i === instIdx));
  renderCompareChips();
  renderCompareCharts();
}

function renderCompareChips() {
  const s = state.data.sectors[state.sector];
  if (!state.compare.length) {
    els["compare-chips"].innerHTML = `<div class="muted small">Ingen studier valgt — søk for å legge til.</div>`;
    return;
  }
  els["compare-chips"].innerHTML = state.compare.map((x, i) => `
    <div class="chip">
      <span class="dot" style="background:${SERIES_COLORS[i % SERIES_COLORS.length]}"></span>
      <span>${escapeHtml(x.n)} · <span class="muted">${escapeHtml(s.institutions[x.i])}</span></span>
      <button data-code="${x.c}" data-inst="${x.i}"><i data-lucide="x"></i></button>
    </div>
  `).join("");
  els["compare-chips"].querySelectorAll("button").forEach(b => {
    b.addEventListener("click", () => removeFromCompare(b.dataset.code, +b.dataset.inst));
  });
  renderIcons();
}

function renderCompareCharts() {
  const s = state.data.sectors[state.sector];
  const years = s.years;

  const build = (key, idEl, formatter) => {
    const chart = makeChart(idEl);
    if (!chart) return;
    if (!state.compare.length) {
      chart.setOption({
        title: { text: "Ingen studier valgt", left: "center", top: "middle", textStyle: { color: COLORS.muted, fontSize: 13, fontWeight: 400 } }
      });
      return;
    }
    const series = state.compare.map((x, i) => {
      let data;
      if (key === "ratio") {
        data = years.map((_, j) => (x.p[j] > 0 && x.fv[j] != null) ? +(x.fv[j] / x.p[j]).toFixed(2) : null);
      } else {
        data = x[key];
      }
      return {
        name: `${x.n} (${s.institutions[x.i]})`,
        type: "line", smooth: true, symbolSize: 6,
        lineStyle: { width: 2.5 },
        color: SERIES_COLORS[i % SERIES_COLORS.length],
        data,
      };
    });
    chart.setOption({
      grid: { top: 40, left: 52, right: 16, bottom: 28 },
      legend: { top: 0, type: "scroll", icon: "circle", itemWidth: 8, itemHeight: 8, textStyle: { color: COLORS.ink2, fontSize: 11.5 } },
      tooltip: { ...baseTooltip, trigger: "axis", valueFormatter: formatter },
      xAxis: { type: "category", data: years, ...baseAxis },
      yAxis: { type: "value", ...baseAxis, axisLabel: { ...baseAxis.axisLabel, formatter: v => (key === "kv") ? `${v}%` : (v >= 10000 ? `${v/1000}k` : v) } },
      series,
    });
  };
  build("fv",    "chart-cmp-fv",    FMT.int);
  build("ratio", "chart-cmp-ratio", FMT.ratio);
  build("s",     "chart-cmp-s",     FMT.int);
  build("kv",    "chart-cmp-kv",    v => FMT.pct(v));
}

/* ---------- Data table ---------- */

const TABLE_YEARS = [2020, 2021, 2022, 2023, 2024, 2025, 2026];
const SEARCH_YEAR_BASE = 2021;   // søkertall year index 0 = 2021
const PG_YEAR_BASE     = 2020;   // pg years index 0 = 2020

function tableColumns() {
  return [
    { key: "inst",  label: "Institusjon", type: "text",
      get: (r, s) => s.institutions[r.x.i] },
    { key: "name",  label: "Studienavn",  type: "text", primary: true,
      get: (r) => r.x.n, sub: (r, s) => s.fields[r.x.f] },
    { key: "loc",   label: "Sted",        type: "text",
      get: (r, s) => s.locations[r.x.l] },
    { key: "code",  label: "Kode",        type: "text",
      get: (r) => r.x.c },
    { key: "year",  label: "År",          type: "year",
      get: (r) => r.year, fmt: v => v == null ? "—" : String(v) },
    { key: "s",     label: "Søkere",      type: "num",
      get: (r) => r.s, fmt: FMT.int },
    { key: "fv",    label: "Førstevalg",  type: "num", strong: true,
      get: (r) => r.fv, fmt: FMT.int },
    { key: "p",     label: "Plasser",     type: "num",
      get: (r) => r.p, fmt: FMT.int },
    { key: "ratio", label: "Søk/plass",   type: "num",
      get: (r) => (r.p > 0 && r.fv != null) ? r.fv / r.p : null, fmt: FMT.ratio },
    { key: "kv",    label: "Kvinner %",   type: "num",
      get: (r) => r.kv, fmt: FMT.pct },
    { key: "pg_ord",label: "PG ord",      type: "num", pg: true,
      get: (r) => r.pg_ord,
      fmt: v => v == null ? "—" : (v === 0 ? "0" : v.toFixed(1).replace(".", ",")) },
    { key: "pg_fgv",label: "PG fgv",      type: "num", pg: true,
      get: (r) => r.pg_fgv,
      fmt: v => v == null ? "—" : (v === 0 ? "0" : v.toFixed(1).replace(".", ",")) },
  ];
}

function buildTableRows(s) {
  // One row per (study × year) across 2020..2026
  const rows = [];
  for (const x of s.studies) {
    for (const year of TABLE_YEARS) {
      const sIdx  = year - SEARCH_YEAR_BASE;   // -1 for 2020
      const pgIdx = year - PG_YEAR_BASE;       // 6 for 2026
      const inSearch = sIdx >= 0 && sIdx < s.years.length;
      const inPg     = pgIdx >= 0 && x.pg && pgIdx < 6;
      rows.push({
        x,
        year,
        s:  inSearch ? x.s[sIdx]  : null,
        fv: inSearch ? x.fv[sIdx] : null,
        p:  inSearch ? x.p[sIdx]  : null,
        kv: inSearch ? x.kv[sIdx] : null,
        pg_ord: inPg ? (x.pg.hov_ord[pgIdx] ?? null) : null,
        pg_fgv: inPg ? (x.pg.hov_fgv[pgIdx] ?? null) : null,
      });
    }
  }
  return rows;
}

function parseNumFilter(raw) {
  // Accepts "50", ">50", ">=50", "<50", "<=50", "50-100"
  if (!raw) return null;
  const t = String(raw).trim().replace(",", ".");
  if (!t) return null;
  const range = t.match(/^(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)$/);
  if (range) return { min: +range[1], max: +range[2] };
  const cmp = t.match(/^(>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)$/);
  if (cmp) {
    const v = +cmp[2];
    if (cmp[1] === ">")  return { min: v + 1e-9 };
    if (cmp[1] === ">=") return { min: v };
    if (cmp[1] === "<")  return { max: v - 1e-9 };
    if (cmp[1] === "<=") return { max: v };
  }
  const plain = parseFloat(t);
  if (!isNaN(plain)) return { min: plain };
  return null;
}

function filterMatches(col, row, s, filter) {
  if (filter == null || filter === "") return true;
  const v = col.get(row, s);
  if (col.type === "text") {
    const haystack = [col.get(row, s), col.sub ? col.sub(row, s) : ""].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(String(filter).toLowerCase());
  }
  if (col.type === "year") {
    if (filter === "all" || !filter) return true;
    return String(v) === String(filter);
  }
  if (col.type === "num") {
    const range = parseNumFilter(filter);
    if (!range) return true;
    if (v == null) return false;
    if (range.min != null && v < range.min) return false;
    if (range.max != null && v > range.max) return false;
    return true;
  }
  return true;
}

function renderDataTable() {
  const s = state.data.sectors[state.sector];
  const cols = tableColumns();
  const q = state.table.search;

  renderYearPills();

  let rows = buildTableRows(s);

  if (q) {
    rows = rows.filter(r => {
      const hay = `${r.x.n} ${s.institutions[r.x.i]} ${s.locations[r.x.l]} ${s.fields[r.x.f]} ${r.x.c}`.toLowerCase();
      return hay.includes(q);
    });
  }

  // Column filters
  const cf = state.table.colFilters;
  for (const col of cols) {
    const f = cf[col.key];
    if (f == null || f === "") continue;
    rows = rows.filter(r => filterMatches(col, r, s, f));
  }

  // Sort (nulls always go to the end regardless of direction)
  const { sortKey, sortDir } = state.table;
  const col = cols.find(c => c.key === sortKey) || cols.find(c => c.key === "fv");
  rows.sort((a, b) => {
    const av = col.get(a, s);
    const bv = col.get(b, s);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === "string") return sortDir * av.localeCompare(bv, "nb");
    return sortDir * (av - bv);
  });

  // --- HEADER: two rows (title + filter) ---
  const head = document.getElementById("data-head");
  const headHtml = cols.map(c => {
    const active = c.key === sortKey;
    const arrow = active ? (sortDir === 1 ? "▲" : "▼") : "";
    const numCls = (c.type === "num" || c.type === "year") ? " num" : "";
    return `<th data-key="${c.key}" class="col-head${numCls}${active ? " active" : ""}">
      <button class="head-label" data-key="${c.key}">${escapeHtml(c.label)}<span class="sort-arrow">${arrow}</span></button>
    </th>`;
  }).join("");

  const filterHtml = cols.map(c => {
    const val = cf[c.key] || "";
    const placeholder = c.type === "num" ? "f.eks 50, >100, 20-40" : "filter";
    if (c.type === "year") {
      const opts = ["<option value=\"\">Alle år</option>"].concat(TABLE_YEARS.map(y =>
        `<option value="${y}" ${val == y ? "selected" : ""}>${y}</option>`
      )).join("");
      return `<th class="col-filter num"><select data-filter="${c.key}">${opts}</select></th>`;
    }
    const numCls = c.type === "num" ? " num" : "";
    return `<th class="col-filter${numCls}">
      <input type="text" data-filter="${c.key}" placeholder="${placeholder}" value="${escapeHtml(val)}" />
    </th>`;
  }).join("");

  head.innerHTML = `<tr class="r-head">${headHtml}</tr><tr class="r-filter">${filterHtml}</tr>`;

  // Wire header clicks (sort) and filter inputs
  head.querySelectorAll("button.head-label").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.key;
      if (state.table.sortKey === key) state.table.sortDir = -state.table.sortDir;
      else { state.table.sortKey = key; state.table.sortDir = (cols.find(c => c.key === key).type !== "text" ? -1 : 1); }
      state.table.page = 0;
      renderDataTable();
    });
  });
  head.querySelectorAll("[data-filter]").forEach(inp => {
    const handler = debounce(() => {
      const key = inp.dataset.filter;
      cf[key] = inp.value;
      state.table.page = 0;
      renderDataTable();
      // keep focus and caret in the same input
      const again = document.querySelector(`#data-head [data-filter="${key}"]`);
      if (again && inp !== again) {
        again.focus();
        if (again.setSelectionRange && again.value) {
          again.setSelectionRange(again.value.length, again.value.length);
        }
      }
    }, 180);
    inp.addEventListener("input", handler);
    inp.addEventListener("change", handler);
  });

  // Pagination
  const perPage = state.table.perPage;
  const totalPages = Math.max(1, Math.ceil(rows.length / perPage));
  if (state.table.page >= totalPages) state.table.page = totalPages - 1;
  const start = state.table.page * perPage;
  const pageRows = rows.slice(start, start + perPage);

  // Body
  const body = document.getElementById("data-body");
  if (!pageRows.length) {
    body.innerHTML = `<tr><td class="data-empty" colspan="${cols.length}">Ingen rader matcher filtrene.</td></tr>`;
  } else {
    body.innerHTML = pageRows.map(r => {
      const cells = cols.map(c => {
        const raw = c.get(r, s);
        const fmtted = c.fmt ? c.fmt(raw) : (raw ?? "—");
        const numCls = (c.type === "num" || c.type === "year") ? " num" : "";
        const classes = [
          numCls.trim(),
          c.strong ? "strong" : "",
          c.pg ? "pg" : "",
          ((c.type === "num" || c.type === "year") && raw == null) ? "muted" : "",
        ].filter(Boolean).join(" ");
        if (c.primary) {
          return `<td class="${classes} strong cell-primary">${escapeHtml(String(raw))}<div class="td-sub">${escapeHtml(c.sub ? c.sub(r, s) : "")}</div></td>`;
        }
        return `<td class="${classes}">${escapeHtml(String(fmtted))}</td>`;
      }).join("");
      return `<tr data-code="${r.x.c}" data-inst="${r.x.i}">${cells}</tr>`;
    }).join("");
  }

  // Counts and pager
  const countEl = document.getElementById("data-count");
  if (countEl) countEl.textContent = rows.length.toLocaleString("nb-NO");

  let pagerWrap = document.getElementById("data-pager");
  if (!pagerWrap) {
    pagerWrap = document.createElement("div");
    pagerWrap.id = "data-pager";
    pagerWrap.style.marginTop = "12px";
    document.querySelector(".data-table-wrap").insertAdjacentElement("afterend", pagerWrap);
  }
  if (totalPages > 1) {
    pagerWrap.innerHTML = pagerHTML(state.table.page, totalPages, rows.length);
    wirePager(pagerWrap, (dir) => {
      state.table.page = (dir === Infinity) ? totalPages - 1 : (dir === -Infinity) ? 0 : clampPage(state.table.page + dir, totalPages);
      renderDataTable();
    });
  } else {
    pagerWrap.innerHTML = "";
  }

  // Row click → drawer
  document.querySelectorAll("#data-body tr[data-code]").forEach(tr => {
    tr.addEventListener("click", () => openDrawer(findStudy(tr.dataset.code, +tr.dataset.inst)));
  });

  renderIcons();
}

function renderYearPills() {
  const wrap = document.getElementById("data-year-pills");
  if (!wrap) return;
  const current = state.table.colFilters.year || "";
  const pills = ["<span class=\"pill-label\">År</span>"];
  pills.push(`<button data-year="" class="${current === "" ? "active" : ""}">Alle år</button>`);
  TABLE_YEARS.forEach(y => {
    pills.push(`<button data-year="${y}" class="${String(current) === String(y) ? "active" : ""}">${y}</button>`);
  });
  // Quick-link extras
  pills.push(`<span class="pill-label" style="margin-left:10px">Kun poenggrense</span>`);
  const pgActive = state.table.colFilters.pg_ord;
  pills.push(`<button data-quick="pg" class="${pgActive ? "active" : ""}">≥ 1</button>`);
  const yrEl = document.getElementById("data-year");
  if (yrEl) yrEl.textContent = current === "" ? "2020–2026" : String(current);

  wrap.innerHTML = pills.join("");
  wrap.querySelectorAll("button[data-year]").forEach(btn => {
    btn.addEventListener("click", () => {
      state.table.colFilters.year = btn.dataset.year;
      state.table.page = 0;
      renderDataTable();
    });
  });
  const pgBtn = wrap.querySelector("button[data-quick=\"pg\"]");
  if (pgBtn) pgBtn.addEventListener("click", () => {
    if (state.table.colFilters.pg_ord) delete state.table.colFilters.pg_ord;
    else state.table.colFilters.pg_ord = ">0";
    state.table.page = 0;
    renderDataTable();
  });
}

function debounce(fn, ms) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

function exportDataCsv() {
  const s = state.data.sectors[state.sector];
  const cols = tableColumns();
  const q = state.table.search;

  let rows = buildTableRows(s);
  if (q) {
    rows = rows.filter(r => {
      const hay = `${r.x.n} ${s.institutions[r.x.i]} ${s.locations[r.x.l]} ${s.fields[r.x.f]} ${r.x.c}`.toLowerCase();
      return hay.includes(q);
    });
  }
  const cf = state.table.colFilters;
  for (const col of cols) {
    const f = cf[col.key];
    if (f == null || f === "") continue;
    rows = rows.filter(r => filterMatches(col, r, s, f));
  }
  const { sortKey, sortDir } = state.table;
  const col = cols.find(c => c.key === sortKey) || cols[0];
  rows.sort((a, b) => {
    const av = col.get(a, s); const bv = col.get(b, s);
    if (av == null && bv == null) return 0;
    if (av == null) return 1; if (bv == null) return -1;
    if (typeof av === "string") return sortDir * av.localeCompare(bv, "nb");
    return sortDir * (av - bv);
  });

  const csvEscape = (v) => {
    if (v == null) return "";
    const s2 = String(v);
    return /[",;\n]/.test(s2) ? `"${s2.replace(/"/g, '""')}"` : s2;
  };
  const header = cols.map(c => csvEscape(c.label)).join(";");
  const lines = rows.map(r => cols.map(c => {
    const raw = c.get(r, s);
    if (c.type === "num" || c.type === "year") return raw == null ? "" : String(raw).replace(".", ",");
    return csvEscape(raw);
  }).join(";"));
  const csv = "﻿" + [header, ...lines].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sokertall-${state.sector}-alle-aar.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  showToast(`CSV lastet ned (${rows.length.toLocaleString("nb-NO")} rader)`);
}

/* ---------- Toast ---------- */
let toastTimer = null;
function showToast(msg) {
  const t = els["toast"];
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ---------- Utility ---------- */
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
