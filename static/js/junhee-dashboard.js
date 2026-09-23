"use strict";
/* junhee-dashboard.js — 종합 탭 점수형 화면 모듈.
   - static/data/companies/index.json 과 <company_id>.json 을 읽는다.
   - 업로드 전에는 빈 상태(— / 100), 회사를 고르면 점수·전월 대비·추세선을 보여준다.
   - 게이지·추세선은 이미 들어 있는 static/vendor/chart.umd.js(Chart.js)로 그린다.
   - workspace.js 가 configure()/panelHTML()/mount()/select()/identifyFile() 로 연결한다. */
(() => {
  const INDEX_URL = "/static/data/companies/index.json";
  const companyUrl = (id) => `/static/data/companies/${encodeURIComponent(id)}.json`;
  const FACTORS = [
    { key: "regulation", ko: "규제 관문", en: "Regulation", icon: "shield-check", empty: "수입규제·제재 명단·통제번호 후보를 검토합니다." },
    { key: "market", ko: "시장성", en: "Marketability", icon: "trend-up", empty: "세계 반도체 출하 흐름과 기업 수출 증가율을 봅니다." },
    { key: "price", ko: "가격", en: "Price & Tariff", icon: "currency-circle-dollar", empty: "목적국 관세율과 제품 마진율을 봅니다." },
    { key: "logistics", ko: "물류", en: "Logistics", icon: "truck", empty: "납기 준수율과 운송비 비중을 봅니다." },
    { key: "stability", ko: "안정성", en: "Stability", icon: "wave-sine", empty: "거래처·목적국 집중도와 월별 수출액 변동을 봅니다 (기업 내부 거래 안정성)." },
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

  let cfg = { colors: DEFAULT_COLORS, weights: DEFAULT_WEIGHTS, esc: null, onSelect: null };
  let index = null;
  let indexError = null;
  let indexPromise = null;
  let current = null;
  const cache = {};
  let charts = [];
  let prevNums = {};
  let rafs = [];

  const esc = (v) =>
    cfg.esc
      ? cfg.esc(v)
      : String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const reduced = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  const rgba = (hex, a) => {
    const n = parseInt(hex.replace("#", ""), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const fmt = (v, d) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d));

  // ---------------------------------------------------------------- 데이터
  function loadIndex() {
    if (index) return Promise.resolve(index);
    if (!indexPromise)
      indexPromise = fetch(INDEX_URL, { cache: "no-store" })
        .then((r) => {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        })
        .then((doc) => {
          if (!doc || !Array.isArray(doc.companies)) throw new Error("index.json 형식 오류");
          index = doc;
          indexError = null;
          return index;
        })
        .catch((e) => {
          indexError = e;
          indexPromise = null;
          console.error("JunheeDashboard index:", e);
          return null;
        });
    return indexPromise;
  }
  const entries = () => (index ? index.companies : []);
  const findByFileName = (name) => entries().find((c) => c.file_name === name) || null;
  const findById = (id) => entries().find((c) => c.company_id === id) || null;

  async function sha256Hex(file) {
    const buf = await file.arrayBuffer();
    const h = await crypto.subtle.digest("SHA-256", buf);
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
    } catch (e) {
      return { status: "error", message: String((e && e.message) || e) };
    }
  }
  async function select(companyId) {
    await loadIndex();
    const entry = findById(companyId);
    if (!entry) return null;
    if (!cache[companyId]) {
      const r = await fetch(companyUrl(companyId), { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      cache[companyId] = await r.json();
    }
    prevNums = snapshot(current);
    current = cache[companyId];
    if (cfg.onSelect) cfg.onSelect(current);
    return current;
  }
  function clear() {
    prevNums = snapshot(current);
    current = null;
    if (cfg.onSelect) cfg.onSelect(null);
  }
  function snapshot(c) {
    const s = {};
    if (!c) return s;
    s.overall = c.overall && c.overall.score;
    (c.factors || []).forEach((f) => (s[f.key] = f.score));
    return s;
  }
  const factor = (key) => (current && current.factors ? current.factors.find((f) => f.key === key) : null);

  // ---------------------------------------------------------------- HTML
  function deltaHTML(d, withParen) {
    if (d == null || !Number.isFinite(d)) return `<span class="jd-delta none">–</span>`;
    const cls = d > 0.05 ? "up" : d < -0.05 ? "down" : "flat";
    const sym = cls === "up" ? "▲" : cls === "down" ? "▼" : "–";
    const txt = cls === "flat" ? "0.0" : (d > 0 ? "+" : "") + d.toFixed(1);
    return `<span class="jd-delta ${cls}" aria-label="지난달 대비 ${cls === "up" ? "상승" : cls === "down" ? "하락" : "변화 없음"} ${txt}">${sym} ${txt}</span>${withParen ? " <span>(지난달 대비)</span>" : ""}`;
  }
  function overallPanel() {
    const c = current;
    const ov = c && c.overall;
    const score = ov && ov.state === "ok" ? ov.score : null;
    const state = !c ? "empty" : ov.state === "ok" ? "ok" : "insufficient";
    const needsReview = !!(ov && ov.needs_regulation_review);
    let chip = `<span class="jd-chip muted">업로드 전</span>`;
    if (c && score != null) {
      const d = ov.delta_vs_prev_month;
      const cls = d == null ? "muted" : d > 0.05 ? "up" : d < -0.05 ? "down" : "flat";
      chip = `<span class="jd-chip ${cls}">전월 대비 ${d == null ? "–" : (d > 0 ? "+" : "") + d.toFixed(1) + "점"}</span>`;
    } else if (c) chip = `<span class="jd-chip muted">종합 자료 부족</span>`;
    const rows = FACTORS.map((f) => {
      const fx = factor(f.key);
      const color = cfg.colors[f.key] || DEFAULT_COLORS[f.key];
      const w = f.key === "regulation" ? "관문" : `비중 ${cfg.weights[f.key] ?? DEFAULT_WEIGHTS[f.key]}%`;
      let sc = `<span class="jd-fscore empty">—<small> /100</small></span>`;
      let dl = `<span class="jd-delta none"></span>`;
      if (fx && fx.state === "ok") {
        sc = `<span class="jd-fscore"><span class="jd-num" data-key="${f.key}" data-to="${fx.score}" data-decimals="0">${fmt(fx.score, 0)}</span><small> /100</small></span>`;
        dl = deltaHTML(fx.delta, false);
      } else if (fx) {
        sc = `<span class="jd-fscore insufficient">자료 부족</span>`;
      }
      return `<li><span class="jd-dot" style="background:${color}"></span><span class="jd-fname" title="${esc(w)}">${f.ko}</span>${sc}${dl}</li>`;
    }).join("");
    const point = c
      ? esc(c.highlights || "")
      : "바탕화면의 기업 파일을 업로드하면 점수가 계산됩니다.";
    const meta = c
      ? `<b>${esc(c.data_class || "가상 데이터 · 시연용 산식")}</b> · ${esc(c.company_name)} · 기준일 ${esc(c.as_of)} · ${esc(c.file_name)}`
      : `<b>가상 데이터 · 시연용 산식</b> · 등록된 샘플 파일 2개만 분석됩니다`;
    return `<section class="jd-panel jd-overall" data-state="${state}" aria-label="종합 수출적합도">
      <div class="jd-overall-head"><div class="jd-title"><span class="jd-tile"><i class="ph ph-chart-line-up"></i></span><div><small>Overall Export Suitability</small><h3>종합 수출적합도</h3></div></div>${chip}</div>
      <p class="jd-sub">다섯 가지 평가요인을 종합한<br />우리 기업의 수출 가능성입니다.</p>
      ${needsReview ? `<span class="jd-review"><i class="ph ph-warning"></i>규제 검토 필요 · 통제번호 후보 품목 (해당 확정 아님)</span>` : ""}
      <div class="jd-overall-body">
        <div class="jd-gauge" role="img" aria-label="종합 점수 ${score == null ? "없음" : fmt(score, 1) + " / 100"}"><canvas id="jd-gauge" width="150" height="150"></canvas><div class="jd-gauge-center"><strong class="jd-num" data-key="overall" data-to="${score == null ? "" : score}" data-decimals="1">${fmt(score, 1)}</strong><span>/ 100</span></div></div>
        <div class="jd-factors"><div class="jd-factors-title">요인별 점수</div><ul>${rows}</ul></div>
      </div>
      <div class="jd-point"><div><i class="ph ph-info"></i><div><b>핵심 포인트</b><p>${point}</p></div></div><button type="button" class="jd-link" data-action="report">상세 리포트 보기 →</button></div>
      <div class="jd-meta">${meta}</div>
    </section>`;
  }
  function cardHTML(f) {
    const c = current;
    const fx = factor(f.key);
    const color = cfg.colors[f.key] || DEFAULT_COLORS[f.key];
    const state = !c ? "empty" : fx && fx.state === "ok" ? "ok" : "insufficient";
    let main;
    if (state === "ok") {
      main = `<div><div class="jd-score"><strong class="jd-num" data-key="${f.key}" data-to="${fx.score}" data-decimals="0">${fmt(fx.score, 0)}</strong><small>/100</small></div><div class="jd-delta-line">${deltaHTML(fx.delta, true)}</div></div><canvas class="jd-spark" data-key="${f.key}" width="96" height="36" role="img" aria-label="${f.ko} 최근 6개월 점수 추세: ${(fx.series || []).map((v) => (v == null ? "없음" : v.toFixed(1))).join(", ")}"></canvas>`;
    } else if (state === "insufficient") {
      main = `<div><div class="jd-score insufficient">자료 부족</div><div class="jd-need">필요 자료: ${esc(NEEDED[f.key])}</div></div>`;
    } else {
      main = `<div><div class="jd-score empty"><strong>—</strong><small>/100</small></div></div>`;
    }
    const note = state === "ok" ? esc(fx.note || "") : state === "insufficient" ? esc((fx && fx.note) || "계산에 필요한 값이 없습니다.") : f.empty;
    const srcs = fx && fx.inputs && Array.isArray(fx.inputs.sources) ? fx.inputs.sources : [];
    const foot = c ? `기준일 ${esc(c.as_of)} · ${esc(srcs.join(", ") || c.file_name)}` : "업로드 전";
    const review = f.key === "regulation" && c && c.overall && c.overall.needs_regulation_review ? `<span class="jd-review">검토 필요</span>` : "";
    return `<article class="jd-card jd-card-${f.key}" style="--c:${color};--bg:${rgba(color, 0.07)};--bd:${rgba(color, 0.22)}" data-state="${state}">
      <div><div class="jd-card-head"><span class="jd-tile"><i class="ph ph-${f.icon}"></i></span><div><small>${f.en}</small><h4>${f.ko}</h4></div>${review}</div>
      <div class="jd-card-main">${main}</div>
      <p class="jd-note">${note}</p></div>
      <div class="jd-card-foot"><small title="${esc(foot)}">${foot}</small><button type="button" class="jd-more" data-open-tab="${f.key}">더보기 →</button></div>
    </article>`;
  }
  function panelHTML() {
    const err = indexError ? `<span class="jd-error">등록 샘플 목록을 불러오지 못했습니다 (${esc(indexError.message || indexError)})</span>` : "";
    return `<div class="jd-layout">${overallPanel()}<div class="jd-cards">${FACTORS.map(cardHTML).join("")}</div></div><div class="jd-foot"><span><i class="ph ph-info"></i>가상 데이터 · 시연용 산식 (junhee/rules/demo_scoring.md) · 규제는 관문으로 종합 점수에 포함하지 않음 · 안정성은 기업 내부 거래 안정성이며 국가위험등급이 아님</span><span>${err || (current ? `가중치 시장성 ${cfg.weights.market}% · 가격 ${cfg.weights.price}% · 물류 ${cfg.weights.logistics}% · 안정성 ${cfg.weights.stability}%` : "등록된 샘플: " + entries().map((e) => esc(e.company_name)).join(", "))}</span></div>`;
  }

  // ---------------------------------------------------------------- 차트·애니메이션
  function destroy() {
    charts.forEach((ch) => {
      try {
        ch.destroy();
      } catch {}
    });
    charts = [];
    rafs.forEach((id) => cancelAnimationFrame(id));
    rafs = [];
  }
  function drawGauge(root) {
    const canvas = root.querySelector("#jd-gauge");
    if (!canvas || !window.Chart) return;
    const ctx = canvas.getContext && canvas.getContext("2d");
    if (!ctx) return;
    const score = current && current.overall && current.overall.state === "ok" ? current.overall.score : null;
    let fill = "#e6eef8";
    if (score != null) {
      const g = ctx.createLinearGradient(0, 0, 150, 150);
      g.addColorStop(0, "#32b5d2");
      g.addColorStop(0.5, "#386bf3");
      g.addColorStop(1, "#9565d8");
      fill = g;
    }
    charts.push(
      new Chart(canvas, {
        type: "doughnut",
        data: { datasets: [{ data: score == null ? [0, 100] : [score, 100 - score], backgroundColor: [fill, "#e6eef8"], borderWidth: 0, borderRadius: score != null && score > 0 && score < 100 ? 8 : 0 }] },
        options: { cutout: "78%", responsive: false, events: [], animation: reduced() ? false : { duration: 800, easing: "easeOutQuart" }, plugins: { legend: { display: false }, tooltip: { enabled: false } } },
      }),
    );
  }
  function drawSparks(root) {
    if (!window.Chart) return;
    root.querySelectorAll("canvas.jd-spark").forEach((canvas) => {
      const fx = factor(canvas.dataset.key);
      if (!fx || !Array.isArray(fx.series) || !(canvas.getContext && canvas.getContext("2d"))) return;
      const vals = fx.series.map((v) => (v == null ? null : v));
      const nums = vals.filter((v) => v != null);
      const min = Math.min(...nums), max = Math.max(...nums);
      const pad = Math.max(2, (max - min) * 0.25);
      const color = cfg.colors[fx.key] || DEFAULT_COLORS[fx.key];
      charts.push(
        new Chart(canvas, {
          type: "line",
          data: { labels: fx.series_months || vals.map((_, i) => i + 1), datasets: [{ data: vals, borderColor: color, borderWidth: 2.5, tension: 0.45, pointRadius: 0, pointHitRadius: 8, fill: false, spanGaps: true }] },
          options: {
            responsive: false,
            animation: reduced() ? false : { duration: 700 },
            layout: { padding: 3 },
            plugins: { legend: { display: false }, tooltip: { displayColors: false, callbacks: { label: (c) => `${c.label} · ${c.parsed.y.toFixed(1)}점` } } },
            scales: { x: { display: false }, y: { display: false, suggestedMin: min - pad, suggestedMax: max + pad } },
          },
        }),
      );
    });
  }
  function countUp(root) {
    root.querySelectorAll(".jd-num[data-to]").forEach((el) => {
      const to = parseFloat(el.dataset.to);
      const dec = parseInt(el.dataset.decimals || "0", 10);
      if (!Number.isFinite(to)) return;
      const from = Number.isFinite(prevNums[el.dataset.key]) ? prevNums[el.dataset.key] : 0;
      if (reduced() || from === to) {
        el.textContent = to.toFixed(dec);
        return;
      }
      const t0 = performance.now(), dur = 700;
      const step = (now) => {
        const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
        el.textContent = (from + (to - from) * e).toFixed(dec);
        if (p < 1) rafs.push(requestAnimationFrame(step));
      };
      rafs.push(requestAnimationFrame(step));
    });
  }
  function mount(root) {
    destroy();
    if (!root) return;
    drawGauge(root);
    drawSparks(root);
    countUp(root);
    prevNums = snapshot(current);
  }

  window.JunheeDashboard = Object.freeze({
    configure(opts) {
      cfg = { ...cfg, ...(opts || {}) };
    },
    load: loadIndex,
    ready: () => !!index,
    entries,
    findByFileName,
    findById,
    identifyFile,
    select,
    clear,
    current: () => current,
    panelHTML,
    mount,
    destroy,
    isAnalyzed: (fileName) => !!(current && current.file_name === fileName),
  });
})();
