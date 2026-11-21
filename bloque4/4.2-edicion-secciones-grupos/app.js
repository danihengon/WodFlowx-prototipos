/*
 * Lógica del prototipo del subbloque 4.2 (edición de secciones y grupos
 * principales). HTML + CSS + JavaScript local únicamente: sin React, sin
 * React Flow, sin peticiones HTTP, sin localStorage. Todo el estado vive en
 * variables de este archivo y se pierde al recargar la página o al cambiar
 * de escenario de prueba, a propósito.
 *
 * Base: copia adaptada de app.js del prototipo aprobado 4.1 (mismo lienzo
 * HTML+SVG, mismo layout, mismas interacciones de zoom/paneo táctil, sin
 * tocarlas). Lo nuevo de 4.2 son las operaciones de mutación sobre un árbol
 * en memoria (crear/editar/mover/eliminar sección o grupo principal) y los
 * formularios/diálogos que las disparan.
 *
 * Fidelidad a las reglas reales del backend (ver informe de la Fase A):
 *  - Nombre obligatorio, descripción libre, en ambos formularios
 *    (SectionRequest/SectionGroupRequest, @NotBlank name).
 *  - Reordenar = renumeración consecutiva desde 1 (SectionService/
 *    SectionGroupService.renumberSafely), nunca huecos ni intercambios
 *    parciales.
 *  - Eliminar una sección con grupos está BLOQUEADO (sin cascada): mismo
 *    409 real de SectionService.deleteSection.
 *  - Eliminar un grupo principal SÍ borra en cascada su contenido completo
 *    (subgrupos, ejercicios, dinámica propia, transiciones con un extremo
 *    en el subárbol): mismo comportamiento real de GroupSubtreeDeleter.
 *  - No existe "mover un grupo a otra sección": el backend real no expone
 *    ese endpoint (SectionGroupService no lo soporta); por eso este
 *    prototipo no ofrece ese control (ver limitaciones en el informe).
 */

(function () {
  "use strict";

  // ---------- Estado ----------
  var TREE = null;
  var currentScenarioKey = "C";

  var selectedKey = null;
  var expandedKeys = new Set();
  var viewMode = "diagram"; // 'diagram' | 'list'
  var orderStyleMode = "A"; // 'A' sin flechas de orden | 'B' con flechas de orden
  var detailStyleMode = "panel"; // 'panel' | 'modal'
  var scale = 1;
  var panX = 40;
  var panY = 20;

  var dataIndex = {};
  var flowNameIndex = {};
  var flowTypeIndex = {};
  var nodeElements = {};
  var flowIndex = {};
  var orderContainers = [];

  var lastFocusedBeforeModal = null;

  var nextSectionId = 1;
  var nextSectionGroupId = 1;
  var nextGroupId = 1;
  var nextFlowElementId = 1;

  var formContext = null; // { kind: 'section'|'group', sectionId, editId }
  var pendingOnConfirm = null;

  // ---------- Utilidades ----------
  function esc(value) {
    return (value === null || value === undefined ? "" : String(value)).replace(
      /[&<>"]/g,
      function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
      }
    );
  }

  function sectionKeyOf(s) {
    return "section:" + s.sectionId;
  }
  function groupKeyOf(g) {
    return "group:" + g.groupId;
  }
  function exKeyOf(e) {
    return "ex:" + e.exerciseOccurrenceId;
  }

  function byPosition(a, b) {
    return a.position - b.position;
  }

  // ---------- Escenarios ----------
  function recomputeIdCounters() {
    var maxSection = 0, maxSectionGroup = 0, maxGroup = 0, maxFlow = 0;
    function walkGroup(g) {
      maxGroup = Math.max(maxGroup, g.groupId);
      maxFlow = Math.max(maxFlow, g.flowElementId);
      g.content.forEach(function (ci) {
        if (ci.kind === "group") {
          walkGroup(ci.item);
        } else {
          maxFlow = Math.max(maxFlow, ci.item.flowElementId);
        }
      });
    }
    TREE.sections.forEach(function (s) {
      maxSection = Math.max(maxSection, s.sectionId);
      s.groups.forEach(function (mg) {
        maxSectionGroup = Math.max(maxSectionGroup, mg.sectionGroupId);
        walkGroup(mg.group);
      });
    });
    nextSectionId = maxSection + 1;
    nextSectionGroupId = maxSectionGroup + 1;
    nextGroupId = maxGroup + 1;
    nextFlowElementId = maxFlow + 1;
  }

  function resetToScenario(key) {
    currentScenarioKey = key;
    TREE = cloneScenario(key);
    recomputeIdCounters();
    selectedKey = null;
    closeOverlay("modalOverlay");
    closeOverlay("formOverlay");
    closeOverlay("confirmOverlay");
    rebuildDataIndex();
    expandAllInitially();
    renderWorkoutHeader();
    renderEditorBody();
    renderDiagram();
    renderList();
    renderDetail();
    requestAnimationFrame(fitView);
  }

  // ---------- Índice de datos ----------
  function indexExercise(e) {
    dataIndex[exKeyOf(e)] = { type: "exercise", data: e };
    flowNameIndex[e.flowElementId] = e.exerciseName;
    flowTypeIndex[e.flowElementId] = "exercise";
  }

  function indexGroup(g, depth) {
    dataIndex[groupKeyOf(g)] = { type: "group", data: g, depth: depth };
    flowNameIndex[g.flowElementId] = g.name;
    flowTypeIndex[g.flowElementId] = "group";
    g.content.slice().forEach(function (ci) {
      if (ci.kind === "group") {
        indexGroup(ci.item, depth + 1);
      } else {
        indexExercise(ci.item);
      }
    });
  }

  function indexSection(s) {
    dataIndex[sectionKeyOf(s)] = { type: "section", data: s };
    s.groups.forEach(function (mg) {
      indexGroup(mg.group, 1);
    });
  }

  function rebuildDataIndex() {
    dataIndex = {};
    flowNameIndex = {};
    flowTypeIndex = {};
    TREE.sections.forEach(indexSection);
  }

  function expandAllInitially() {
    expandedKeys = new Set();
    Object.keys(dataIndex).forEach(function (key) {
      if (dataIndex[key].type === "group") {
        expandedKeys.add(key);
      }
    });
  }

  // ---------- Búsquedas en el árbol ----------
  function findSection(sectionId) {
    for (var i = 0; i < TREE.sections.length; i++) {
      if (TREE.sections[i].sectionId === sectionId) {
        return TREE.sections[i];
      }
    }
    return null;
  }

  function findMainGroupEntry(sectionGroupId) {
    for (var i = 0; i < TREE.sections.length; i++) {
      var sec = TREE.sections[i];
      for (var j = 0; j < sec.groups.length; j++) {
        if (sec.groups[j].sectionGroupId === sectionGroupId) {
          return { section: sec, mg: sec.groups[j] };
        }
      }
    }
    return null;
  }

  // ---------- Mutaciones: secciones ----------
  function renumberSections() {
    TREE.sections.sort(byPosition);
    TREE.sections.forEach(function (s, idx) {
      s.position = idx + 1;
    });
  }

  function renumberGroups(sec) {
    sec.groups.sort(byPosition);
    sec.groups.forEach(function (mg, idx) {
      mg.position = idx + 1;
    });
  }

  function createSectionLocal(name, description) {
    var s = section(nextSectionId++, TREE.sections.length + 1, name, []);
    s.description = description || "";
    TREE.sections.push(s);
    return s;
  }

  function updateSectionLocal(sectionId, name, description) {
    var s = findSection(sectionId);
    if (!s) {
      return;
    }
    s.name = name;
    s.description = description || "";
  }

  function moveSectionBy(sectionId, delta) {
    TREE.sections.sort(byPosition);
    var idx = -1;
    for (var i = 0; i < TREE.sections.length; i++) {
      if (TREE.sections[i].sectionId === sectionId) {
        idx = i;
        break;
      }
    }
    var newIdx = idx + delta;
    if (idx < 0 || newIdx < 0 || newIdx >= TREE.sections.length) {
      return;
    }
    var moved = TREE.sections.splice(idx, 1)[0];
    TREE.sections.splice(newIdx, 0, moved);
    renumberSections();
    afterMutation(selectedKey);
  }

  function deleteSectionLocal(sectionId) {
    TREE.sections = TREE.sections.filter(function (s) {
      return s.sectionId !== sectionId;
    });
    renumberSections();
  }

  // ---------- Mutaciones: grupos principales ----------
  function createGroupLocal(sectionId, name, description) {
    var sec = findSection(sectionId);
    if (!sec) {
      return null;
    }
    var g = grp(nextGroupId++, nextFlowElementId++, name, description, []);
    var mg = mainGroup(nextSectionGroupId++, sec.groups.length + 1, g);
    sec.groups.push(mg);
    return mg;
  }

  function updateGroupLocal(sectionGroupId, name, description) {
    var entry = findMainGroupEntry(sectionGroupId);
    if (!entry) {
      return;
    }
    entry.mg.group.name = name;
    entry.mg.group.description = description || "";
  }

  function moveGroupBy(sectionGroupId, delta) {
    var entry = findMainGroupEntry(sectionGroupId);
    if (!entry) {
      return;
    }
    var sec = entry.section;
    sec.groups.sort(byPosition);
    var idx = -1;
    for (var i = 0; i < sec.groups.length; i++) {
      if (sec.groups[i].sectionGroupId === sectionGroupId) {
        idx = i;
        break;
      }
    }
    var newIdx = idx + delta;
    if (idx < 0 || newIdx < 0 || newIdx >= sec.groups.length) {
      return;
    }
    var moved = sec.groups.splice(idx, 1)[0];
    sec.groups.splice(newIdx, 0, moved);
    renumberGroups(sec);
    afterMutation(selectedKey);
  }

  function collectFlowElementIds(groupNode) {
    var ids = [groupNode.flowElementId];
    groupNode.content.forEach(function (ci) {
      if (ci.kind === "group") {
        ids = ids.concat(collectFlowElementIds(ci.item));
      } else {
        ids.push(ci.item.flowElementId);
      }
    });
    return ids;
  }

  function collectSubtreeStats(groupNode) {
    var subgroupCount = 0;
    var exerciseCount = 0;
    function walk(node) {
      node.content.forEach(function (ci) {
        if (ci.kind === "group") {
          subgroupCount++;
          walk(ci.item);
        } else {
          exerciseCount++;
        }
      });
    }
    walk(groupNode);
    var ids = collectFlowElementIds(groupNode);
    var idSet = {};
    ids.forEach(function (id) {
      idSet[id] = true;
    });
    var transitionCount = TREE.transitions.filter(function (t) {
      return idSet[t.originFlowElementId] || idSet[t.destinationFlowElementId];
    }).length;
    return { subgroupCount: subgroupCount, exerciseCount: exerciseCount, transitionCount: transitionCount };
  }

  function deleteGroupLocal(sectionGroupId) {
    var entry = findMainGroupEntry(sectionGroupId);
    if (!entry) {
      return;
    }
    var ids = collectFlowElementIds(entry.mg.group);
    var idSet = {};
    ids.forEach(function (id) {
      idSet[id] = true;
    });
    TREE.transitions = TREE.transitions.filter(function (t) {
      return !(idSet[t.originFlowElementId] || idSet[t.destinationFlowElementId]);
    });
    entry.section.groups = entry.section.groups.filter(function (mg) {
      return mg.sectionGroupId !== sectionGroupId;
    });
    renumberGroups(entry.section);
  }

  // ---------- Re-render tras una mutación ----------
  function afterMutation(selectKeyAfter) {
    rebuildDataIndex();
    renderEditorBody();
    renderDiagram();
    renderList();
    if (selectKeyAfter && dataIndex[selectKeyAfter]) {
      selectKey(selectKeyAfter);
    } else {
      selectedKey = null;
      applySelectionHighlight();
      renderDetail();
    }
  }

  // ---------- Formularios (alta/edición) ----------
  function buildSectionFormHtml(existing) {
    var name = existing ? esc(existing.name) : "";
    var desc = existing ? esc(existing.description || "") : "";
    return (
      '<p class="form-scope-note">Campos reales admitidos por el backend (<code>SectionRequest</code>): nombre obligatorio, descripción libre.</p>' +
      '<div class="field"><label for="fSectionName">Nombre *</label>' +
      '<input type="text" id="fSectionName" value="' + name + '" maxlength="120" /></div>' +
      '<div id="fSectionNameError" class="field-error" style="display:none;"></div>' +
      '<div class="field"><label for="fSectionDesc">Descripción</label>' +
      "<textarea id=\"fSectionDesc\">" + desc + "</textarea></div>" +
      '<div class="modal-footer">' +
      '<button type="button" class="btn btn-secondary" id="formCancelBtn">Cancelar</button>' +
      '<button type="button" class="btn btn-primary" id="formSaveBtn">Guardar</button>' +
      "</div>"
    );
  }

  function buildGroupFormHtml(sec, existing) {
    var name = existing ? esc(existing.name) : "";
    var desc = existing ? esc(existing.description || "") : "";
    return (
      '<p class="field-hint">Sección: <strong>' + esc(sec.name) + "</strong></p>" +
      '<p class="form-scope-note">Campos reales admitidos por el backend (<code>SectionGroupRequest</code>): nombre obligatorio, descripción libre. Los subgrupos y ejercicios se gestionan en subbloques posteriores (4.3+).</p>' +
      '<div class="field"><label for="fGroupName">Nombre *</label>' +
      '<input type="text" id="fGroupName" value="' + name + '" maxlength="120" /></div>' +
      '<div id="fGroupNameError" class="field-error" style="display:none;"></div>' +
      '<div class="field"><label for="fGroupDesc">Descripción</label>' +
      "<textarea id=\"fGroupDesc\">" + desc + "</textarea></div>" +
      '<div class="modal-footer">' +
      '<button type="button" class="btn btn-secondary" id="formCancelBtn">Cancelar</button>' +
      '<button type="button" class="btn btn-primary" id="formSaveBtn">Guardar</button>' +
      "</div>"
    );
  }

  function openSectionForm(sectionId) {
    var existing = sectionId ? findSection(sectionId) : null;
    formContext = { kind: "section", sectionId: null, editId: sectionId || null };
    document.getElementById("formTitle").textContent = existing ? "Editar sección" : "Añadir sección";
    document.getElementById("formBody").innerHTML = buildSectionFormHtml(existing);
    wireFormFooterButtons();
    openOverlay("formOverlay", "fSectionName");
  }

  function openGroupForm(sectionId, sectionGroupId) {
    var sec = findSection(sectionId);
    if (!sec) {
      return;
    }
    var existingEntry = sectionGroupId ? findMainGroupEntry(sectionGroupId) : null;
    formContext = { kind: "group", sectionId: sectionId, editId: sectionGroupId || null };
    document.getElementById("formTitle").textContent = existingEntry ? "Editar grupo" : "Añadir grupo";
    document.getElementById("formBody").innerHTML = buildGroupFormHtml(sec, existingEntry ? existingEntry.mg.group : null);
    wireFormFooterButtons();
    openOverlay("formOverlay", "fGroupName");
  }

  function wireFormFooterButtons() {
    document.getElementById("formCancelBtn").addEventListener("click", function () {
      closeOverlay("formOverlay");
    });
    document.getElementById("formSaveBtn").addEventListener("click", saveForm);
  }

  function saveForm() {
    if (!formContext) {
      return;
    }
    if (formContext.kind === "section") {
      var nameInput = document.getElementById("fSectionName");
      var descInput = document.getElementById("fSectionDesc");
      var name = nameInput.value.trim();
      if (!name) {
        nameInput.classList.add("invalid");
        var err = document.getElementById("fSectionNameError");
        err.textContent = "El nombre de la sección es obligatorio.";
        err.style.display = "block";
        nameInput.focus();
        return;
      }
      var newKey;
      if (formContext.editId) {
        updateSectionLocal(formContext.editId, name, descInput.value.trim());
        newKey = "section:" + formContext.editId;
      } else {
        var created = createSectionLocal(name, descInput.value.trim());
        newKey = sectionKeyOf(created);
      }
      closeOverlay("formOverlay");
      afterMutation(newKey);
    } else {
      var gNameInput = document.getElementById("fGroupName");
      var gDescInput = document.getElementById("fGroupDesc");
      var gName = gNameInput.value.trim();
      if (!gName) {
        gNameInput.classList.add("invalid");
        var gErr = document.getElementById("fGroupNameError");
        gErr.textContent = "El nombre del grupo es obligatorio.";
        gErr.style.display = "block";
        gNameInput.focus();
        return;
      }
      var newGroupKey;
      if (formContext.editId) {
        updateGroupLocal(formContext.editId, gName, gDescInput.value.trim());
        var entry = findMainGroupEntry(formContext.editId);
        newGroupKey = groupKeyOf(entry.mg.group);
      } else {
        var createdMg = createGroupLocal(formContext.sectionId, gName, gDescInput.value.trim());
        newGroupKey = groupKeyOf(createdMg.group);
        expandedKeys.add(newGroupKey);
      }
      closeOverlay("formOverlay");
      afterMutation(newGroupKey);
    }
  }

  // ---------- Confirmación de eliminación ----------
  function openConfirm(options) {
    document.getElementById("confirmTitle").textContent = options.title;
    document.getElementById("confirmBody").innerHTML = options.html;
    var okBtn = document.getElementById("confirmOkBtn");
    var cancelBtn = document.getElementById("confirmCancelBtn");
    if (options.blocked) {
      okBtn.style.display = "none";
      cancelBtn.textContent = "Entendido";
      pendingOnConfirm = null;
    } else {
      okBtn.style.display = "";
      okBtn.textContent = options.confirmLabel || "Eliminar";
      cancelBtn.textContent = "Cancelar";
      pendingOnConfirm = options.onConfirm || null;
    }
    openOverlay("confirmOverlay", options.blocked ? "confirmCancelBtn" : "confirmCancelBtn");
  }

  function requestDeleteSection(sectionId) {
    var s = findSection(sectionId);
    if (!s) {
      return;
    }
    if (s.groups.length > 0) {
      openConfirm({
        title: "No es posible eliminar esta sección",
        blocked: true,
        html:
          '<p class="confirm-consequences">La sección «' + esc(s.name) + "» contiene " + s.groups.length +
          " grupo(s) principal(es).</p>" +
          '<p class="confirm-warning">El backend real (<code>SectionService.deleteSection</code>) rechaza esta operación con un error 409 mientras existan grupos asociados: no hay eliminación en cascada para secciones. Elimina primero cada grupo principal.</p>',
      });
      return;
    }
    openConfirm({
      title: "Eliminar sección",
      html: '<p class="confirm-consequences">¿Eliminar la sección «' + esc(s.name) + '»? Está vacía: no hay ningún grupo que se vea afectado.</p>',
      confirmLabel: "Eliminar sección",
      onConfirm: function () {
        deleteSectionLocal(sectionId);
        closeModal();
        afterMutation(null);
      },
    });
  }

  function requestDeleteGroup(sectionGroupId) {
    var entry = findMainGroupEntry(sectionGroupId);
    if (!entry) {
      return;
    }
    var g = entry.mg.group;
    var stats = collectSubtreeStats(g);
    var parts = [];
    if (stats.subgroupCount) {
      parts.push(stats.subgroupCount + " subgrupo(s)");
    }
    if (stats.exerciseCount) {
      parts.push(stats.exerciseCount + " ejercicio(s)");
    }
    if (stats.transitionCount) {
      parts.push(stats.transitionCount + " transición(es)");
    }
    var html = '<p class="confirm-consequences">¿Eliminar el grupo «' + esc(g.name) + "»?</p>";
    if (parts.length) {
      html +=
        '<p class="confirm-warning">Esto eliminará también, en cascada, ' + parts.join(", ") +
        " — igual que el backend real (<code>GroupSubtreeDeleter</code>). Esta acción no se puede deshacer.</p>";
    } else {
      html += '<p class="confirm-consequences">No contiene ningún elemento adicional.</p>';
    }
    openConfirm({
      title: "Eliminar grupo",
      html: html,
      confirmLabel: "Eliminar grupo",
      onConfirm: function () {
        deleteGroupLocal(sectionGroupId);
        closeModal();
        afterMutation(null);
      },
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

  function rowsHtml(rows) {
    return rows
      .map(function (r) {
        return '<div class="detail-row"><div class="detail-row-label">' + esc(r[0]) + '</div><div class="detail-row-value">' + r[1] + "</div></div>";
      })
      .join("");
  }

  function detailHtmlForSection(s) {
    var groupsSorted = s.groups.slice().sort(byPosition);
    var groupNames = groupsSorted.map(function (mg) {
      return esc(mg.group.name);
    }).join(", ");
    var rows = [
      ["Orden en el entrenamiento", "Posición " + s.position + " de " + TREE.sections.length],
      ["Grupos principales que contiene", groupNames || "(sin grupos)"],
    ];
    if (s.description) {
      rows.push(["Descripción", esc(s.description)]);
    }

    var sortedSections = TREE.sections.slice().sort(byPosition);
    var idx = sortedSections.findIndex(function (x) {
      return x.sectionId === s.sectionId;
    });
    var isFirst = idx === 0;
    var isLast = idx === sortedSections.length - 1;

    var actions =
      '<button type="button" class="btn btn-primary" data-action="add-group" data-section-id="' + s.sectionId + '">Añadir grupo en esta sección</button>' +
      '<button type="button" class="btn btn-secondary" data-action="edit-section" data-id="' + s.sectionId + '">Editar sección</button>' +
      '<button type="button" class="btn btn-secondary" data-action="move-section-up" data-id="' + s.sectionId + '"' + (isFirst ? " disabled" : "") + '>Subir</button>' +
      '<button type="button" class="btn btn-secondary" data-action="move-section-down" data-id="' + s.sectionId + '"' + (isLast ? " disabled" : "") + '>Bajar</button>' +
      '<button type="button" class="btn btn-danger" data-action="delete-section" data-id="' + s.sectionId + '"' +
      (s.groups.length > 0 ? ' title="No se puede eliminar: contiene ' + s.groups.length + ' grupo(s). Elimina primero sus grupos."' : "") +
      ">Eliminar sección</button>";

    var blockedNote =
      s.groups.length > 0
        ? '<p class="detail-blocked-note">Esta sección no se puede eliminar todavía: contiene ' + s.groups.length + " grupo(s) principal(es). El backend real rechaza la eliminación mientras existan (sin cascada para secciones).</p>"
        : "";

    return (
      '<h3 class="detail-title">' + esc(s.name) + '</h3><div class="detail-kind">Sección</div>' +
      rowsHtml(rows) +
      '<div class="detail-actions">' + actions + "</div>" +
      blockedNote
    );
  }

  function detailHtmlForGroup(g, depth, sectionGroupId) {
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
    var related = TREE.transitions.filter(function (t) {
      return t.originFlowElementId === g.flowElementId || t.destinationFlowElementId === g.flowElementId;
    });
    rows.push(["Transiciones relacionadas", describeRelatedTransitions(related)]);

    var actionsHtml = "";
    var blockedNote = "";
    if (sectionGroupId !== null && depth === 1) {
      // Solo los grupos principales (depth 1) se gestionan en 4.2; los
      // subgrupos (depth > 1) se gestionarán en 4.3+ — por eso no reciben
      // estas acciones, para no simular una operación que el backend
      // actual no respalda todavía (SectionGroupService es exclusivo de
      // SECTION_GROUP, nunca de subgrupos anidados vía GROUP_CONTENT).
      var entry = findMainGroupEntry(sectionGroupId);
      var sortedGroups = entry.section.groups.slice().sort(byPosition);
      var idx = sortedGroups.findIndex(function (mg) {
        return mg.sectionGroupId === sectionGroupId;
      });
      var isFirst = idx === 0;
      var isLast = idx === sortedGroups.length - 1;
      actionsHtml =
        '<button type="button" class="btn btn-secondary" data-action="edit-group" data-section-id="' + entry.section.sectionId + '" data-section-group-id="' + sectionGroupId + '">Editar grupo</button>' +
        '<button type="button" class="btn btn-secondary" data-action="move-group-up" data-section-group-id="' + sectionGroupId + '"' + (isFirst ? " disabled" : "") + '>Subir</button>' +
        '<button type="button" class="btn btn-secondary" data-action="move-group-down" data-section-group-id="' + sectionGroupId + '"' + (isLast ? " disabled" : "") + '>Bajar</button>' +
        '<button type="button" class="btn btn-danger" data-action="delete-group" data-section-group-id="' + sectionGroupId + '">Eliminar grupo</button>' +
        '<button type="button" class="btn btn-secondary" disabled title="Fuera de alcance de 4.2">Añadir ejercicio (bloque 4.3)</button>' +
        '<button type="button" class="btn btn-secondary" disabled title="Fuera de alcance de 4.2">Configurar dinámica (bloque 4.6)</button>';
    } else {
      actionsHtml =
        '<button type="button" class="btn btn-secondary" disabled title="Los subgrupos se gestionarán en el bloque 4.3">Editar subbloque (bloque 4.3)</button>';
      blockedNote = '<p class="detail-readonly-note">Este subbloque (4.2) gestiona únicamente secciones y grupos principales. La edición de subgrupos anidados llegará en 4.3.</p>';
    }

    return (
      '<h3 class="detail-title">' + esc(g.name) + '</h3><div class="detail-kind">' +
      (depth === 1 ? "Grupo principal" : "Subbloque (subgrupo, nivel " + depth + ")") +
      "</div>" +
      rowsHtml(rows) +
      '<div class="detail-actions">' + actionsHtml + "</div>" +
      blockedNote
    );
  }

  function detailHtmlForExercise(e) {
    var detailRows = e.prescriptionDetail
      .map(function (d) {
        return esc(d.label) + ": " + esc(d.value);
      })
      .join(", ");
    var relatedEx = TREE.transitions.filter(function (t) {
      return t.originFlowElementId === e.flowElementId || t.destinationFlowElementId === e.flowElementId;
    });
    var rows = [
      ["Resumen de la prescripción", esc(e.prescriptionSummary || "(sin prescripción)")],
      ["Valores de la prescripción", detailRows || "(sin valores)"],
      ["Transiciones relacionadas", describeRelatedTransitions(relatedEx)],
    ];
    var actions = ["Editar prescripción (bloque 4.4)", "Cambiar de ejercicio (bloque 4.3)", "Mover (bloque 4.3)"]
      .map(function (a) {
        return '<button type="button" class="btn btn-secondary" disabled>' + esc(a) + "</button>";
      })
      .join("");
    return (
      '<h3 class="detail-title">' + esc(e.exerciseName) + '</h3><div class="detail-kind">Ejercicio (aparición en el flujo)</div>' +
      rowsHtml(rows) +
      '<div class="detail-actions">' + actions + "</div>" +
      '<p class="detail-readonly-note">Los ejercicios son de solo lectura en este subbloque: se gestionarán en 4.3 (añadir/mover/cambiar) y 4.4 (prescripción).</p>'
    );
  }

  function detailHtmlForKey(key) {
    var entry = dataIndex[key];
    if (!entry) {
      return null;
    }
    if (entry.type === "section") {
      return detailHtmlForSection(entry.data);
    }
    if (entry.type === "group") {
      var sgId = null;
      if (entry.depth === 1) {
        for (var i = 0; i < TREE.sections.length; i++) {
          var found = TREE.sections[i].groups.filter(function (mg) {
            return mg.group.groupId === entry.data.groupId;
          })[0];
          if (found) {
            sgId = found.sectionGroupId;
            break;
          }
        }
      }
      return detailHtmlForGroup(entry.data, entry.depth, sgId);
    }
    return detailHtmlForExercise(entry.data);
  }

  function effectiveDetailMode() {
    return window.innerWidth <= 760 ? "modal" : detailStyleMode;
  }

  function renderDetail() {
    var html = selectedKey ? detailHtmlForKey(selectedKey) : null;
    var title = selectedKey && dataIndex[selectedKey] ? titleOf(dataIndex[selectedKey]) : "Detalle";
    var placeholder = '<p class="detail-panel-placeholder">Selecciona una sección o un grupo principal del diagrama o de la lista para ver y gestionar aquí sus datos.</p>';

    if (effectiveDetailMode() === "modal") {
      if (html) {
        document.getElementById("modalBody").innerHTML = html;
        document.getElementById("modalTitle").textContent = title;
        openModal();
      }
      document.getElementById("detailPanelBody").innerHTML = placeholder;
    } else {
      document.getElementById("detailPanelBody").innerHTML = html || placeholder;
      closeModal();
    }
  }

  function titleOf(entry) {
    if (entry.type === "section") {
      return entry.data.name;
    }
    if (entry.type === "group") {
      return entry.data.name;
    }
    return entry.data.exerciseName;
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

  // ---------- Overlays (modal de detalle, formulario, confirmación) ----------
  function openOverlay(id, focusId) {
    var overlay = document.getElementById(id);
    if (overlay.classList.contains("open")) {
      return;
    }
    lastFocusedBeforeModal = document.activeElement;
    overlay.classList.add("open");
    var toFocus = focusId ? document.getElementById(focusId) : overlay.querySelector("button, input, textarea");
    if (toFocus) {
      toFocus.focus();
    }
  }

  function closeOverlay(id) {
    var overlay = document.getElementById(id);
    if (!overlay.classList.contains("open")) {
      return;
    }
    overlay.classList.remove("open");
    if (lastFocusedBeforeModal && document.contains(lastFocusedBeforeModal)) {
      lastFocusedBeforeModal.focus();
    }
  }

  function openModal() {
    openOverlay("modalOverlay");
  }
  function closeModal() {
    closeOverlay("modalOverlay");
  }

  // ---------- Diagrama ----------
  function buildExerciseEl(e) {
    var key = exKeyOf(e);
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
    var key = groupKeyOf(g);
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

    TREE.sections
      .slice()
      .sort(byPosition)
      .forEach(function (s) {
        var lane = document.createElement("div");
        lane.className = "section-lane";
        lane.dataset.key = sectionKeyOf(s);

        var header = document.createElement("div");
        header.className = "section-lane-header";
        header.setAttribute("role", "button");
        header.setAttribute("tabindex", "0");
        header.innerHTML = '<span class="section-order">Sección ' + s.position + "</span> — " + esc(s.name);
        header.addEventListener("click", function (ev) {
          ev.stopPropagation();
          selectKey(sectionKeyOf(s));
        });
        header.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            selectKey(sectionKeyOf(s));
          }
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

        if (!s.groups.length) {
          var hint = document.createElement("div");
          hint.className = "lane-empty-hint";
          hint.textContent = "Esta sección todavía no tiene ningún grupo.";
          lane.appendChild(hint);
        }

        var footer = document.createElement("div");
        footer.className = "lane-footer";
        footer.innerHTML = '<button type="button" class="btn btn-secondary" data-action="add-group" data-section-id="' + s.sectionId + '">+ Añadir grupo</button>';
        lane.appendChild(footer);

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
      { id: "arrow-order-exercise", color: "#9aa1ad", size: 7 },
      { id: "arrow-order-group", color: "#64748b", size: 9 },
      { id: "arrow-transition", color: "#c2410c", size: 9 },
    ].forEach(function (m) {
      var marker = document.createElementNS(ns, "marker");
      marker.setAttribute("id", m.id);
      marker.setAttribute("markerWidth", String(m.size));
      marker.setAttribute("markerHeight", String(m.size));
      marker.setAttribute("refX", String(m.size - 2));
      marker.setAttribute("refY", String(m.size / 2));
      marker.setAttribute("orient", "auto");
      var path = document.createElementNS(ns, "path");
      path.setAttribute("d", "M0,0 L" + (m.size - 2) + "," + m.size / 2 + " L0," + m.size + " Z");
      path.setAttribute("fill", m.color);
      marker.appendChild(path);
      defs.appendChild(marker);
    });
    svg.appendChild(defs);
    markersReady = true;
  }

  function nodeRect(el) {
    return { top: el.offsetTop, left: el.offsetLeft, width: el.offsetWidth, height: el.offsetHeight };
  }

  function isVisible(el) {
    return !!el && el.getClientRects().length > 0;
  }

  function edgePoints(aEl, bEl) {
    var ra = nodeRect(aEl);
    var rb = nodeRect(bEl);
    if (ra.top <= rb.top) {
      return {
        p1: { x: ra.left + ra.width / 2, y: ra.top + ra.height },
        p2: { x: rb.left + rb.width / 2, y: rb.top },
      };
    }
    return {
      p1: { x: ra.left + ra.width / 2, y: ra.top },
      p2: { x: rb.left + rb.width / 2, y: rb.top + rb.height },
    };
  }

  function drawLine(svg, p1, p2, markerId, strokeColor, strokeWidth, dashed, label) {
    var ns = "http://www.w3.org/2000/svg";
    var line = document.createElementNS(ns, "line");
    line.setAttribute("x1", p1.x);
    line.setAttribute("y1", p1.y);
    line.setAttribute("x2", p2.x);
    line.setAttribute("y2", p2.y);
    line.setAttribute("stroke", strokeColor);
    line.setAttribute("stroke-width", String(strokeWidth));
    if (dashed) {
      line.setAttribute("stroke-dasharray", "7,5");
    }
    line.setAttribute("marker-end", "url(#" + markerId + ")");
    svg.appendChild(line);

    if (label) {
      var labelX = Math.min(p1.x, p2.x) + 10;
      var labelY = (p1.y + p2.y) / 2 + 3;
      var text = document.createElementNS(ns, "text");
      text.setAttribute("x", labelX);
      text.setAttribute("y", labelY);
      text.setAttribute("class", "arrow-label");
      text.textContent = label;
      svg.appendChild(text);
      var bbox = text.getBBox();
      var bg = document.createElementNS(ns, "rect");
      bg.setAttribute("x", bbox.x - 3);
      bg.setAttribute("y", bbox.y - 2);
      bg.setAttribute("width", bbox.width + 6);
      bg.setAttribute("height", bbox.height + 4);
      bg.setAttribute("rx", "3");
      bg.setAttribute("class", "arrow-label-bg");
      svg.insertBefore(bg, text);
    }
  }

  function drawArrows() {
    var svg = document.getElementById("canvasSvg");
    var treeRoot = document.getElementById("canvasTree");
    if (!svg || !treeRoot) {
      return;
    }
    treeRoot.classList.toggle("arrows-on", orderStyleMode === "B");
    while (svg.firstChild) {
      svg.removeChild(svg.firstChild);
    }
    ensureArrowMarkers(svg);

    var w = Math.max(treeRoot.scrollWidth, 10);
    var h = Math.max(treeRoot.scrollHeight, 10);
    svg.setAttribute("width", w);
    svg.setAttribute("height", h);

    if (orderStyleMode === "B") {
      orderContainers.forEach(function (ids) {
        for (var i = 0; i < ids.length - 1; i++) {
          var a = flowIndex[ids[i]];
          var b = flowIndex[ids[i + 1]];
          if (!isVisible(a) || !isVisible(b)) {
            continue;
          }
          var bothGroups = flowTypeIndex[ids[i]] === "group" && flowTypeIndex[ids[i + 1]] === "group";
          var pts = edgePoints(a, b);
          if (bothGroups) {
            drawLine(svg, pts.p1, pts.p2, "arrow-order-group", "#64748b", 2.5, false, null);
          } else {
            drawLine(svg, pts.p1, pts.p2, "arrow-order-exercise", "#9aa1ad", 1.5, false, null);
          }
        }
      });
    }

    TREE.transitions.forEach(function (t) {
      var a = flowIndex[t.originFlowElementId];
      var b = flowIndex[t.destinationFlowElementId];
      if (!isVisible(a) || !isVisible(b)) {
        return;
      }
      var parts = ["Transición"];
      if (t.duration) {
        parts.push(t.duration.value + " " + t.duration.unit);
      }
      if (t.activity) {
        parts.push("+ actividad");
      }
      var pts = edgePoints(a, b);
      drawLine(svg, pts.p1, pts.p2, "arrow-transition", "#c2410c", 2.5, true, parts.join(" · "));
    });
  }

  // ---------- Vista jerárquica (lista) ----------
  function buildListGroupRow(g, depth, container) {
    var key = groupKeyOf(g);
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
    var key = exKeyOf(e);
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
    TREE.sections
      .slice()
      .sort(byPosition)
      .forEach(function (s) {
        var wrap = document.createElement("div");
        wrap.className = "hlist-section";
        wrap.dataset.key = sectionKeyOf(s);

        var title = document.createElement("div");
        title.className = "hlist-section-title";
        title.textContent = "Sección " + s.position + " — " + s.name;
        title.setAttribute("role", "button");
        title.setAttribute("tabindex", "0");
        title.addEventListener("click", function () {
          selectKey(sectionKeyOf(s));
        });
        wrap.appendChild(title);

        s.groups
          .slice()
          .sort(byPosition)
          .forEach(function (mg) {
            buildListGroupRow(mg.group, 1, wrap);
          });

        var addRow = document.createElement("div");
        addRow.className = "hlist-add-row";
        addRow.innerHTML = '<button type="button" class="btn btn-secondary" data-action="add-group" data-section-id="' + s.sectionId + '">+ Añadir grupo</button>';
        wrap.appendChild(addRow);

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
    scale = Math.max(0.2, s);
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
      if (ev.target.closest(".node") || ev.target.closest(".section-lane-header") || ev.target.closest("[data-action]")) {
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

    var touchMode = null;
    var touchStartX = 0;
    var touchStartY = 0;
    var touchOrigX = 0;
    var touchOrigY = 0;
    var pinchStartDist = 0;
    var pinchStartScale = 1;
    var pinchStartPanX = 0;
    var pinchStartPanY = 0;
    var pinchMidX = 0;
    var pinchMidY = 0;

    function touchDistance(t1, t2) {
      var dx = t2.clientX - t1.clientX;
      var dy = t2.clientY - t1.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function viewportMidpoint(t1, t2) {
      var rect = viewport.getBoundingClientRect();
      return {
        x: (t1.clientX + t2.clientX) / 2 - rect.left,
        y: (t1.clientY + t2.clientY) / 2 - rect.top,
      };
    }

    function beginPan(touch) {
      touchMode = "pan";
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
      touchOrigX = panX;
      touchOrigY = panY;
    }

    function beginPinch(t1, t2) {
      touchMode = "pinch";
      pinchStartDist = touchDistance(t1, t2);
      pinchStartScale = scale;
      pinchStartPanX = panX;
      pinchStartPanY = panY;
      var mid = viewportMidpoint(t1, t2);
      pinchMidX = mid.x;
      pinchMidY = mid.y;
    }

    viewport.addEventListener(
      "touchstart",
      function (ev) {
        if (ev.touches.length === 1) {
          touchMode = ev.target.closest(".node") || ev.target.closest("[data-action]") ? "node" : null;
          if (touchMode === null) {
            beginPan(ev.touches[0]);
          }
        } else if (ev.touches.length === 2) {
          beginPinch(ev.touches[0], ev.touches[1]);
        } else {
          touchMode = null;
        }
      },
      { passive: true }
    );

    viewport.addEventListener(
      "touchmove",
      function (ev) {
        if (ev.touches.length === 2) {
          if (touchMode !== "pinch") {
            beginPinch(ev.touches[0], ev.touches[1]);
            return;
          }
          ev.preventDefault();
          var newDist = touchDistance(ev.touches[0], ev.touches[1]);
          var ratio = newDist / pinchStartDist;
          var newScale = Math.max(0.4, Math.min(2, pinchStartScale * ratio));
          var worldX = (pinchMidX - pinchStartPanX) / pinchStartScale;
          var worldY = (pinchMidY - pinchStartPanY) / pinchStartScale;
          scale = newScale;
          panX = pinchMidX - worldX * newScale;
          panY = pinchMidY - worldY * newScale;
          applyTransform();
        } else if (ev.touches.length === 1) {
          if (touchMode === "pan") {
            ev.preventDefault();
            panX = touchOrigX + (ev.touches[0].clientX - touchStartX);
            panY = touchOrigY + (ev.touches[0].clientY - touchStartY);
            applyTransform();
          } else if (touchMode === "pinch") {
            beginPan(ev.touches[0]);
          }
        }
      },
      { passive: false }
    );

    function endTouch(ev) {
      if (ev.touches.length === 0) {
        touchMode = null;
        requestAnimationFrame(drawArrows);
      } else if (ev.touches.length === 1) {
        beginPan(ev.touches[0]);
      } else if (ev.touches.length >= 2) {
        beginPinch(ev.touches[0], ev.touches[1]);
      }
    }
    viewport.addEventListener("touchend", endTouch);
    viewport.addEventListener("touchcancel", endTouch);

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

  // ---------- Cabecera del entrenamiento y cuerpo (estado vacío) ----------
  function renderWorkoutHeader() {
    var w = TREE.workout;
    document.getElementById("workoutTitle").textContent = w.title;
    var typeBadge = w.type === "DAILY_CLASS" ? "Clase del día" : "Personal";
    var typeClass = w.type === "DAILY_CLASS" ? "badge-daily" : "badge-personal";
    var meta =
      '<span class="badge ' + typeClass + '">' + esc(typeBadge) + "</span>" +
      '<span class="badge badge-active">' + (w.active ? "Activo" : "Inactivo") + "</span>" +
      (w.date ? "<span>" + esc(w.date) + "</span>" : "") +
      '<span class="badge badge-editing">Edición de secciones y grupos (4.2)</span>';
    document.getElementById("workoutMeta").innerHTML = meta;
  }

  function renderEditorBody() {
    var hasSections = TREE.sections.length > 0;
    document.getElementById("comparePanel").style.display = hasSections ? "" : "none";
    document.getElementById("editorToolbar").style.display = hasSections ? "" : "none";
    document.getElementById("editorMain").style.display = hasSections ? "" : "none";
    document.getElementById("emptyWorkoutState").style.display = hasSections ? "none" : "";
  }

  // ---------- Delegación de acciones (data-action en cualquier parte) ----------
  function wireActionDelegation() {
    document.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-action]");
      if (!btn || btn.disabled) {
        return;
      }
      var action = btn.dataset.action;
      switch (action) {
        case "add-section":
          openSectionForm(null);
          break;
        case "edit-section":
          openSectionForm(Number(btn.dataset.id));
          break;
        case "move-section-up":
          moveSectionBy(Number(btn.dataset.id), -1);
          break;
        case "move-section-down":
          moveSectionBy(Number(btn.dataset.id), 1);
          break;
        case "delete-section":
          requestDeleteSection(Number(btn.dataset.id));
          break;
        case "add-group":
          openGroupForm(Number(btn.dataset.sectionId), null);
          break;
        case "edit-group":
          openGroupForm(Number(btn.dataset.sectionId), Number(btn.dataset.sectionGroupId));
          break;
        case "move-group-up":
          moveGroupBy(Number(btn.dataset.sectionGroupId), -1);
          break;
        case "move-group-down":
          moveGroupBy(Number(btn.dataset.sectionGroupId), 1);
          break;
        case "delete-group":
          requestDeleteGroup(Number(btn.dataset.sectionGroupId));
          break;
        case "set-scenario":
          resetToScenario(btn.dataset.key);
          document.querySelectorAll("#segScenario button").forEach(function (b) {
            b.classList.toggle("active", b === btn);
          });
          break;
        default:
          break;
      }
    });
  }

  // ---------- Overlays: cierre con Escape, clic fuera y botones ✕ ----------
  function wireOverlays() {
    document.getElementById("modalCloseBtn").addEventListener("click", closeModal);
    document.getElementById("modalOverlay").addEventListener("click", function (ev) {
      if (ev.target === ev.currentTarget) {
        closeModal();
      }
    });
    document.getElementById("formCloseBtn").addEventListener("click", function () {
      closeOverlay("formOverlay");
    });
    document.getElementById("formOverlay").addEventListener("click", function (ev) {
      if (ev.target === ev.currentTarget) {
        closeOverlay("formOverlay");
      }
    });
    document.getElementById("confirmCancelBtn").addEventListener("click", function () {
      closeOverlay("confirmOverlay");
    });
    document.getElementById("confirmOkBtn").addEventListener("click", function () {
      closeOverlay("confirmOverlay");
      if (pendingOnConfirm) {
        var fn = pendingOnConfirm;
        pendingOnConfirm = null;
        fn();
      }
    });
    document.getElementById("confirmOverlay").addEventListener("click", function (ev) {
      if (ev.target === ev.currentTarget) {
        closeOverlay("confirmOverlay");
      }
    });
    document.addEventListener("keydown", function (ev) {
      if (ev.key !== "Escape") {
        return;
      }
      if (document.getElementById("confirmOverlay").classList.contains("open")) {
        closeOverlay("confirmOverlay");
      } else if (document.getElementById("formOverlay").classList.contains("open")) {
        closeOverlay("formOverlay");
      } else {
        closeModal();
      }
    });
  }

  // ---------- Arranque ----------
  document.addEventListener("DOMContentLoaded", function () {
    wireCanvasInteraction();
    wireOverlays();
    wireActionDelegation();
    wireSegControl("segView", setViewMode);
    wireSegControl("segOrder", setOrderStyle);
    wireSegControl("segDetail", setDetailStyle);

    resetToScenario(currentScenarioKey);

    window.addEventListener("resize", function () {
      requestAnimationFrame(drawArrows);
    });
  });
})();
