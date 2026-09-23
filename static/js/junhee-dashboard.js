"use strict";
/* junhee-dashboard.js — 종합 탭(점수형) + 상세 탭 5개 모듈. 디자인 기준: JH2/index2.html(대시보드최종디자인) 구조를 현재 앱 틀에 맞춰 이식.
   - static/data/companies/index.json, <company_id>.json (회사 점수), static/data/dashboard_summary.json (공개자료 근거) 를 읽는다.
   - 업로드 전에는 빈 상태(— / 100), 회사를 고르면 점수·전월 대비·추세선을 보여준다.
   - 사용자 가중치(workspace.js 의 weights)를 읽어 종합 점수를 다시 계산한다. 규제는 관문으로 제외.
   - 게이지·추세선·추이 차트는 static/vendor/chart.umd.js(Chart.js)로 그린다. 새 라이브러리 없음.
   - workspace.js 연결: configure / panelHTML / detailMeta / detailHTML / mount / select / identifyFile / reportRows */
(() => {
  const INDEX_URL = "/static/data/companies/index.json";
  const SUMMARY_URL = "/static/data/dashboard_summary.json";
  const companyUrl = (id) => `/static/data/companies/${encodeURIComponent(id)}.json`;
  const FACTORS = [
    { key: "regulation", ko: "규제 관문", en: "REGULATION", icon: "shield-check", bg: "#fff5f5", empty: "수입규제·제재 명단·통제번호 후보를 검토합니다.", kicker: "REGULATION CHECK", title: "판정에 앞서, 반드시 확인할 조건", sub: "규제 관문은 사업성 점수와 별도로 확인합니다. 가중치를 바꿔도 이 상태는 바뀌지 않습니다." },
    { key: "market", ko: "시장성", en: "MARKETABILITY", icon: "trend-up", bg: "#faf5ff", empty: "세계 반도체 출하 흐름과 기업 수출 증가율을 봅니다.", kicker: "MARKET DYNAMICS", title: "시장 규모 및 성장성 (Marketability)", sub: "세계 반도체 출하(WSTS) 전년동월비와 기업의 최근 3개월 수출 증가율" },
    { key: "price", ko: "가격", en: "PRICE & TARIFF", icon: "coins", bg: "#f0f9ff", empty: "목적국 관세율과 제품 마진율을 봅니다.", kicker: "PRICE & TARIFF", title: "관세율 및 마진 채산성 (Price)", sub: "목적국의 대한국 적용관세율(WTO 관세조치 자료)과 수출 단가 대비 원가·부대비용 마진율" },
    { key: "logistics", ko: "물류", en: "LOGISTICS", icon: "truck", bg: "#fffdf0", empty: "납기 준수율과 운송비 비중을 봅니다.", kicker: "LOGISTICS & FREIGHT", title: "물류 납기 및 운송비 (Logistics)", sub: "물류 시트의 납기 준수율·운송비 비중과 관세청 해상수출 운임" },
    { key: "stability", ko: "안정성", en: "STABILITY", icon: "shield-plus", bg: "#f0fdf4", empty: "거래처·목적국 집중도와 월별 수출액 변동을 봅니다 (기업 내부 거래 안정성).", kicker: "RISK & STABILITY", title: "거래 안정성 (Stability)", sub: "거래처·목적국 집중도(HHI)와 월별 수출액 변동계수 — 기업 내부 거래 안정성이며 국가위험등급·신용등급이 아닙니다" },
  ];
  const NEEDED = {
    regulation: "수출실적 + KOTRA 수입규제·CSL·HSK 연계표",
    market: "WSTS 출하액 + 최근 6개월 수출실적",
    price: "목적국 관세 CSV + 원가·비용 시트",
    logistics: "물류 시트의 예정·실제 도착일과 운임",
    stability: "최근 12개월 중 6개월 이상의 수출실적",
  };
  const DEFAULT_COLORS = { regulation: "#e94c98", market: "#9565d8", price: "#32b5d2", logistics: "#efa44d", stability: "#39ad96" };
  const DEFAULT_WEIGHTS = { market: 35, price: 30, logistics: 20, stability: 15 };
  const WKEYS = Object.keys(DEFAULT_WEIGHTS);

  let cfg = { colors: DEFAULT_COLORS, defaults: DEFAULT_WEIGHTS, getWeights: null, isCustom: null, esc: null, onSelect: null };
  let index = null, indexError = null, indexPromise = null;
  let summary = null, summaryPromise = null;
  let current = null;
  const cache = {};
  let charts = [], rafs = [], prevNums = {};

  // ---------------------------------------------------------------- 유틸
  const esc = (v) =>
    cfg.esc ? cfg.esc(v) : String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const reduced = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const fmt = (v, d) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d));
  const pct = (v, d = 1) => (v == null || !Number.isFinite(v) ? "—" : (v > 0 ? "+" : "") + v.toFixed(d) + "%");
  const usd = (v) => (v == null || !Number.isFinite(v) ? "—" : v >= 1e9 ? "$" + (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? "$" + (v / 1e6).toFixed(2) + "M" : "$" + Math.round(v).toLocaleString("en-US"));
  const weights = () => {
    const w = (cfg.getWeights && cfg.getWeights()) || cfg.defaults || DEFAULT_WEIGHTS;
    const out = {};
    WKEYS.forEach((k) => (out[k] = Number.isFinite(+w[k]) ? +w[k] : DEFAULT_WEIGHTS[k]));
    return out;
  };
  const isDefaultWeights = () => {
    const w = weights(), d = cfg.defaults || DEFAULT_WEIGHTS;
    return WKEYS.every((k) => w[k] === d[k]);
  };
  const isCustom = () => (cfg.isCustom ? !!cfg.isCustom() : !isDefaultWeights());

  // ---------------------------------------------------------------- 데이터
  function fetchJson(url) {
    return fetch(url, { cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }
  function loadIndex() {
    if (index) return Promise.resolve(index);
    if (!indexPromise)
      indexPromise = fetchJson(INDEX_URL)
        .then((doc) => {
          if (!doc || !Array.isArray(doc.companies)) throw new Error("index.json 형식 오류");
          index = doc; indexError = null; return index;
        })
        .catch((e) => { indexError = e; indexPromise = null; console.error("JunheeDashboard index:", e); return null; });
    return indexPromise;
  }
  function loadSummary() {
    if (summary) return Promise.resolve(summary);
    if (!summaryPromise)
      summaryPromise = fetchJson(SUMMARY_URL)
        .then((doc) => { if (doc && Array.isArray(doc.items)) { summary = {}; doc.items.forEach((it) => (summary[it.key] = it)); summary._context = doc.context; } return summary; })
        .catch((e) => { summaryPromise = null; console.error("JunheeDashboard summary:", e); return null; });
    return summaryPromise;
  }
  const entries = () => (index ? index.companies : []);
  const findByFileName = (name) => entries().find((c) => c.file_name === name) || null;
  const findById = (id) => entries().find((c) => c.company_id === id) || null;
  async function sha256Hex(file) {
    const h = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  async function identifyFile(file) {
    await loadIndex();
    if (!index) return { status: "error", message: "등록된 샘플 목록을 불러오지 못했습니다." };
    if (!(window.crypto && crypto.subtle)) return { status: "error", message: "이 브라우저에서는 파일 해시를 계산할 수 없습니다 (https 또는 localhost 필요)." };
    try {
      const sha = await sha256Hex(file);
      const entry = entries().find((c) => c.file_sha256 === sha) || null;
      return entry ? { status: "matched", entry, sha } : { status: "unregistered", sha };
    } catch (e) { return { status: "error", message: String((e && e.message) || e) }; }
  }
  async function select(companyId) {
    await loadIndex();
    const entry = findById(companyId);
    if (!entry) return null;
    if (!cache[companyId]) cache[companyId] = await fetchJson(companyUrl(companyId));
    prevNums = snapshot();
    current = cache[companyId];
    if (cfg.onSelect) cfg.onSelect(current);
    return current;
  }
  function clear() { prevNums = snapshot(); current = null; if (cfg.onSelect) cfg.onSelect(null); }
  const factor = (key) => (current && current.factors ? current.factors.find((f) => f.key === key) : null);
  const publicItem = (key) => (summary ? summary[key] : null);

  // ---------------------------------------------------------------- 종합 점수 (가중치 반영)
  function overallNow() {
    // 기본 가중치면 점수표(JSON) 값을 그대로, 사용자 가중치면 같은 요인 점수에 새 가중치를 적용해 다시 계산한다.
    if (!current) return null;
    const ov = current.overall || {};
    if (!isCustom() && isDefaultWeights()) return { score: ov.score, delta: ov.delta_vs_prev_month, state: ov.state, recomputed: false };
    const w = weights(), sum = WKEYS.reduce((a, k) => a + w[k], 0);
    if (sum <= 0) return { score: null, delta: null, state: "insufficient", recomputed: true };
    const fx = WKEYS.map((k) => factor(k));
    if (fx.some((f) => !f || f.state !== "ok")) return { score: null, delta: null, state: "insufficient", recomputed: true };
    const at = (i) => { const vals = fx.map((f) => (f.series || [])[i]); if (vals.some((v) => v == null)) return null; return vals.reduce((a, v, j) => a + w[WKEYS[j]] * v, 0) / sum; };
    const n = (fx[0].series || []).length;
    const now = n ? at(n - 1) : fx.reduce((a, f, j) => a + w[WKEYS[j]] * f.score, 0) / sum;
    const prev = n > 1 ? at(n - 2) : null;
    return { score: now == null ? null : Math.round(now * 10) / 10, delta: now != null && prev != null ? Math.round((now - prev) * 10) / 10 : null, state: now == null ? "insufficient" : "ok", recomputed: true };
  }
  function snapshot() {
    const s = {};
    if (!current) return s;
    const ov = overallNow(); s.overall = ov && ov.score;
    (current.factors || []).forEach((f) => (s[f.key] = f.score));
    return s;
  }

  // ---------------------------------------------------------------- 공통 조각
  function deltaHTML(d, color, withParen) {
    if (d == null || !Number.isFinite(d)) return `<span class="jd-delta none">–</span>`;
    const cls = d > 0.05 ? "up" : d < -0.05 ? "down" : "flat";
    const sym = cls === "up" ? "↑" : cls === "down" ? "↓" : "–";
    const txt = cls === "flat" ? "0.0" : (d > 0 ? "+" : "") + d.toFixed(1);
    const style = cls === "up" && color ? ` style="color:${color}"` : "";
    return `<span class="jd-delta ${cls}"${style} aria-label="지난달 대비 ${cls === "up" ? "상승" : cls === "down" ? "하락" : "변화 없음"} ${txt}">${sym} ${txt}</span>${withParen ? ' <span class="jd-paren">(지난달 대비)</span>' : ""}`;
  }
  const stateOf = (f) => (!current ? "empty" : f && f.state === "ok" ? "ok" : "insufficient");
  function srcLine(f) {
    const srcs = f && f.inputs && Array.isArray(f.inputs.sources) ? f.inputs.sources : [];
    return current ? `기준일 ${esc(current.as_of)} · ${esc(srcs.join(", ") || current.file_name)}` : "업로드 전";
  }

  // ---------------------------------------------------------------- 종합 탭
  function overallPanel() {
    const c = current, ov = overallNow();
    const score = ov && ov.state === "ok" ? ov.score : null;
    const state = !c ? "empty" : score != null ? "ok" : "insufficient";
    const needsReview = !!(c && c.overall && c.overall.needs_regulation_review);
    let chip = `<span class="jd-chip muted">업로드 전</span>`;
    if (c && score != null) {
      const d = ov.delta, cls = d == null ? "muted" : d > 0.05 ? "up" : d < -0.05 ? "down" : "flat";
      chip = `<span class="jd-chip ${cls}"><i class="ph ph-trend-${cls === "down" ? "down" : "up"}"></i>전월 대비 ${d == null ? "–" : (d > 0 ? "+" : "") + d.toFixed(1) + "점"}</span>`;
    } else if (c) chip = `<span class="jd-chip muted">종합 자료 부족</span>`;
    const rows = FACTORS.map((f) => {
      const fx = factor(f.key), color = cfg.colors[f.key] || DEFAULT_COLORS[f.key];
      const w = f.key === "regulation" ? "관문" : `비중 ${weights()[f.key]}%`;
      let sc = `<span class="jd-fscore empty">—<small> / 100</small></span>`, dl = `<span class="jd-delta none"></span>`;
      if (fx && fx.state === "ok") { sc = `<span class="jd-fscore"><span class="jd-num" data-key="${f.key}" data-to="${fx.score}" data-decimals="0">${fmt(fx.score, 0)}</span><small> / 100</small></span>`; dl = deltaHTML(fx.delta, null, false); }
      else if (fx) sc = `<span class="jd-fscore insufficient">자료 부족</span>`;
      return `<li><span class="jd-dot" style="background:${color}"></span><span class="jd-fname" title="${esc(w)}">${f.ko}</span>${sc}${dl}</li>`;
    }).join("");
    const point = c ? esc(c.highlights || "") : "바탕화면의 기업 파일을 업로드하면 점수가 계산됩니다.";
    const wline = isCustom() ? `사용자 가중치 적용(시장성 ${weights().market}·가격 ${weights().price}·물류 ${weights().logistics}·안정성 ${weights().stability}) · 종합 점수 재계산` : `기본 가중치 35·30·20·15`;
    const meta = c ? `<b>${esc(c.data_class || "가상 데이터 · 시연용 산식")}</b> · ${esc(c.company_name)} · 기준일 ${esc(c.as_of)} · ${esc(c.file_name)} · ${wline}` : `<b>가상 데이터 · 시연용 산식</b> · 등록된 샘플 파일 2개만 분석됩니다`;
    return `<section class="jd-panel jd-overall" data-state="${state}" aria-label="종합 수출적합도">
      <div><div class="jd-overall-head"><div><small class="jd-eyebrow">Overall Export Suitability</small><h3>종합 수출적합도</h3></div>${chip}</div>
      <p class="jd-sub">다섯 가지 평가요인을 종합한 우리 기업의 수출 가능성입니다.</p>
      ${needsReview ? `<span class="jd-review"><i class="ph ph-warning"></i>규제 검토 필요 · 통제번호 후보 품목 (해당 확정 아님)</span>` : ""}
      <div class="jd-gauge-wrap"><div class="jd-gauge" role="img" aria-label="종합 점수 ${score == null ? "없음" : fmt(score, 1) + " / 100"}"><canvas id="jd-gauge" width="176" height="176"></canvas><div class="jd-gauge-center"><strong class="jd-num" data-key="overall" data-to="${score == null ? "" : score}" data-decimals="1">${fmt(score, 1)}</strong><span>/ 100</span></div></div></div></div>
      <div class="jd-factors"><div class="jd-factors-title">요인별 점수</div><ul>${rows}</ul></div>
      <div class="jd-point"><div class="jd-point-head"><span><i class="ph ph-compass"></i>핵심 포인트</span><button type="button" class="jd-link" data-action="report">상세 리포트 보기 →</button></div><p>${point}</p></div>
      <div class="jd-meta">${meta}</div>
    </section>`;
  }
  function cardHTML(f) {
    const c = current, fx = factor(f.key), color = cfg.colors[f.key] || DEFAULT_COLORS[f.key], state = stateOf(fx);
    let main;
    if (state === "ok") {
      main = `<div><div class="jd-score"><strong class="jd-num" data-key="${f.key}" data-to="${fx.score}" data-decimals="0">${fmt(fx.score, 0)}</strong><small>/ 100</small></div><div class="jd-delta-line">${deltaHTML(fx.delta, color, true)}</div></div><canvas class="jd-spark${f.key === "stability" ? " wide" : ""}" data-key="${f.key}" width="${f.key === "stability" ? 160 : 96}" height="36" role="img" aria-label="${f.ko} 최근 6개월 점수 추세: ${(fx.series || []).map((v) => (v == null ? "없음" : v.toFixed(1))).join(", ")}"></canvas>`;
    } else if (state === "insufficient") {
      main = `<div><div class="jd-score insufficient">자료 부족</div><div class="jd-need">필요 자료: ${esc(NEEDED[f.key])}</div></div>`;
    } else main = `<div><div class="jd-score empty"><strong>—</strong><small>/ 100</small></div></div>`;
    const note = state === "ok" ? esc(fx.note || "") : state === "insufficient" ? esc((fx && fx.note) || "계산에 필요한 값이 없습니다.") : f.empty;
    const review = f.key === "regulation" && c && c.overall && c.overall.needs_regulation_review ? `<span class="jd-review">검토 필요</span>` : "";
    return `<article class="jd-card jd-card-${f.key}" style="--c:${color};--bg:${f.bg}" data-state="${state}">
      <div><div class="jd-card-head"><span class="jd-tile"><i class="ph ph-${f.icon}"></i></span><div><small>${f.en}</small><h4>${f.ko}</h4></div>${review}</div>
      <div class="jd-card-main">${main}</div></div>
      <div class="jd-card-foot"><span class="jd-note" title="${srcLine(fx)}">${note}</span><button type="button" class="jd-more" data-open-tab="${f.key}">더보기 →</button></div>
    </article>`;
  }
  function panelHTML() {
    const err = indexError ? `<span class="jd-error">등록 샘플 목록을 불러오지 못했습니다 (${esc(indexError.message || indexError)})</span>` : "";
    return `<div class="jd-layout">${overallPanel()}<div class="jd-cards">${FACTORS.map(cardHTML).join("")}</div></div><div class="jd-foot"><span><i class="ph ph-info"></i>가상 데이터 · 시연용 산식 (junhee/rules/demo_scoring.md) · 규제는 관문으로 종합 점수에 넣지 않음 · 안정성은 기업 내부 거래 안정성이며 국가위험등급이 아님</span><span>${err || (current ? `카드 기준일 ${esc(current.as_of)} · 출처는 카드 설명에 마우스를 올리면 표시` : "등록된 샘플: " + entries().map((e) => esc(e.company_name)).join(", "))}</span></div>`;
  }

  // ---------------------------------------------------------------- 상세 탭
  const fmeta = (key) => FACTORS.find((f) => f.key === key);
  function detailMeta(key) {
    const f = fmeta(key);
    if (!f) return null;
    let sub = f.sub;
    if (current && key === "market") sub = `대상국: ${esc(current.country)} · 주요 품목: HS ${esc(String(current.hs).replace(/^(\d{4})(\d+)/, "$1.$2"))} · ${f.sub}`;
    return { kicker: f.kicker, title: f.title, sub };
  }
  function bannerHTML(key) {
    const f = fmeta(key), fx = factor(key), color = cfg.colors[key] || DEFAULT_COLORS[key], state = stateOf(fx);
    if (state === "empty") return `<div class="jd-banner" data-state="empty"><span class="jd-tile" style="--c:#7f8a9d"><i class="ph ph-upload-simple"></i></span><div><b>업로드 전 · 점수 없음</b><small>바탕화면의 기업 파일을 열면 이 항목의 점수와 근거가 계산됩니다.</small></div></div>`;
    if (state === "insufficient") return `<div class="jd-banner" data-state="insufficient"><span class="jd-tile" style="--c:#b45309"><i class="ph ph-warning"></i></span><div><b>자료 부족 · 점수 없음</b><small>${esc(fx.note || "")} · 필요 자료: ${esc(NEEDED[key])}</small></div></div>`;
    const gate = key === "regulation";
    return `<div class="jd-banner" data-state="ok" style="--c:${color}"><span class="jd-tile"><i class="ph ph-${f.icon}"></i></span><div><b>${esc(current.company_name)} · ${f.ko} <span class="jd-banner-score">${fmt(fx.score, 1)}<small> / 100</small></span> ${deltaHTML(fx.delta, color, true)}</b><small>${esc(fx.note || "")}${gate ? " · 관문 항목: 종합 점수에 더하지 않음" : ` · 종합 비중 ${weights()[key]}%`}</small></div></div>`;
  }
  const kpi = (label, value, foot, color) => `<div class="jd-kpi"><div class="jd-kpi-label">${label}</div><div class="jd-kpi-value">${value}</div>${foot ? `<div class="jd-kpi-foot"${color ? ` style="color:${color}"` : ""}>${foot}</div>` : ""}</div>`;
  const row = (label, value, tone) => `<div class="jd-row"><span>${label}</span><b${tone ? ` class="${tone}"` : ""}>${value}</b></div>`;
  const chip = (text, tone) => `<span class="jd-status ${tone}">${text}</span>`;
  function trendHTML(key) {
    const fx = factor(key);
    if (!fx || fx.state !== "ok" || !Array.isArray(fx.series)) return "";
    return `<div class="jd-panel-box jd-trend-box"><h4>최근 6개월 점수 추이</h4><canvas class="jd-trend" data-key="${key}" height="120" role="img" aria-label="${fmeta(key).ko} 최근 6개월 점수: ${fx.series.map((v, i) => `${(fx.series_months || [])[i] || i + 1} ${v == null ? "없음" : v.toFixed(1)}`).join(", ")}"></canvas><small>같은 산식을 각 달의 데이터로 다시 계산한 값 · 가상 데이터</small></div>`;
  }
  function publicBox(key, title, body) {
    const it = publicItem(key);
    const foot = it ? `출처 ${esc(it.source || "-")} · 기준일 ${esc(it.as_of || "없음")} · ${esc(it.data_class || "")}` : "공개자료 요약(static/data/dashboard_summary.json)을 불러오지 못했습니다";
    return `<div class="jd-panel-box"><h4>${title}</h4>${body}<small>${foot}</small></div>`;
  }
  function detailBody(key) {
    const fx = factor(key), inp = (fx && fx.inputs) || {}, ok = stateOf(fx) === "ok", color = cfg.colors[key] || DEFAULT_COLORS[key], pub = publicItem(key), pd = (pub && pub.detail) || {};
    if (key === "regulation") {
      const kh = inp.kotra_hits || [], ch = inp.csl_hits || [], share = inp.hsk_candidate_share, pen = inp.penalties || {};
      const rows = ok
        ? [
            ["전략물자 통제번호 후보 (HSK 연계표)", share > 0 ? chip(`검토 필요 · 수출액 비중 ${(share * 100).toFixed(0)}% · −${(pen.P3_hsk || 0).toFixed(1)}점`, "warn") : chip("후보 없음", "ok")],
            ["목적국 수입규제 (KOTRA)", kh.length ? chip(`${kh.length}건 해당 · −${pen.P1_kotra}점`, "bad") : chip("해당 없음", "ok")],
            ["제재 명단(CSL) 거래처 일치", ch.length ? chip(`${ch.length}건 일치 · −${pen.P2_csl}점`, "bad") : chip("일치 없음", "ok")],
            ["수출 허가 조건", chip("미검토 · 자료 없음", "muted")],
            ["원산지 및 증빙", chip("미검토 · 자료 없음", "muted")],
          ]
        : [["전략물자 해당 여부", chip("미검토", "muted")], ["거래 상대·최종사용자", chip("미검토", "muted")], ["수출 허가 조건", chip("미검토", "muted")], ["원산지 및 증빙", chip("미검토", "muted")]];
      const table = `<div class="jd-panel-box jd-check"><h4>필수 확인 항목</h4><div class="jd-check-head"><span>검토 항목</span><span>현재 상태</span></div>${rows.map(([a, b]) => `<div class="jd-check-row"><span>${a}</span>${b}</div>`).join("")}<small>${ok ? `HS ${(inp.hs6 || []).join("·")} · 목적국 ${(inp.countries || []).join("·")} · 통제번호 후보는 '검토 필요'이며 '해당'이 아닙니다. 목록 불일치나 자료 누락을 '통과'로 표시하지 않습니다.` : "규정·거래 제한 목록 대조는 회사 파일을 연 뒤 실행됩니다. 자료 누락을 '통과'로 표시하지 않습니다."}</small></div>`;
      const pubBody = pub ? `${row("공개자료 요약", esc(pub.headline || ""))}${row("설명", esc(pub.note || ""))}${pd.csl ? row("CSL 총 건수", `${Number(pd.csl.rows_total).toLocaleString()}건 · 최신 등재 ${esc(pd.csl.latest_start_date || "")}`) : ""}${pd.kotra ? row("미국의 대한국 수입규제", `${pd.kotra.rows_us_targeting_korea}건 (${esc(pd.kotra.as_of || "")})`) : ""}` : `<p class="jd-muted">공개자료 요약을 불러오는 중이거나 없습니다.</p>`;
      return `<div class="jd-detail-grid two">${table}<div class="jd-col">${publicBox("regulation", "공개자료 근거 (규제)", pubBody)}${trendHTML(key)}</div></div>`;
    }
    if (key === "market") {
      const kp = ok
        ? kpi("세계 반도체 출하 전년동월비", pct(inp.wsts_yoy_pct), `WSTS Worldwide ${esc(inp.wsts_month || "")}`, color) + kpi("기업 최근 3개월 수출액", usd(inp.recent_3m_usd), `직전 3개월 ${usd(inp.prev_3m_usd)}`) + kpi("기업 최근 3개월 증가율", pct(inp.company_growth_3m_pct), `f ${fmt(inp.f, 1)} · g ${fmt(inp.g, 1)} → 점수 ${fmt(fx.score, 1)}`, color)
        : kpi("세계 반도체 출하 전년동월비", "—", "업로드 전") + kpi("기업 최근 3개월 수출액", "—", "업로드 전") + kpi("기업 최근 3개월 증가율", "—", "업로드 전");
      const pubBody = pub ? `${row("공개자료 요약", esc(pub.headline || ""))}${row("설명", esc(pub.note || ""))}` : `<p class="jd-muted">공개자료 요약 없음</p>`;
      const insight = ok ? `<p>시장성 점수는 세계 출하 흐름(f = 50 + 전년동월비 ÷ 2)과 기업 자체 증가율(g = 50 + 최근 3개월 증가율)의 평균입니다. 이번 값은 f ${fmt(inp.f, 1)}, g ${fmt(inp.g, 1)} 로 ${inp.company_growth_3m_pct >= 0 ? "기업 수출이 최근 3개월 늘어" : "기업 수출이 최근 3개월 줄어"} ${fmt(fx.score, 1)}점입니다. 세계 출하 전년동월비가 매우 커서 f 는 상한(100)에 가깝습니다.</p>` : `<p class="jd-muted">회사 파일을 열면 산식 구성값이 표시됩니다.</p>`;
      return `<div class="jd-kpis">${kp}</div><div class="jd-detail-grid two"><div class="jd-col"><div class="jd-panel-box"><h4>점수 구성 (시연용 산식)</h4>${insight}<small>${srcLine(fx)}</small></div>${publicBox("market", "공개자료 근거 (시장성)", pubBody)}</div>${trendHTML(key)}</div>`;
    }
    if (key === "price") {
      const tb = inp.tariff_by_channel || {};
      const left = ok
        ? `${row("가중 적용관세율", `${fmt(inp.weighted_tariff_pct, 2)}%`)}${Object.entries(tb).map(([k, v]) => row(`· ${esc(k)}`, v == null ? "자료 없음" : `${(+v).toFixed(1)}%`)).join("")}${row("관세 점수 t", fmt(inp.t, 1))}${row("수출액 가중 마진율", `${fmt(inp.margin_pct, 1)}%`, inp.margin_pct < 0 ? "bad" : "")}${row("마진 점수 m", fmt(inp.m, 1))}${inp.excluded_products && inp.excluded_products.length ? row("원가 없는 제품(제외)", esc(inp.excluded_products.join(", "))) : ""}`
        : `<p class="jd-muted">회사 파일을 열면 목적국·HS 별 관세율과 마진율이 표시됩니다.</p>`;
      const epi = pd.export_price_index, tar = pd.tariff;
      const pubBody = pub ? `${row("공개자료 요약", esc(pub.headline || ""))}${epi ? row(`수출물가지수 (${esc(epi.row_label || "")})`, `${epi.latest_preliminary} (${esc(epi.period || "")}p, 전월비 ${pct(epi.mom_pct)})`) : ""}${tar && tar.per_hs ? Object.entries(tar.per_hs).map(([hs, v]) => row(`미국 적용관세 HS ${hs}`, `${(+v.best_avlbl_pct).toFixed(1)}% · 수입액 ${usd(v.imports_usd)}`)).join("") : ""}` : `<p class="jd-muted">공개자료 요약 없음</p>`;
      return `<div class="jd-detail-grid two"><div class="jd-panel-box"><h4>관세율과 마진 (회사 파일 기준)</h4>${left}<small>${ok ? "점수 = 0.5 × t + 0.5 × m · t = 100 − 2×관세율 · m = 2.5×마진율 · " : ""}${srcLine(fx)}</small></div><div class="jd-col">${publicBox("price", "공개자료 근거 (가격)", pubBody)}${trendHTML(key)}</div></div>`;
    }
    if (key === "logistics") {
      const left = ok
        ? `${row("납기 준수율", `${fmt(inp.ontime_pct, 1)}% (${inp.ontime}/${inp.shipments}건)`)}${row("운임 합계 / 연결 수출액", `${usd(inp.freight_usd)} / ${usd(inp.linked_amount_usd)}`)}${row("운송비 비중", `${fmt(inp.freight_share_pct, 2)}%`)}${row("비용 점수 c", fmt(inp.c, 1))}`
        : `<p class="jd-muted">회사 파일을 열면 납기 준수율과 운송비 비중이 표시됩니다.</p>`;
      const routes = pd.routes || {};
      const pubBody = pub ? `${row("공개자료 요약", esc(pub.headline || ""))}${Object.entries(routes).slice(0, 4).map(([r, v]) => row(`해상수출 ${esc(r)}`, `${Number(v.avg_cost_thousand_krw_per_2teu).toLocaleString()}천원/2TEU · 전월비 ${pct(v.mom_pct)}`)).join("")}${pd.data_period ? row("자료 월", esc(pd.data_period)) : ""}` : `<p class="jd-muted">공개자료 요약 없음</p>`;
      return `<div class="jd-detail-grid two"><div class="jd-panel-box"><h4>납기와 운송비 (회사 파일 기준)</h4>${left}<small>${ok ? "점수 = 0.7 × 납기 준수율 + 0.3 × c · c = 100 − 10×운송비 비중 · " : ""}${srcLine(fx)}</small></div><div class="jd-col">${publicBox("logistics", "공개자료 근거 (관세청 해상수출 운임)", pubBody)}${trendHTML(key)}</div></div>`;
    }
    if (key === "stability") {
      const left = ok
        ? `${row("거래처 집중도 HHI", fmt(inp.hhi_customer, 3))}${row("목적국 집중도 HHI", fmt(inp.hhi_country, 3))}${row("집중도 점수 conc", fmt(inp.conc, 1))}${row("월별 수출액 변동계수", `${fmt(inp.cv_pct, 1)}% (거래 있는 달 ${inp.months_with_sales}개)`)}${row("변동 점수 cv", fmt(inp.cv_score, 1))}`
        : `<p class="jd-muted">회사 파일을 열면 집중도와 변동계수가 표시됩니다.</p>`;
      const pc = pd.per_country && current ? pd.per_country[current.country] : null;
      const pubBody = pub ? `${row("환율 변동(참고)", esc(pc ? pc.headline : pub.headline || ""))}${row("설명", esc(pc ? pc.note : pub.note || ""))}<p class="jd-muted">환율 변동은 참고용 공개자료이며 이 항목의 점수에는 들어가지 않습니다.</p>` : `<p class="jd-muted">공개자료 요약 없음</p>`;
      return `<div class="jd-notice"><i class="ph ph-info"></i>이 항목은 <b>기업 내부 거래의 안정성</b>(거래처·목적국 집중도, 월별 수출액 변동)입니다. 국가위험등급·바이어 신용등급이 아니며 그렇게 해석하지 않습니다.</div><div class="jd-detail-grid two"><div class="jd-panel-box"><h4>집중도와 변동 (회사 파일 기준)</h4>${left}<small>${ok ? "점수 = 0.5 × conc + 0.5 × cv · conc = (1 − HHI)×100 · cv = 100 − 2×변동계수 · " : ""}${srcLine(fx)}</small></div><div class="jd-col">${publicBox("stability", "공개자료 참고 (결제통화 환율 변동)", pubBody)}${trendHTML(key)}</div></div>`;
    }
    return "";
  }
  function detailHTML(key) {
    if (!fmeta(key)) return "";
    return `<div class="jd-detail" data-key="${key}">${bannerHTML(key)}${detailBody(key)}<div class="jd-foot"><span><i class="ph ph-info"></i>가상 데이터 · 시연용 산식 (junhee/rules/demo_scoring.md)</span><span>${current ? `기준월 ${esc(current.as_of_month || current.as_of)} · ${esc(current.file_name)}` : "등록된 샘플 파일을 열면 계산됩니다"}</span></div></div>`;
  }

  // ---------------------------------------------------------------- 보고서용 행
  function reportRows() {
    const ov = overallNow(), w = weights();
    const rows = FACTORS.map((f) => {
      const fx = factor(f.key);
      const val = !fx ? "—" : fx.state === "ok" ? `${fmt(fx.score, 1)} / 100 (전월 대비 ${fx.delta == null ? "–" : (fx.delta > 0 ? "+" : "") + fx.delta.toFixed(1)})<br><small>${esc(fx.note || "")}</small>` : `자료 부족<br><small>${esc(fx.note || "")}</small>`;
      return [f.ko, val, f.key === "regulation" ? "관문 고정" : w[f.key] + "%"];
    });
    rows.push(["종합", ov && ov.score != null ? `${fmt(ov.score, 1)} / 100 (전월 대비 ${ov.delta == null ? "–" : (ov.delta > 0 ? "+" : "") + ov.delta.toFixed(1)})${ov.recomputed ? "<br><small>사용자 가중치로 재계산</small>" : ""}` : "자료 부족", isCustom() ? "사용자 가중치" : "기본 가중치"]);
    return rows;
  }

  // ---------------------------------------------------------------- 차트·애니메이션
  function destroy() {
    charts.forEach((ch) => { try { ch.destroy(); } catch {} });
    charts = []; rafs.forEach((id) => cancelAnimationFrame(id)); rafs = [];
  }
  const ctx2d = (canvas) => (canvas && canvas.getContext ? canvas.getContext("2d") : null);
  const GAUGE_MS = 1300; // 종합 점수 숫자와 도넛이 같은 시간·같은 곡선으로 함께 올라간다 (JH2 시안의 1.3초)
  const easeOut = (p) => 1 - Math.pow(1 - p, 3);
  function drawGauge(root) {
    // 도넛(Chart.js)과 가운데 숫자를 하나의 rAF 루프로 동기화한다: 숫자가 올라가는 만큼 링이 채워진다.
    const canvas = root.querySelector("#jd-gauge"), ctx = ctx2d(canvas), counter = root.querySelector('.jd-num[data-key="overall"]');
    const ov = overallNow(), score = ov && ov.state === "ok" ? ov.score : null;
    const from = Number.isFinite(prevNums.overall) ? prevNums.overall : 0; // 회사를 바꾸면 이전 점수에서 새 점수로 이동
    let chart = null;
    if (canvas && ctx && window.Chart) {
      let fill = "#eef2f6";
      if (score != null) { const g = ctx.createLinearGradient(0, 0, 176, 176); g.addColorStop(0, "#2563eb"); g.addColorStop(0.6, "#38bdf8"); g.addColorStop(1, "#6366f1"); fill = g; }
      const start = score == null ? 0 : reduced() ? score : from;
      chart = new Chart(canvas, {
        type: "doughnut",
        data: { datasets: [{ data: [start, 100 - start], backgroundColor: [fill, "#eef2f6"], borderWidth: 0, borderRadius: 9 }] },
        options: { cutout: "80%", responsive: false, events: [], animation: false, plugins: { legend: { display: false }, tooltip: { enabled: false } } },
      });
      charts.push(chart);
    }
    if (score == null) { if (counter) counter.textContent = "—"; return; }
    const paint = (v) => {
      if (counter) counter.textContent = v.toFixed(1);
      if (chart) { chart.data.datasets[0].data = [v, 100 - v]; chart.update("none"); }
    };
    if (reduced() || from === score) { paint(score); return; }
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / GAUGE_MS);
      paint(from + (score - from) * easeOut(p));
      if (p < 1) rafs.push(requestAnimationFrame(step));
      else paint(score);
    };
    paint(from);
    rafs.push(requestAnimationFrame(step));
  }
  function drawSparks(root) {
    if (!window.Chart) return;
    root.querySelectorAll("canvas.jd-spark").forEach((canvas) => {
      const fx = factor(canvas.dataset.key), ctx = ctx2d(canvas);
      if (!fx || !ctx || !Array.isArray(fx.series)) return;
      const vals = fx.series.map((v) => (v == null ? null : v)), nums = vals.filter((v) => v != null);
      if (!nums.length) return;
      const min = Math.min(...nums), max = Math.max(...nums), pad = Math.max(2, (max - min) * 0.3), color = cfg.colors[fx.key] || DEFAULT_COLORS[fx.key];
      const radii = vals.map((_, i) => (i === vals.length - 1 ? 3 : 0));
      charts.push(new Chart(canvas, {
        type: "line",
        data: { labels: fx.series_months || vals.map((_, i) => i + 1), datasets: [{ data: vals, borderColor: color, borderWidth: 2.6, tension: 0.35, pointRadius: radii, pointBackgroundColor: color, pointBorderWidth: 0, pointHitRadius: 8, fill: false, spanGaps: true }] },
        options: { responsive: false, animation: reduced() ? false : { duration: 700 }, layout: { padding: 4 }, plugins: { legend: { display: false }, tooltip: { displayColors: false, callbacks: { label: (c) => `${c.label} · ${c.parsed.y.toFixed(1)}점` } } }, scales: { x: { display: false }, y: { display: false, suggestedMin: min - pad, suggestedMax: max + pad } } },
      }));
    });
  }
  function drawTrend(root) {
    if (!window.Chart) return;
    root.querySelectorAll("canvas.jd-trend").forEach((canvas) => {
      const fx = factor(canvas.dataset.key), ctx = ctx2d(canvas);
      if (!fx || !ctx || !Array.isArray(fx.series)) return;
      const color = cfg.colors[fx.key] || DEFAULT_COLORS[fx.key];
      charts.push(new Chart(canvas, {
        type: "line",
        data: { labels: fx.series_months || fx.series.map((_, i) => i + 1), datasets: [{ data: fx.series, borderColor: color, backgroundColor: color + "22", borderWidth: 2.4, tension: 0.35, pointRadius: 3, pointBackgroundColor: "#fff", pointBorderColor: color, pointBorderWidth: 2, fill: true, spanGaps: true }] },
        options: { responsive: true, maintainAspectRatio: false, animation: reduced() ? false : { duration: 500 }, plugins: { legend: { display: false }, tooltip: { displayColors: false, callbacks: { label: (c) => `${c.parsed.y.toFixed(1)}점 · 시연용 산식` } } }, scales: { x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 10 }, color: "#a1aabc" } }, y: { suggestedMin: 0, suggestedMax: 100, border: { display: false }, grid: { color: "#f1f3f8" }, ticks: { maxTicksLimit: 5, font: { size: 9 }, color: "#b1b9c7" } } } },
      }));
    });
  }
  function countUp(root) {
    // 종합 점수(overall)는 drawGauge 가 도넛과 함께 움직이므로 여기서는 요인 점수만 카운트업한다
    root.querySelectorAll('.jd-num[data-to]:not([data-key="overall"])').forEach((el) => {
      const to = parseFloat(el.dataset.to), dec = parseInt(el.dataset.decimals || "0", 10);
      if (!Number.isFinite(to)) return;
      const from = Number.isFinite(prevNums[el.dataset.key]) ? prevNums[el.dataset.key] : 0;
      if (reduced() || from === to) { el.textContent = to.toFixed(dec); return; }
      const t0 = performance.now();
      const step = (now) => { const p = Math.min(1, (now - t0) / GAUGE_MS); el.textContent = (from + (to - from) * easeOut(p)).toFixed(dec); if (p < 1) rafs.push(requestAnimationFrame(step)); else el.textContent = to.toFixed(dec); };
      rafs.push(requestAnimationFrame(step));
    });
  }
  function mount(root, key) {
    destroy();
    if (!root) return;
    if (!key || key === "overview") { drawGauge(root); drawSparks(root); countUp(root); prevNums = snapshot(); }
    else drawTrend(root);
  }

  window.JunheeDashboard = Object.freeze({
    configure(opts) { cfg = { ...cfg, ...(opts || {}) }; },
    load: () => Promise.all([loadIndex(), loadSummary()]).then(() => index),
    ready: () => !!index,
    entries, findByFileName, findById, identifyFile, select, clear,
    current: () => current,
    overall: overallNow,
    panelHTML, detailMeta, detailHTML, mount, destroy, reportRows,
    isAnalyzed: (fileName) => !!(current && current.file_name === fileName),
  });
})();
