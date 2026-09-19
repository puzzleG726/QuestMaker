/* Document coordinates stay fixed while the editing surface fits its container. */
(() => {
  "use strict";
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const names = ["分级表", "九宫格", "关系图", "相性表"];
  const titles = ["我的角色印象表", "关于我的喜欢", "我们的关系图", "CP相性表"];
  const prompts = [
    "最喜欢的颜色",
    "最喜欢的角色",
    "最喜欢的性格",
    "最喜欢的舞台",
    "最喜欢的小说",
    "最喜欢的歌曲",
    "最喜欢的番剧",
    "最喜欢的电影",
    "最喜欢的物品",
  ];
  const rankColors = ["#ef8b8c", "#f4d583", "#c6db9b", "#9ed5c9", "#c8b2de"];
  const documents = names.map((_, type) => ({
    type,
    texts: {},
    images: {},
    background: [0, 3].includes(type) ? "#19191c" : "#ffffff",
    foreground: [0, 3].includes(type) ? "#ffffff" : "#29272d",
    rows: type === 0 ? 5 : 3,
    cols: type === 0 ? 1 : 3,
    boxRatio: "1",
    rowHeights: Array(12).fill(135),
    fills: {},
    ...(type !== 2 ? { nodeCount: 8 } : {}),
    legends: [
      { name: "喜欢", color: "#e67f85" },
      { name: "朋友", color: "#89b9c7" },
      { name: "竞争", color: "#d6ba6b" },
    ],
    edges: [],
    people: 2,
    knob: "#c6afdf",
    values: {},
    checks: {},
    extras: [],
    blocks: [
      { id: "portrait", type: "image" },
      {
        id: "voice",
        type: "scale",
        title: "说话声音",
        left: "小声",
        right: "大声",
      },
      {
        id: "pace",
        type: "scale",
        title: "说话节奏",
        left: "慢热",
        right: "热情",
      },
      {
        id: "expression",
        type: "scale",
        title: "表达方式",
        left: "含蓄",
        right: "直接",
      },
      { id: "choices", type: "checks", options: 3 },
      { id: "notes", type: "box" },
    ],
  }));
  documents.forEach((doc) => {
    if (doc.type === 2) {
      doc.participants = [];
      doc.nextParticipantId = 0;
      for (let i = 0; i < 8; i++) doc.participants.push(createParticipant(doc, i));
      bindParticipants(doc);
    }
    Object.assign(doc, {
      paperWidth: 720,
      rankWidths: [90, 529],
      rankPictures: [],
      rankAlign: {},
      textBoxes: {},
      legendPosition: "top-right",
      showLabels: true,
      themeColors: ["#c6afdf", "#89b9c7"],
      knobs: {},
    });
    doc.legends = (
      doc.type === 2
        ? [
            { name: "本命", color: "#e78b95" },
            { name: "可以接受", color: "#dce579" },
            { name: "CB", color: "#9cd7c7" },
            { name: "雷", color: "#000000" },
          ]
        : doc.legends
    ).map((item, i) => ({ ...item, id: "code-" + i }));
  });
  documents[0].texts.title = {
    html: '本账号含有以下<span style="color:#ff2020">受害</span>角色',
    preset: "title1",
  };
  ["公", "一般<br>不糟", "不分<br>左右", "偶尔<br>一糟", "受"].forEach(
    (html, i) => (documents[0].texts["rank-title-" + i] = { html }),
  );
  Object.assign(documents[3], { background: "#ffffff", foreground: "#29272d" });
  documents[3].texts.title = { html: "CP相性表", preset: "title1" };
  documents[3].blocks = [
    { id: "portrait", type: "image" },
    {
      id: "voice",
      type: "scale",
      title: "对对方爱的程度？",
      left: "讨厌",
      right: "喜欢",
    },
    {
      id: "pace",
      type: "scale",
      title: "敞开心扉的程度？",
      left: "严防死守",
      right: "心门大开",
    },
    {
      id: "expression",
      type: "scale",
      title: "遇到矛盾？",
      left: "示弱",
      right: "咄咄逼人",
    },
    { id: "palette", type: "legend" },
    { id: "choices", type: "checks", options: 3 },
    { id: "notes", type: "box" },
  ];
  documents[3].legends.forEach(
    (item, i) => (item.name = ["喜欢", "看情况", "讨厌"][i]),
  );
  let legendEditing = false,
    activeLegendId = "code-0",
    suppressClick = false;
  let active = null,
    selected = null,
    savedRange = null,
    colorEdit = null,
    linkMode = false,
    linkStart = null,
    imageTarget = null;
  let relationImportVersion = 0;
  let history = [],
    historyIndex = -1,
    historyTimer,
    toastTimer,
    scaleFrame;
  const viewZoom = [1, 1, 1, 1];
  let cropState = null;
  let closeLinePopovers = () => {};
  const sheet = $("#sheet");
  const uid = () =>
    "item-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const escapeHTML = (t) =>
    String(t).replace(
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
  const icon = (n) => '<i data-lucide="' + n + '" aria-hidden="true"></i>';
  const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || min));
  const current = () => documents[active];
  function createParticipant(doc, index) {
    const initialName = "角色 " + (index + 1);
    return { id: doc.nextParticipantId++, image: {}, name: { html: initialName }, initialName };
  }
  function bindParticipants(doc) {
    if (doc.type !== 2) return;
    // Keep the existing image/text editors as views onto participant-owned data.
    Object.defineProperty(doc, "nodeCount", {
      configurable: true,
      get: () => doc.participants.length,
    });
    for (const [map, prefix, property] of [
      [doc.images, "node-", "image"],
      [doc.texts, "node-name-", "name"],
    ]) {
      Object.getOwnPropertyNames(map).filter((key) => key.startsWith(prefix)).forEach((key) => delete map[key]);
      doc.participants.forEach((participant) => Object.defineProperty(map, prefix + participant.id, {
        configurable: true,
        get: () => participant[property],
        set: (value) => { participant[property] = value; },
      }));
    }
  }
  function participantIsEmpty(doc, participant) {
    const key = "node-" + participant.id;
    return !participant.image.src &&
      participant.name.html === participant.initialName &&
      Object.entries(participant.name).every(([key, value]) => key === "html" || value == null || value === "") &&
      !doc.fills[key] &&
      !Object.values(doc.textBoxes).some((box) => box.frame === key) &&
      !doc.edges.some((edge) => edge.from === participant.id || edge.to === participant.id);
  }
  function resizeParticipants(doc, count) {
    if (count < doc.participants.length) {
      const removeCount = doc.participants.length - count;
      const emptyIds = new Set();
      for (let index = doc.participants.length - 1; index >= 0 && emptyIds.size < removeCount; index--) {
        const participant = doc.participants[index];
        if (participantIsEmpty(doc, participant)) emptyIds.add(participant.id);
      }
      if (emptyIds.size < removeCount) {
        notify("空槽不足，无法减少到 " + count + " 人；已有图片、文字或连线的角色会保留");
        return false;
      }
      doc.participants = doc.participants.filter((participant) => !emptyIds.has(participant.id));
    }
    while (doc.participants.length < count)
      doc.participants.push(createParticipant(doc, doc.participants.length));
    bindParticipants(doc);
    return true;
  }
  function icons() {
    if (typeof window.lucide?.createIcons === "function")
      window.lucide.createIcons();
  }
  function notify(message) {
    clearTimeout(toastTimer);
    $("#toast").textContent = message;
    $("#toast").hidden = false;
    toastTimer = setTimeout(() => ($("#toast").hidden = true), 3400);
  }
  function rich(doc, key, fallback, classes = "", preset = "body") {
    const v = doc.texts[key];
    if (v?.hidden) return "";
    const style =
      (v?.align ? "text-align:" + v.align + ";" : "") +
      (v?.color ? "color:" + v.color + ";" : "") +
      (v?.fontSize ? "font-size:" + v.fontSize + "px;" : "") +
      (v?.weight ? "font-weight:" + v.weight + ";" : "") +
      (v?.fill ? "background-color:" + v.fill + ";" : "");
    return (
      '<div class="rich ' +
      classes +
      (v?.preset ? " text-" + v.preset : "") +
      '" contenteditable="true" spellcheck="false" role="textbox" aria-label="' +
      escapeHTML(fallback) +
      '" data-text="' +
      key +
      '" data-preset="' +
      (v?.preset || preset) +
      '" style="' +
      style +
      '">' +
      (v?.html ?? escapeHTML(fallback)) +
      "</div>"
    );
  }
  function imageBox(doc, key, classes = "") {
    const v = doc.images[key];
    const attached = Object.keys(doc.textBoxes).filter(
      (id) => doc.textBoxes[id].frame === key,
    );
    const above = attached.filter(
        (id) => doc.textBoxes[id].placement === "above",
      ),
      inside = attached.filter((id) => doc.textBoxes[id].placement !== "above");
    return (
      '<div class="frame-group"><div class="frame-heading">' +
      above.map((id) => textBoxHTML(doc, id)).join("") +
      '</div><div class="image-frame" data-frame="' +
      key +
      '"><button class="image-box ' +
      classes +
      " " +
      (v?.shape || "") +
      '" data-image="' +
      key +
      '" aria-label="选择图片框" aria-pressed="false" style="background-color:' +
      (doc.fills[key] || "#ffffff") +
      '">' +
      (v?.src
        ? '<img src="' +
          v.src +
          '" alt="上传的问卷图片" draggable="false" style="object-fit:' +
          (v.fit || "cover") +
          '">'
        : "") +
      "</button>" +
      inside
        .map((id, i) =>
          textBoxHTML(doc, id, inside.length === 1 ? 50 : 30 + i * 40),
        )
        .join("") +
      "</div></div>"
    );
  }
  function textBoxHTML(doc, id, top = 50) {
    const box = doc.textBoxes[id];
    if (!box) return "";
    const flow = box.placement.startsWith("layout-"),
      free = !box.frame && !flow,
      above = box.placement === "above";
    const style = free
      ? "left:" + box.x + "px;top:" + box.y + "px;width:" + box.width + "px"
      : above || flow
        ? ""
        : "top:" + top + "%";
    return (
      '<div class="text-box ' +
      (flow
        ? "flow-text"
        : free
          ? "free-text"
          : above
            ? "above-text"
            : "inside-text") +
      '" data-text-box="' +
      id +
      '" style="' +
      style +
      '"><button class="text-grip" data-drag-text="' +
      id +
      '" data-html2canvas-ignore aria-label="移动文字框" data-tooltip="拖动文字框">' +
      icon("grip-horizontal") +
      "</button>" +
      rich(doc, id, "文字") +
      "</div>"
    );
  }
  function flowTextHTML(doc, placement) {
    return (
      '<div class="layout-texts ' +
      placement +
      '">' +
      Object.keys(doc.textBoxes)
        .filter((id) => doc.textBoxes[id].placement === placement)
        .map((id) => textBoxHTML(doc, id))
        .join("") +
      "</div>"
    );
  }
  function legendHTML(doc) {
    return (
      '<div class="legend ' +
      (doc.type === 2 ? "corner-legend " + doc.legendPosition : "") +
      '">' +
      doc.legends
        .map(
          (item) =>
            '<div class="legend-item"><button class="legend-dot" data-legend-id="' +
            item.id +
            '" aria-label="选择' +
            escapeHTML(item.name) +
            '关系" style="background:' +
            item.color +
            '"></button>' +
            rich(doc, "legend-" + item.id, item.name) +
            "</div>",
        )
        .join("") +
      "</div>"
    );
  }
  function gridHTML(doc) {
    return (
      '<div class="grid-body" style="--cols:' +
      doc.cols +
      ";--box-ratio:" +
      doc.boxRatio +
      '">' +
      Array.from(
        { length: doc.rows * doc.cols },
        (_, i) =>
          '<section class="grid-cell">' +
          imageBox(doc, "grid-" + i) +
          rich(
            doc,
            "grid-caption-" + i,
            prompts[i] || "问题 " + (i + 1),
            "cell-caption",
          ) +
          "</section>",
      ).join("") +
      "</div>"
    );
  }
  function rankGeometry(doc) {
    if (doc.rankWidths.length !== doc.cols + 1) {
      const label = doc.rankWidths[0] || 90,
        rest = Math.max(
          doc.cols * 96,
          doc.paperWidth - 96 - label - doc.cols * 5,
        );
      doc.rankWidths = [label, ...Array(doc.cols).fill(rest / doc.cols)];
      doc.paperWidth = 96 + label + rest + doc.cols * 5;
    }
    const xs = [0],
      ys = [0];
    doc.rankWidths.forEach((w, i) => xs.push(xs[i] + w + 5));
    for (let r = 0; r < doc.rows; r++) ys.push(ys[r] + doc.rowHeights[r] + 5);
    return { xs, ys, width: xs.at(-1) - 5, height: ys.at(-1) - 5 };
  }
  function rankHTML(doc) {
    const g = rankGeometry(doc);
    return (
      '<div class="rank-body" style="width:' +
      g.width +
      'px">' +
      Array.from(
        { length: doc.rows },
        (_, r) =>
          '<section class="rank-row" data-row="' +
          r +
          '" style="grid-template-columns:' +
          doc.rankWidths.map((w) => w + "px").join(" ") +
          ";height:" +
          doc.rowHeights[r] +
          'px"><div class="rank-tag" data-fill="rank-tag-' +
          r +
          '" style="background:' +
          (doc.fills["rank-tag-" + r] || rankColors[r % 5]) +
          '"><span class="rank-number">' +
          (r + 1) +
          "</span>" +
          rich(doc, "rank-title-" + r, "等级 " + (r + 1)) +
          "</div>" +
          Array.from({ length: doc.cols }, (_, c) => {
            const key = "rank-" + r + "-" + c;
            return (
              '<div class="rank-cell" data-fill="' +
              key +
              '">' +
              imageBox(doc, key) +
              "</div>"
            );
          }).join("") +
          "</section>",
      ).join("") +
      doc.rankPictures
        .filter((p) => p.row < doc.rows && p.col < doc.cols)
        .map((p) => rankPictureHTML(doc, p, g))
        .join("") +
      Array.from(
        { length: doc.rows - 1 },
        (_, r) =>
          '<div class="row-divider rank-handle" data-resize="row" data-resize-index="' +
          r +
          '" data-divider="' +
          r +
          '" style="top:' +
          (g.ys[r + 1] - 10) +
          'px" data-html2canvas-ignore></div>',
      ).join("") +
      Array.from(
        { length: doc.cols },
        (_, c) =>
          '<div class="col-divider rank-handle" data-resize="col" data-resize-index="' +
          c +
          '" style="left:' +
          (g.xs[c + 1] - 10) +
          'px" data-html2canvas-ignore></div>',
      ).join("") +
      '<div class="table-right rank-handle" data-resize="width" data-html2canvas-ignore></div><div class="table-bottom rank-handle" data-resize="height" data-html2canvas-ignore></div><div class="table-corner rank-handle" data-resize="both" data-html2canvas-ignore></div></div>'
    );
  }
  function rankPictureHTML(doc, p, g = rankGeometry(doc)) {
    const w = Math.min(p.width, doc.rankWidths[p.col + 1] - 12),
      h = w / p.ratio,
      x = g.xs[p.col + 1] + p.x * doc.rankWidths[p.col + 1],
      y =
        p.boundary && p.row < doc.rows - 1
          ? g.ys[p.row + 1] - 2.5
          : g.ys[p.row] + doc.rowHeights[p.row] / 2;
    return (
      '<button class="rank-picture" data-picture="' +
      p.id +
      '" aria-label="选择行内图片" style="left:' +
      (x - w / 2) +
      "px;top:" +
      (y - h / 2) +
      "px;width:" +
      w +
      "px;height:" +
      h +
      'px"><img src="' +
      p.src +
      '" alt="行内图片" draggable="false" style="object-fit:contain"></button>'
    );
  }
  const relationGeometries = new Map();
  function relationGeometry(n) {
    if (relationGeometries.has(n)) return relationGeometries.get(n);
    let radius = n <= 12 ? 225 : 251;
    // Avatar and label are separate boxes, allowing tighter spacing than their union.
    const units = Array.from({ length: n }, (_, i) => {
        const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
        return { x: Math.cos(angle), y: Math.sin(angle) };
      }),
      boxes = [
        [-33, -33, 33, 33],
        [-33, 36, 33, 55],
      ];
    const overlaps = (r) =>
      units.some((a, i) =>
        units
          .slice(i + 1)
          .some((b) =>
            boxes.some((x) =>
              boxes.some(
                (y) =>
                  Math.min(a.x * r + x[2], b.x * r + y[2]) -
                    Math.max(a.x * r + x[0], b.x * r + y[0]) >
                    -2 &&
                  Math.min(a.y * r + x[3], b.y * r + y[3]) -
                    Math.max(a.y * r + x[1], b.y * r + y[1]) >
                    -2,
              ),
            ),
          ),
      );
    if (n >= 14) while (overlaps(radius)) radius++;
    const g = {
      radius,
      width: 2 * radius + 144,
      height: 2 * radius + 144,
      paper: 2 * radius + 192,
    };
    relationGeometries.set(n, g);
    return g;
  }
  function nodePosition(i, n) {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2,
      g = relationGeometry(n);
    return {
      x: g.width / 2 + g.radius * Math.cos(angle),
      y: g.height / 2 + g.radius * Math.sin(angle),
    };
  }
  function nodeSize() {
    return 66;
  }
  function edgeGeometry(doc, edge) {
    const a =
        edge.from != null
          ? nodePosition(doc.participants.findIndex((p) => p.id === edge.from), doc.nodeCount)
          : edge.startPoint,
      b =
        edge.to != null ? nodePosition(doc.participants.findIndex((p) => p.id === edge.to), doc.nodeCount) : edge.endPoint;
    const dx = b.x - a.x,
      dy = b.y - a.y,
      length = Math.max(1, Math.hypot(dx, dy)),
      bend = edge.bend || 0,
      c = {
        x: (a.x + b.x) / 2 + (edge.control?.x ?? (-dy / length) * bend),
        y: (a.y + b.y) / 2 + (edge.control?.y ?? (dx / length) * bend),
      };
    const startAngle = Math.atan2(c.y - a.y, c.x - a.x),
      endAngle = Math.atan2(b.y - c.y, b.x - c.x),
      radius = nodeSize(doc) / 2 + 4,
      s = {
        x: a.x + (edge.from != null ? radius : 0) * Math.cos(startAngle),
        y: a.y + (edge.from != null ? radius : 0) * Math.sin(startAngle),
      },
      e = {
        x: b.x - (edge.to != null ? radius : 0) * Math.cos(endAngle),
        y: b.y - (edge.to != null ? radius : 0) * Math.sin(endAngle),
      };
    return {
      a,
      b,
      s,
      e,
      c,
      startAngle,
      endAngle,
      path:
        "M " +
        s.x +
        " " +
        s.y +
        " Q " +
        c.x +
        " " +
        c.y +
        " " +
        e.x +
        " " +
        e.y,
      label: {
        x: 0.25 * s.x + 0.5 * c.x + 0.25 * e.x,
        y: 0.25 * s.y + 0.5 * c.y + 0.25 * e.y,
      },
    };
  }
  function edgeColor(doc, edge) {
    return (
      edge.color ||
      doc.legends.find((l) => l.id === edge.legendId)?.color ||
      "#999999"
    );
  }
  function endpointHTML(style, p, angle, color, width) {
    if (style === "circle")
      return (
        '<circle cx="' +
        p.x +
        '" cy="' +
        p.y +
        '" r="' +
        (4 + width / 2) +
        '" fill="' +
        color +
        '"/>'
      );
    if (style === "bar")
      return (
        '<path d="M ' +
        (p.x + 8 * Math.sin(angle)) +
        " " +
        (p.y - 8 * Math.cos(angle)) +
        " L " +
        (p.x - 8 * Math.sin(angle)) +
        " " +
        (p.y + 8 * Math.cos(angle)) +
        '" stroke="' +
        color +
        '" stroke-width="' +
        width +
        '"/>'
      );
    if (style !== "arrow") return "";
    return (
      '<path d="M ' +
      (p.x - 12 * Math.cos(angle - 0.5)) +
      " " +
      (p.y - 12 * Math.sin(angle - 0.5)) +
      " L " +
      p.x +
      " " +
      p.y +
      " L " +
      (p.x - 12 * Math.cos(angle + 0.5)) +
      " " +
      (p.y - 12 * Math.sin(angle + 0.5)) +
      '" fill="none" stroke="' +
      color +
      '" stroke-width="' +
      width +
      '"/>'
    );
  }
  function relationEdgeHTML(doc, edge, i) {
      const g = edgeGeometry(doc, edge),
        color = edgeColor(doc, edge),
        width = edge.width || 3;
      return (
        '<g class="relation-edge" data-edge="' +
        i +
        '"><path class="edge-halo" d="' +
        g.path +
        '" fill="none" stroke="#b399d1" stroke-width="' +
        (width + 9) +
        '" opacity="0"/><path class="edge-hit" d="' +
        g.path +
        '" fill="none" stroke="transparent" stroke-width="20"/><path class="edge-line" d="' +
        g.path +
        '" fill="none" stroke="' +
        color +
        '" stroke-width="' +
        width +
        '"/>' +
        endpointHTML(
          edge.startStyle || "none",
          g.s,
          g.startAngle + Math.PI,
          color,
          width,
        ) +
        endpointHTML(edge.endStyle || "arrow", g.e, g.endAngle, color, width) +
        [
          ["start", g.s],
          ["end", g.e],
        ]
          .map(
            ([handle, p]) =>
              '<circle class="edge-control" data-edge-handle="' +
              handle +
              '" cx="' +
              p.x +
              '" cy="' +
              p.y +
              '" r="7" data-html2canvas-ignore/>',
          )
          .join("") +
        "</g>"
      );
  }
  function refreshSelectedLine(doc, edge, index) {
    const element = $('[data-edge="' + index + '"]', sheet);
    if (!element) return;
    element.outerHTML = relationEdgeHTML(doc, edge, index);
    const replacement = $('[data-edge="' + index + '"]', sheet);
    replacement.classList.add("selected");
    if (selected?.type === "edge") selected.element = replacement;
    const label = $('[data-edge-label="' + index + '"]', sheet);
    if (label) {
      const geometry = edgeGeometry(doc, edge);
      label.style.left = geometry.label.x + "px";
      label.style.top = geometry.label.y + "px";
    }
  }
  function relationHTML(doc) {
    let edges = "",
      labels = "";
    doc.edges.forEach((edge, i) => {
      if ([edge.from, edge.to].some((id) => id != null && !doc.participants.some((p) => p.id === id))) return;
      const g = edgeGeometry(doc, edge), color = edgeColor(doc, edge);
      edges += relationEdgeHTML(doc, edge, i);
      if (edge.textKey)
        labels +=
          '<div class="edge-text" data-edge-label="' +
          i +
          '" style="left:' +
          g.label.x +
          "px;top:" +
          g.label.y +
          "px;color:" +
          color +
          '">' +
          rich(doc, edge.textKey, "文字") +
          "</div>";
    });
    const g = relationGeometry(doc.nodeCount);
    return (
      '<div class="relation-map" style="width:' +
      g.width +
      "px;height:" +
      g.height +
      'px;--node-size:66px;--node-label-size:14px"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' +
      g.width +
      " " +
      g.height +
      '" role="img" aria-label="角色关系连线">' +
      edges +
      "</svg>" +
      doc.participants.map((participant, i) => {
        const p = nodePosition(i, doc.nodeCount);
        return (
          '<section class="relation-node" data-node="' +
          participant.id +
          '" data-participant-id="' + participant.id +
          '" style="left:' +
          p.x +
          "px;top:" +
          p.y +
          'px">' +
          imageBox(doc, "node-" + participant.id) +
          (doc.showLabels
            ? rich(doc, "node-name-" + participant.id, participant.initialName, "node-name")
            : "") +
          "</section>"
        );
      }).join("") +
      labels +
      "</div>" +
      legendHTML(doc)
    );
  }
  function quadrantHTML(doc, b) {
    const labels = [
      ["top", "抽象的"],
      ["bottom", "具象的"],
      ["left", "人"],
      ["right", "物"],
    ];
    return (
      rich(doc, b.id + "-title", "关注对象", "shared-scale-title", "title2") +
      '<div class="quadrant-chart" data-quadrant="' +
      b.id +
      '"><div class="quadrant-axis axis-x"></div><div class="quadrant-axis axis-y"></div>' +
      labels
        .map(([side, text]) =>
          rich(doc, b.id + "-" + side, text, "quadrant-label label-" + side),
        )
        .join("") +
      (b.points || [])
        .map(
          (p) =>
            '<button class="quadrant-dot" data-dot="' +
            p.id +
            '" style="left:' +
            p.x +
            "%;top:" +
            p.y +
            "%;background:" +
            themeColor(doc, p.theme < doc.people ? p.theme : 0) +
            '" aria-label="切换标记颜色"></button>',
        )
        .join("") +
      "</div>"
    );
  }
  function compatImageBox(doc, key, classes) {
    const v = doc.images[key],
      width = v?.width ? Math.min(100, v.width) + "%" : "100%";
    return (
      '<div class="compat-image" data-compat-image="' +
      key +
      '" style="width:' +
      width +
      ";--frame-height:" +
      (v?.height ? v.height + "px" : "auto") +
      '">' +
      imageBox(doc, key, classes) +
      '<button class="frame-resize" data-resize-frame="' +
      key +
      '" aria-label="调整图片框大小" data-tooltip="调整图片框大小" data-html2canvas-ignore>' +
      icon("move-diagonal-2") +
      "</button></div>"
    );
  }
  function themeColor(doc, person) {
    return doc.themeColors[person] || doc.themeColors[0];
  }
  function checkPalette(doc, person) {
    return doc.legends.length
      ? doc.legends.map((l) => ({
          id: l.id,
          color: l.color || themeColor(doc, person),
        }))
      : [{ id: "theme", color: themeColor(doc, person) }];
  }
  function blockSlot(doc, b) {
    return (
      b.slot ||
      (doc.people === 1 && b.type === "scale"
        ? "left"
        : doc.people === 1 && b.type === "image"
          ? "right"
          : "full")
    );
  }
  function blockHTML(doc, b) {
    const slot = blockSlot(doc, b),
      people =
        doc.people === 1
          ? [0]
          : slot === "full"
            ? [0, 1]
            : [slot === "right" ? 1 : 0];
    const actions =
      '<div class="block-actions" data-html2canvas-ignore><button data-drag-block="' +
      b.id +
      '" aria-label="拖动组件" data-tooltip="拖动组件">' +
      icon("grip-vertical") +
      "</button></div>";
    let body = "";
    if (b.type === "legend") body = legendHTML(doc);
    else if (b.type === "text")
      body = rich(
        doc,
        b.textKey || b.id + "-text",
        "文字",
        "component-text",
        "title2",
      );
    else if (b.type === "quadrant") body = quadrantHTML(doc, b);
    else
      body =
        (b.type === "scale"
          ? rich(
              doc,
              b.id + "-title",
              b.title || "相性量表",
              "shared-scale-title",
              "title2",
            )
          : "") +
        '<div class="compat-pair" style="--people:' +
        people.length +
        '">' +
        people
          .map((person) => {
            const key = b.id + "-" + person;
            let content = "";
            if (b.type === "image")
              content = compatImageBox(doc, key, "portrait");
            if (b.type === "box")
              content =
                rich(doc, key + "-label", "备注", "notes-label") +
                compatImageBox(doc, key, "notes-box");
            if (b.type === "scale") {
              const knob = doc.knobs[key] || {},
                color = knob.color || themeColor(doc, person),
                shape = knob.shape || "default";
              content =
                '<div class="scale-labels">' +
                rich(doc, key + "-left", b.left || "少") +
                rich(doc, key + "-right", b.right || "多") +
                '</div><div class="scale-control"><span class="scale-track"></span><input type="range" min="0" max="100" value="' +
                (doc.values[key] ?? 50) +
                '" data-scale="' +
                key +
                '" aria-label="角色' +
                (person + 1) +
                " " +
                escapeHTML(b.title || "相性量表") +
                '" data-html2canvas-ignore><button class="scale-knob knob-' +
                shape +
                '" data-knob="' +
                key +
                '" ' +
                (knob.hidden ? "hidden" : "") +
                ' aria-label="编辑滑块" style="left:' +
                (doc.values[key] ?? 50) +
                "%;--knob:" +
                color +
                ";--knob-length:" +
                (knob.length || 28) +
                'px">' +
                (shape === "heart" ? icon("heart") : "") +
                "</button></div>";
            }
            if (b.type === "checks")
              content =
                '<div class="check-group">' +
                Array.from({ length: b.options ?? 3 }, (_, i) => {
                  const id = key + "-" + i,
                    state = doc.checks[id],
                    choice = checkPalette(doc, person).find(
                      (c) => c.id === state,
                    ),
                    color =
                      choice?.color ||
                      (state === true ? themeColor(doc, person) : null);
                  return (
                    '<div class="check-option"><button class="choice" role="checkbox" aria-checked="' +
                    Boolean(color) +
                    '" aria-label="角色' +
                    (person + 1) +
                    " 选项" +
                    (i + 1) +
                    '" data-check="' +
                    id +
                    '" data-person="' +
                    person +
                    '" style="--knob:' +
                    (color || themeColor(doc, person)) +
                    '"></button>' +
                    rich(
                      doc,
                      key + "-choice-" + i,
                      ["很有默契", "偶尔拌嘴", "需要磨合"][i] ||
                        "选项 " + (i + 1),
                    ) +
                    "</div>"
                  );
                }).join("") +
                "</div>";
            return "<section>" + content + "</section>";
          })
          .join("") +
        "</div>";
    const portrait =
      doc.people === 1 && b.id === "portrait" && !b.slot && !doc.widgetsMoved
        ? " single-portrait"
        : "";
    return (
      '<section class="compat-block slot-' +
      slot +
      portrait +
      '" data-component="' +
      b.id +
      '" data-kind="' +
      b.type +
      '">' +
      body +
      actions +
      "</section>"
    );
  }
  function compatHTML(doc) {
    return (
      '<div class="compat-body compat-widgets ' +
      (doc.people === 1 ? "compat-single" : "") +
      '" style="--people:' +
      doc.people +
      '"><div class="compat-names">' +
      Array.from({ length: doc.people }, (_, i) =>
        rich(
          doc,
          "person-" + i,
          "角色 " + String.fromCharCode(65 + i),
          "person-" + i,
        ),
      ).join("") +
      "</div>" +
      doc.blocks.map((b) => blockHTML(doc, b)).join("") +
      "</div>"
    );
  }
  function renderSheet(doc, target) {
    if (doc.type === 0) rankGeometry(doc);
    if (doc.type === 2) doc.paperWidth = relationGeometry(doc.nodeCount).paper;
    target.style.height = doc.type === 2 ? doc.paperWidth + "px" : "";
    target.classList.toggle("sheet-relation", doc.type === 2);
    target.classList.toggle(
      "sheet-grid-single",
      doc.type === 1 && doc.rows === 1,
    );
    target.style.width = doc.paperWidth + "px";
    target.style.setProperty("--paper-bg", doc.background);
    target.style.setProperty("--paper-ink", doc.foreground);
    target.style.setProperty("--knob", doc.knob);
    target.innerHTML =
      rich(doc, "title", titles[doc.type], "sheet-title", "title1") +
      rich(doc, "respondent", "填表人： ", "respondent") +
      flowTextHTML(doc, "layout-top") +
      [rankHTML, gridHTML, relationHTML, compatHTML][doc.type](doc) +
      flowTextHTML(doc, "layout-bottom") +
      '<div class="text-flow-spacer"></div><footer class="watermark">表格由@QuestMaker制作</footer><div class="free-layer">' +
      Object.keys(doc.textBoxes)
        .filter(
          (id) =>
            !doc.textBoxes[id].frame &&
            !doc.textBoxes[id].placement.startsWith("layout-"),
        )
        .map((id) => textBoxHTML(doc, id))
        .join("") +
      "</div>";
    if (doc.type === 0)
      $$("span.rank-number", target).forEach(
        (el, i) =>
          (el.outerHTML = rich(
            doc,
            "rank-number-" + i,
            String(i + 1),
            "rank-number",
          )),
      );
    fitRankLabels(target);
    if (target.isConnected) alignFrameHeadings(target);
  }
  function fitRankLabels(target) {
    if (!target.isConnected) return;
    $$(".rank-tag", target).forEach((tag) => {
      const text = $(".rich:not(.rank-number)", tag);
      if (!text) return;
      text.style.removeProperty("--auto-font-size");
      if (
        text.style.fontSize ||
        text.matches(".text-title1,.text-title2,.text-body") ||
        $$("[style]", text).some((el) => el.style.fontSize)
      )
        return;
      text.style.setProperty("--auto-font-size", "26px");
      for (
        let size = 25;
        size >= 12 &&
        (text.scrollHeight > tag.clientHeight - 36 ||
          text.scrollWidth > tag.clientWidth - 12);
        size--
      )
        text.style.setProperty("--auto-font-size", size + "px");
    });
  }
  function alignFrameHeadings(target) {
    const align = (headings) => {
      headings.forEach((el) => (el.style.minHeight = "0"));
      const height = Math.max(0, ...headings.map((el) => el.offsetHeight));
      headings.forEach((el) => (el.style.minHeight = height + "px"));
    };
    const grid = $(".grid-body", target);
    if (grid) {
      const cols = Number(grid.style.getPropertyValue("--cols")),
        headings = $$(".frame-heading", grid);
      for (let i = 0; i < headings.length; i += cols)
        align(headings.slice(i, i + cols));
    }
    $$(".rank-row,.compat-pair", target).forEach((row) =>
      align($$(".frame-heading", row)),
    );
    layoutRankPictures(target);
    $$(".scale-control", target).forEach((control) =>
      positionKnob(control, Number($("[data-scale]", control).value)),
    );
    const widgets = $(".compat-widgets", target);
    if (widgets)
      for (const child of widgets.children)
        child.style.gridRowEnd = "span " + Math.ceil(child.offsetHeight + 25);
    layoutRelation(target);
  }
  function layoutRelation(target) {
    const map = $(".relation-map", target);
    if (!map || !target.isConnected) return;
    map.classList.toggle(
      "compact-ring",
      $$(".relation-node", map).length >= 14,
    );
    const title = $(":scope > .sheet-title", target),
      respondent = $(":scope > .respondent", target),
      legend = $(":scope > .corner-legend", target),
      paper = target.offsetWidth;
    const legendScale = paper / 642;
    legend.style.transform = "scale(" + legendScale + ")";
    legend.style.transformOrigin = "top left";
    const legendWidth = legend.offsetWidth * legendScale,
      legendHeight = legend.offsetHeight * legendScale;
    const topFlow = $(".layout-top", target),
      bottomFlow = $(".layout-bottom", target);
    Object.assign(topFlow.style, { left: "24px", top: "25.6px", width: paper - 48 + "px" });
    const cornerWidth = Math.min(320, Math.floor(paper * 0.35)),
      top = 25.6 + (topFlow.children.length ? topFlow.offsetHeight + 16 : 0),
      gap = 4;
    if (title)
      Object.assign(title.style, {
        left: "24px",
        top: top + "px",
        width: "fit-content",
        maxWidth: cornerWidth + "px",
      });
    const respondentTop = top + (title ? title.offsetHeight + 8 : 0);
    if (respondent)
      Object.assign(respondent.style, {
        left: "24px",
        top: respondentTop + "px",
        width: "fit-content",
        maxWidth: cornerWidth + "px",
      });
    const scale = target.getBoundingClientRect().width / paper,
      mapRect = map.getBoundingClientRect();
    if (!scale) return;
    const nodes = $$(
      ".relation-node [data-image],.relation-node .node-name,.relation-node .frame-heading",
      map,
    )
      .filter((el) => el.offsetHeight)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          left: 24 + (r.left - mapRect.left) / scale,
          right: 24 + (r.right - mapRect.left) / scale,
          top: (r.top - mapRect.top) / scale,
          bottom: (r.bottom - mapRect.top) / scale,
        };
      });
    const overlapsX = (node, left, width) =>
      node.left < left + width + gap && node.right > left - gap;
    const headers = [];
    if (title)
      headers.push({
        width: title.offsetWidth,
        bottom: top + title.offsetHeight,
      });
    if (respondent)
      headers.push({
        width: respondent.offsetWidth,
        bottom: respondentTop + respondent.offsetHeight,
      });
    let mapTop = 24;
    for (const node of nodes)
      for (const header of headers)
        if (overlapsX(node, 24, header.width))
          mapTop = Math.max(mapTop, header.bottom + gap - node.top);
    const bottomLegend = legend.classList.contains("bottom-left"),
      legendLeft = bottomLegend ? 12 : paper - 12 - legendWidth;
    if (!bottomLegend)
      for (const node of nodes)
        if (overlapsX(node, legendLeft, legendWidth))
          mapTop = Math.max(mapTop, top + legendHeight + gap - node.top);
    if (topFlow.children.length) {
      mapTop = Math.max(
        mapTop,
        top - Math.min(...nodes.map((n) => n.top)),
      );
    }
    map.style.top = Math.ceil(mapTop) + "px";
    mapTop = Math.ceil(mapTop);
    let height = paper + mapTop - 24;
    let legendTop = top;
    if (bottomLegend) {
      legendTop = height - 42 - legendHeight;
      for (const node of nodes)
        if (overlapsX(node, legendLeft, legendWidth))
          legendTop = Math.max(legendTop, mapTop + node.bottom + gap);
      height = Math.max(height, legendTop + legendHeight + 42);
    }
    Object.assign(legend.style, {
      left: legendLeft + "px",
      right: "auto",
      top: legendTop + "px",
      bottom: "auto",
    });
    let contentBottom = Math.max(
      0,
      ...nodes.map((node) => mapTop + node.bottom),
      ...$$(".free-text", target).map((el) => el.offsetTop + el.offsetHeight),
    );
    if (bottomFlow.children.length) {
      const y = Math.max(contentBottom, legendTop + legendHeight) + 16;
      Object.assign(bottomFlow.style, {
        left: "24px",
        top: y + "px",
        width: paper - 48 + "px",
      });
      contentBottom = y + bottomFlow.offsetHeight;
    }
    target.style.height =
      Math.ceil(Math.max(height, contentBottom + 38)) + "px";
  }
  function layoutRankPictures(target) {
    const body = $(".rank-body", target);
    if (!body) return;
    const doc = documents[0],
      root = body.getBoundingClientRect(),
      scale = target.getBoundingClientRect().width / target.offsetWidth;
    if (!scale) return;
    for (let row = 0; row < doc.rows; row++)
      for (let col = 0; col < doc.cols; col++) {
        const frame = $('[data-frame="rank-' + row + "-" + col + '"]', target),
          r = frame.getBoundingClientRect(),
          items = doc.rankPictures
            .filter((p) => p.row === row && p.col === col)
            .sort((a, b) => a.x - b.x);
        const widths = items.map((p) =>
            p.boundary
              ? p.width
              : Math.min(
                  p.manualWidth ? p.width : Infinity,
                  frame.clientHeight * p.ratio,
                ),
          ),
          gap = Math.min(8, frame.clientWidth / Math.max(1, items.length * 2)),
          room = frame.clientWidth - Math.max(0, items.length - 1) * gap,
          total = widths.reduce((a, b) => a + b, 0),
          factor = Math.min(1, room / Math.max(1, total)),
          used = total * factor + Math.max(0, items.length - 1) * gap,
          align = doc.rankAlign[row + "-" + col] || "left";
        let left =
          (r.left - root.left) / scale +
          (align === "right"
            ? frame.clientWidth - used
            : align === "center"
              ? (frame.clientWidth - used) / 2
              : 0);
        items.forEach((p, i) => {
          const el = $('[data-picture="' + p.id + '"]', target);
          if (!el) return;
          const width = widths[i] * factor,
            height = width / p.ratio;
          Object.assign(el.style, {
            width: width + "px",
            height: height + "px",
            left: left + "px",
          });
          if (!p.boundary)
            el.style.top =
              (r.top - root.top) / scale +
              (frame.clientHeight - height) / 2 +
              "px";
          left += width + gap;
        });
      }
  }
  function renderHome() {
    $("#templates").innerHTML = names
      .map(
        (name, i) =>
          '<button class="template-card" data-open="' +
          i +
          '"><div class="template-preview"><div class="thumbnail-frame"></div></div><div class="template-caption"><span><small>0' +
          (i + 1) +
          "</small>" +
          name +
          "</span>" +
          icon("arrow-up-right") +
          "</div></button>",
      )
      .join("");
    $$("[data-open]").forEach((button, i) => {
      const preview = document.createElement("div");
      preview.className = "sheet";
      renderSheet(documents[i], preview);
      const frame = $(".thumbnail-frame", button);
      frame.append(preview);
      fitRankLabels(preview);
      alignFrameHeadings(preview);
      $$("[data-html2canvas-ignore]", preview).forEach((el) => el.remove());
      $$("button", preview).forEach((el) => {
        const span = document.createElement("span");
        span.className = el.className;
        span.style.cssText = el.style.cssText;
        span.innerHTML = el.innerHTML;
        el.replaceWith(span);
      });
      $$("[contenteditable]", preview).forEach((el) => {
        el.removeAttribute("contenteditable");
        el.removeAttribute("role");
      });
      const width = preview.offsetWidth,
        scale = Math.min(192 / width, 205 / preview.offsetHeight);
      preview.style.transform = "scale(" + scale + ")";
      frame.style.width = width * scale + "px";
      frame.style.height = preview.offsetHeight * scale + "px";
      button.onclick = () => openEditor(i);
    });
    icons();
  }
  function fitSheet() {
    cancelAnimationFrame(scaleFrame);
    scaleFrame = requestAnimationFrame(() => {
      if (active === null) return;
      alignFrameHeadings(sheet);
      const doc = current(),
        spacer = $(".text-flow-spacer", sheet);
      spacer.style.display = "none";
      if (doc.type !== 2) {
        const bottom = Math.max(
          0,
          ...$$(".free-text", sheet).map(
            (el) => el.offsetTop + el.offsetHeight,
          ),
        );
        const extra = bottom + 26 - $(".watermark", sheet).offsetTop;
        if (extra > 0) {
          spacer.style.display = "block";
          spacer.style.height = extra + "px";
        }
      }
      fitRankLabels(sheet);
      const available = $("#canvasViewport").clientWidth,
        width = sheet.offsetWidth,
        scale = Math.min(1, available / width) * viewZoom[active];
      sheet.style.transform = "scale(" + scale + ")";
      $("#sheetFrame").style.width = width * scale + "px";
      $("#sheetFrame").style.height = sheet.offsetHeight * scale + "px";
      $("#zoomOut").disabled = viewZoom[active] <= 1;
      $("#zoomIn").disabled = viewZoom[active] >= 4;
      $("#zoomLevel").textContent = Math.round(scale * 100) + "%";
      $("#dimensions").textContent = width + " × " + sheet.offsetHeight;
      $("#exportDimensions").textContent =
        width * Number($("#exportScale").value) +
        " × " +
        sheet.offsetHeight * Number($("#exportScale").value) +
        " px";
    });
  }
  function openEditor(type) {
    if (active !== null) flushHistory();
    active = type;
    selected = null;
    savedRange = null;
    setLinkMode(false);
    $("#textStyle").value = "body";
    $("#textColor").value = current().foreground;
    $("#homeView").hidden = true;
    $("#editorView").hidden = false;
    $("#editorActions").hidden = false;
    $("#breadcrumb").textContent = "/ " + names[type];
    $("#paperName").textContent = names[type];
    $("#linkMode").hidden = type !== 2;
    history = [];
    historyIndex = -1;
    render();
    recordHistory();
    window.scrollTo({ top: 0 });
  }
  function render() {
    renderSheet(current(), sheet);
    renderProperties();
    renderSelection();
    icons();
    fitSheet();
  }
  const field = (label, body) =>
    '<label class="field">' + label + body + "</label>";
  function visualOptionGroup(id, label, value, options) {
    return '<div class="field visual-option-field"><span>' + label +
      '</span><div id="' + id + '" class="visual-option-group" role="group" aria-label="' + label + '">' +
      options.map((option) => '<button type="button" data-option="' + escapeHTML(option.value) +
        '" aria-label="' + escapeHTML(option.label) + '" data-tooltip="' + escapeHTML(option.label) +
        '" aria-pressed="' + (option.value === value) + '">' + option.icon +
        (option.showLabel ? '<span class="option-label">' + escapeHTML(option.label) + '</span>' : '') + '</button>').join('') + '</div></div>';
  }
  function bindVisualOptions(id, onChange) {
    const group = $("#" + id);
    if (!group) return;
    group.onclick = (event) => {
      const button = event.target.closest("button[data-option]");
      if (!button || !group.contains(button)) return;
      $$("button", group).forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      onChange(button.dataset.option);
    };
  }
  const shapeOption = (value, label, filled = false) => ({
    value, label,
    icon: value === "" || value === "default" ? icon("rotate-ccw") :
      value === "heart" ? '<span class="option-heart" aria-hidden="true">' + icon("heart") + '</span>' :
      '<span class="option-shape shape-' + value + (filled ? ' filled' : '') + '" aria-hidden="true"></span>',
  });
  const numberField = (id, value, min, max) =>
    '<input type="number" id="' +
    id +
    '" value="' +
    value +
    '" min="' +
    min +
    '" max="' +
    max +
    '">';
  function discreteSliderField(id, label, value, min, max) {
    const progress = ((value - min) / (max - min)) * 100,
      interval = max - min <= 6 ? 1 : Math.ceil((max - min) / 7),
      ticks = [];
    for (let tick = min + interval; tick < max; tick += interval)
      ticks.push('<span style="left:' + ((tick - min) / (max - min)) * 100 + '%"></span>');
    return '<div class="field discrete-slider-field"><label for="' + id + '">' + label +
      '</label><div class="discrete-control" style="--progress:' + progress + '%">' +
      '<div class="discrete-scale"><output for="' + id + '">' + value + '</output>' +
      '<div class="discrete-rail" aria-hidden="true">' + ticks.join('') + '</div>' +
      '<span class="discrete-min" aria-hidden="true">' + min + '</span>' +
      '<span class="discrete-max" aria-hidden="true">' + max + '</span></div>' +
      '<input id="' + id + '" type="range" min="' + min + '" max="' + max +
      '" step="1" value="' + value + '"></div></div>';
  }
  function updateDiscreteSlider(input) {
    const control = input.closest(".discrete-control");
    if (!control) return;
    const value = Math.round(clamp(input.value, Number(input.min), Number(input.max)));
    input.value = value;
    control.style.setProperty("--progress", ((value - input.min) / (input.max - input.min)) * 100 + "%");
    $("output", control).value = value;
  }
  function renderProperties() {
    const doc = current();
    let layout = "";
    if (doc.type === 0 || doc.type === 1)
      layout =
        '<div class="field-row discrete-counts">' +
        discreteSliderField("rows", "行数", doc.rows, 1, doc.type === 0 ? 12 : 6) +
        discreteSliderField("cols", "列数", doc.cols, 1, doc.type === 0 ? 4 : 5) +
        "</div>";
    if (doc.type === 0)
      layout +=
        '<div class="field-row">' +
        field(
          "表格宽度",
          numberField(
            "rankWidth",
            rankGeometry(doc).width,
            56 + doc.cols * 101,
            1200,
          ),
        ) +
        field(
          "表格高度",
          numberField(
            "rankHeight",
            rankGeometry(doc).height,
            doc.rows * 80 + (doc.rows - 1) * 5,
            doc.rows * 500 + (doc.rows - 1) * 5,
          ),
        ) +
        "</div>";
    if (doc.type === 1)
      layout += field(
        "格子比例",
        '<select id="boxRatio"><option value="1">1:1</option><option value="3/4">3:4</option><option value="4/5">4:5</option></select>',
      );
    if (doc.type === 2)
      layout +=
        '<button id="batchAvatars">' + icon("images") + '批量导入头像</button>' +
        discreteSliderField("nodeCount", "头像数量", doc.nodeCount, 3, 24) +
        '<label class="toggle-field"><input id="showLabels" type="checkbox" ' +
        (doc.showLabels ? "checked" : "") +
        ">显示角色名称</label>" +
        visualOptionGroup("legendPosition", "图例位置", doc.legendPosition, [
          { value: "bottom-left", label: "左下角", icon: '<span class="option-canvas bottom-left" aria-hidden="true"></span>' },
          { value: "top-right", label: "右上角", icon: '<span class="option-canvas top-right" aria-hidden="true"></span>' },
        ]);
    if (doc.type === 3)
      layout +=
        field(
          "排列",
          '<select id="people"><option value="2">双人对照</option><option value="1">单人排版</option></select>',
        ) +
        '<div class="field-row">' +
        Array.from({ length: doc.people }, (_, i) =>
          field(
            "主题颜色" +
              (doc.people === 2 ? " " + String.fromCharCode(65 + i) : ""),
            '<input data-theme="' +
              i +
              '" type="color" value="' +
              themeColor(doc, i) +
              '">',
          ),
        ).join("") +
        '</div><div class="field"><span>添加组件</span><div class="component-palette" role="group" aria-label="添加组件">' +
        [
          ["scale", "sliders-horizontal", "滑动量表"],
          ["checks", "list-checks", "勾选选项"],
          ["legend", "palette", "颜色图例"],
          ["box", "notebook-pen", "备注框"],
          ["image", "image", "图片框"],
          ["quadrant", "axis-3d", "四维图"],
        ].map(([type, name, label]) => '<button type="button" data-add-component="' + type +
          '" aria-label="添加' + label + '">' + icon(name) + '<span>' + label + '</span></button>').join('') +
        '</div></div>';
    $("#layoutProperties").innerHTML =
      '<section class="property-section"><h3>' +
      names[doc.type] +
      "</h3>" +
      layout +
      '</section><section class="property-section"><h3>画布</h3><div class="field-row">' +
      field(
        "背景颜色",
        '<input id="background" type="color" value="' + doc.background + '">',
      ) +
      field(
        "默认文字",
        '<input id="foreground" type="color" value="' + doc.foreground + '">',
      ) +
      "</div></section>" +
      legendPanel(doc);
    ["rows", "cols", "nodeCount", "people"].forEach((key) => {
      const el = $("#" + key);
      if (!el) return;
      el.value = doc[key];
      if (el.type === "range") el.oninput = () => updateDiscreteSlider(el);
      el.onchange = () => {
        const next = Math.round(
          clamp(
            el.value,
            key === "nodeCount" ? 3 : 1,
            key === "rows"
              ? doc.type === 0
                ? 12
                : 6
              : key === "cols"
                ? doc.type === 0
                  ? 4
                  : 5
                : key === "nodeCount"
                  ? 24
                  : 2,
          ),
        );
        el.value = next;
        updateDiscreteSlider(el);
        if (doc[key] === next) return;
        const retainSliderFocus = el.type === "range" && document.activeElement === el;
        flushHistory();
        if (key === "nodeCount") {
          if (!resizeParticipants(doc, next)) {
            el.value = doc.nodeCount;
            updateDiscreteSlider(el);
            return;
          }
          setLinkMode(false);
        } else doc[key] = next;
        if (doc.type === 0) fitRankPictures(doc);
        selected = null;
        refreshSheet();
        renderProperties();
        renderSelection();
        if (retainSliderFocus) $("#" + key).focus({ preventScroll: true });
        recordHistory();
      };
    });
    const batchAvatars = $("#batchAvatars");
    if (batchAvatars) batchAvatars.onclick = () => {
      imageTarget = { type: 2, batch: true };
      $("#imageUpload").multiple = true;
      $("#imageUpload").value = "";
      $("#imageUpload").click();
    };
    const br = $("#boxRatio");
    if (br) {
      br.value = doc.boxRatio;
      br.onchange = () => {
        doc.boxRatio = br.value;
        selected = null;
        render();
        recordHistory();
      };
    }
    ["background", "foreground", "knob"].forEach((key) => {
      const el = $("#" + key);
      if (!el) return;
      el.oninput = () => {
        doc[key] = el.value;
        sheet.style.setProperty(
          {
            background: "--paper-bg",
            foreground: "--paper-ink",
            knob: "--knob",
          }[key],
          el.value,
        );
        scheduleHistory();
      };
    });
    bindLegendPanel(doc);
    const labels = $("#showLabels");
    if (labels)
      labels.onchange = () => {
        doc.showLabels = labels.checked;
        refreshSheet();
        recordHistory();
      };
    $$("[data-theme]").forEach(
      (input) =>
        (input.oninput = () => {
          doc.themeColors[Number(input.dataset.theme)] = input.value;
          refreshSheet();
          if (selected?.type === "knob") renderSelection();
          scheduleHistory();
        }),
    );
    bindVisualOptions("legendPosition", (value) => {
        doc.legendPosition = value;
        refreshSheet();
        recordHistory();
    });
    ["Width", "Height"].forEach((dimension) => {
      const el = $("#rank" + dimension);
      if (el)
        el.onchange = () => {
          resizeRank(doc, dimension.toLowerCase(), Number(el.value));
          refreshSheet();
          renderProperties();
          recordHistory();
        };
    });
    $$("[data-add-component]").forEach((button) => {
      button.onclick = () => addCompatComponent(button.dataset.addComponent);
    });
  }
  function legendPanel(doc) {
    if (doc.type !== 2 && doc.type !== 3) return "";
    return (
      '<section class="property-section"><div class="section-heading"><h3>颜色图例</h3><button id="editLegends">' +
      icon(legendEditing ? "check" : "pencil") +
      (legendEditing ? "完成" : "编辑") +
      '</button></div><div id="legendList">' +
      doc.legends
        .map(
          (item, i) =>
            '<div class="legend-edit ' +
            (legendEditing ? "editing" : "") +
            '" data-legend-row="' +
            item.id +
            '">' +
            (legendEditing
              ? '<button class="danger small-icon" data-delete-legend="' +
                item.id +
                '" aria-label="删除' +
                escapeHTML(item.name) +
                '">' +
                icon("x") +
                "</button>"
              : "") +
            '<input type="color" data-legend-color="' +
            item.id +
            '" value="' +
            item.color +
            '" aria-label="图例 ' +
            (i + 1) +
            ' 颜色" ' +
            (!legendEditing ? "disabled" : "") +
            '><input type="text" data-legend-name="' +
            item.id +
            '" value="' +
            escapeHTML(item.name) +
            '" aria-label="图例 ' +
            (i + 1) +
            ' 名称" ' +
            (!legendEditing ? "readonly" : "") +
            ">" +
            (legendEditing
              ? '<button class="small-icon legend-grip" data-drag-legend="' +
                item.id +
                '" aria-label="拖动排序 ' +
                escapeHTML(item.name) +
                '">' +
                icon("grip-vertical") +
                "</button>"
              : "") +
            "</div>",
        )
        .join("") +
      "</div>" +
      (legendEditing
        ? '<button id="addLegend" class="full" aria-label="添加颜色图例" ' +
          (doc.legends.length >= 7 ? "disabled" : "") +
          ">" +
          icon("plus") +
          "</button>"
        : "") +
      "</section>"
    );
  }
  function reorderLegend(doc, id, before) {
    const from = doc.legends.findIndex((l) => l.id === id),
      to = doc.legends.findIndex((l) => l.id === before);
    if (from < 0 || to < 0 || from === to) return;
    const [item] = doc.legends.splice(from, 1);
    doc.legends.splice(to, 0, item);
    refreshSheet();
    renderProperties();
    renderSelection();
    recordHistory();
  }
  function bindLegendPanel(doc) {
    const toggle = $("#editLegends");
    if (!toggle) return;
    toggle.onclick = () => {
      legendEditing = !legendEditing;
      renderProperties();
      icons();
    };
    const add = $("#addLegend");
    if (add)
      add.onclick = () => {
        if (doc.legends.length >= 7) return;
        doc.legends.push({ id: uid(), name: "新关系", color: "#b6a1ce" });
        refreshSheet();
        renderProperties();
        renderSelection();
        recordHistory();
      };
    $$("[data-delete-legend]").forEach(
      (el) =>
        (el.onclick = () => {
          const id = el.dataset.deleteLegend;
          doc.legends = doc.legends.filter((l) => l.id !== id);
          doc.edges.forEach((edge) => {
            if (edge.legendId === id) edge.legendId = doc.legends[0]?.id || "";
          });
          if (activeLegendId === id) activeLegendId = doc.legends[0]?.id || "";
          delete doc.texts["legend-" + id];
          refreshSheet();
          renderProperties();
          renderSelection();
          recordHistory();
        }),
    );
    $$("[data-legend-color]").forEach(
      (el) =>
        (el.oninput = () => {
          doc.legends.find((l) => l.id === el.dataset.legendColor).color =
            el.value;
          refreshSheet();
          scheduleHistory();
        }),
    );
    $$("[data-legend-name]").forEach(
      (el) =>
        (el.oninput = () => {
          doc.legends.find((l) => l.id === el.dataset.legendName).name =
            el.value;
          delete doc.texts["legend-" + el.dataset.legendName];
          refreshSheet();
          renderSelection();
          scheduleHistory();
        }),
    );
    $$("[data-drag-legend]").forEach((handle) => {
      handle.onpointerdown = (event) => {
        event.preventDefault();
        const id = handle.dataset.dragLegend;
        handle.setPointerCapture(event.pointerId);
        let target = id;
        handle.onpointermove = (e) => {
          const row = $$("[data-legend-row]").find((r) => {
            const b = r.getBoundingClientRect();
            return e.clientY >= b.top && e.clientY <= b.bottom;
          });
          $$("[data-legend-row]").forEach((r) =>
            r.classList.toggle("drop-target", r === row),
          );
          if (row) target = row.dataset.legendRow;
        };
        handle.onpointerup = () => {
          handle.onpointermove = null;
          $$(".drop-target").forEach((r) => r.classList.remove("drop-target"));
          reorderLegend(doc, id, target);
        };
      };
      handle.onkeydown = (e) => {
        if (!["ArrowUp", "ArrowDown"].includes(e.key)) return;
        e.preventDefault();
        const i = doc.legends.findIndex(
            (l) => l.id === handle.dataset.dragLegend,
          ),
          next = doc.legends[i + (e.key === "ArrowUp" ? -1 : 1)];
        if (next) reorderLegend(doc, handle.dataset.dragLegend, next.id);
      };
    });
    icons();
  }
  function resizeRank(doc, dimension, value) {
    const g = rankGeometry(doc);
    if (dimension === "width") {
      const desired = clamp(value, 56 + doc.cols * 101, 1200),
        minima = doc.rankWidths.map((_, i) => (i === 0 ? 56 : 96)),
        free = desired - doc.cols * 5 - minima.reduce((a, b) => a + b, 0),
        weights = doc.rankWidths.map((w, i) => Math.max(1, w - minima[i])),
        sum = weights.reduce((a, b) => a + b, 0);
      doc.rankWidths = weights.map((w, i) => minima[i] + (free * w) / sum);
      doc.paperWidth = desired + 96;
    } else {
      const target =
        clamp(
          value,
          doc.rows * 80 + (doc.rows - 1) * 5,
          doc.rows * 500 + (doc.rows - 1) * 5,
        ) -
        (doc.rows - 1) * 5;
      let heights = doc.rowHeights
        .slice(0, doc.rows)
        .map((h) =>
          clamp((h * target) / (g.height - (doc.rows - 1) * 5), 80, 500),
        );
      for (let pass = 0; pass < 12; pass++) {
        const diff = target - heights.reduce((a, b) => a + b, 0),
          indices = heights
            .map((h, i) => i)
            .filter((i) => (diff > 0 ? heights[i] < 500 : heights[i] > 80));
        if (Math.abs(diff) < 0.01 || !indices.length) break;
        indices.forEach(
          (i) =>
            (heights[i] = clamp(heights[i] + diff / indices.length, 80, 500)),
        );
      }
      heights.forEach((h, i) => (doc.rowHeights[i] = h));
    }
    fitRankPictures(doc);
  }
  function highlightSelection() {
    $$(".relation-node", sheet).forEach((node) =>
      node.classList.toggle("link-start", linkMode && node.querySelector('[data-image="node-' + linkStart + '"]') !== null),
    );
    $$(".selected", sheet).forEach((el) => el.classList.remove("selected"));
    $$("[data-image]", sheet).forEach((el) =>
      el.setAttribute("aria-pressed", "false"),
    );
    if (selected?.element) {
      selected.element.classList.add("selected");
      if (selected.type === "image")
        selected.element.setAttribute("aria-pressed", "true");
    }
    const index = selectedEdgeIndex();
    if (index >= 0)
      $('[data-edge="' + index + '"]', sheet)?.classList.add("selected");
  }
  function refreshSheet() {
    renderSheet(current(), sheet);
    if (selected?.key)
      selected.element = $(
        "[data-" +
          ({ image: "image", picture: "picture", knob: "knob" }[
            selected.type
          ] || "text") +
          '="' +
          selected.key +
          '"]',
        sheet,
      );
    if (selected?.type === "edge")
      selected.element = $('[data-edge="' + selected.index + '"]', sheet);
    highlightSelection();
    syncLineColorButton();
    icons();
    fitSheet();
  }
  function setSelected(value) {
    if (colorEdit && (value?.type !== "text" || value.key !== colorEdit.key))
      colorEdit = null;
    selected = value;
    highlightSelection();
    renderSelection();
  }
  function renderSelection() {
    renderLineToolbar();
    const host = $("#selectionProperties");
    host.innerHTML =
      '<section class="property-section"><h3>选中内容</h3><p class="secondary">' +
      (selected
        ? {
            text: "文字",
            image: "图片",
            fill: "分区",
            edge: "连线",
            component: "组件",
            knob: "滑块",
            picture: "行内图片",
          }[selected.type]
        : "未选择") +
      "</p></section>";
    if (!selected) return;
    const doc = current();
    if (selected.type === "text" && selected.element)
      renderTextSelection(doc, host);
    if (selected.type === "text" && selected.element) {
      const key = selected.key,
        section = $(".property-section", host),
        controls = document.createElement("div");
      controls.className = "text-fill-controls";
      controls.innerHTML =
        '<span class="control-label">文字框填充</span><div class="property-actions"><input id="textFill" type="color" aria-label="文字框填充颜色" value="' +
        (doc.texts[key]?.fill || "#ffffff") +
        '"><button id="clearTextFill" class="icon-button" aria-label="透明填充" data-tooltip="透明填充">' +
        icon("eraser") +
        "</button></div>";
      section.insertBefore(controls, $("#removeText", section));
      $("#textFill").oninput = (e) => {
        saveText(selected.element);
        doc.texts[key].fill = e.target.value;
        selected.element.style.backgroundColor = e.target.value;
        scheduleHistory();
      };
      $("#clearTextFill").onclick = () => {
        if (doc.texts[key]) delete doc.texts[key].fill;
        selected.element.style.backgroundColor = "";
        recordHistory();
      };
    }
    if (selected.type === "image") {
      const key = selected.key,
        value = doc.images[key] || {},
        textKey = "frame-" + key,
        attached = Object.keys(doc.textBoxes).filter(
          (id) => doc.textBoxes[id].frame === key,
        );
      host.innerHTML =
        '<section class="property-section"><h3>图片框</h3><div class="property-actions frame-actions"><button id="replaceImage">' +
        icon("image-plus") +
        '导入图片</button><button id="addFrameText" ' +
        (attached.length >= 2 ? "disabled" : "") +
        ">" +
        icon("type") +
        "添加文字</button></div>" +
        field(
          "填充颜色",
          '<input id="cellFill" type="color" value="' +
            (doc.fills[key] || "#ffffff") +
            '">',
        ) +
        visualOptionGroup("imageShape", "图片框形状", value.shape || "", [
          shapeOption("", "默认"), shapeOption("square", "方形"),
          shapeOption("circle", "圆形"), shapeOption("rectangle", "长方形"),
          shapeOption("rounded", "圆角"),
        ]) +
        field(
          "图片适配",
          '<select id="imageFit"><option value="cover">填满</option><option value="contain">完整显示</option></select>',
        ) +
        '<div class="property-actions"><button id="removeImage" ' +
        (!value.src ? "disabled" : "") +
        ">" +
        icon("trash-2") +
        "移除图片</button>" +
        (attached.length
          ? '<button id="removeFrameText">' + icon("x") + "移除文字</button>"
          : "") +
        "</div></section>";
      $("#imageFit").value = value.fit || "cover";
      const changeImageOption = (prop, value) => {
            doc.images[key] = {
              ...doc.images[key],
              [prop]: value,
            };
            refreshSheet();
            renderSelection();
            recordHistory();
      };
      bindVisualOptions("imageShape", (value) => changeImageOption("shape", value));
      $("#imageFit").onchange = (e) => changeImageOption("fit", e.target.value);
      $("#replaceImage").onclick = () => chooseImage(key);
      addCropButton(
        $(".frame-actions", host),
        { type: active, key },
        Boolean(value.src),
      );
      $("#removeImage").onclick = () => {
        delete doc.images[key].src;
        delete doc.images[key].originalSrc;
        delete doc.images[key].crop;
        refreshSheet();
        renderSelection();
        recordHistory();
      };
      $("#cellFill").oninput = (e) => {
        doc.fills[key] = e.target.value;
        $('[data-image="' + key + '"]', sheet).style.backgroundColor =
          e.target.value;
        scheduleHistory();
      };
      $("#addFrameText").onclick = () => addTextBox(key);
      const removeText = $("#removeFrameText");
      if (removeText)
        removeText.onclick = () => {
          attached.forEach((id) => {
            delete doc.texts[id];
            delete doc.textBoxes[id];
          });
          refreshSheet();
          renderSelection();
          recordHistory();
        };
    }
    if (selected.type === "fill") {
      host.innerHTML =
        '<section class="property-section"><h3>分区</h3>' +
        field(
          "背景颜色",
          '<input id="fillColor" type="color" value="' +
            (doc.fills[selected.key] ||
              rankColors[Number(selected.key.split("-").pop()) % 5]) +
            '">',
        ) +
        "</section>";
      $("#fillColor").oninput = (e) => {
        doc.fills[selected.key] = e.target.value;
        selected.element.style.background = e.target.value;
        scheduleHistory();
      };
    }
    if (selected.type === "knob") renderKnobSelection(doc, host);
    if (selected.type === "picture") {
      renderPictureSelection(doc, host);
      addCropButton(
        $(".property-actions", host),
        { type: active, pictureId: selected.key },
        true,
      );
    }
    if (doc.type === 0 && ["picture", "image"].includes(selected.type))
      renderRankAlignment(doc, host);
    const componentId =
      selected.type === "component"
        ? selected.id
        : selected.element?.closest("[data-component]")?.dataset.component;
    if (componentId) renderComponentSelection(doc, host, componentId);
    icons();
  }
  function textComponent(doc, key) {
    return doc.blocks.find(
      (b) => b.type === "text" && (b.textKey || b.id + "-text") === key,
    );
  }
  function placeText(key, placement) {
    const doc = current(),
      element = $('[data-text="' + key + '"]', sheet),
      bounds = paperRect(element.closest("[data-text-box]") || element);
    applyTextPlacement(doc, key, placement, bounds);
  }
  function applyTextPlacement(doc, key, placement, bounds) {
    const block = textComponent(doc, key), box = doc.textBoxes[key];
    if (placement === "inside" || placement === "above") {
      if (box?.frame) box.placement = placement;
      return;
    }
    if (block) doc.blocks = doc.blocks.filter((b) => b !== block);
    if (placement === "component" || placement.startsWith("before:")) {
      delete doc.textBoxes[key];
      const before = doc.blocks.findIndex((b) => b.id === placement.slice(7)),
        next = block || { id: uid(), type: "text", textKey: key };
      next.slot = "full";
      doc.blocks.splice(before < 0 ? doc.blocks.length : before, 0, next);
    } else
      doc.textBoxes[key] = {
        frame: null,
        placement,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
      };
  }
  function renderTextSelection(doc, host) {
    const key = selected.key,
      value = doc.texts[key],
      box = doc.textBoxes[key],
      block = textComponent(doc, key);
    $("#textStyle").value =
      value?.preset || selected.element.dataset.preset || "body";
    const componentOptions =
      doc.type === 3
        ? '<option value="component">组件末尾整行</option>' +
          doc.blocks
            .filter((b) => b !== block)
            .map(
              (b, i) =>
                '<option value="before:' +
                b.id +
                '">第 ' +
                (i + 1) +
                " 项组件之前</option>",
            )
            .join("")
        : "";
    host.innerHTML =
      '<section class="property-section"><div class="selected-label">' +
      icon("type") +
      "<h3>文字</h3></div>" +
      field(
        "字号",
        numberField(
          "fontSize",
          parseFloat(getComputedStyle(selected.element).fontSize),
          10,
          96,
        ),
      ) +
      (box || block
        ? field(
            "位置",
            '<select id="textPlacement"><option value="free">自由位置</option><option value="layout-top">排版上方整行</option><option value="layout-bottom">排版下方整行</option>' +
              (box?.frame
                ? '<option value="inside">框内</option><option value="above">图片框正上方</option>'
                : "") +
              componentOptions +
              "</select>",
          )
        : "") +
      '<button id="removeText">' +
      icon("trash-2") +
      "删除文字</button></section>";
    bindFontSize();
    const placement = $("#textPlacement");
    if (placement) {
      const next = block && doc.blocks[doc.blocks.indexOf(block) + 1];
      placement.value = block
        ? next
          ? "before:" + next.id
          : "component"
        : box.placement;
      placement.onchange = () => {
        flushHistory();
        placeText(key, placement.value);
        refreshSheet();
        renderSelection();
        recordHistory();
      };
    }
    $("#removeText").onclick = () => {
      flushHistory();
      if (box || block) {
        delete doc.textBoxes[key];
        delete doc.texts[key];
        doc.blocks = doc.blocks.filter((b) => b !== block);
        doc.extras = doc.extras.filter((id) => id !== key);
      } else doc.texts[key] = { ...doc.texts[key], hidden: true };
      selected = null;
      savedRange = null;
      render();
      recordHistory();
    };
  }
  function selectedEdgeIndex() {
    if (active !== 2) return -1;
    return selected?.type === "edge"
      ? selected.index
      : selected?.type === "text"
        ? current().edges.findIndex((edge) => edge.textKey === selected.key)
        : -1;
  }
  function renderLineToolbar() {
    closeLinePopovers();
    const host = $("#lineToolbar"),
      index = selectedEdgeIndex(),
      edge = current()?.edges[index];
    host.hidden = !edge;
    host.innerHTML = "";
    if (!edge) return;
    const doc = current(),
      geometry = edgeGeometry(doc, edge),
      dx = geometry.b.x - geometry.a.x,
      dy = geometry.b.y - geometry.a.y,
      bend = edge.control
        ? (-dy * edge.control.x + dx * edge.control.y) / Math.max(1, Math.hypot(dx, dy))
        : edge.bend || 0,
      bendLimit = Math.max(300, Math.ceil(Math.abs(bend)));
    host.innerHTML =
      field(
        "颜色",
        '<button id="edgeColor" class="icon-button"><span class="edge-color-swatch" aria-hidden="true"></span></button>',
      ) +
      field("Start", '<button id="edgeStart" class="icon-button" aria-label="起点箭头" data-tooltip="起点箭头">' + icon("arrow-left") + '</button>') +
      field("End", '<button id="edgeEnd" class="icon-button" aria-label="终点箭头" data-tooltip="终点箭头">' + icon("arrow-right") + '</button>') +
      '<div class="field"><span>粗细</span><button id="edgeWidth" class="icon-button" aria-label="线条粗细" data-tooltip="线条粗细" aria-expanded="false" aria-controls="edgeWidthPopover">' +
      icon("list-filter") +
      '</button><div id="edgeWidthPopover" class="line-control-popover" popover="auto" role="group" aria-label="线条粗细">' +
      [6, 9, 12].map((width, i) => '<button class="icon-button" data-edge-width="' + width + '" aria-label="' + ["细", "中", "粗"][i] + '" style="--weight:' + (2 + i * 2) + '">' + icon("minus") + '</button>').join("") +
      '</div></div>' +
      '<button id="edgeText" aria-label="编辑线上文字" data-tooltip="线上文字">' +
      icon("type") +
      '</button><div class="line-curve-control"><button id="edgeCurve" aria-label="连线曲率" data-tooltip="连线曲率" aria-expanded="false" aria-controls="edgeCurvePopover">' +
      icon("spline") +
      '</button><div id="edgeCurvePopover" class="line-control-popover" popover="auto"><input id="edgeBend" type="range" aria-label="连线曲率" min="-' + bendLimit + '" max="' + bendLimit + '" step="1" value="' + bend + '"></div></div>' +
      '<button id="removeEdge" aria-label="删除连线" data-tooltip="删除连线">' +
      icon("trash-2") +
      "</button>";
    syncLineColorButton();
    $("#edgeColor").onclick = () => {
      if (!doc.legends.length) return;
      flushHistory();
      const position = doc.legends.findIndex((legend) => legend.id === edge.legendId),
        next = doc.legends[(position + 1) % doc.legends.length];
      edge.legendId = next.id;
      delete edge.color;
      refreshSheet();
      recordHistory();
    };
    for (const [id, key] of [
      ["edgeStart", "startStyle"],
      ["edgeEnd", "endStyle"],
    ]) {
      const button = $("#" + id),
        isArrow = () => (edge[key] || (key === "endStyle" ? "arrow" : "none")) === "arrow";
      button.setAttribute("aria-pressed", String(isArrow()));
      button.onpointerdown = (event) => {
        event.stopPropagation();
        if (event.isPrimary && event.button === 0)
          button.setPointerCapture(event.pointerId);
      };
      button.onpointerup = button.onpointercancel = (event) => {
        event.stopPropagation();
        if (button.hasPointerCapture(event.pointerId))
          button.releasePointerCapture(event.pointerId);
      };
      button.onpointermove = (event) => event.stopPropagation();
      button.onclick = (event) => {
        event.stopPropagation();
        // The surrounding field is a label; do not forward a second activation.
        event.preventDefault();
        flushHistory();
        edge[key] = isArrow() ? "none" : "arrow";
        button.setAttribute("aria-pressed", String(isArrow()));
        refreshSelectedLine(doc, edge, index);
        recordHistory();
      };
    }
    const widthButton = $("#edgeWidth"),
      popover = $("#edgeWidthPopover"),
      updateWidth = () => {
        const nearest = [6, 9, 12].reduce((a, b) => Math.abs(b - (edge.width || 3)) < Math.abs(a - (edge.width || 3)) ? b : a);
        $$("[data-edge-width]", popover).forEach((button) => button.setAttribute("aria-pressed", String(Number(button.dataset.edgeWidth) === nearest)));
      };
    updateWidth();
    const closeWidth = bindLinePopover(widthButton, popover),
      closeCurve = bindLinePopover($("#edgeCurve"), $("#edgeCurvePopover"));
    closeLinePopovers = () => { closeWidth(); closeCurve(); };
    $$("[data-edge-width]", popover).forEach((button) => {
      button.onclick = () => {
        flushHistory();
        edge.width = Number(button.dataset.edgeWidth);
        updateWidth();
        popover.hidePopover();
        widthButton.focus();
        refreshSheet();
        recordHistory();
      };
    });
    $("#edgeText").onclick = () => {
      if (!edge.textKey || doc.texts[edge.textKey]?.hidden) {
        edge.textKey ??= uid();
        doc.texts[edge.textKey] = { html: "文字", preset: "body" };
        refreshSheet();
        recordHistory();
      }
      const el = $('[data-text="' + edge.textKey + '"]', sheet);
      el.focus();
      setSelected({ type: "text", key: edge.textKey, element: el });
    };
    const bendSlider = $("#edgeBend");
    bendSlider.onpointerdown = () => flushHistory();
    bendSlider.oninput = () => {
      const value = Number(bendSlider.value);
      delete edge.control;
      edge.bend = Math.abs(value) <= 8 ? 0 : value;
      bendSlider.value = edge.bend;
      bendSlider.setAttribute("aria-valuetext", edge.bend === 0 ? "直线" : String(edge.bend));
      refreshSelectedLine(doc, edge, index);
    };
    bendSlider.onchange = () => flushHistory();
    bendSlider.onkeydown = (event) => {
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      flushHistory();
      const direction = ["ArrowRight", "ArrowUp"].includes(event.key) ? 1 : -1;
      bendSlider.value = clamp(Number(bendSlider.value) + direction * 10, -bendLimit, bendLimit);
      bendSlider.oninput();
      recordHistory();
    };
    $("#removeEdge").onclick = () => {
      if (edge.textKey) delete doc.texts[edge.textKey];
      doc.edges.splice(index, 1);
      selected = null;
      render();
      recordHistory();
    };
    icons();
  }
  function bindLinePopover(button, popover) {
    let listeners;
    const viewport = () => ({
      left: visualViewport?.offsetLeft || 0,
      top: visualViewport?.offsetTop || 0,
      width: visualViewport?.width || innerWidth,
      height: visualViewport?.height || innerHeight,
    });
    const close = () => {
      listeners?.abort();
      if (popover.matches(":popover-open")) popover.hidePopover();
      button.setAttribute("aria-expanded", "false");
    };
    const position = () => {
      if (!popover.matches(":popover-open")) return;
      const view = viewport(), rect = button.getBoundingClientRect();
      popover.style.maxWidth = Math.max(0, view.width - 16) + "px";
      const width = popover.offsetWidth, height = popover.offsetHeight;
      if (rect.top < view.top || rect.bottom + height + 14 > view.top + view.height) {
        close();
        return;
      }
      popover.style.left = Math.max(view.left + 8, Math.min(rect.left, view.left + view.width - width - 8)) + "px";
      popover.style.top = rect.bottom + 6 + "px";
    };
    button.onclick = () => {
      if (popover.matches(":popover-open")) return close();
      popover.showPopover();
      const view = viewport(), rect = button.getBoundingClientRect();
      if (rect.top < view.top || rect.bottom + popover.offsetHeight + 14 > view.top + view.height)
        button.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
      position();
      if (!popover.matches(":popover-open")) return;
      button.setAttribute("aria-expanded", "true");
      listeners?.abort();
      listeners = new AbortController();
      const options = { signal: listeners.signal, passive: true };
      window.addEventListener("resize", position, options);
      document.addEventListener("scroll", position, { ...options, capture: true });
      visualViewport?.addEventListener("resize", position, options);
      visualViewport?.addEventListener("scroll", position, options);
    };
    popover.ontoggle = () => {
      if (!popover.matches(":popover-open")) close();
    };
    return close;
  }
  function syncLineColorButton() {
    const button = $("#edgeColor"),
      doc = current(),
      edge = doc?.edges[selectedEdgeIndex()];
    if (!button || !edge) return;
    const legend = doc.legends.find((item) => item.id === edge.legendId);
    $(".edge-color-swatch", button).style.backgroundColor = edgeColor(doc, edge);
    button.disabled = !doc.legends.length;
    button.dataset.legendId = edge.legendId || "";
    button.dataset.tooltip = legend && !edge.color ? legend.name : "切换颜色图例";
    button.setAttribute("aria-label", "切换颜色图例" + (legend && !edge.color ? "：" + legend.name : ""));
  }
  function renderKnobSelection(doc, host) {
    const key = selected.key,
      person = Number(key.split("-").at(-1)),
      knob = doc.knobs[key] || {};
    const maximum = $('[data-knob="' + key + '"]', sheet).closest(
        ".scale-control",
      ).clientWidth,
      length = Math.min(knob.length || 28, maximum);
    host.innerHTML =
      '<section class="property-section knob-properties"><h3>滑块</h3><div class="field-row">' +
      visualOptionGroup("knobShape", "形状", knob.shape || "default", [
        shapeOption("default", "默认"), shapeOption("circle", "圆形", true),
        shapeOption("heart", "心形", true), shapeOption("rectangle", "长方形", true),
      ]) +
      field(
        "颜色",
        '<div class="knob-color-controls"><input id="knobColor" type="color" value="' +
          (knob.color || themeColor(doc, person)) +
          '"><button id="resetKnobColor" class="icon-button" aria-label="使用主题颜色" data-tooltip="使用主题颜色">' +
          icon("rotate-ccw") +
          "</button></div>",
      ) +
      "</div>" +
      (knob.shape === "rectangle"
        ? field(
            "长度",
            '<div class="knob-length-control"><input id="knobLength" type="range" min="10" max="' +
              maximum +
              '" step="1" value="' +
              length +
              '" aria-label="长方形滑块长度"><output id="knobLengthValue" for="knobLength">' +
              length +
              " px</output></div>",
          )
        : "") +
      "</section>";
    bindVisualOptions("knobShape", (value) => {
      doc.knobs[key] = { ...doc.knobs[key], shape: value };
      refreshSheet();
      renderSelection();
      scheduleHistory();
    });
    host
      .querySelector("h3")
      .insertAdjacentHTML(
        "afterend",
        '<label class="toggle-field"><input id="knobVisible" type="checkbox" ' +
          (!knob.hidden ? "checked" : "") +
          ">显示滑块</label>",
      );
    $("#knobVisible").onchange = (e) => {
      doc.knobs[key] = { ...doc.knobs[key], hidden: !e.target.checked };
      refreshSheet();
      recordHistory();
    };
    for (const [id, prop] of [
      ["knobColor", "color"],
      ["knobLength", "length"],
    ]) {
      const input = $("#" + id);
      if (input)
        input.oninput = () => {
          doc.knobs[key] = {
            ...doc.knobs[key],
            [prop]:
              prop === "length" ? clamp(input.value, 10, maximum) : input.value,
          };
          refreshSheet();
          if (prop === "length")
            $("#knobLengthValue").textContent = doc.knobs[key].length + " px";
          scheduleHistory();
        };
    }
    $("#resetKnobColor").onclick = () => {
      if (doc.knobs[key]) delete doc.knobs[key].color;
      refreshSheet();
      renderSelection();
      recordHistory();
    };
  }
  function renderComponentSelection(doc, host, id) {
    const b = doc.blocks.find((b) => b.id === id);
    if (!b) return;
    const section = document.createElement("section");
    section.className = "property-section";
    section.innerHTML =
      "<h3>组件位置</h3>" +
      field(
        "位置",
        '<select id="componentSlot"><option value="full">整行</option><option value="left">左列</option><option value="right">右列</option></select>',
      ) +
      (b.type === "checks"
        ? field("选项数量", numberField("optionCount", b.options ?? 3, 1, 24)) +
          '<button id="addCheckOption">' +
          icon("plus") +
          "添加选项</button>"
        : "") +
      '<div class="property-actions component-controls"><button data-move="-1" data-block="' +
      id +
      '" aria-label="上移组件">' +
      icon("chevron-up") +
      '</button><button data-move="1" data-block="' +
      id +
      '" aria-label="下移组件">' +
      icon("chevron-down") +
      '</button><button data-delete-block="' +
      id +
      '" aria-label="删除组件">' +
      icon("trash-2") +
      "</button></div>";
    host.append(section);
    $("#componentSlot").value = blockSlot(doc, b);
    $("#componentSlot").onchange = (e) => {
      b.slot = e.target.value;
      refreshSheet();
      renderSelection();
      recordHistory();
    };
    const count = $("#optionCount");
    if (count)
      count.onchange = () => {
        b.options = Math.round(clamp(count.value, 1, 24));
        refreshSheet();
        renderSelection();
        recordHistory();
      };
    const add = $("#addCheckOption");
    if (add) {
      add.disabled = b.options >= 24;
      add.onclick = () => {
        b.options = Math.min(24, (b.options ?? 3) + 1);
        refreshSheet();
        renderSelection();
        recordHistory();
      };
    }
  }
  function addCompatComponent(type) {
    const doc = current(),
      id = uid(),
      parent =
        selected?.element?.closest("[data-component]")?.dataset.component ||
        selected?.id,
      index = doc.blocks.findIndex((b) => b.id === parent),
      block = { id, type, options: 3 };
    if (type === "text") block.slot = "full";
    else if (index >= 0) block.slot = blockSlot(doc, doc.blocks[index]);
    doc.blocks.splice(index >= 0 ? index + 1 : doc.blocks.length, 0, block);
    if (type === "text")
      doc.texts[id + "-text"] = { html: "文字", preset: "title2" };
    selected = { type: "component", id };
    render();
    recordHistory();
    if (type === "text") {
      $('[data-text="' + id + '-text"]', sheet).focus();
    }
  }
  function renderRankAlignment(doc, host) {
    const picture = doc.rankPictures.find((p) => p.id === selected.key),
      parts = selected.key.split("-"),
      row = picture?.row ?? Number(parts[1]),
      col = picture?.col ?? Number(parts[2]);
    if (!Number.isFinite(row) || !Number.isFinite(col)) return;
    const key = row + "-" + col,
      section = document.createElement("section");
    section.className = "property-section";
    section.innerHTML =
      '<h3>图片对齐</h3><div class="property-actions">' +
      ["left", "center", "right"]
        .map(
          (align, i) =>
            '<button data-picture-align="' +
            align +
            '" aria-label="' +
            ["左对齐", "居中", "右对齐"][i] +
            '" aria-pressed="' +
            ((doc.rankAlign[key] || "left") === align) +
            '">' +
            icon("align-" + align) +
            "</button>",
        )
        .join("") +
      "</div>" +
      (picture ? '<button id="fitPictureHeight">适应行高</button>' : "");
    host.append(section);
    $$("[data-picture-align]", section).forEach(
      (button) =>
        (button.onclick = () => {
          doc.rankAlign[key] = button.dataset.pictureAlign;
          fitRankPictures(doc);
          refreshSheet();
          renderSelection();
          recordHistory();
        }),
    );
    const fit = $("#fitPictureHeight");
    if (fit)
      fit.onclick = () => {
        picture.manualWidth = false;
        fitRankPictures(doc);
        refreshSheet();
        renderSelection();
        recordHistory();
      };
    const width = $("#pictureWidth");
    if (width)
      width.onchange = () => {
        picture.manualWidth = true;
        picture.width = clamp(width.value, 24, doc.rankWidths[col + 1]);
        fitRankPictures(doc);
        refreshSheet();
        renderSelection();
        recordHistory();
      };
  }
  function renderPictureSelection(doc, host) {
    const picture = doc.rankPictures.find((p) => p.id === selected.key);
    if (!picture) return;
    host.innerHTML =
      '<section class="property-section"><h3>行内图片</h3>' +
      field(
        "图片宽度",
        numberField(
          "pictureWidth",
          Math.round(picture.width),
          24,
          doc.rankWidths[picture.col + 1] - 12,
        ),
      ) +
      field(
        "垂直位置",
        '<select id="pictureBoundary"><option value="center">行内居中</option><option value="boundary">中线吸附下方分隔线</option></select>',
      ) +
      '<div class="property-actions"><button id="replacePicture">' +
      icon("image-plus") +
      '替换</button><button id="deletePicture">' +
      icon("trash-2") +
      "删除</button></div></section>";
    $("#pictureBoundary").value = picture.boundary ? "boundary" : "center";
    $("#pictureWidth").onchange = (e) => {
      picture.width = clamp(
        e.target.value,
        24,
        doc.rankWidths[picture.col + 1] - 12,
      );
      fitRankPictures(doc);
      refreshSheet();
      renderSelection();
      recordHistory();
    };
    $("#pictureBoundary").onchange = (e) => {
      picture.boundary =
        e.target.value === "boundary" && picture.row < doc.rows - 1;
      fitRankPictures(doc);
      refreshSheet();
      recordHistory();
    };
    $("#replacePicture").onclick = () => chooseImage("", picture.id);
    $("#deletePicture").onclick = () => {
      doc.rankPictures = doc.rankPictures.filter((p) => p.id !== picture.id);
      selected = null;
      refreshSheet();
      renderSelection();
      recordHistory();
    };
  }
  function addTextBox(frame = null) {
    const doc = current(),
      attached = Object.keys(doc.textBoxes).filter(
        (id) => doc.textBoxes[id].frame === frame && frame,
      );
    if (frame && attached.length >= 2) {
      notify("每个图片框最多放两个文字区");
      return;
    }
    flushHistory();
    let key = frame ? "frame-" + frame : uid();
    if (doc.textBoxes[key]) key = uid();
    doc.texts[key] = { html: "文字", preset: "body" };
    doc.textBoxes[key] = {
      frame,
      placement: frame ? "inside" : "layout-bottom",
      x: doc.paperWidth * 0.25,
      y: 140,
      width: Math.min(240, doc.paperWidth - 96),
    };
    doc.extras.push(key);
    selected = null;
    refreshSheet();
    recordHistory();
    const el = $('[data-text="' + key + '"]', sheet);
    el.focus();
    setSelected({ type: "text", key, element: el });
    const range = document.createRange();
    range.selectNodeContents(el);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    savedRange = range.cloneRange();
  }
  function paperRect(el) {
    const root = sheet.getBoundingClientRect(),
      r = el.getBoundingClientRect(),
      scale = root.width / sheet.offsetWidth;
    return {
      x: (r.left - root.left) / scale,
      y: (r.top - root.top) / scale,
      width: r.width / scale,
      height: r.height / scale,
    };
  }

  function changeBlock(event) {
    const remove = event.target.closest("[data-delete-block]"),
      move = event.target.closest("[data-move]"),
      doc = current();
    if (remove) {
      doc.blocks = doc.blocks.filter(
        (b) => b.id !== remove.dataset.deleteBlock,
      );
      selected = null;
      render();
      recordHistory();
      return true;
    }
    if (move) {
      const i = doc.blocks.findIndex((b) => b.id === move.dataset.block),
        j = i + Number(move.dataset.move);
      if (j >= 0 && j < doc.blocks.length) {
        [doc.blocks[i], doc.blocks[j]] = [doc.blocks[j], doc.blocks[i]];
        selected = null;
        render();
        recordHistory();
      }
      return true;
    }
    return false;
  }
  $("#selectionProperties").addEventListener("click", changeBlock);

  // Only text and inline formatting enter the document model.
  function sanitize(html) {
    const template = document.createElement("template");
    template.innerHTML = html;
    function clean(node) {
      if (node.nodeType === 3) return document.createTextNode(node.textContent);
      if (node.nodeType !== 1) return document.createTextNode("");
      if (node.tagName === "BR") return document.createElement("br");
      if (["SCRIPT", "STYLE", "IFRAME", "OBJECT"].includes(node.tagName))
        return document.createTextNode("");
      // Native Enter creates blocks; flattening them moves or removes line breaks.
      const element = document.createElement(
        ["DIV", "P"].includes(node.tagName) ? "div" : "span",
      );
      ["color", "fontWeight", "fontSize"].forEach((prop) => {
        if (node.style[prop]) element.style[prop] = node.style[prop];
      });
      if (["B", "STRONG"].includes(node.tagName))
        element.style.fontWeight = "700";
      for (const child of node.childNodes) element.append(clean(child));
      return element;
    }
    const container = document.createElement("div");
    for (const child of template.content.childNodes)
      container.append(clean(child));
    return container.innerHTML;
  }
  function saveText(el) {
    const key = el.dataset.text,
      existing = current().texts[key] || {};
    current().texts[key] = {
      ...existing,
      html: sanitize(el.innerHTML),
      align: el.style.textAlign || existing.align,
      color: el.style.color || existing.color,
      fontSize: parseFloat(el.style.fontSize) || existing.fontSize,
      weight: el.style.fontWeight || existing.weight,
    };
    const legend = current().legends.find(
      (item) => key === "legend-" + item.id,
    );
    if (legend) {
      legend.name = el.textContent;
      const input = $('[data-legend-name="' + legend.id + '"]'),
        option = $('#edgeLegend option[value="' + legend.id + '"]');
      if (input) input.value = legend.name;
      if (option) option.textContent = legend.name;
    }
  }
  document.addEventListener("selectionchange", () => {
    const selection = window.getSelection();
    if (!selection?.rangeCount || active === null || colorEdit) return;
    const range = selection.getRangeAt(0),
      parent =
        range.commonAncestorContainer.nodeType === 1
          ? range.commonAncestorContainer
          : range.commonAncestorContainer.parentElement,
      editor = parent?.closest("[data-text]");
    if (
      editor &&
      sheet.contains(editor) &&
      editor.contains(document.activeElement)
    ) {
      savedRange = range.cloneRange();
      if (selected?.key !== editor.dataset.text)
        setSelected({
          type: "text",
          key: editor.dataset.text,
          element: editor,
        });
      syncFontSize();
    }
  });
  function clearInlineStyles(el, properties) {
    $$("[style]", el).forEach((node) =>
      properties.forEach((prop) => (node.style[prop] = "")),
    );
  }
  function syncFontSize() {
    const input = $("#fontSize"),
      el = selected?.element;
    if (!input || selected.type !== "text" || document.activeElement === input)
      return;
    let node = el;
    if (savedRange && el.contains(savedRange.startContainer)) {
      node = savedRange.startContainer;
      if (node.nodeType === 1)
        node =
          node.childNodes[savedRange.startOffset] ||
          node.childNodes[savedRange.startOffset - 1] ||
          node;
      while (node.firstChild) node = node.firstChild;
      if (node.nodeType !== 1) node = node.parentElement;
    }
    input.value = parseFloat(getComputedStyle(node).fontSize);
  }
  function bindFontSize() {
    const input = $("#fontSize");
    let applied = null;
    syncFontSize();
    input.oninput = () => {
      const size = Number(input.value);
      if (!input.value || !Number.isFinite(size) || size < 10 || size > 96)
        return;
      formatSelection({ fontSize: size + "px" });
      applied = size;
    };
    input.onchange = () => {
      const size = clamp(input.value, 10, 96);
      input.value = size;
      if (size !== applied) formatSelection({ fontSize: size + "px" });
      applied = size;
    };
  }
  function formatSelection(style) {
    if (selected?.type !== "text" || !sheet.contains(selected.element)) {
      notify("请先选择画布中的文字");
      return;
    }
    const el = selected.element,
      properties = Object.keys(style);
    if (
      savedRange &&
      !savedRange.collapsed &&
      el.contains(savedRange.commonAncestorContainer)
    ) {
      const editing = el.contains(document.activeElement),
        bookmark = textRangeBookmark(el, savedRange),
        walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT),
        parts = [];
      let offset = 0;
      // Style text leaves independently: extracting a cross-line range splits its blocks.
      while (walker.nextNode()) {
        const node = walker.currentNode,
          start = Math.max(0, bookmark.start - offset),
          end = Math.min(node.length, bookmark.end - offset);
        if (end > start) parts.push({ node, start, end });
        offset += node.length;
      }
      for (const { node, start, end } of parts) {
        if (end < node.length) node.splitText(end);
        const part = start ? node.splitText(start) : node,
          parent = part.parentElement;
        if (parent.tagName === "SPAN" && parent.childNodes.length === 1)
          Object.assign(parent.style, style);
        else {
          const span = document.createElement("span");
          Object.assign(span.style, style);
          part.before(span);
          span.append(part);
        }
      }
      const range = bookmarkedRange(el, bookmark);
      savedRange = range.cloneRange();
      // Keep keyboard focus in the size/color control while preserving the text range.
      if (editing) {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    } else {
      clearInlineStyles(el, properties);
      Object.assign(el.style, style);
    }
    saveText(el);
    fitSheet();
    recordHistory();
  }
  function textRangeBookmark(el, range) {
    const prefix = document.createRange();
    prefix.selectNodeContents(el);
    prefix.setEnd(range.startContainer, range.startOffset);
    const start = prefix.toString().length;
    prefix.setEnd(range.endContainer, range.endOffset);
    return { start, end: prefix.toString().length };
  }
  function bookmarkedRange(el, bookmark) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT),
      nodes = [];
    let length = 0;
    while (walker.nextNode()) {
      const node = walker.currentNode;
      nodes.push({ node, start: length, end: length + node.length });
      length += node.length;
    }
    if (bookmark.end > length) return null;
    const range = document.createRange(),
      point = (offset) => {
        const item = nodes.find((n) => offset >= n.start && offset <= n.end);
        return item ? [item.node, offset - item.start] : [el, 0];
      };
    range.setStart(...point(bookmark.start));
    range.setEnd(...point(bookmark.end));
    return range;
  }
  function beginTextColor() {
    if (selected?.type !== "text" || !sheet.contains(selected.element)) return;
    if (colorEdit?.key === selected.key) return;
    const el = selected.element,
      selection = window.getSelection(),
      live = selection?.rangeCount ? selection.getRangeAt(0) : null,
      valid = (r) =>
        r && el.contains(r.startContainer) && el.contains(r.endContainer);
    const range =
      valid(live) && !live.collapsed
        ? live
        : valid(savedRange)
          ? savedRange
          : valid(live)
            ? live
            : null;
    if (!range) return;
    colorEdit = {
      key: selected.key,
      text: el.textContent,
      ...textRangeBookmark(el, range),
    };
  }
  function applyTextColor(event) {
    beginTextColor();
    const el = selected?.element;
    if (
      !colorEdit ||
      selected?.type !== "text" ||
      selected.key !== colorEdit.key ||
      el.textContent !== colorEdit.text
    ) {
      notify("请先选择需要改色的文字");
      return;
    }
    if (colorEdit.color === event.target.value) return;
    const range = bookmarkedRange(el, colorEdit);
    if (!range) {
      notify("请重新选择需要改色的文字");
      return;
    }
    savedRange = range;
    formatSelection({ color: event.target.value });
    colorEdit.color = event.target.value;
  }
  // Native color dialogs can collapse selection; character offsets survive focus and span changes.
  const textColor = $("#textColor"),
    colorTool = textColor.closest(".color-tool");
  colorTool.addEventListener("pointerdown", beginTextColor, true);
  textColor.addEventListener("focus", beginTextColor);
  textColor.oninput = applyTextColor;
  textColor.onchange = applyTextColor;
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (!colorTool.contains(event.target)) colorEdit = null;
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.target !== textColor ||
        event.key === "Tab" ||
        event.key === "Escape"
      )
        colorEdit = null;
    },
    true,
  );
  $("#boldButton").onpointerdown = (e) => e.preventDefault();
  $("#boldButton").onclick = () => {
    const node = savedRange?.startContainer,
      el = node?.nodeType === 1 ? node : node?.parentElement;
    const weight = el ? Number(getComputedStyle(el).fontWeight) : 400;
    formatSelection({ fontWeight: weight >= 600 ? "400" : "700" });
  };
  $("#textStyle").onchange = (e) => {
    if (selected?.type !== "text") {
      notify("请先选择画布中的文字");
      return;
    }
    const el = selected.element;
    el.classList.remove("text-title1", "text-title2", "text-body");
    el.classList.add("text-" + e.target.value);
    clearInlineStyles(el, ["fontSize", "fontWeight"]);
    el.style.fontSize = "";
    el.style.fontWeight = "";
    el.dataset.preset = e.target.value;
    saveText(el);
    current().texts[selected.key].preset = e.target.value;
    delete current().texts[selected.key].fontSize;
    delete current().texts[selected.key].weight;
    fitSheet();
    recordHistory();
    renderSelection();
  };
  $$("[data-align]").forEach((button) => {
    button.onpointerdown = (e) => e.preventDefault();
    button.onclick = () => {
      if (selected?.type === "text") {
        selected.element.style.textAlign = button.dataset.align;
        saveText(selected.element);
        recordHistory();
      }
    };
  });
  $("#addText").onclick = () =>
    active === 3 && selected?.type !== "image"
      ? addCompatComponent("text")
      : addTextBox(selected?.type === "image" ? selected.key : null);
  sheet.addEventListener("focusin", (event) => {
    const el = event.target.closest("[data-text]");
    if (el) setSelected({ type: "text", key: el.dataset.text, element: el });
  });
  sheet.addEventListener("input", (event) => {
    const el = event.target.closest("[data-text]");
    if (el) {
      saveText(el);
      fitSheet();
      scheduleHistory();
    }
    const scale = event.target.closest("[data-scale]");
    if (scale) {
      current().values[scale.dataset.scale] = Number(scale.value);
      positionKnob(scale.parentElement, Number(scale.value));
      scheduleHistory();
    }
  });
  sheet.addEventListener("paste", (event) => {
    if (!event.target.closest("[data-text]")) return;
    event.preventDefault();
    const text = event.clipboardData.getData("text/plain"),
      selection = window.getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const node = document.createTextNode(text);
    range.insertNode(node);
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    saveText(event.target.closest("[data-text]"));
    fitSheet();
    scheduleHistory();
  });
  sheet.addEventListener("click", (event) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (changeBlock(event)) return;
    const doc = current(),
      image = event.target.closest("[data-image]"),
      check = event.target.closest("[data-check]"),
      edge = event.target.closest("[data-edge]"),
      legend = event.target.closest("[data-legend-id]"),
      picture = event.target.closest("[data-picture]");
    const chart = event.target.closest("[data-quadrant]");
    if (chart && !event.target.closest("[data-text]")) {
      const b = doc.blocks.find((b) => b.id === chart.dataset.quadrant),
        dot = event.target.closest("[data-dot]");
      flushHistory();
      b.points ??= [];
      if (dot) {
        const p = b.points.find((p) => p.id === dot.dataset.dot);
        if (p.theme >= doc.people - 1)
          b.points = b.points.filter((p) => p.id !== dot.dataset.dot);
        else p.theme++;
      } else {
        const r = chart.getBoundingClientRect();
        b.points.push({
          id: uid(),
          x: clamp(((event.clientX - r.left) / r.width) * 100, 3, 97),
          y: clamp(((event.clientY - r.top) / r.height) * 100, 3, 97),
          theme: 0,
        });
      }
      selected = { type: "component", id: b.id };
      refreshSheet();
      renderSelection();
      recordHistory();
      return;
    }
    const scale = event.target.closest("[data-scale]");
    if (scale) {
      const key = scale.dataset.scale;
      setSelected({
        type: "knob",
        key,
        element: $('[data-knob="' + key + '"]', sheet),
      });
      return;
    }
    if (picture) {
      setSelected({
        type: "picture",
        key: picture.dataset.picture,
        element: picture,
      });
      return;
    }
    if (check) {
      const key = check.dataset.check,
        palette = checkPalette(doc, Number(check.dataset.person)),
        index = palette.findIndex((c) => c.id === doc.checks[key]);
      doc.checks[key] =
        index === palette.length - 1 ? null : palette[index + 1].id;
      selected = {
        type: "component",
        id: check.closest("[data-component]").dataset.component,
      };
      refreshSheet();
      renderSelection();
      recordHistory();
      return;
    }
    const knob = event.target.closest("[data-knob]");
    if (knob) {
      setSelected({ type: "knob", key: knob.dataset.knob, element: knob });
      return;
    }
    if (legend) {
      activeLegendId = legend.dataset.legendId;
      $$(".legend-dot", sheet).forEach((e) =>
        e.classList.toggle("selected", e === legend),
      );
      return;
    }
    if (edge) {
      setSelected({
        type: "edge",
        index: Number(edge.dataset.edge),
        element: edge,
      });
      return;
    }
    if (image) {
      const key = image.dataset.image;
      if (linkMode && key.startsWith("node-")) {
        const node = Number(key.split("-")[1]);
        if (linkStart === null) {
          linkStart = node;
          image.closest(".relation-node").classList.add("link-start");
          notify("请选择第二个头像");
        } else if (node !== linkStart) {
          doc.edges.push({
            from: linkStart,
            to: node,
            legendId:
              doc.legends.find((l) => l.id === activeLegendId)?.id ||
              doc.legends[0]?.id ||
              "",
            width: 3,
            bend: 0,
            startStyle: "none",
            endStyle: "none",
          });
          setLinkMode(false);
          selected = { type: "edge", index: doc.edges.length - 1 };
          refreshSheet();
          renderSelection();
          recordHistory();
        }
        return;
      }
      setSelected({ type: "image", key, element: image });
      return;
    }
    const fill = event.target.closest(".rank-tag");
    if (fill && !event.target.closest("[data-text]")) {
      setSelected({ type: "fill", key: fill.dataset.fill, element: fill });
      return;
    }
    const component = event.target.closest("[data-component]");
    if (component && !event.target.closest("[data-text]"))
      setSelected({ type: "component", id: component.dataset.component });
    if (linkMode && !event.target.closest('[data-text], [data-component], button, input, select, [data-drag-text]'))
      setLinkMode(false);
  });
  function setLinkMode(enabled) {
    linkMode = enabled;
    linkStart = null;
    const button = $("#linkMode");
    button.classList.toggle("active", linkMode);
    button.setAttribute("aria-pressed", String(linkMode));
    button.innerHTML = icon("move-up-right") + (linkMode ? "连线中" : "连线");
    $$(".link-start", sheet).forEach((e) => e.classList.remove("link-start"));
    if (!linkMode && $("#toast").textContent === "请选择第二个头像") {
      clearTimeout(toastTimer);
      $("#toast").hidden = true;
    }
    icons();
  }
  $("#linkMode").onclick = () => setLinkMode(!linkMode);
  $("#canvasViewport").addEventListener("click", (event) => {
    if (linkMode && (event.target === event.currentTarget || event.target === $("#sheetFrame")))
      setLinkMode(false);
  });
  function dragSession(event, move, finish) {
    event.preventDefault();
    const start = { x: event.clientX, y: event.clientY };
    let moved = false;
    sheet.setPointerCapture(event.pointerId);
    const onMove = (e) => {
      if (e.pointerId !== event.pointerId) return;
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 3)
        moved = true;
      move(e);
    };
    const end = (e) => {
      if (e.pointerId !== event.pointerId) return;
      sheet.removeEventListener("pointermove", onMove);
      sheet.removeEventListener("pointerup", end);
      sheet.removeEventListener("pointercancel", end);
      if (sheet.hasPointerCapture(e.pointerId))
        sheet.releasePointerCapture(e.pointerId);
      suppressClick = moved;
      finish(e, moved);
      setTimeout(() => (suppressClick = false), 0);
    };
    sheet.addEventListener("pointermove", onMove);
    sheet.addEventListener("pointerup", end);
    sheet.addEventListener("pointercancel", end);
  }
  sheet.addEventListener("pointerdown", (event) => {
    const frameResize = event.target.closest("[data-resize-frame]");
    if (frameResize) {
      startFrameResize(event, frameResize.dataset.resizeFrame);
      return;
    }
    const blockGrip = event.target.closest("[data-drag-block]"),
      knob = event.target.closest("[data-knob]"),
      edge = event.target.closest("[data-edge]");
    if (blockGrip) {
      startBlockDrag(event, blockGrip.dataset.dragBlock);
      return;
    }
    if (knob) {
      startKnobDrag(event, knob);
      return;
    }
    const scaleInput = event.target.closest("[data-scale]");
    if (scaleInput) {
      startKnobDrag(event, $("[data-knob]", scaleInput.parentElement), true);
      return;
    }
    if (edge) {
      if (selectedEdgeIndex() !== Number(edge.dataset.edge)) {
        setSelected({
          type: "edge",
          index: Number(edge.dataset.edge),
          element: edge,
        });
        return;
      }
      if (event.target.closest("[data-edge-handle]")) startEdgeDrag(event, edge);
      return;
    }
    const resize = event.target.closest("[data-resize]"),
      grip = event.target.closest("[data-drag-text]"),
      picture = event.target.closest("[data-picture]");
    if (resize) {
      flushHistory();
      const doc = current(),
        before = structuredClone(doc),
        kind = resize.dataset.resize,
        index = Number(resize.dataset.resizeIndex),
        x = event.clientX,
        y = event.clientY,
        scale = sheet.getBoundingClientRect().width / sheet.offsetWidth,
        g = rankGeometry(doc);
      dragSession(
        event,
        (e) => {
          const dx = (e.clientX - x) / scale,
            dy = (e.clientY - y) / scale;
          if (kind === "row") {
            const total =
              before.rowHeights[index] + before.rowHeights[index + 1];
            doc.rowHeights[index] = clamp(
              before.rowHeights[index] + dy,
              Math.max(80, total - 500),
              Math.min(500, total - 80),
            );
            doc.rowHeights[index + 1] = total - doc.rowHeights[index];
          } else if (kind === "col") {
            const total =
              before.rankWidths[index] + before.rankWidths[index + 1];
            doc.rankWidths[index] = clamp(
              before.rankWidths[index] + dx,
              index === 0 ? 56 : 96,
              total - 96,
            );
            doc.rankWidths[index + 1] = total - doc.rankWidths[index];
          } else {
            if (kind === "width" || kind === "both") {
              doc.rankWidths = [...before.rankWidths];
              resizeRank(doc, "width", g.width + dx);
            }
            if (kind === "height" || kind === "both") {
              doc.rowHeights = [...before.rowHeights];
              resizeRank(doc, "height", g.height + dy);
            }
          }
          fitRankPictures(doc);
          refreshSheet();
        },
        () => {
          renderProperties();
          recordHistory();
        },
      );
      return;
    }
    if (grip) {
      startTextDrag(event, grip.dataset.dragText);
      return;
    }
    if (picture) {
      startPictureDrag(event, picture);
    }
  });
  function startFrameResize(event, key) {
    const doc = current(),
      wrapper = $('[data-compat-image="' + key + '"]', sheet),
      frame = $('[data-image="' + key + '"]', wrapper),
      component = wrapper.closest("[data-component]"),
      b = doc.blocks.find((b) => b.id === component.dataset.component),
      slot = blockSlot(doc, b),
      single = doc.people === 1;
    const scale = sheet.getBoundingClientRect().width / sheet.offsetWidth,
      bodyWidth = $(".compat-body", sheet).clientWidth,
      column = (bodyWidth - 34) / 2,
      parentWidth = wrapper.parentElement.clientWidth,
      origin = { width: frame.offsetWidth, height: frame.offsetHeight },
      start = { x: event.clientX, y: event.clientY };
    let width = origin.width,
      height = origin.height;
    const frameRect = frame.getBoundingClientRect(),
      neighbors = single
        ? []
        : $$(".compat-image [data-image]", sheet)
            .filter((el) => el !== frame)
            .map((el) => ({ el, r: el.getBoundingClientRect() }))
            .filter(
              ({ r }) =>
                Math.min(r.bottom, frameRect.bottom) >
                  Math.max(r.top, frameRect.top) &&
                Math.min(r.right, frameRect.right) <=
                  Math.max(r.left, frameRect.left) + 2,
            );
    flushHistory();
    dragSession(
      event,
      (e) => {
        width = clamp(
          origin.width + (e.clientX - start.x) / scale,
          80,
          single ? bodyWidth : parentWidth,
        );
        height = clamp(origin.height + (e.clientY - start.y) / scale, 60, 900);
        $$(".bottom-snap", sheet).forEach((el) =>
          el.classList.remove("bottom-snap"),
        );
        const candidate = neighbors
          .map(({ el, r }) => ({
            el,
            height: (r.bottom - frameRect.top) / scale,
          }))
          .filter((item) => item.height >= 60 && item.height <= 900)
          .sort(
            (a, b) => Math.abs(a.height - height) - Math.abs(b.height - height),
          )[0];
        if (candidate && Math.abs(candidate.height - height) <= 12) {
          height = candidate.height;
          frame.closest(".image-frame").classList.add("bottom-snap");
          candidate.el.closest(".image-frame").classList.add("bottom-snap");
        }
        wrapper.style.maxWidth = "none";
        wrapper.style.width = width + "px";
        wrapper.style.setProperty("--frame-height", height + "px");
        component.classList.toggle("frame-snap", Math.abs(width - column) < 24);
        fitSheet();
      },
      (e, moved) => {
        if (moved && e.type !== "pointercancel") {
          let available = parentWidth;
          if (!single && Math.abs(width - parentWidth) < 24)
            width = parentWidth;
          if (single) {
            b.slot =
              width > column + 24
                ? "full"
                : slot === "right"
                  ? "right"
                  : "left";
            available = b.slot === "full" ? bodyWidth : column;
            if (Math.abs(width - column) < 24) width = column;
            doc.widgetsMoved = true;
          }
          doc.images[key] = {
            ...doc.images[key],
            width: Math.min(100, (width / available) * 100),
            height,
          };
        }
        selected = { type: "image", key };
        refreshSheet();
        renderSelection();
        recordHistory();
      },
    );
  }
  function startBlockDrag(event, id) {
    const doc = current(),
      source = $('[data-component="' + id + '"]', sheet);
    flushHistory();
    const initial = JSON.parse(JSON.stringify(doc)), positions = widgetPositions(sheet),
      body = paperRect($(".compat-body", sheet)), origin = positions[id],
      scale = sheet.getBoundingClientRect().width / sheet.offsetWidth,
      start = { x: event.clientX, y: event.clientY }, cache = new Map();
    const preview = document.createElement("div");
    preview.className = "widget-insertion-preview";
    preview.dataset.html2canvasIgnore = "";
    preview.hidden = true;
    sheet.append(preview);
    let beforeId = null, slot = blockSlot(doc, doc.blocks.find(b => b.id === id)), ready = false;
    source.classList.add("widget-dragging");
    dragSession(
      event,
      (e) => {
        const root = sheet.getBoundingClientRect(),
          x = (e.clientX - root.left) / scale, y = (e.clientY - root.top) / scale,
          fraction = (x - body.x) / body.width;
        const ghostX = clamp(origin.x + (e.clientX - start.x) / scale, body.x, body.x + body.width - origin.width);
        source.style.translate = (ghostX - origin.x) + "px " + (e.clientY - start.y) / scale + "px";
        slot = fraction < 0.34 ? "left" : fraction > 0.66 ? "right" : "full";
        const rest = initial.blocks.filter(b => b.id !== id);
        const candidates = rest.map((b, index) => {
          const r = positions[b.id], dx = Math.max(r.x - x, 0, x - r.x - r.width),
            after = y > r.y + r.height / 2;
          return { index: index + (after ? 1 : 0), distance: dx * dx + Math.min(Math.abs(y - r.y), Math.abs(y - r.y - r.height)) ** 2 };
        });
        const nearest = candidates.sort((a, b) => a.distance - b.distance)[0];
        beforeId = rest[nearest?.index ?? rest.length]?.id || null;
        const token = beforeId + ":" + slot;
        if (!cache.has(token)) {
          const candidate = JSON.parse(JSON.stringify(initial)), block = candidate.blocks.find(b => b.id === id);
          candidate.blocks = candidate.blocks.filter(b => b.id !== id);
          block.slot = slot;
          candidate.blocks.splice(beforeId ? candidate.blocks.findIndex(b => b.id === beforeId) : candidate.blocks.length, 0, block);
          candidate.widgetsMoved = true;
          cache.set(token, measureDropLayout(candidate, null, id));
        }
        const result = cache.get(token);
        preview.hidden = false;
        Object.assign(preview.style, { left: result.x + "px", top: result.y + "px", width: result.width + "px", height: result.height + "px" });
        showWidgetReflow(positions, result.widgets, id);
        ready = true;
      },
      (e, moved) => {
        preview.remove();
        clearWidgetReflow();
        if (moved && ready && e.type !== "pointercancel") {
          const from = doc.blocks.findIndex((b) => b.id === id),
            [block] = doc.blocks.splice(from, 1),
            at = beforeId
              ? doc.blocks.findIndex((b) => b.id === beforeId)
              : doc.blocks.length;
          block.slot = slot;
          doc.blocks.splice(Math.max(0, at), 0, block);
          doc.widgetsMoved = true;
        }
        selected = { type: "component", id };
        refreshSheet();
        renderSelection();
        recordHistory();
      },
    );
  }
  function knobBounds(control) {
    const knob = $("[data-knob]", control),
      width = control.clientWidth;
    const inset = knob.classList.contains("knob-rectangle")
      ? Math.min(
          parseFloat(knob.style.getPropertyValue("--knob-length")) || 28,
          width,
        ) /
          2 -
        3
      : 0;
    return { inset, travel: Math.max(1, width - 2 * inset) };
  }
  function positionKnob(control, value) {
    const knob = $("[data-knob]", control),
      { inset } = knobBounds(control);
    knob.style.left = inset
      ? "calc(" + value + "% + " + inset * (1 - (2 * value) / 100) + "px)"
      : value + "%";
  }
  function startKnobDrag(event, knob, fromTrack = false) {
    const doc = current(),
      key = knob.dataset.knob,
      control = knob.closest(".scale-control"),
      bounds = control.getBoundingClientRect(),
      before = doc.values[key] ?? 50,
      { inset, travel } = knobBounds(control),
      scale = bounds.width / control.clientWidth;
    const grabOffset = fromTrack
      ? 0
      : (event.clientX - bounds.left) / scale -
        (inset + (before / 100) * travel);
    flushHistory();
    const move = (e) => {
      doc.values[key] = Math.max(
        0,
        Math.min(
          100,
          Math.round(
            (((e.clientX - bounds.left) / scale - grabOffset - inset) /
              travel) *
              100,
          ),
        ),
      );
      positionKnob(control, doc.values[key]);
      $("[data-scale]", control).value = doc.values[key];
    };
    if (fromTrack) move(event);
    dragSession(event, move, (e, moved) => {
      if ((!moved && !fromTrack) || e.type === "pointercancel")
        doc.values[key] = before;
      selected = { type: "knob", key };
      refreshSheet();
      renderSelection();
      recordHistory();
    });
  }
  function startEdgeDrag(event, element) {
    const handle = event.target.closest("[data-edge-handle]")?.dataset.edgeHandle;
    if (handle !== "start" && handle !== "end") return;
    const doc = current(),
      index = Number(element.dataset.edge),
      edge = doc.edges[index],
      before = structuredClone(edge),
      map = $(".relation-map", sheet).getBoundingClientRect(),
      bounds = relationGeometry(doc.nodeCount),
      scale = map.width / bounds.width;
    flushHistory();
    dragSession(
      event,
      (e) => {
        const p = {
          x: Math.max(
            0,
            Math.min(bounds.width, (e.clientX - map.left) / scale),
          ),
          y: Math.max(
            0,
            Math.min(bounds.height, (e.clientY - map.top) / scale),
          ),
        };
        if (handle === "start" || handle === "end") {
          const end = handle === "start" ? "from" : "to",
            other = handle === "start" ? "to" : "from",
            nearest = doc.participants.map((participant, i) => ({
              i: participant.id,
              p: nodePosition(i, doc.nodeCount),
            })).find(
              (node) =>
                node.i !== edge[other] &&
                Math.hypot(node.p.x - p.x, node.p.y - p.y) <
                  nodeSize(doc) / 2 + 18,
            );
          edge[end] = nearest ? nearest.i : null;
          edge[handle === "start" ? "startPoint" : "endPoint"] = p;
        }
        refreshSheet();
      },
      (e, moved) => {
        if (!moved || e.type === "pointercancel") doc.edges[index] = before;
        refreshSheet();
        renderSelection();
        recordHistory();
      },
    );
  }
  function measureTextDrop(source, key, destination, bounds) {
    const doc = JSON.parse(JSON.stringify(source));
    bindParticipants(doc);
    if (destination.frame) {
      const used = Object.keys(doc.textBoxes).filter(id => id !== key && doc.textBoxes[id].frame === destination.frame);
      if (used.length >= 2) return null;
      const block = textComponent(doc, key);
      if (block) doc.blocks = doc.blocks.filter(item => item !== block);
      doc.textBoxes[key] = { ...doc.textBoxes[key], ...destination };
    } else applyTextPlacement(doc, key, destination.placement, bounds);
    return measureDropLayout(doc, key);
  }
  function widgetPositions(target) {
    const root = target.getBoundingClientRect(), scale = root.width / target.offsetWidth;
    return Object.fromEntries($$("[data-component]", target).map(el => {
      const r = el.getBoundingClientRect();
      return [el.dataset.component, { x: (r.x - root.x) / scale, y: (r.y - root.y) / scale, width: r.width / scale, height: r.height / scale }];
    }));
  }
  function clearWidgetReflow() {
    $$(".widget-reflow", sheet).forEach(el => {
      el.classList.remove("widget-reflow");
      el.style.removeProperty("translate");
    });
  }
  function showWidgetReflow(before, after, excludedId) {
    for (const [id, next] of Object.entries(after || {})) {
      const prior = before[id], el = $('[data-component="' + id + '"]', sheet);
      if (!prior || !el || id === excludedId) continue;
      el.classList.add("widget-reflow");
      el.style.translate = (next.x - prior.x) + "px " + (next.y - prior.y) + "px";
    }
  }
  function measureDropLayout(doc, key, componentId = null) {
    // Measure the same layout used on drop, once per destination during a drag.
    const probe = document.createElement("div");
    probe.className = "sheet text-snap-measure";
    probe.setAttribute("aria-hidden", "true");
    probe.inert = true;
    document.body.append(probe);
    try {
      renderSheet(doc, probe);
      const text = componentId ? $('[data-component="' + componentId + '"]', probe) : $('[data-text="' + key + '"]', probe);
      const element = text.closest("[data-text-box],[data-component]") || text;
      const root = probe.getBoundingClientRect(), rect = element.getBoundingClientRect();
      const frame = key && doc.textBoxes[key]?.frame;
      const object = frame ? $('[data-frame="' + frame + '"]', probe).getBoundingClientRect() : null;
      return { x: rect.left - root.left, y: rect.top - root.top, width: rect.width, height: rect.height,
        widgets: doc.type === 3 ? widgetPositions(probe) : null,
        object: object && { x: object.left - root.left, y: object.top - root.top, width: object.width, height: object.height } };
    } finally {
      probe.remove();
    }
  }
  function startTextDrag(event, key) {
    const doc = current(),
      block = textComponent(doc, key),
      blockIndex = doc.blocks.indexOf(block),
      box = doc.textBoxes[key] || {},
      el =
        $('[data-text-box="' + key + '"]', sheet) ||
        $('[data-text="' + key + '"]', sheet).closest("[data-component]"),
      origin = paperRect(el),
      scale = sheet.getBoundingClientRect().width / sheet.offsetWidth,
      sx = event.clientX,
      sy = event.clientY;
    flushHistory();
    const original = { ...box };
    const previewDoc = JSON.parse(JSON.stringify(doc)), previewCache = new Map(), initialWidgets = widgetPositions(sheet),
      frameTargets = $$("[data-frame]", sheet).map(frame => ({ key: frame.dataset.frame, bounds: paperRect(frame) }));
    const preview = document.createElement("div");
    preview.className = "text-snap-preview";
    preview.dataset.html2canvasIgnore = "";
    preview.setAttribute("aria-hidden", "true");
    preview.innerHTML = '<div class="text-snap-object"></div><div class="text-snap-destination"></div>';
    preview.hidden = true;
    sheet.append(preview);
    const body = $(".rank-body,.grid-body,.relation-map,.compat-body", sheet),
      bounds = paperRect(body),
      zones = [
        { y: doc.type === 2 ? 25.6 : bounds.y, placement: "layout-top", element: body },
        { y: bounds.y + bounds.height, placement: "layout-bottom", element: body },
      ];
    if (doc.type === 3)
      $$("[data-component]", body).forEach((component) => {
        if (component === el) return;
        const b = paperRect(component);
        zones.push({ y: b.y - 10, placement: "before:" + component.dataset.component, element: component });
      });
    let target = null, targetObject = null;
    dragSession(
      event,
      (e) => {
        if (block) {
          doc.blocks = doc.blocks.filter((b) => b !== block);
          doc.textBoxes[key] = box;
        }
        Object.assign(box, {
          frame: null,
          placement: "free",
          x: clamp(
            origin.x + (e.clientX - sx) / scale,
            8,
            doc.paperWidth - origin.width - 8,
          ),
          y: clamp(
            origin.y + (e.clientY - sy) / scale,
            8,
            Math.max(4000, sheet.offsetHeight + 200),
          ),
          width: origin.width,
        });
        if (el.parentElement !== $(".free-layer", sheet)) {
          // Keep the source space while dragging so the drop targets do not move.
          const placeholder = document.createElement("div");
          placeholder.className = el.className;
          placeholder.style.cssText = el.style.cssText;
          placeholder.style.height = origin.height + "px";
          placeholder.style.pointerEvents = "none";
          placeholder.dataset.html2canvasIgnore = "";
          el.before(placeholder);
          $(".free-layer", sheet).append(el);
        }
        el.className = "text-box free-text";
        Object.assign(el.style, {
          left: box.x + "px",
          top: box.y + "px",
          width: box.width + "px",
        });
        target = null;
        targetObject = null;
        const root = sheet.getBoundingClientRect(),
          pointer = {
            x: (e.clientX - root.left) / scale,
            y: (e.clientY - root.top) / scale,
          },
          cx = pointer.x,
          cy = pointer.y;
        $$(".snap-target,.flow-drop,.text-snap-target-muted", sheet).forEach((node) =>
          node.classList.remove("snap-target", "flow-drop", "text-snap-target-muted"),
        );
        frameTargets.forEach((frame) => {
          const b = frame.bounds;
          if (
            cx >= b.x &&
            cx <= b.x + b.width &&
            cy >= b.y - 55 &&
            cy <= b.y + b.height
          ) {
            target = {
              frame: frame.key,
              placement: cy < b.y + 8 ? "above" : "inside",
            };
            targetObject = b;
          }
        });
        // Full-row edges take priority only within their narrow insertion zone.
        if (cx >= bounds.x && cx <= bounds.x + bounds.width) {
          const zone = zones.reduce((nearest, item) =>
            Math.abs(item.y - cy) < Math.abs(nearest.y - cy) ? item : nearest,
          );
          if (Math.abs(zone.y - cy) < 16) {
            $$(".snap-target", sheet).forEach((frame) => frame.classList.remove("snap-target"));
            target = { placement: zone.placement };
            targetObject = paperRect(zone.element);
          }
        }
        const token = target && (target.frame || "") + ":" + target.placement;
        if (target && !previewCache.has(token)) {
          previewCache.set(token, measureTextDrop(previewDoc, key, target, origin));
        }
        const destination = target && previewCache.get(token);
        preview.hidden = !destination;
        el.classList.toggle("text-snap-pending", Boolean(destination));
        if (destination) {
          if (destination.object) {
            targetObject = destination.object;
            $('[data-frame="' + target.frame + '"]', sheet).classList.add("text-snap-target-muted");
          }
          for (const [selector, rect] of [[".text-snap-object", targetObject], [".text-snap-destination", destination]]) {
            Object.assign($(selector, preview).style, { left: rect.x + "px", top: rect.y + "px", width: rect.width + "px", height: rect.height + "px" });
          }
        }
        if (doc.type === 3 && destination && !target.frame) showWidgetReflow(initialWidgets, destination.widgets);
        else clearWidgetReflow();
      },
      (e, moved) => {
        preview.remove();
        clearWidgetReflow();
        el.classList.remove("text-snap-pending");
        if (!moved || e.type === "pointercancel") {
          if (block) {
            delete doc.textBoxes[key];
            doc.blocks = doc.blocks.filter((b) => b !== block);
            doc.blocks.splice(blockIndex, 0, block);
          } else {
            Object.keys(box).forEach((k) => delete box[k]);
            Object.assign(box, original);
          }
        } else if (target?.frame) {
          const used = Object.keys(doc.textBoxes).filter(
            (id) => id !== key && doc.textBoxes[id].frame === target.frame,
          );
          if (used.length < 2) Object.assign(box, target);
          else notify("该图片框已有两个文字区，文字保留在自由位置");
        } else if (target) {
          if (block) doc.blocks.push(block);
          placeText(key, target.placement);
        }
        refreshSheet();
        selected = {
          type: "text",
          key,
          element: $('[data-text="' + key + '"]', sheet),
        };
        highlightSelection();
        renderSelection();
        recordHistory();
      },
    );
  }
  function fitRankPictures(doc) {
    const g = rankGeometry(doc);
    for (let row = 0; row < doc.rows; row++)
      for (let col = 0; col < doc.cols; col++) {
        const items = doc.rankPictures
          .filter((p) => p.row === row && p.col === col)
          .sort((a, b) => a.x - b.x);
        items.forEach((p) => {
          const height =
            p.boundary && row < doc.rows - 1
              ? 2 * Math.min(doc.rowHeights[row], doc.rowHeights[row + 1])
              : doc.rowHeights[row];
          p.width = Math.min(
            p.manualWidth ? p.width : Infinity,
            height * p.ratio,
          );
        });
        const gap = Math.min(
            8,
            doc.rankWidths[col + 1] / Math.max(1, items.length * 2),
          ),
          available =
            doc.rankWidths[col + 1] - Math.max(0, items.length - 1) * gap,
          total = items.reduce((s, p) => s + p.width, 0);
        if (total > available)
          items.forEach((p) => (p.width *= available / total));
        const used =
            items.reduce((s, p) => s + p.width, 0) +
            Math.max(0, items.length - 1) * gap,
          align = doc.rankAlign[row + "-" + col] || "left";
        let x =
          align === "right"
            ? doc.rankWidths[col + 1] - used
            : align === "center"
              ? (doc.rankWidths[col + 1] - used) / 2
              : 0;
        items.forEach((p) => {
          p.x = (x + p.width / 2) / doc.rankWidths[col + 1];
          x += p.width + gap;
        });
      }
    return g;
  }
  function startPictureDrag(event, element) {
    const doc = current(),
      p = doc.rankPictures.find((p) => p.id === element.dataset.picture);
    if (!p) return;
    flushHistory();
    const origin = { ...p },
      bounds = paperRect($(".rank-body", sheet)),
      scale = sheet.getBoundingClientRect().width / sheet.offsetWidth;
    let destination = null;
    dragSession(
      event,
      (e) => {
        const root = sheet.getBoundingClientRect(),
          x = (e.clientX - root.left) / scale - bounds.x,
          y = (e.clientY - root.top) / scale - bounds.y,
          g = rankGeometry(doc),
          row = g.ys.findIndex(
            (top, i) =>
              i < doc.rows && y >= top && y <= top + doc.rowHeights[i] + 5,
          ),
          col =
            g.xs.findIndex(
              (left, i) =>
                i > 0 &&
                i <= doc.cols &&
                x >= left &&
                x <= left + doc.rankWidths[i],
            ) - 1;
        destination =
          row >= 0 && col >= 0
            ? {
                row,
                col,
                x: (x - g.xs[col + 1]) / doc.rankWidths[col + 1],
                boundary: false,
              }
            : null;
        if (destination) {
          const boundary = g.ys.findIndex(
            (top, i) => i > 0 && i < doc.rows && Math.abs(y - (top - 2.5)) < 18,
          );
          if (origin.boundary && boundary > 0) {
            destination.row = boundary - 1;
            destination.boundary = true;
          }
          const targetY = destination.boundary
            ? g.ys[destination.row + 1] - 2.5
            : Math.max(
                g.ys[row] + element.offsetHeight / 2,
                Math.min(
                  g.ys[row] + doc.rowHeights[row] - element.offsetHeight / 2,
                  y,
                ),
              );
          Object.assign(element.style, {
            left: x - element.offsetWidth / 2 + "px",
            top: targetY - element.offsetHeight / 2 + "px",
          });
        }
      },
      (e, moved) => {
        if (moved && destination && e.type !== "pointercancel")
          Object.assign(p, destination);
        else Object.assign(p, origin);
        fitRankPictures(doc);
        refreshSheet();
        setSelected({
          type: "picture",
          key: p.id,
          element: $('[data-picture="' + p.id + '"]', sheet),
        });
        recordHistory();
      },
    );
  }
  function chooseImage(key, pictureId = null) {
    imageTarget = { type: active, key, pictureId };
    $("#imageUpload").multiple = active === 0 && !pictureId;
    $("#imageUpload").value = "";
    $("#imageUpload").click();
  }
  function addCropButton(host, target, enabled) {
    const button = document.createElement("button");
    button.id = "cropImage";
    button.innerHTML = icon("crop") + "裁剪";
    button.disabled = !enabled;
    button.onclick = () => openCrop(target);
    host.append(button);
  }
  function cropImageValue(target) {
    const doc = documents[target.type];
    return target.pictureId
      ? doc.rankPictures.find((p) => p.id === target.pictureId)
      : doc.images[target.key];
  }
  function cropRatio() {
    return cropState.aspect === "free"
      ? 0
      : cropState.aspect === "frame"
        ? cropState.frameRatio
        : Number(cropState.aspect);
  }
  function centeredCrop(image, ratio) {
    const width = ratio
        ? Math.min(image.naturalWidth, image.naturalHeight * ratio)
        : image.naturalWidth,
      height = ratio ? width / ratio : image.naturalHeight;
    return {
      x: (image.naturalWidth - width) / 2,
      y: (image.naturalHeight - height) / 2,
      width,
      height,
    };
  }
  async function openCrop(target) {
    const value = cropImageValue(target);
    if (!value?.src) return;
    flushHistory();
    const element = target.pictureId
      ? $('[data-picture="' + target.pictureId + '"]', sheet)
      : $('[data-image="' + target.key + '"]', sheet);
    const state = {
      target,
      source: value.originalSrc || value.src,
      selection: { ...selected },
      frameRatio: element.clientWidth / element.clientHeight,
      aspect: value.crop ? "free" : "frame",
      image: null,
      drag: null,
    };
    cropState = state;
    $("#cropAspect").value = state.aspect;
    $("#applyCrop").disabled = true;
    $("#cropAspect").disabled = true;
    $("#resetCrop").disabled = true;
    $("#cropDimensions").textContent = "";
    $("#cropDialog").showModal();
    try {
      const image = new Image();
      image.src = state.source;
      await image.decode();
      if (cropState !== state) return;
      state.image = image;
      state.rect = value.crop
        ? { ...value.crop }
        : centeredCrop(image, cropRatio());
      $(".crop-surface").style.setProperty(
        "--crop-ratio",
        image.naturalWidth / image.naturalHeight,
      );
      $("#applyCrop").disabled = false;
      $("#cropAspect").disabled = false;
      $("#resetCrop").disabled = false;
      drawCrop();
      $("#cropCanvas").focus();
    } catch {
      if (cropState === state) {
        $("#cropDialog").close();
        notify("无法读取图片，请重新导入后重试");
      }
    }
  }
  function drawCrop() {
    const state = cropState,
      canvas = $("#cropCanvas"),
      context = canvas.getContext("2d"),
      width = canvas.clientWidth,
      height = canvas.clientHeight,
      dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    context.scale(dpr, dpr);
    context.clearRect(0, 0, width, height);
    if (!state?.image) return;
    const { image, rect } = state,
      scale = Math.min(
        (width - 24) / image.naturalWidth,
        (height - 24) / image.naturalHeight,
      ),
      left = (width - image.naturalWidth * scale) / 2,
      top = (height - image.naturalHeight * scale) / 2;
    state.view = { scale, left, top };
    context.drawImage(
      image,
      left,
      top,
      image.naturalWidth * scale,
      image.naturalHeight * scale,
    );
    const x = left + rect.x * scale,
      y = top + rect.y * scale,
      w = rect.width * scale,
      h = rect.height * scale;
    context.fillStyle = "#29223288";
    context.beginPath();
    context.rect(0, 0, width, height);
    context.rect(x, y, w, h);
    context.fill("evenodd");
    context.strokeStyle = "#9875b8";
    context.lineWidth = 2;
    context.strokeRect(x, y, w, h);
    context.strokeStyle = "#ffffff88";
    context.lineWidth = 1;
    context.beginPath();
    for (const part of [1 / 3, 2 / 3]) {
      context.moveTo(x + w * part, y);
      context.lineTo(x + w * part, y + h);
      context.moveTo(x, y + h * part);
      context.lineTo(x + w, y + h * part);
    }
    context.stroke();
    context.fillStyle = "#ffffff";
    context.strokeStyle = "#9875b8";
    for (const [a, b] of [
      [x, y],
      [x + w, y],
      [x, y + h],
      [x + w, y + h],
    ]) {
      context.fillRect(a - 5, b - 5, 10, 10);
      context.strokeRect(a - 5, b - 5, 10, 10);
    }
    $("#cropDimensions").textContent =
      Math.round(rect.width) + " × " + Math.round(rect.height) + " px";
  }
  const cropCanvas = $("#cropCanvas");
  function cropPoint(event) {
    const r = cropCanvas.getBoundingClientRect(),
      v = cropState.view;
    return {
      x: Math.max(
        0,
        Math.min(
          cropState.image.naturalWidth,
          (event.clientX - r.left - v.left) / v.scale,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          cropState.image.naturalHeight,
          (event.clientY - r.top - v.top) / v.scale,
        ),
      ),
    };
  }
  cropCanvas.addEventListener("pointerdown", (event) => {
    if (!cropState?.image || cropState.drag || event.button > 0) return;
    event.preventDefault();
    cropCanvas.focus();
    const p = cropPoint(event),
      r = cropState.rect,
      hit = 16 / cropState.view.scale,
      corners = [
        ["nw", r.x, r.y],
        ["ne", r.x + r.width, r.y],
        ["sw", r.x, r.y + r.height],
        ["se", r.x + r.width, r.y + r.height],
      ],
      corner = corners.find(([, x, y]) => Math.hypot(p.x - x, p.y - y) <= hit);
    const mode =
      corner?.[0] ||
      (p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height
        ? "move"
        : "new");
    cropState.drag = {
      id: event.pointerId,
      mode,
      start: p,
      before: { ...r },
      anchor:
        mode === "new"
          ? p
          : {
              x: mode.includes("w") ? r.x + r.width : r.x,
              y: mode.includes("n") ? r.y + r.height : r.y,
            },
    };
    cropCanvas.setPointerCapture(event.pointerId);
  });
  cropCanvas.addEventListener("pointermove", (event) => {
    const state = cropState,
      drag = state?.drag;
    if (!drag || drag.id !== event.pointerId) return;
    event.preventDefault();
    const p = cropPoint(event),
      { before, anchor, mode } = drag,
      { naturalWidth: iw, naturalHeight: ih } = state.image;
    if (mode === "move")
      state.rect = {
        ...before,
        x: Math.max(
          0,
          Math.min(iw - before.width, before.x + p.x - drag.start.x),
        ),
        y: Math.max(
          0,
          Math.min(ih - before.height, before.y + p.y - drag.start.y),
        ),
      };
    else {
      const sx =
          mode === "new"
            ? p.x < anchor.x
              ? -1
              : 1
            : mode.includes("w")
              ? -1
              : 1,
        sy =
          mode === "new"
            ? p.y < anchor.y
              ? -1
              : 1
            : mode.includes("n")
              ? -1
              : 1,
        maxW = sx < 0 ? anchor.x : iw - anchor.x,
        maxH = sy < 0 ? anchor.y : ih - anchor.y,
        ratio = cropRatio();
      let width = Math.min(maxW, Math.max(1, (p.x - anchor.x) * sx)),
        height = Math.min(maxH, Math.max(1, (p.y - anchor.y) * sy));
      if (ratio) {
        width = Math.min(maxW, maxH * ratio, Math.max(width, height * ratio));
        height = width / ratio;
      }
      if (width >= 1 && height >= 1)
        state.rect = {
          x: anchor.x + (sx < 0 ? -width : 0),
          y: anchor.y + (sy < 0 ? -height : 0),
          width,
          height,
        };
    }
    drawCrop();
  });
  function finishCropDrag(event) {
    if (!cropState?.drag || cropState.drag.id !== event.pointerId) return;
    if (event.type === "pointercancel") cropState.rect = cropState.drag.before;
    cropState.drag = null;
    if (cropCanvas.hasPointerCapture(event.pointerId))
      cropCanvas.releasePointerCapture(event.pointerId);
    drawCrop();
  }
  cropCanvas.addEventListener("pointerup", finishCropDrag);
  cropCanvas.addEventListener("pointercancel", finishCropDrag);
  cropCanvas.addEventListener("keydown", (event) => {
    if (
      !cropState?.image ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;
    event.preventDefault();
    const r = cropState.rect,
      step = event.shiftKey ? 10 : 1;
    r.x = Math.max(
      0,
      Math.min(
        cropState.image.naturalWidth - r.width,
        r.x +
          (event.key === "ArrowLeft"
            ? -step
            : event.key === "ArrowRight"
              ? step
              : 0),
      ),
    );
    r.y = Math.max(
      0,
      Math.min(
        cropState.image.naturalHeight - r.height,
        r.y +
          (event.key === "ArrowUp"
            ? -step
            : event.key === "ArrowDown"
              ? step
              : 0),
      ),
    );
    drawCrop();
  });
  $("#cropAspect").onchange = (event) => {
    if (!cropState?.image) return;
    cropState.aspect = event.target.value;
    cropState.rect = centeredCrop(cropState.image, cropRatio());
    drawCrop();
  };
  $("#resetCrop").onclick = () => {
    if (!cropState?.image) return;
    cropState.aspect = "free";
    $("#cropAspect").value = "free";
    cropState.rect = centeredCrop(cropState.image, 0);
    drawCrop();
  };
  for (const id of ["closeCrop", "cancelCrop"])
    $("#" + id).onclick = () => $("#cropDialog").close();
  $("#cropDialog").addEventListener("close", () => {
    cropState = null;
  });
  new ResizeObserver(() => {
    if ($("#cropDialog").open) drawCrop();
  }).observe(cropCanvas);
  $("#applyCrop").onclick = () => {
    const state = cropState;
    if (!state?.image || state.drag) return;
    try {
      const value = cropImageValue(state.target),
        r = state.rect,
        image = state.image,
        full =
          r.x < 0.5 &&
          r.y < 0.5 &&
          Math.abs(r.width - image.naturalWidth) < 0.5 &&
          Math.abs(r.height - image.naturalHeight) < 0.5;
      if (!value) return;
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(r.width));
      canvas.height = Math.max(1, Math.round(r.height));
      canvas
        .getContext("2d")
        .drawImage(
          image,
          r.x,
          r.y,
          r.width,
          r.height,
          0,
          0,
          canvas.width,
          canvas.height,
        );
      value.src = full ? state.source : canvas.toDataURL("image/png");
      if (full) {
        delete value.originalSrc;
        delete value.crop;
      } else {
        value.originalSrc = state.source;
        value.crop = { ...r };
      }
      if (state.target.pictureId) {
        value.ratio = canvas.width / canvas.height;
        fitRankPictures(documents[state.target.type]);
      }
      selected = state.selection;
      $("#cropDialog").close();
      refreshSheet();
      renderSelection();
      recordHistory();
    } catch {
      notify("裁剪未完成，请重试");
    }
  };
  async function readImage(file) {
    if (!file.type.startsWith("image/")) throw new Error("请选择图片文件");
    if (file.size > 30 * 1024 * 1024)
      throw new Error("请选择 30 MB 以内的图片");
    const data = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = reject;
        r.readAsDataURL(file);
      }),
      img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () =>
          reject(new Error("无法读取图片，请尝试 JPG、PNG 或 WebP"));
        image.src = data;
      }),
      factor = Math.min(1, 2000 / img.width, 2000 / img.height),
      canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * factor);
    canvas.height = Math.round(img.height * factor);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return {
      src: canvas.toDataURL("image/png"),
      ratio: img.width / img.height,
    };
  }
  async function importRelationImages(files, target) {
    const doc = documents[2],
      version = ++relationImportVersion,
      batch = Boolean(target.batch),
      participant = batch ? null : doc.participants.find((p) => "node-" + p.id === target.key),
      before = JSON.stringify(doc.participants);
    if (batch && (files.length < 3 || files.length > 24)) {
      notify("请一次选择 3–24 张头像图片");
      return;
    }
    if (!batch && !participant) {
      notify("这个角色已被移除，请重新选择头像");
      return;
    }
    if (batch && doc.participants.some((p) => !participantIsEmpty(doc, p)) &&
        !window.confirm("批量导入将按所选图片顺序替换头像，并将人数调整为 " + files.length +
          (files.length < doc.participants.length ? "。超出人数的末尾角色将被移除，其连线将不再显示" : "") + "。是否继续？")) return;
    const button = $("#batchAvatars");
    if (button) { button.disabled = true; button.setAttribute("aria-busy", "true"); }
    try {
      // Decode into temporary storage; commit the ordered list once, never per image.
      const images = [];
      for (const file of batch ? files : files.slice(0, 1)) images.push(await readImage(file));
      if (version !== relationImportVersion) return;
      if (active !== 2 || documents[2] !== doc || JSON.stringify(doc.participants) !== before) {
        notify("角色内容已更改，未应用本次导入；请重新选择图片");
        return;
      }
      flushHistory();
      if (batch) {
        const previous = doc.participants;
        doc.participants = images.map((image, i) => {
          const next = previous[i] || createParticipant(doc, i);
          next.image = { ...next.image, src: image.src };
          delete next.image.originalSrc;
          delete next.image.crop;
          return next;
        });
        for (const removed of previous.slice(images.length)) {
          const key = "node-" + removed.id;
          delete doc.fills[key];
          for (const [id, box] of Object.entries(doc.textBoxes)) if (box.frame === key) {
            delete doc.textBoxes[id];
            delete doc.texts[id];
          }
        }
        bindParticipants(doc);
        selected = null;
        setLinkMode(false);
      } else {
        participant.image = { ...participant.image, src: images[0].src };
        delete participant.image.originalSrc;
        delete participant.image.crop;
      }
      refreshSheet();
      if (batch) renderProperties();
      renderSelection();
      recordHistory();
      notify(batch ? "已按顺序导入 " + images.length + " 个头像" : "已替换头像");
    } catch (error) {
      notify(error.message || "图片导入未完成，请重试");
    } finally {
      if (version === relationImportVersion && $("#batchAvatars")) {
        $("#batchAvatars").disabled = false;
        $("#batchAvatars").removeAttribute("aria-busy");
      }
    }
  }
  $("#imageUpload").onchange = async (event) => {
    const files = [...event.target.files],
      target = imageTarget;
    if (!files.length || !target) return;
    if (target.type === 2) {
      await importRelationImages(files, target);
      return;
    }
    const doc = documents[target.type];
    let added = 0,
      failed = "";
    for (const file of files) {
      try {
        const image = await readImage(file);
        if (target.type === 0) {
          if (target.pictureId) {
            const picture = doc.rankPictures.find(
              (p) => p.id === target.pictureId,
            );
            if (picture) {
              Object.assign(picture, image);
              delete picture.originalSrc;
              delete picture.crop;
            }
          } else {
            const [, r, c] = target.key.split("-"),
              row = Number(r),
              col = Number(c),
              items = doc.rankPictures.filter(
                (p) => p.row === row && p.col === col,
              );
            rankGeometry(doc);
            const remaining =
              doc.rankWidths[col + 1] -
              12 -
              items.reduce((s, p) => s + p.width + 8, 0);
            if (remaining < 24)
              throw new Error("这一行已放满，请先缩小或移除图片");
            doc.rankPictures.push({
              id: uid(),
              ...image,
              row,
              col,
              x: 1,
              boundary: false,
              width: Math.min(
                remaining,
                (doc.rowHeights[row] - 12) * image.ratio,
              ),
            });
          }
          fitRankPictures(doc);
        } else {
          doc.images[target.key] = {
            ...doc.images[target.key],
            src: image.src,
          };
          delete doc.images[target.key].originalSrc;
          delete doc.images[target.key].crop;
        }
        added++;
      } catch (error) {
        failed = error.message;
      }
    }
    if (active === target.type) {
      refreshSheet();
      renderSelection();
      recordHistory();
    }
    notify(
      failed
        ? (added ? "已添加 " + added + " 张；" : "") + failed
        : "已添加 " + added + " 张图片",
    );
  };
  function recordHistory() {
    clearTimeout(historyTimer);
    if (active === null) return;
    const value = JSON.stringify(current());
    if (history[historyIndex] === value) return;
    history = history.slice(0, historyIndex + 1);
    history.push(value);
    if (history.length > 30) history.shift();
    historyIndex = history.length - 1;
    updateHistoryButtons();
  }
  function scheduleHistory() {
    clearTimeout(historyTimer);
    historyTimer = setTimeout(recordHistory, 350);
  }
  function flushHistory() {
    clearTimeout(historyTimer);
    recordHistory();
  }
  function updateHistoryButtons() {
    $("#undoButton").disabled = historyIndex <= 0;
    $("#redoButton").disabled = historyIndex >= history.length - 1;
  }
  function undo() {
    flushHistory();
    if (historyIndex <= 0) return;
    documents[active] = JSON.parse(history[--historyIndex]);
    bindParticipants(documents[active]);
    selected = null;
    savedRange = null;
    render();
    updateHistoryButtons();
  }
  function redo() {
    if (historyIndex >= history.length - 1) return;
    documents[active] = JSON.parse(history[++historyIndex]);
    bindParticipants(documents[active]);
    selected = null;
    savedRange = null;
    render();
    updateHistoryButtons();
  }
  $("#undoButton").onclick = undo;
  $("#redoButton").onclick = redo;
  document.addEventListener("keydown", (event) => {
    if (active === null || $("#cropDialog").open) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
    }
    if (event.key === "Escape") {
      setLinkMode(false);
    }
  });
  $("#homeButton").onclick = () => {
    if (active !== null) flushHistory();
    setLinkMode(false);
    active = null;
    selected = null;
    savedRange = null;
    $("#homeView").hidden = false;
    $("#editorView").hidden = true;
    $("#editorActions").hidden = true;
    $("#breadcrumb").textContent = "";
    renderHome();
    window.scrollTo({ top: 0 });
  };
  for (const [id, delta] of [
    ["zoomIn", 0.5],
    ["zoomOut", -0.5],
    ["zoomFit", 0],
  ])
    $("#" + id).onclick = () => {
      if (active === null) return;
      viewZoom[active] = delta ? clamp(viewZoom[active] + delta, 1, 4) : 1;
      if (!delta) $("#canvasViewport").scrollLeft = 0;
      fitSheet();
    };
  let previewExport = null, exportRevision = 0;
  function updateExportButton() {
    $("#downloadButton").innerHTML = icon("image") + "生成预览";
    icons();
  }
  function resetExportDelivery() {
    exportRevision++;
    $("#downloadButton").disabled = false;
    updateExportButton();
  }
  $("#exportDialog").addEventListener("close", resetExportDelivery);
  $("#exportButton").onclick = () => {
    resetExportDelivery();
    flushHistory();
    fitSheet();
    $("#exportDialog").showModal();
  };
  $("#exportScale").onchange = () => { resetExportDelivery(); fitSheet(); };
  $("#exportFormat").onchange = resetExportDelivery;
  $("#exportPreview").addEventListener("close", () => {
    $("#exportPreviewImage").removeAttribute("src");
    previewExport?.dispose();
    previewExport = null;
  });
  $("#closeExportPreview").onclick = () => $("#exportPreview").close();
  async function deliverPreview(action) {
    const result = previewExport, buttons = [$("#saveExport"), $("#shareExport")];
    if (!result || buttons.some((button) => button.disabled)) return;
    const statusMessage = $("#exportPreviewStatus");
    statusMessage.hidden = true;
    buttons.forEach((button) => { button.disabled = true; });
    try {
      const status = await result[action]();
      if (result !== previewExport) return;
      if (status === "unsupported") {
        $("#shareExport").hidden = true;
        statusMessage.textContent = window.isSecureContext
          ? "当前浏览器不支持文件分享，可保存至文件或长按图片存入相册"
          : "当前 HTTP 页面无法调用系统分享，请通过 HTTPS 打开；也可保存至文件或长按图片存入相册";
        statusMessage.hidden = false;
      }
    } catch (error) {
      if (result === previewExport) {
        statusMessage.textContent = "操作未完成，可重试或长按图片保存至手机相册";
        statusMessage.hidden = false;
      }
    } finally {
      if (result === previewExport) buttons.forEach((button) => { button.disabled = false; });
    }
  }
  $("#saveExport").onclick = () => deliverPreview("save");
  $("#shareExport").onclick = () => deliverPreview("share");
  async function prepareExportImages(copy, scale) {
    // html2canvas does not implement object-fit, so rasterize each fitted image first.
    for (const image of $$("img", copy)) {
      await image.decode();
      const width = image.clientWidth,
        height = image.clientHeight;
      if (!width || !height) continue;
      const fitted = document.createElement("canvas");
      fitted.width = Math.round(width * scale);
      fitted.height = Math.round(height * scale);
      const context = fitted.getContext("2d");
      const factor = (
        image.style.objectFit === "contain" ? Math.min : Math.max
      )(fitted.width / image.naturalWidth, fitted.height / image.naturalHeight);
      const w = image.naturalWidth * factor,
        h = image.naturalHeight * factor;
      context.drawImage(
        image,
        (fitted.width - w) / 2,
        (fitted.height - h) / 2,
        w,
        h,
      );
      image.src = fitted.toDataURL("image/png");
      image.style.objectFit = "fill";
      await image.decode();
    }
  }
  $("#downloadButton").onclick = async () => {
    const button = $("#downloadButton"), revision = exportRevision;
    button.disabled = true;
    button.textContent = "正在生成…";
    let copy;
    try {
      let result;
      {
        if (typeof window.html2canvas !== "function")
          throw new Error("导出组件未加载，请刷新后重试");
        await document.fonts.ready;
        copy = sheet.cloneNode(true);
        copy.id = "exportSheet";
        copy.classList.add("render-copy");
        Object.assign(copy.style, {
          position: "absolute",
          left: "-10000px",
          top: "0",
          transform: "none",
        });
        $$("[contenteditable]", copy).forEach((el) =>
          el.removeAttribute("contenteditable"),
        );
        $$("[data-html2canvas-ignore]", copy).forEach((el) => el.remove());
        document.body.append(copy);
        const scale = Number($("#exportScale").value);
        await prepareExportImages(copy, scale);
        const canvas = await window.html2canvas(copy, {
          scale,
          backgroundColor: current().background,
          logging: false,
          width: copy.offsetWidth,
          height: copy.offsetHeight,
          windowWidth: Math.max(1400, copy.offsetWidth + 100),
          windowHeight: copy.offsetHeight + 100,
          scrollX: 0,
          scrollY: 0,
        });
        const format = $("#exportFormat").value,
          blob = await new Promise((resolve) =>
            canvas.toBlob(resolve, "image/" + format, 0.94),
          );
        if (!blob) throw new Error("图片生成失败");
        const actual = blob.type.split("/")[1];
        result = { blob, actual, format, filename:
          "QuestMaker-" + names[active] + "." + (actual === "jpeg" ? "jpg" : actual) };
      }
      if (revision !== exportRevision || !$("#exportDialog").open) return;
      const generated = window.QuestMakerExport.create(result.blob, result.filename);
      let previewURL;
      try {
        previewURL = await generated.previewURL();
      } catch (error) {
        generated.dispose();
        throw error;
      }
      if (revision !== exportRevision || !$("#exportDialog").open) {
        generated.dispose();
        return;
      }
      previewExport?.dispose();
      previewExport = generated;
      $("#exportPreviewImage").src = previewURL;
      $("#shareExport").hidden = !previewExport.canShare();
      $("#shareExport").disabled = false;
      $("#saveExport").disabled = false;
      $("#exportPreviewStatus").hidden = true;
      $("#exportDialog").close();
      $("#exportPreview").showModal();
    } catch (error) {
      if (revision === exportRevision) notify(error.message || "导出失败，请重试");
    } finally {
      copy?.remove();
      if (revision === exportRevision) {
        button.disabled = false;
        updateExportButton();
      }
    }
  };
  new ResizeObserver(fitSheet).observe($(".stage"));
  new ResizeObserver(fitSheet).observe(sheet);
  window.addEventListener("resize", fitSheet);
  renderHome();
})();
