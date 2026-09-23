"use strict";
(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const t = (source) => window.AXPI18n?.t(source) || source;
  const countryCodes = {US:"미국",JP:"일본",DE:"독일",VN:"베트남"};
  const countryLabel = (code) => t(countryCodes[code] || code);
  const displayDate = () => {$("#desktop-date").textContent = new Date().toLocaleDateString(window.AXPI18n?.locale || "ko-KR", {month:"long",day:"numeric",weekday:"short"});};
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const esc = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const icons = $("#desktop-icons"),
    desk = $("#desktop"),
    win = $("#analysis-window"),
    sidebar = $("#window-sidebar"),
    sidebarToggle = $("#sidebar-toggle");
  const defaults = { market: 35, price: 30, logistics: 20, stability: 15 };
  let weights = { ...defaults },
    draft = { ...defaults },
    customWeights = false;
  let context = {
    company: "AX 반도체",
    hs: "854231",
    country: "US",
    file: "AX_반도체_샘플.xlsx",
    fileId: "sample",
  };
  let pendingFile = null,
    activeTab = "overview",
    chart = null,
    selected = null,
    maximized = false;
  let files = [
    {
      id: "sample",
      name: "AX_반도체_샘플.xlsx",
      size: 0,
      sample: true,
      trash: false,
      cell: 1,
    },
  ];
  const systemIcons = [
    {
      id: "analysis",
      name: "분석 대시보드",
      icon: "chart-pie-slice",
      cell: 0,
    },
    { id: "trash", name: "휴지통", icon: "trash", cell: 2 },
  ];
  const names = {
    overview: "종합",
    regulation: "규제",
    market: "시장성",
    price: "가격",
    logistics: "물류",
    stability: "안정성",
  };
  const colors = {
    regulation: "#e94c98",
    market: "#9565d8",
    price: "#32b5d2",
    logistics: "#efa44d",
    stability: "#39ad96",
  };
  let toastTimer;
  const toast = (message) => {
    $("#toast").textContent = message;
    $("#toast").classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $("#toast").classList.remove("show"), 3500);
  };
  const openDialog = (id) => {
    const dlg = $(id);
    if (!dlg.open) dlg.showModal();
  };
  const readUI = () => {
    try {
      return JSON.parse(localStorage.getItem("axport-ui-layout-v1") || "null");
    } catch {
      return null;
    }
  };
  const saveUI = () => {
    try {
      localStorage.setItem(
        "axport-ui-layout-v1",
        JSON.stringify({
          x: win.offsetLeft,
          y: win.offsetTop,
          w: win.offsetWidth,
          h: win.offsetHeight,
        }),
      );
    } catch {
      /* UI storage is optional. */
    }
  };
  // UI geometry only is persisted. User filenames, file contents and conditions stay in memory.
  function fitWindow() {
    if (maximized || innerWidth <= 850) return;
    const bottomGap = 13,
      availableHeight = desk.clientHeight - 26;
    win.style.minHeight = Math.min(455, Math.max(220, availableHeight)) + "px";
    const width = Math.min(win.offsetWidth, desk.clientWidth - 83),
      height = Math.min(win.offsetHeight, availableHeight);
    win.style.width =
      Math.max(Math.min(690, desk.clientWidth - 83), width) + "px";
    win.style.height = Math.max(Math.min(455, availableHeight), height) + "px";
    win.style.left =
      Math.max(
        8,
        Math.min(win.offsetLeft, desk.clientWidth - win.offsetWidth - 72),
      ) + "px";
    win.style.top =
      Math.max(
        8,
        Math.min(
          win.offsetTop,
          desk.clientHeight - win.offsetHeight - bottomGap,
        ),
      ) + "px";
  }
  function resetWindow() {
    win.style.cssText = "";
    maximized = false;
    win.classList.remove("maximized");
    $("#maximize-btn").setAttribute("aria-label", "창 최대화");
    try {
      localStorage.removeItem("axport-ui-layout-v1");
    } catch {}
    fitWindow();
  }
  function showWindow() {
    win.hidden = false;
    fitWindow();
  }
  function hideWindow() {
    win.hidden = true;
  }
  function setSidebarOpen(open) {
    sidebar.hidden = !open;
    win.classList.toggle("sidebar-collapsed", !open);
    const label = open ? "사이드바 접기" : "사이드바 펼치기";
    sidebarToggle.setAttribute("aria-expanded", String(open));
    sidebarToggle.setAttribute("aria-label", label);
    sidebarToggle.title = label;
  }
  function grid() {
    return {
      rows: Math.max(3, Math.floor((desk.clientHeight - 95) / 106)),
      cols: Math.max(1, Math.floor((desk.clientWidth - 18) / 112)),
    };
  }
  function point(cell) {
    const { rows } = grid();
    return {
      x: 18 + Math.floor(cell / rows) * 112,
      y: 19 + (cell % rows) * 106,
    };
  }
  function occupied(except) {
    return new Set(
      [...systemIcons, ...files]
        .filter((f) => !f.trash && f.id !== except)
        .map((f) => f.cell),
    );
  }
  function desktopIcon(id) {
    return (
      systemIcons.find((f) => f.id === id) || files.find((f) => f.id === id)
    );
  }
  function emptyCell(want, id) {
    const { rows, cols } = grid(),
      used = occupied(id),
      limit = rows * cols;
    want = Math.max(0, Math.min(limit - 1, want));
    if (!used.has(want)) return want;
    for (let i = 0; i < limit; i++) if (!used.has(i)) return i;
    return null;
  }
  function nearestCell(x, y, id) {
    const { rows, cols } = grid();
    return emptyCell(
      Math.max(0, Math.min(cols - 1, Math.round((x - 18) / 112))) * rows +
        Math.max(0, Math.min(rows - 1, Math.round((y - 19) / 106))),
      id,
    );
  }
  function drawIcons() {
    const entries = [
      systemIcons[0],
      ...files
        .filter((f) => !f.trash)
        .map((f) => ({ ...f, icon: "microsoft-excel-logo" })),
      systemIcons[1],
    ];
    icons.innerHTML = entries
      .map((f) => {
        const p = point(f.cell);
        return `<button class="desktop-icon ${selected === f.id ? "selected" : ""}" data-id="${esc(f.id)}" style="left:${p.x}px;top:${p.y}px" aria-label="${esc(f.name)}" title="${esc(f.name)} · 더블클릭으로 열기"><span class="file-image"><i class="ph ph-${f.icon}"></i></span><span class="file-name">${esc(f.name)}</span></button>`;
      })
      .join("");
    $("#file-count").textContent = files.filter((f) => !f.trash).length;
  }
  function selectIcon(id) {
    selected = id;
    $$(".desktop-icon").forEach((el) =>
      el.classList.toggle("selected", el.dataset.id === id),
    );
  }
  function trashFile(id) {
    const f = files.find((f) => f.id === id);
    if (!f) return;
    f.trash = true;
    selected = null;
    drawIcons();
    toast("휴지통으로 이동했습니다. 원본 파일은 변경되지 않습니다.");
  }
  function openIcon(id) {
    if (id === "analysis") showWindow();
    else if (id === "trash") showFiles(true);
    else {
      const f = files.find((f) => f.id === id);
      if (f && !f.trash) {
        pendingFile = f;
        updateUploadLabel();
        openUpload();
      }
    }
  }
  icons.addEventListener("click", (e) => {
    const el = e.target.closest("[data-id]");
    if (el) selectIcon(el.dataset.id);
  });
  icons.addEventListener("dblclick", (e) => {
    const el = e.target.closest("[data-id]");
    if (el) openIcon(el.dataset.id);
  });
  icons.addEventListener("keydown", (e) => {
    const el = e.target.closest("[data-id]");
    if (!el) return;
    const id = el.dataset.id;
    selectIcon(id);
    if (e.key === "Enter") {
      e.preventDefault();
      openIcon(id);
    } else if (e.key === "Delete") {
      e.preventDefault();
      trashFile(id);
    } else if (e.key.startsWith("Arrow")) {
      const f = desktopIcon(id);
      if (!f) return;
      e.preventDefault();
      const { rows } = grid();
      const delta = {
          ArrowDown: 1,
          ArrowUp: -1,
          ArrowLeft: -rows,
          ArrowRight: rows,
        }[e.key],
        cell = emptyCell(f.cell + delta, id);
      if (cell !== null) f.cell = cell;
      drawIcons();
      $(`[data-id="${id}"]`, icons)?.focus();
    }
  });
  icons.addEventListener("pointerdown", (e) => {
    const el = e.target.closest("[data-id]");
    if (!el || e.button !== 0) return;
    const id = el.dataset.id,
      f = desktopIcon(id);
    selectIcon(id);
    if (!f) return;
    const start = {
      x: e.clientX,
      y: e.clientY,
      left: el.offsetLeft,
      top: el.offsetTop,
    };
    let moved = false;
    el.setPointerCapture(e.pointerId);
    const move = (ev) => {
      if (
        Math.abs(ev.clientX - start.x) + Math.abs(ev.clientY - start.y) < 5 &&
        !moved
      )
        return;
      moved = true;
      el.style.zIndex = "6";
      el.style.left =
        Math.max(
          0,
          Math.min(desk.clientWidth - 100, start.left + ev.clientX - start.x),
        ) + "px";
      el.style.top =
        Math.max(
          0,
          Math.min(desk.clientHeight - 100, start.top + ev.clientY - start.y),
        ) + "px";
    };
    const cleanup = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", cancel);
      el.removeEventListener("lostpointercapture", cancel);
      if (el.hasPointerCapture(e.pointerId))
        el.releasePointerCapture(e.pointerId);
    };
    const end = (ev) => {
      cleanup();
      if (!moved) return;
      const inRect = (target) => {
        if (!target || target.closest("[hidden]")) return false;
        const r = target.getBoundingClientRect();
        return (
          ev.clientX >= r.left &&
          ev.clientX <= r.right &&
          ev.clientY >= r.top &&
          ev.clientY <= r.bottom
        );
      };
      if (files.includes(f) && inRect($('[data-id="trash"]', icons)))
        trashFile(id);
      else {
        const cell = nearestCell(el.offsetLeft, el.offsetTop, id);
        if (cell !== null) f.cell = cell;
        drawIcons();
      }
    };
    const cancel = () => {
      cleanup();
      drawIcons();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", cancel);
    el.addEventListener("lostpointercapture", cancel);
  });
  function bindWindowMove(handle, resize) {
    handle.addEventListener("pointerdown", (e) => {
      if (
        maximized ||
        e.button !== 0 ||
        innerWidth <= 850 ||
        e.target.closest("button")
      )
        return;
      e.preventDefault();
      const start = {
        x: e.clientX,
        y: e.clientY,
        left: win.offsetLeft,
        top: win.offsetTop,
        w: win.offsetWidth,
        h: win.offsetHeight,
      };
      handle.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const dx = ev.clientX - start.x,
          dy = ev.clientY - start.y,
          bottomGap = 13;
        if (resize) {
          win.style.width =
            Math.max(
              690,
              Math.min(desk.clientWidth - start.left - 72, start.w + dx),
            ) + "px";
          win.style.height =
            Math.max(
              Math.min(455, desk.clientHeight - start.top - bottomGap),
              Math.min(desk.clientHeight - start.top - bottomGap, start.h + dy),
            ) + "px";
        } else {
          win.style.left =
            Math.max(
              8,
              Math.min(desk.clientWidth - start.w - 72, start.left + dx),
            ) + "px";
          win.style.top =
            Math.max(
              8,
              Math.min(desk.clientHeight - start.h - bottomGap, start.top + dy),
            ) + "px";
        }
      };
      const end = () => {
        handle.removeEventListener("pointermove", move);
        handle.removeEventListener("pointerup", end);
        handle.removeEventListener("pointercancel", end);
        saveUI();
      };
      handle.addEventListener("pointermove", move);
      handle.addEventListener("pointerup", end);
      handle.addEventListener("pointercancel", end);
    });
  }
  bindWindowMove($("#window-handle"), false);
  bindWindowMove($("#resize-handle"), true);
  $("#resize-handle").addEventListener("keydown", (e) => {
    if (maximized || !e.key.startsWith("Arrow")) return;
    e.preventDefault();
    if (e.key === "ArrowRight") win.style.width = win.offsetWidth + 20 + "px";
    if (e.key === "ArrowLeft")
      win.style.width = Math.max(690, win.offsetWidth - 20) + "px";
    if (e.key === "ArrowDown") win.style.height = win.offsetHeight + 20 + "px";
    if (e.key === "ArrowUp")
      win.style.height = Math.max(455, win.offsetHeight - 20) + "px";
    fitWindow();
    saveUI();
  });
  $("#minimize-btn").onclick = hideWindow;
  $("#close-window-btn").onclick = hideWindow;
  sidebarToggle.onclick = () => setSidebarOpen(sidebar.hidden);
  $("#maximize-btn").onclick = () => {
    maximized = !maximized;
    win.classList.toggle("maximized", maximized);
    $("#maximize-btn").setAttribute(
      "aria-label",
      maximized ? "이전 창 크기로 복원" : "창 최대화",
    );
    fitWindow();
  };
  const formatHS = (hs) => hs.slice(0, 4) + "." + hs.slice(4);
  function contextUI() {
    $("#company-context").textContent = context.company;
    $("#hs-context").textContent = formatHS(context.hs);
    $("#country-context").textContent = countryLabel(context.country);
  }
  function heading(title, sub, kicker = "EXPORT INTELLIGENCE") {
    return `<div class="content-heading"><div><span class="eyebrow">${kicker}</span><h2>${title}</h2><p>${sub}</p></div><div class="heading-actions"><button class="small-button" aria-label="가중치 설정" data-action="weights"><i class="ph ph-sliders-horizontal"></i><span>가중치 설정</span></button><button class="small-button" aria-label="보고서 다운로드" data-action="report"><i class="ph ph-download-simple"></i><span>보고서</span></button></div></div>`;
  }
  function overview() {
    const cards = [
      {
        key: "regulation",
        icon: "shield-check",
        label: "규제",
        hint: "GATE",
        value: "검토 전",
        unit: "",
        desc: "필수 조건 확인이 필요한 단계",
        foot: "실제 판정 미실행",
        status: true,
      },
      {
        key: "market",
        icon: "trend-up",
        label: "시장성",
        hint: "MARKET",
        value: "82",
        unit: "/ 100",
        desc: "시장규모와 성장 흐름의 예시",
        foot: "성장 추세 예시",
      },
      {
        key: "price",
        icon: "currency-circle-dollar",
        label: "가격",
        hint: "PRICE",
        value: "76",
        unit: "/ 100",
        desc: "관세·환율 조건의 예시",
        foot: "가격 조건 예시",
      },
      {
        key: "logistics",
        icon: "airplane-tilt",
        label: "물류",
        hint: "LOGISTICS",
        value: "88",
        unit: "/ 100",
        desc: "운송 기간·비용의 예시",
        foot: "운송 시나리오 예시",
      },
      {
        key: "stability",
        icon: "wave-sine",
        label: "안정성",
        hint: "STABILITY",
        value: "71",
        unit: "/ 100",
        desc: "변동률 표시를 위한 예시",
        foot: "대상·산식 미확정",
      },
    ];
    return (
      heading(
        "한눈에 보는 수출 가능성",
        "기업의 다음 선택을 위한 다섯 가지 관점",
      ) +
      `<div class="analysis-banner"><span class="banner-icon"><i class="ph ph-magnifying-glass"></i></span><div><strong>가능성을 살펴보고, 근거를 확인하세요.</strong><p>현재 화면은 예시입니다. 실제 규제 검토와 수출 판정은 진행되지 않았습니다.</p></div><span class="example-badge">DEMO</span></div><div class="score-grid">${cards.map((c) => `<article class="score-card" style="--card-color:${colors[c.key]}"><div class="card-title"><i class="ph ph-${c.icon}"></i>${c.label}<small>${c.hint}</small></div><div class="metric ${c.status ? "status" : ""}">${c.value}<small>${c.unit}</small></div><p>${c.desc}</p><div class="card-foot"><span>${c.foot}</span><span>${c.key === "regulation" ? "관문 고정" : `비중 ${weights[c.key]}%`}</span></div></article>`).join("")}</div><div class="summary-foot"><span><i class="ph ph-info"></i>오른쪽 책갈피에서 상세 지표와 근거를 확인하세요.</span><span>${customWeights ? "사용자 가중치 · 시연" : "기본 가중치 · 시연"} · 실제 자료 미연결</span></div>`
    );
  }
  const detailData = {
    market: {
      title: "시장의 흐름을 읽다",
      sub: "시장규모와 성장률을 같은 시선으로 살펴보세요.",
      metrics: [
        ["수입시장 규모", "$128.4B"],
        ["전년 대비 성장률", "+12.8%"],
        ["시장성 예시 점수", "82 / 100"],
      ],
      chart: "수입시장 추이",
      labels: ["2021", "2022", "2023", "2024", "2025", "2026"],
      data: [76, 83, 91, 97, 114, 128.4],
      unit: "B USD",
      rows: [
        ["시장규모", "128.4B USD", "연간 합계 · 예시"],
        ["성장률", "12.8%", "전년 대비 · 예시"],
        ["수출입실적", "상세 조회 예정", "실제 데이터 미연결"],
      ],
      note: "실제 연결 시 목적국·HS 버전·조회 기간을 함께 표시합니다. 현재 숫자는 추이 차트 디자인을 위한 가상 값입니다.",
    },
    price: {
      title: "가격에 영향을 주는 조건",
      sub: "관세와 환율을 분리해서 살펴보세요.",
      metrics: [
        ["관세율 예시", "3.5%"],
        ["환율 예시", "1,340 KRW"],
        ["가격 예시 점수", "76 / 100"],
      ],
      chart: "환율 흐름 예시",
      labels: ["4월", "5월", "6월", "7월", "8월", "9월"],
      data: [1330, 1375, 1362, 1325, 1348, 1340],
      unit: "KRW / USD",
      rows: [
        ["관세", "3.5%", "적용 조건 검증 전"],
        ["환율", "1,340 KRW/USD", "기준일 미연결"],
        ["원산지·세번", "확인 필요", "실제 판정 미실행"],
      ],
      note: "예시 세율은 실제 목적국 관세율이 아닙니다. 원산지·세번·적용일과 결제 통화를 확인한 뒤 계산하도록 연동할 예정입니다.",
    },
    logistics: {
      title: "목적지까지의 계획",
      sub: "운송 경로와 기간, 비용을 함께 확인하세요.",
      metrics: [
        ["운송 기간 예시", "8일"],
        ["운송비 예시", "$2,400"],
        ["물류 예시 점수", "88 / 100"],
      ],
      chart: "구간별 소요 기간",
      labels: ["출고 준비", "내륙 운송", "국제 운송", "통관·배송"],
      data: [2, 1, 3, 2],
      unit: "일",
      bar: true,
      rows: [
        ["운송 수단", "항공 · 예시", "실제 견적 없음"],
        ["경로", "인천 → 목적국", "시연 시나리오"],
        ["납기", "확인 필요", "기업 조건 미분석"],
      ],
      note: "실제 운송 조회·견적·예약을 제공하지 않는 화면 시연입니다. 구간별 일정과 비용 근거가 이 영역에 연결됩니다.",
    },
    stability: {
      title: "변화를 살피는 또 하나의 관점",
      sub: "변동률의 크기와 흐름을 시각화합니다.",
      metrics: [
        ["변동률 예시", "4.2%"],
        ["관측 구간 예시", "6개월"],
        ["안정성 예시 점수", "71 / 100"],
      ],
      chart: "변동률 표시 예시",
      labels: ["4월", "5월", "6월", "7월", "8월", "9월"],
      data: [3.1, 5.2, 3.8, 4.7, 2.9, 4.2],
      unit: "%",
      rows: [
        ["대상 지표", "미확정", "PM 결정 필요"],
        ["계산 방식", "미확정", "표시는 가상 값"],
        ["분석 기간", "6개월 · 예시", "확정 기준 아님"],
      ],
      note: "변동률의 대상과 산식은 아직 정해지지 않았습니다. 이 화면은 UI 시연이며 국가위험 또는 신용등급을 의미하지 않습니다.",
    },
  };
  function detail(key) {
    if (key === "regulation")
      return (
        heading(
          "판정에 앞서, 반드시 확인할 조건",
          "규제 관문은 사업성 점수와 별도로 확인합니다.",
          "REGULATION CHECK",
        ) +
        `<div class="analysis-banner"><span class="banner-icon"><i class="ph ph-shield-check"></i></span><div><strong>규제 검토 전 · 실제 판정 미실행</strong><p>가중치를 변경해도 이 상태는 바뀌지 않습니다.</p></div><span class="example-badge">GATE</span></div><section class="detail-panel"><div class="panel-heading"><h3>필수 확인 항목</h3><span>화면 구성 예시</span></div><div class="table-wrap"><table><thead><tr><th>검토 항목</th><th>현재 상태</th><th>확인할 내용</th></tr></thead><tbody>${[
          ["전략물자 해당 여부", "제품 사양·분류"],
          ["거래 상대·최종사용자", "대상 목록·최종용도"],
          ["수출 허가 조건", "목적국·적용 규정"],
          ["원산지 및 증빙", "기업 증빙자료"],
        ]
          .map(
            (r) =>
              `<tr><td>${r[0]}</td><td><span class="tag">미검토</span></td><td>${r[1]}</td></tr>`,
          )
          .join(
            "",
          )}</tbody></table></div><p class="detail-help">규정·거래 제한 목록이 연결되지 않았습니다. 목록 불일치나 자료 누락을 ‘통과’로 표시하지 않습니다.</p></section>`
      );
    const d = detailData[key];
    return (
      heading(d.title, d.sub, key.toUpperCase() + " INSIGHT") +
      `<div class="detail-metrics">${d.metrics.map((m) => `<div class="detail-metric"><span>${m[0]}</span><strong style="color:${colors[key]}">${m[1]}</strong></div>`).join("")}</div><section class="chart-panel"><div class="panel-heading"><h3>${d.chart}</h3><span>${d.unit} · 예시 데이터</span></div><div class="chart-wrap"><canvas id="detail-chart" role="img" aria-label="${d.chart}, ${d.labels.map((l, i) => l + " " + d.data[i]).join(", ")}"></canvas></div></section><section class="detail-panel"><div class="panel-heading"><h3>지표와 판단 근거</h3><span>실제 자료 미연결</span></div><div class="table-wrap"><table><thead><tr><th>지표</th><th>표시값</th><th>근거 상태</th></tr></thead><tbody>${d.rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div><p class="detail-help">${d.note}</p></section>`
    );
  }
  function drawChart(key) {
    const d = detailData[key];
    if (!d || !$("#detail-chart") || !window.Chart) return;
    chart = new Chart($("#detail-chart"), {
      type: d.bar ? "bar" : "line",
      data: {
        labels: d.labels.map(t),
        datasets: [
          {
            data: d.data,
            borderColor: colors[key],
            backgroundColor: colors[key] + (d.bar ? "bb" : "15"),
            fill: true,
            borderWidth: 2,
            tension: 0.38,
            pointRadius: 3,
            pointBackgroundColor: "#fff",
            pointBorderWidth: 2,
            borderRadius: 5,
            barThickness: 32,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? false
          : { duration: 400 },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            callbacks: { label: (ctx) => `${ctx.parsed.y} ${d.unit} · ${t("예시")}` },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { font: { size: 10 }, color: "#a1aabc" },
          },
          y: {
            beginAtZero: d.bar,
            border: { display: false },
            grid: { color: "#f1f3f8" },
            ticks: { maxTicksLimit: 5, font: { size: 9 }, color: "#b1b9c7" },
          },
        },
      },
    });
  }
  function setTab(key) {
    if (!names[key]) return;
    activeTab = key;
    chart?.destroy();
    chart = null;
    $$("[data-tab]").forEach((b) => {
      const on = b.dataset.tab === key;
      b.classList.toggle("selected", on);
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
    });
    $("#tab-content").innerHTML = key === "overview" ? overview() : detail(key);
    $("#tab-content").setAttribute("role", "tabpanel");
    $("#tab-content").setAttribute("aria-labelledby", "tab-" + key);
    $(".window-main").scrollTop = 0;
    drawChart(key);
    window.AXPI18n?.translateDOM($("#tab-content"));
  }
  $$(".bookmark-tabs button").forEach((b) => {
    b.onclick = () => setTab(b.dataset.tab);
    b.onkeydown = (e) => {
      if (
        ![
          "ArrowDown",
          "ArrowUp",
          "ArrowLeft",
          "ArrowRight",
          "Home",
          "End",
        ].includes(e.key)
      )
        return;
      e.preventDefault();
      const all = $$(".bookmark-tabs button"),
        i = all.indexOf(b),
        next =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? all.length - 1
              : (i +
                  (["ArrowDown", "ArrowRight"].includes(e.key) ? 1 : -1) +
                  all.length) %
                all.length;
      all[next].focus();
      setTab(all[next].dataset.tab);
    };
  });
  function updateUploadLabel() {
    $("#file-label").textContent = pendingFile
      ? pendingFile.name
      : "엑셀 파일을 끌어 놓거나 선택하세요";
    $("#upload-error").textContent = "";
  }
  function openUpload() {
    const saved = pendingFile?.conditions || context;
    $("#excel-input").value = "";
    $("#company-input").value = saved.company;
    $("#hs-input").value = saved.hs;
    $("#country-input").value = saved.country;
    updateUploadLabel();
    openDialog("#upload-dialog");
  }
  function acceptFile(file) {
    if (!file) return;
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      $("#upload-error").textContent =
        "엑셀 파일(.xlsx, .xls)을 선택해 주세요.";
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      $("#upload-error").textContent = "20 MB 이하의 파일을 선택해 주세요.";
      return;
    }
    pendingFile = { name: file.name, size: file.size, sample: false };
    updateUploadLabel();
  }
  $("#excel-input").onchange = (e) => acceptFile(e.target.files[0]);
  $("#drop-zone").ondragover = (e) => {
    e.preventDefault();
    $("#drop-zone").classList.add("drag-over");
  };
  $("#drop-zone").ondragleave = () =>
    $("#drop-zone").classList.remove("drag-over");
  $("#drop-zone").ondrop = (e) => {
    e.preventDefault();
    $("#drop-zone").classList.remove("drag-over");
    acceptFile(e.dataTransfer.files[0]);
  };
  desk.addEventListener("dragover", (e) => {
    if ([...e.dataTransfer.types].includes("Files")) e.preventDefault();
  });
  desk.addEventListener("drop", (e) => {
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    openUpload();
    acceptFile(e.dataTransfer.files[0]);
  });
  $("#use-sample").onclick = () => {
    pendingFile = { name: "AX_반도체_샘플.xlsx", size: 0, sample: true };
    updateUploadLabel();
  };
  $("#analysis-form").onsubmit = (e) => {
    e.preventDefault();
    const hs = $("#hs-input").value.replace(/[.\s]/g, ""),
      company = $("#company-input").value.trim();
    if (!pendingFile) {
      $("#upload-error").textContent =
        "파일을 선택하거나 샘플 파일을 사용해 주세요.";
      return;
    }
    if (!/^(\d{6}|\d{8}|\d{10})$/.test(hs)) {
      $("#upload-error").textContent =
        "HS 코드는 숫자 6·8·10자리로 입력해 주세요.";
      return;
    }
    if (!company) {
      $("#upload-error").textContent = "기업명을 입력해 주세요.";
      return;
    }
    let file = files.find((f) => f.id === pendingFile.id && !f.trash);
    if (!file) {
      const cell = emptyCell(1);
      if (cell === null) {
        $("#upload-error").textContent =
          "바탕화면이 가득 찼습니다. 파일을 휴지통으로 이동해 주세요.";
        return;
      }
      file = { ...pendingFile, id: "file-" + Date.now(), trash: false, cell };
      files.push(file);
    }
    context = {
      company,
      hs,
      country: $("#country-input").value,
      file: file.name,
      fileId: file.id,
    };
    file.conditions = { ...context };
    contextUI();
    drawIcons();
    setTab("overview");
    showWindow();
    $("#upload-dialog").close();
    toast("예시 분석 화면을 열었습니다. 파일 내용은 분석하지 않았습니다.");
  };
  function showFiles(trash = false) {
    $("#files-title").textContent = trash ? "휴지통" : "기업 데이터";
    $("#files-title").dataset.trash = String(trash);
    $("#files-description").textContent = trash
      ? "휴지통의 파일을 바탕화면으로 복원할 수 있습니다. 원본 파일은 변경되지 않습니다."
      : "현재 화면에서 추가한 파일입니다. 새로고침하면 파일 목록이 초기화됩니다.";
    const list = files.filter((f) => f.trash === trash);
    $("#files-list").innerHTML = list.length
      ? list
          .map(
            (f) =>
              `<div class="file-row"><i class="ph ph-microsoft-excel-logo"></i><div class="file-info"><strong>${esc(f.name)}</strong><small>${f.sample ? "샘플 파일" : (f.size / 1024).toFixed(1) + " KB"} · 내용 미분석</small></div><button class="small-button" data-file-action="${trash ? "restore" : "open"}" data-file-id="${f.id}">${trash ? "복원" : "열기"}</button>${trash ? "" : `<button class="icon-btn" aria-label="${esc(f.name)} 휴지통으로 이동" data-file-action="trash" data-file-id="${f.id}"><i class="ph ph-trash"></i></button>`}</div>`,
          )
          .join("")
      : `<div class="empty-state"><i class="ph ph-${trash ? "trash" : "folder-simple"}"></i>${trash ? "휴지통이 비어 있습니다." : "추가된 파일이 없습니다."}</div>`;
    openDialog("#files-dialog");
  }
  $("#files-list").onclick = (e) => {
    const b = e.target.closest("[data-file-action]");
    if (!b) return;
    const f = files.find((f) => f.id === b.dataset.fileId);
    if (!f) return;
    if (b.dataset.fileAction === "restore") {
      const cell = emptyCell(1, f.id);
      if (cell === null) {
        toast("바탕화면에 빈 공간이 없습니다.");
        return;
      }
      f.trash = false;
      f.cell = cell;
      drawIcons();
      showFiles(true);
      toast("바탕화면으로 복원했습니다.");
    } else if (b.dataset.fileAction === "trash") {
      trashFile(f.id);
      showFiles(false);
    } else {
      $("#files-dialog").close();
      openIcon(f.id);
    }
  };
  function drawWeights() {
    $("#weight-fields").innerHTML = Object.keys(defaults)
      .map(
        (key) =>
          `<div class="weight-row"><label for="weight-${key}">${names[key]}</label><input type="range" id="weight-${key}" data-weight="${key}" min="0" max="100" value="${draft[key]}" aria-label="${names[key]} 가중치 슬라이더"><input type="number" data-weight="${key}" min="0" max="100" step="1" value="${draft[key]}" aria-label="${names[key]} 가중치 퍼센트"></div>`,
      )
      .join("");
    weightTotal();
  }
  function weightTotal() {
    const total = Object.values(draft).reduce((a, b) => a + b, 0);
    $("#weight-total").textContent = total + "%";
    $("#weight-total").style.color = total === 100 ? "#6788d6" : "#ce5870";
    return total;
  }
  function openWeights() {
    draft = { ...weights };
    drawWeights();
    $("#weight-error").textContent = "";
    openDialog("#weights-dialog");
  }
  $("#weight-fields").oninput = (e) => {
    const key = e.target.dataset.weight;
    if (!key) return;
    const raw = e.target.value,
      v = Number(raw);
    if (raw === "" || !Number.isInteger(v) || v < 0 || v > 100) {
      $("#weight-error").textContent = "0~100 사이의 정수를 입력해 주세요.";
      draft[key] = NaN;
      weightTotal();
      return;
    }
    draft[key] = v;
    $$(`[data-weight="${key}"]`).forEach((el) => {
      if (el !== e.target) el.value = v;
    });
    $("#weight-error").textContent = "";
    weightTotal();
  };
  $("#restore-weights").onclick = () => {
    draft = { ...defaults };
    drawWeights();
    $("#weight-error").textContent = "";
  };
  $("#weights-form").onsubmit = (e) => {
    e.preventDefault();
    if (
      Object.values(draft).some(
        (v) => !Number.isInteger(v) || v < 0 || v > 100,
      ) ||
      weightTotal() !== 100
    ) {
      $("#weight-error").textContent =
        "네 항목의 가중치 합계를 100%로 맞춰 주세요.";
      return;
    }
    weights = { ...draft };
    customWeights = Object.keys(defaults).some(
      (k) => weights[k] !== defaults[k],
    );
    $("#weights-dialog").close();
    setTab(activeTab);
    toast("가중치를 적용했습니다. 예시 점수와 규제 상태는 그대로 유지됩니다.");
  };
  function report() {
    const button = $('[data-action="report"]', $("#tab-content"));
    if (button) button.disabled = true;
    try {
      const reportRows = [
        ["규제", "검토 전", "관문 고정"],
        ["시장성", "82 / 100", weights.market + "%"],
        ["가격", "76 / 100", weights.price + "%"],
        ["물류", "88 / 100", weights.logistics + "%"],
        ["안정성", "71 / 100", weights.stability + "%"],
      ];
      const details = Object.entries(detailData)
        .map(
          ([k, d]) =>
            `<h2>${names[k]}</h2><p>${d.note}</p><table><tr><th>지표</th><th>표시값</th><th>상태</th></tr>${d.rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</table>`,
        )
        .join("");
      let html = `<!doctype html><html lang="${window.AXPI18n?.language || "ko"}"><meta charset="utf-8"><title>AXPORT 예시 분석 보고서</title><style>body{font-family:system-ui,'Malgun Gothic',sans-serif;max-width:850px;margin:50px auto;padding:24px;color:#24344f;line-height:1.8}h1{font-size:30px}h2{margin-top:35px;font-size:20px}table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:12px;text-align:left;border-bottom:1px solid #e5e9f1}th{background:#f5f7fb}.note{background:#eef2ff;padding:18px;border-radius:8px;color:#526a9c}@media print{body{margin:0;padding:10px}h2{break-after:avoid}table{break-inside:avoid}}</style><body><p>AXPORT / EXPORT INTELLIGENCE</p><h1>수출 분석 보고서</h1><div class="note">화면 검토용 예시 데이터 · 실제 수출 판정 미실행<br>파일 내용·외부 API·규정 데이터는 연결되지 않았습니다.</div><p>기업: ${esc(context.company)}<br>HS: ${esc(formatHS(context.hs))} · 대상국: ${esc(countryLabel(context.country))}<br>파일: ${esc(context.file)}<br>생성일: ${new Date().toLocaleString(window.AXPI18n?.locale || "ko-KR")}<br>가중치: ${customWeights ? "사용자 설정" : "기본값"} · UI 예시 v1</p><h2>5개 영역 요약</h2><table><tr><th>영역</th><th>표시 결과</th><th>적용 비중</th></tr>${reportRows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</table><h2>규제 관문</h2><p>전략물자·최종사용자·수출허가·원산지 증빙은 모두 미검토입니다. 가중치로 규제 관문을 해제하지 않습니다.</p>${details}<p>출처: AXPORT 프론트엔드 시연 데이터. 실제 근거·시행일·규칙 버전은 미연결입니다.</p></body></html>`;
      html = window.AXPI18n?.translateHTML(html) || html;
      const link = $("#report-download");
      if (link.dataset.blobUrl) URL.revokeObjectURL(link.dataset.blobUrl);
      const blob = new Blob([html], { type: "text/html;charset=utf-8" }),
        url = URL.createObjectURL(blob);
      link.href = url;
      link.dataset.blobUrl = url;
      $("#report-preview").srcdoc = html;
      openDialog("#report-dialog");
    } catch {
      toast("보고서를 만들지 못했습니다. 다시 시도해 주세요.");
    } finally {
      if (button) button.disabled = false;
    }
  }
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-action]");
    if (!b) return;
    const action = b.dataset.action;
    if (action === "overview") {
      setTab("overview");
      showWindow();
    }
    if (action === "upload") {
      pendingFile = null;
      openUpload();
    }
    if (action === "files") showFiles();
    if (action === "report") report();
    if (action === "weights") openWeights();
    if (action === "reset-layout") {
      resetWindow();
      toast("창 배치를 초기화했습니다.");
    }
  });
  $$(".modal-close").forEach(
    (b) => (b.onclick = () => b.closest("dialog").close()),
  );
  $$("dialog").forEach((d) =>
    d.addEventListener("click", (e) => {
      if (e.target === d) {
        const r = d.getBoundingClientRect();
        if (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        )
          d.close();
      }
    }),
  );
  $("#edit-context").onclick = () => {
    pendingFile =
      files.find((f) => f.id === context.fileId && !f.trash) || null;
    openUpload();
  };
  $("#help-btn").onclick = () => openDialog("#help-dialog");
  $("#profile-btn").onclick = () =>
    toast("계정 연결 없는 디자인 미리보기입니다.");
  displayDate();
  window.addEventListener("axp:language-changed", () => {
    displayDate();
    contextUI();
    drawIcons();
    setTab(activeTab);
    if ($("#weights-dialog")?.open) drawWeights();
    if ($("#files-dialog")?.open) showFiles($("#files-title").dataset.trash === "true");
    if ($("#report-dialog")?.open) report();
  });
  window.addEventListener("resize", () => {
    fitWindow();
    const { rows, cols } = grid(),
      used = new Set();
    [...systemIcons, ...files.filter((f) => !f.trash)].forEach((f) => {
      if (f.cell >= rows * cols || used.has(f.cell)) {
        let cell = 0;
        while (used.has(cell)) cell++;
        f.cell = cell;
      }
      used.add(f.cell);
    });
    drawIcons();
  });
  const layout = readUI();
  if (
    layout &&
    [layout.x, layout.y, layout.w, layout.h].every(Number.isFinite) &&
    innerWidth > 850
  ) {
    Object.assign(win.style, {
      left: layout.x + "px",
      top: layout.y + "px",
      width: layout.w + "px",
      height: layout.h + "px",
    });
  }
  files[0].conditions = { ...context };
  setSidebarOpen(innerWidth > 560);
  contextUI();
  drawIcons();
  setTab("overview");
  fitWindow();
  $("#workspace-loading").hidden = true;
})();
