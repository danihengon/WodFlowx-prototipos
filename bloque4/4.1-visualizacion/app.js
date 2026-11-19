/*
 * Lógica del prototipo del subbloque 4.1 (visualización de solo lectura).
 * HTML + CSS + JavaScript local únicamente: sin React, sin React Flow, sin
 * peticiones HTTP, sin localStorage. Todo el estado vive en variables de
 * este archivo y se pierde al recargar la página, a propósito.
 */

(function () {
  "use strict";

  // ---------- Estado ----------
  var selectedKey = null;
  var expandedKeys = new Set();
  var viewMode = "diagram"; // 'diagram' | 'list'
  var orderStyleMode = "A"; // 'A' sin flechas de orden | 'B' con flechas de orden
  var detailStyleMode = "panel"; // 'panel' | 'modal'
  var scale = 1;
  var panX = 40;
  var panY = 20;

  var dataIndex = {}; // key -> { type, data, depth }
  var flowNameIndex = {}; // flowElementId -> nombre legible
  var nodeElements = {}; // key -> elemento DOM del diagrama actual
  var flowIndex = {}; // flowElementId -> elemento DOM del diagrama actual
  var orderContainers = []; // listas de flowElementId en orden, por contenedor

  var lastFocusedBeforeModal = null;

  // ---------- Utilidades ----------
  function esc(value) {
    return (value === null || value === undefined ? "" : String(value)).replace(
      /[&<>"]/g,
      function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
      }
    );
  }

  function sectionKey(s) {
    return "section:" + s.sectionId;
  }
  function groupKey(g) {
    return "group:" + g.groupId;
  }
  function exKey(e) {
    return "ex:" + e.exerciseOccurrenceId;
  }

  function byPosition(a, b) {
    return a.position - b.position;
  }

  // ---------- Índice de datos (independiente de lo que esté expandido) ----------
  function indexExercise(e) {
    dataIndex[exKey(e)] = { type: "exercise", data: e };
    flowNameIndex[e.flowElementId] = e.exerciseName;
  }

  function indexGroup(g, depth) {
    dataIndex[groupKey(g)] = { type: "group", data: g, depth: depth };
    flowNameIndex[g.flowElementId] = g.name;
    g.content.slice().forEach(function (ci) {
      if (ci.kind === "group") {
        indexGroup(ci.item, depth + 1);
      } else {
        indexExercise(ci.item);
      }
    });
  }

  function indexSection(s) {
    dataIndex[sectionKey(s)] = { type: "section", data: s };
    s.groups.forEach(function (mg) {
      indexGroup(mg.group, 1);
    });
  }

  function buildDataIndex() {
    WORKOUT_TREE.sections.forEach(indexSection);
  }

  function expandAllInitially() {
    Object.keys(dataIndex).forEach(function (key) {
      if (dataIndex[key].type === "group") {
        expandedKeys.add(key);
      }
    });
  }

  // ---------- Detalle de selección ----------
  function describeRelatedTransitions(list) {
    if (!list.length) {
      return "Ninguna";
    }
    var items = list.map(function (t) {
      var origin = esc(flowNameIndex[t.originFlowElementId] || ("elemento " + t.originFlowElementId));
      var dest = esc(flowNameIndex[t.destinationFlowElementId] || ("elemento " + t.destinationFlowElementId));
      var extra = [];
      if (t.description) {
        extra.push(esc(t.description));
      }
      if (t.duration) {
        extra.push(t.duration.value + " " + esc(t.duration.unit));
      }
      if (t.activity) {
        extra.push("actividad: " + esc(t.activity.exerciseName) + " (" + esc(t.activity.prescriptionSummary) + ")");
      }
      var extraText = extra.length ? " — " + extra.join(", ") : "";
      return origin + " &rarr; " + dest + extraText;
    });
    return "<ul><li>" + items.join("</li><li>") + "</li></ul>";
  }

  function describeKey(key) {
    var entry = dataIndex[key];
    if (!entry) {
      return null;
    }

    if (entry.type === "section") {
      var s = entry.data;
      var groupNames = s.groups
        .slice()
        .sort(byPosition)
        .map(function (mg) {
          return esc(mg.group.name);
        })
        .join(", ");
      return {
        title: s.name,
        kind: "Sección",
        rows: [
          ["Orden en el entrenamiento", "Posición " + s.position],
          ["Bloques que contiene", groupNames || "(sin bloques)"],
        ],
        actions: ["Añadir bloque (bloque 4.2)", "Reordenar sección (bloque 4.2)"],
      };
    }

    if (entry.type === "group") {
      var g = entry.data;
      var rows = [];
      if (g.description) {
        rows.push(["Descripción", esc(g.description)]);
      }
      var contained = g.content
        .slice()
        .sort(byPosition)
        .map(function (ci) {
          return (ci.kind === "group" ? "Subbloque: " : "Ejercicio: ") + esc(ci.kind === "group" ? ci.item.name : ci.item.exerciseName);
        });
      rows.push(["Elementos contenidos", contained.length ? "<ul><li>" + contained.join("</li><li>") + "</li></ul>" : "(vacío)"]);
      if (g.dynamicConfiguration) {
        var params = g.dynamicConfiguration.parameters
          .map(function (p) {
            return esc(p.label) + ": " + esc(p.value);
          })
          .join(", ");
        rows.push(["Dinámica aplicada", esc(g.dynamicConfiguration.dynamicName)]);
        rows.push(["Parámetros configurados", params]);
      } else {
        rows.push(["Dinámica aplicada", "Ninguna"]);
      }
      var related = WORKOUT_TREE.transitions.filter(function (t) {
        return t.originFlowElementId === g.flowElementId || t.destinationFlowElementId === g.flowElementId;
      });
      rows.push(["Transiciones relacionadas", describeRelatedTransitions(related)]);
      return {
        title: g.name,
        kind: entry.depth === 1 ? "Bloque (grupo principal)" : "Subbloque (subgrupo, nivel " + entry.depth + ")",
        rows: rows,
        actions: ["Editar nombre/descripción (bloque 4.2)", "Añadir ejercicio (bloque 4.3)", "Configurar dinámica (bloque 4.6)"],
      };
    }

    // exercise
    var e = entry.data;
    var detailRows = e.prescriptionDetail
      .map(function (d) {
        return esc(d.label) + ": " + esc(d.value);
      })
      .join(", ");
    var relatedEx = WORKOUT_TREE.transitions.filter(function (t) {
      return t.originFlowElementId === e.flowElementId || t.destinationFlowElementId === e.flowElementId;
    });
    return {
      title: e.exerciseName,
      kind: "Ejercicio (aparición en el flujo)",
      rows: [
        ["Resumen de la prescripción", esc(e.prescriptionSummary || "(sin prescripción)")],
        ["Valores de la prescripción", detailRows || "(sin valores)"],
        ["Transiciones relacionadas", describeRelatedTransitions(relatedEx)],
      ],
      actions: ["Editar prescripción (bloque 4.4)", "Cambiar de ejercicio (bloque 4.3)", "Mover (bloque 4.3)"],
    };
  }

  function buildDetailHtml(info) {
    var rowsHtml = info.rows
      .map(function (r) {
        return '<div class="detail-row"><div class="detail-row-label">' + esc(r[0]) + '</div><div class="detail-row-value">' + r[1] + "</div></div>";
      })
      .join("");
    var actionsHtml = info.actions
      .map(function (a) {
        return '<button type="button" class="btn btn-secondary" disabled>' + esc(a) + "</button>";
      })
      .join("");
    return (
      '<h3 class="detail-title">' +
      esc(info.title) +
      '</h3><div class="detail-kind">' +
      esc(info.kind) +
      "</div>" +
      rowsHtml +
      '<div class="detail-actions">' +
      actionsHtml +
      '</div><p class="detail-readonly-note">El subbloque 4.1 es de solo lectura: estas acciones son una referencia de lo que vendrá en subbloques posteriores, todavía deshabilitadas.</p>'
    );
  }

  function effectiveDetailMode() {
    return window.innerWidth <= 760 ? "modal" : detailStyleMode;
  }

  function renderDetail() {
    var info = selectedKey ? describeKey(selectedKey) : null;
    var placeholder = '<p class="detail-panel-placeholder">Selecciona una sección, un bloque/subbloque o un ejercicio del diagrama o de la lista para ver aquí su información (de solo lectura en este subbloque).</p>';

    if (effectiveDetailMode() === "modal") {
      if (info) {
        document.getElementById("modalBody").innerHTML = buildDetailHtml(info);
        document.getElementById("modalTitle").textContent = info.title;
        openModal();
      }
      document.getElementById("detailPanelBody").innerHTML = placeholder;
    } else {
      document.getElementById("detailPanelBody").innerHTML = info ? buildDetailHtml(info) : placeholder;
      closeModal();
    }
  }

  function applySelectionHighlight() {
    document.querySelectorAll("[data-key]").forEach(function (el) {
      el.classList.toggle("selected", el.dataset.key === selectedKey);
    });
  }

  function selectKey(key) {
    selectedKey = key;
    applySelectionHighlight();
    renderDetail();
  }

  // ---------- Modal ----------
  function openModal() {
    var overlay = document.getElementById("modalOverlay");
    if (overlay.classList.contains("open")) {
      return;
    }
    lastFocusedBeforeModal = document.activeElement;
    overlay.classList.add("open");
    document.getElementById("modalCloseBtn").focus();
  }

  function closeModal() {
    var overlay = document.getElementById("modalOverlay");
    if (!overlay.classList.contains("open")) {
      return;
    }
    overlay.classList.remove("open");
    if (lastFocusedBeforeModal && document.contains(lastFocusedBeforeModal)) {
      lastFocusedBeforeModal.focus();
    }
  }

  // ---------- Diagrama ----------
  function buildExerciseEl(e) {
    var key = exKey(e);
    var el = document.createElement("div");
    el.className = "node node-exercise";
    el.dataset.key = key;
    el.dataset.flowElementId = e.flowElementId;
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", "Ejercicio: " + e.exerciseName + ", " + (e.prescriptionSummary || ""));
    el.innerHTML =
      '<span class="node-kind-label">Ejercicio</span><span class="node-name">' +
      esc(e.exerciseName) +
      '</span><span class="node-exercise-summary">' +
      esc(e.prescriptionSummary || "") +
      "</span>";
    el.addEventListener("click", function (ev) {
      ev.stopPropagation();
      selectKey(key);
    });
    el.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        selectKey(key);
      }
    });
    nodeElements[key] = el;
    flowIndex[e.flowElementId] = el;
    return el;
  }

  function buildGroupEl(g, depth) {
    var key = groupKey(g);
    var isExpanded = expandedKeys.has(key);

    var el = document.createElement("div");
    el.className = "node node-group depth-" + Math.min(depth, 4);
    el.dataset.key = key;
    el.dataset.flowElementId = g.flowElementId;

    var header = document.createElement("div");
    header.className = "node-group-header";

    var expandBtn = document.createElement("button");
    expandBtn.type = "button";
    expandBtn.className = "node-expand";
    expandBtn.textContent = isExpanded ? "▾" : "▸";
    expandBtn.setAttribute("aria-label", (isExpanded ? "Contraer " : "Expandir ") + g.name);
    expandBtn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      if (expandedKeys.has(key)) {
        expandedKeys.delete(key);
      } else {
        expandedKeys.add(key);
      }
      renderDiagram();
      renderList();
    });
    header.appendChild(expandBtn);

    var kindLabel = document.createElement("span");
    kindLabel.className = "node-kind-label";
    kindLabel.textContent = depth === 1 ? "Bloque" : "Subbloque";
    header.appendChild(kindLabel);

    var nameSpan = document.createElement("span");
    nameSpan.className = "node-name";
    nameSpan.textContent = g.name;
    header.appendChild(nameSpan);

    if (g.dynamicConfiguration) {
      var badge = document.createElement("span");
      badge.className = "badge badge-dynamic";
      badge.textContent = g.dynamicConfiguration.dynamicName;
      header.appendChild(badge);
    }

    el.appendChild(header);
    el.setAttribute("tabindex", "0");
    el.setAttribute("role", "button");
    el.addEventListener("click", function (ev) {
      ev.stopPropagation();
      selectKey(key);
    });
    el.addEventListener("keydown", function (ev) {
      if ((ev.key === "Enter" || ev.key === " ") && ev.target === el) {
        ev.preventDefault();
        selectKey(key);
      }
    });

    if (isExpanded) {
      var childrenWrap = document.createElement("div");
      childrenWrap.className = "node-children";
      var orderedIds = [];
      g.content
        .slice()
        .sort(byPosition)
        .forEach(function (ci) {
          var childEl = ci.kind === "group" ? buildGroupEl(ci.item, depth + 1) : buildExerciseEl(ci.item);
          childrenWrap.appendChild(childEl);
          orderedIds.push(ci.item.flowElementId);
        });
      el.appendChild(childrenWrap);
      if (orderedIds.length > 1) {
        orderContainers.push(orderedIds);
      }
    } else if (g.content.length) {
      var hint = document.createElement("div");
      hint.className = "node-collapsed-hint";
      hint.textContent = "Contiene " + g.content.length + " elemento(s) oculto(s)";
      el.appendChild(hint);
    }

    nodeElements[key] = el;
    flowIndex[g.flowElementId] = el;
    return el;
  }

  function renderDiagram() {
    var treeRoot = document.getElementById("canvasTree");
    treeRoot.innerHTML = "";
    nodeElements = {};
    flowIndex = {};
    orderContainers = [];

    WORKOUT_TREE.sections
      .slice()
      .sort(byPosition)
      .forEach(function (s) {
        var lane = document.createElement("div");
        lane.className = "section-lane";
        lane.dataset.key = sectionKey(s);

        var header = document.createElement("div");
        header.className = "section-lane-header";
        header.innerHTML = '<span class="section-order">Sección ' + s.position + "</span> — " + esc(s.name);
        header.style.cursor = "pointer";
        header.addEventListener("click", function (ev) {
          ev.stopPropagation();
          selectKey(sectionKey(s));
        });
        lane.appendChild(header);

        var mainIds = [];
        s.groups
          .slice()
          .sort(byPosition)
          .forEach(function (mg) {
            lane.appendChild(buildGroupEl(mg.group, 1));
            mainIds.push(mg.group.flowElementId);
          });
        if (mainIds.length > 1) {
          orderContainers.push(mainIds);
        }

        treeRoot.appendChild(lane);
      });

    applySelectionHighlight();
    requestAnimationFrame(drawArrows);
  }

  // ---------- Flechas (SVG) ----------
  var markersReady = false;
  function ensureArrowMarkers(svg) {
    if (markersReady) {
      return;
    }
    var ns = "http://www.w3.org/2000/svg";
    var defs = document.createElementNS(ns, "defs");
    [
      { id: "arrow-order", color: "#b7bdc7" },
      { id: "arrow-transition", color: "#c2410c" },
    ].forEach(function (m) {
      var marker = document.createElementNS(ns, "marker");
      marker.setAttribute("id", m.id);
      marker.setAttribute("markerWidth", "8");
      marker.setAttribute("markerHeight", "8");
      marker.setAttribute("refX", "6");
      marker.setAttribute("refY", "3");
      marker.setAttribute("orient", "auto");
      var path = document.createElementNS(ns, "path");
      path.setAttribute("d", "M0,0 L6,3 L0,6 Z");
      path.setAttribute("fill", m.color);
      marker.appendChild(path);
      defs.appendChild(marker);
    });
    svg.appendChild(defs);
    markersReady = true;
  }

  function nodeRect(el) {
    // .canvas-tree es el único antepasado posicionado de todos los nodos,
    // así que su offsetTop/offsetLeft ya están expresados en ese sistema
    // de coordenadas local, sin verse afectados por el zoom/paneo (que se
    // aplica como transform CSS a .canvas-world, un nivel por encima).
    return { top: el.offsetTop, left: el.offsetLeft, width: el.offsetWidth, height: el.offsetHeight };
  }

  function isVisible(el) {
    return !!el && el.getClientRects().length > 0;
  }

  function drawLine(svg, p1, p2, type, transition) {
    var ns = "http://www.w3.org/2000/svg";
    var line = document.createElementNS(ns, "line");
    line.setAttribute("x1", p1.x);
    line.setAttribute("y1", p1.y);
    line.setAttribute("x2", p2.x);
    line.setAttribute("y2", p2.y);
    if (type === "transition") {
      line.setAttribute("stroke", "#c2410c");
      line.setAttribute("stroke-width", "2.5");
      line.setAttribute("stroke-dasharray", "7,5");
      line.setAttribute("marker-end", "url(#arrow-transition)");
    } else {
      line.setAttribute("stroke", "#b7bdc7");
      line.setAttribute("stroke-width", "1.5");
      line.setAttribute("marker-end", "url(#arrow-order)");
    }
    svg.appendChild(line);

    if (type === "transition") {
      var midX = (p1.x + p2.x) / 2;
      var midY = (p1.y + p2.y) / 2;
      var parts = ["Transición"];
      if (transition.duration) {
        parts.push(transition.duration.value + " " + transition.duration.unit);
      }
      if (transition.activity) {
        parts.push("+ actividad");
      }
      var text = document.createElementNS(ns, "text");
      text.setAttribute("x", midX + 6);
      text.setAttribute("y", midY - 6);
      text.setAttribute("class", "arrow-label");
      text.textContent = parts.join(" · ");
      svg.appendChild(text);
    }
  }

  function drawArrows() {
    var svg = document.getElementById("canvasSvg");
    var treeRoot = document.getElementById("canvasTree");
    if (!svg || !treeRoot) {
      return;
    }
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }
    ensureArrowMarkers(svg);

    var w = Math.max(treeRoot.scrollWidth, 10);
    var h = Math.max(treeRoot.scrollHeight, 10);
    svg.setAttribute("width", w);
    svg.setAttribute("height", h);

    function center(el) {
      var r = nodeRect(el);
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    if (orderStyleMode === "B") {
      orderContainers.forEach(function (ids) {
        for (var i = 0; i < ids.length - 1; i++) {
          var a = flowIndex[ids[i]];
          var b = flowIndex[ids[i + 1]];
          if (!isVisible(a) || !isVisible(b)) {
            continue;
          }
          drawLine(svg, center(a), center(b), "order");
        }
      });
    }

    WORKOUT_TREE.transitions.forEach(function (t) {
      var a = flowIndex[t.originFlowElementId];
      var b = flowIndex[t.destinationFlowElementId];
      if (!isVisible(a) || !isVisible(b)) {
        return;
      }
      drawLine(svg, center(a), center(b), "transition", t);
    });
  }

  // ---------- Vista jerárquica (lista) ----------
  function buildListGroupRow(g, depth, container) {
    var key = groupKey(g);
    var isExpanded = expandedKeys.has(key);

    var row = document.createElement("div");
    row.className = "hlist-row";
    row.dataset.key = key;
    row.setAttribute("tabindex", "0");
    row.setAttribute("role", "button");
    row.innerHTML =
      '<button type="button" class="hlist-toggle" aria-label="' +
      (isExpanded ? "Contraer" : "Expandir") +
      '">' +
      (isExpanded ? "▾" : "▸") +
      '</button><span class="node-kind-label">' +
      (depth === 1 ? "Bloque" : "Subbloque") +
      '</span><span class="hlist-name">' +
      esc(g.name) +
      "</span>" +
      (g.dynamicConfiguration ? '<span class="badge badge-dynamic">' + esc(g.dynamicConfiguration.dynamicName) + "</span>" : "");
    row.querySelector(".hlist-toggle").addEventListener("click", function (ev) {
      ev.stopPropagation();
      if (expandedKeys.has(key)) {
        expandedKeys.delete(key);
      } else {
        expandedKeys.add(key);
      }
      renderList();
      renderDiagram();
    });
    row.addEventListener("click", function () {
      selectKey(key);
    });
    row.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        selectKey(key);
      }
    });
    container.appendChild(row);

    if (isExpanded) {
      var childWrap = document.createElement("div");
      childWrap.className = "hlist-children";
      g.content
        .slice()
        .sort(byPosition)
        .forEach(function (ci) {
          if (ci.kind === "group") {
            buildListGroupRow(ci.item, depth + 1, childWrap);
          } else {
            buildListExerciseRow(ci.item, childWrap);
          }
        });
      container.appendChild(childWrap);
    }
  }

  function buildListExerciseRow(e, container) {
    var key = exKey(e);
    var row = document.createElement("div");
    row.className = "hlist-row";
    row.dataset.key = key;
    row.setAttribute("tabindex", "0");
    row.setAttribute("role", "button");
    row.innerHTML =
      '<span class="hlist-toggle"></span><span class="node-kind-label">Ejercicio</span><span class="hlist-name">' +
      esc(e.exerciseName) +
      '</span><span class="hlist-summary">' +
      esc(e.prescriptionSummary || "") +
      "</span>";
    row.addEventListener("click", function () {
      selectKey(key);
    });
    row.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        selectKey(key);
      }
    });
    container.appendChild(row);
  }

  function renderList() {
    var root = document.getElementById("hierarchyList");
    root.innerHTML = "";
    WORKOUT_TREE.sections
      .slice()
      .sort(byPosition)
      .forEach(function (s) {
        var wrap = document.createElement("div");
        wrap.className = "hlist-section";
        wrap.dataset.key = sectionKey(s);

        var title = document.createElement("div");
        title.className = "hlist-section-title";
        title.textContent = "Sección " + s.position + " — " + s.name;
        title.style.cursor = "pointer";
        title.addEventListener("click", function () {
          selectKey(sectionKey(s));
        });
        wrap.appendChild(title);

        s.groups
          .slice()
          .sort(byPosition)
          .forEach(function (mg) {
            buildListGroupRow(mg.group, 1, wrap);
          });

        root.appendChild(wrap);
      });
    applySelectionHighlight();
  }

  // ---------- Zoom / paneo ----------
  function applyTransform() {
    var world = document.getElementById("canvasWorld");
    world.style.transform = "translate(" + panX + "px," + panY + "px) scale(" + scale + ")";
    document.getElementById("zoomLevel").textContent = Math.round(scale * 100) + "%";
  }

  function zoomBy(delta) {
    scale = Math.max(0.4, Math.min(2, scale + delta));
    applyTransform();
    requestAnimationFrame(drawArrows);
  }

  function fitView() {
    var viewport = document.getElementById("canvasViewport");
    var treeRoot = document.getElementById("canvasTree");
    var vw = viewport.clientWidth;
    var vh = viewport.clientHeight;
    var tw = treeRoot.scrollWidth + 48;
    var th = treeRoot.scrollHeight + 48;
    if (tw <= 0 || th <= 0) {
      return;
    }
    var s = Math.min(vw / tw, vh / th, 1);
    scale = Math.max(0.3, s);
    panX = Math.max(10, (vw - tw * scale) / 2);
    panY = 16;
    applyTransform();
    requestAnimationFrame(drawArrows);
  }

  function wireCanvasInteraction() {
    var viewport = document.getElementById("canvasViewport");
    var isPanning = false;
    var startX = 0;
    var startY = 0;
    var origX = 0;
    var origY = 0;

    viewport.addEventListener("mousedown", function (ev) {
      if (ev.target.closest(".node") || ev.target.closest(".section-lane-header")) {
        return;
      }
      isPanning = true;
      viewport.classList.add("panning");
      startX = ev.clientX;
      startY = ev.clientY;
      origX = panX;
      origY = panY;
    });
    window.addEventListener("mousemove", function (ev) {
      if (!isPanning) {
        return;
      }
      panX = origX + (ev.clientX - startX);
      panY = origY + (ev.clientY - startY);
      applyTransform();
    });
    window.addEventListener("mouseup", function () {
      if (isPanning) {
        isPanning = false;
        viewport.classList.remove("panning");
        requestAnimationFrame(drawArrows);
      }
    });

    viewport.addEventListener(
      "touchstart",
      function (ev) {
        if (ev.target.closest(".node") || ev.touches.length !== 1) {
          return;
        }
        isPanning = true;
        startX = ev.touches[0].clientX;
        startY = ev.touches[0].clientY;
        origX = panX;
        origY = panY;
      },
      { passive: true }
    );
    viewport.addEventListener(
      "touchmove",
      function (ev) {
        if (!isPanning || ev.touches.length !== 1) {
          return;
        }
        panX = origX + (ev.touches[0].clientX - startX);
        panY = origY + (ev.touches[0].clientY - startY);
        applyTransform();
      },
      { passive: true }
    );
    viewport.addEventListener("touchend", function () {
      if (isPanning) {
        isPanning = false;
        requestAnimationFrame(drawArrows);
      }
    });

    viewport.addEventListener(
      "wheel",
      function (ev) {
        ev.preventDefault();
        zoomBy(ev.deltaY < 0 ? 0.1 : -0.1);
      },
      { passive: false }
    );

    document.getElementById("btnZoomIn").addEventListener("click", function () {
      zoomBy(0.15);
    });
    document.getElementById("btnZoomOut").addEventListener("click", function () {
      zoomBy(-0.15);
    });
    document.getElementById("btnFitView").addEventListener("click", fitView);
  }

  // ---------- Controles de comparación (vista / orden / detalle) ----------
  function wireSegControl(containerId, onChange) {
    var container = document.getElementById(containerId);
    container.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        container.querySelectorAll("button").forEach(function (b) {
          b.classList.remove("active");
        });
        btn.classList.add("active");
        onChange(btn.dataset.value);
      });
    });
  }

  function setViewMode(mode) {
    viewMode = mode;
    document.getElementById("viewDiagram").style.display = mode === "diagram" ? "" : "none";
    document.getElementById("viewList").style.display = mode === "list" ? "" : "none";
    if (mode === "diagram") {
      requestAnimationFrame(drawArrows);
    }
  }

  function setOrderStyle(mode) {
    orderStyleMode = mode;
    drawArrows();
  }

  function setDetailStyle(mode) {
    detailStyleMode = mode;
    renderDetail();
  }

  // ---------- Cabecera del entrenamiento ----------
  function renderWorkoutHeader() {
    var w = WORKOUT_TREE.workout;
    document.getElementById("workoutTitle").textContent = w.title;
    var typeBadge = w.type === "DAILY_CLASS" ? "Clase del día" : "Personal";
    var meta =
      '<span class="badge badge-daily">' +
      esc(typeBadge) +
      "</span>" +
      '<span class="badge badge-active">Activo</span>' +
      (w.date ? "<span>" + esc(w.date) + "</span>" : "");
    document.getElementById("workoutMeta").innerHTML = meta;
  }

  // ---------- Modal: cierre con Escape y clic fuera ----------
  function wireModal() {
    document.getElementById("modalCloseBtn").addEventListener("click", closeModal);
    document.getElementById("modalOverlay").addEventListener("click", function (ev) {
      if (ev.target === ev.currentTarget) {
        closeModal();
      }
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key === "Escape") {
        closeModal();
      }
    });
  }

  // ---------- Arranque ----------
  document.addEventListener("DOMContentLoaded", function () {
    buildDataIndex();
    expandAllInitially();
    renderWorkoutHeader();
    wireCanvasInteraction();
    wireModal();
    wireSegControl("segView", setViewMode);
    wireSegControl("segOrder", setOrderStyle);
    wireSegControl("segDetail", setDetailStyle);

    renderDiagram();
    renderList();
    renderDetail();
    applyTransform();
    requestAnimationFrame(fitView);

    window.addEventListener("resize", function () {
      requestAnimationFrame(drawArrows);
    });
  });
})();
