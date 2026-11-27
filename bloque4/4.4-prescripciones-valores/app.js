/*
 * Lógica del prototipo del subbloque 4.4 (prescripciones, valores y
 * unidades de los ejercicios de un entrenamiento). HTML + CSS + JavaScript
 * local únicamente: sin React, sin React Flow, sin peticiones HTTP, sin
 * localStorage. Todo el estado vive en variables de este archivo y se
 * pierde al recargar la página o al cambiar de escenario de prueba, a
 * propósito.
 *
 * Base: copia adaptada de app.js del prototipo aprobado 4.3 (mismo lienzo
 * HTML+SVG, mismo layout, mismas mutaciones de sección/grupo/subgrupo/
 * ejercicio — sin tocar ninguna de ellas). Lo nuevo de 4.4 son las
 * operaciones de mutación sobre los VALORES de la prescripción de una
 * aparición de ejercicio ya existente (añadir, editar, mover, eliminar) y
 * sobre su NOTA LIBRE (editar directamente, reutilizando el mismo contrato
 * real ya usado en "Cambiar ejercicio" desde el bloque 4.3, sin duplicar
 * esa lógica).
 *
 * Fidelidad a las reglas reales del backend (ExercisePrescriptionService /
 * ExercisePrescriptionValueOperations / ExercisePrescriptionController,
 * Bloque 26E-6A — confirmadas leyendo el código, no supuestas):
 *  - Un valor (AddPrescriptionValueRequest/UpdatePrescriptionValueRequest):
 *    unitId obligatorio (de una unidad ACTIVA), minValue obligatorio y no
 *    negativo, maxValue OPCIONAL (si se da, debe ser mayor que minValue) —
 *    un valor sin maxValue es un valor exacto, no un rango, no un dato
 *    incompleto.
 *  - La magnitud de un valor SIEMPRE se deriva de la unidad elegida, nunca
 *    se fija de forma independiente (PrescriptionValue.setUnit).
 *  - Una misma prescripción no puede tener dos valores de la MISMA
 *    magnitud (UNIQUE(exercise_prescription_id, magnitude) real): el
 *    backend lo rechaza con 409 ("La prescripcion con id X ya tiene un
 *    valor de magnitud Y"). Este prototipo refleja esa regla filtrando de
 *    antemano, al añadir, las unidades cuya magnitud ya está en uso — no
 *    oculta la regla, la hace imposible de infringir desde el formulario,
 *    igual que ya se hace en 4.3 con las comprobaciones que el árbol
 *    puede saber con certeza.
 *  - Al EDITAR un valor sí se puede cambiar de unidad libremente, incluso
 *    de magnitud (DEC-047): solo se excluye una magnitud ya usada por
 *    OTRO valor de la misma prescripción.
 *  - Eliminar un valor NO tiene ninguna restricción de negocio en el
 *    backend real (a diferencia de eliminar la aparición completa): se
 *    pide confirmación solo porque es una acción destructiva, no porque
 *    el backend la bloquee nunca.
 *  - La nota libre (ExercisePrescription.description, PUT
 *    .../prescription) es una operación real independiente de los
 *    valores y de "cambiar ejercicio": aquí se edita directamente desde el
 *    panel de la prescripción, con el mismo contrato que ya usa el
 *    formulario de "Cambiar ejercicio" del bloque 4.3 — dos puntos de
 *    entrada a la misma operación real, no una funcionalidad duplicada.
 *  - "Cambiar ejercicio"/"Eliminar ejercicio" siguen bloqueados mientras la
 *    prescripción tenga algún valor (igual que en 4.3); ahora que los
 *    valores se pueden eliminar desde aquí, el aviso ya no remite a "un
 *    bloque futuro": indica eliminarlos primero desde este mismo panel.
 *  - Fuera de alcance, a propósito: transiciones (bloque 4.5) y
 *    configuraciones dinámicas (bloque 4.6) — sus datos de solo lectura ya
 *    existentes en el panel de detalle no se modifican aquí.
 *
 * El resto de revisiones de corrección Android (apertura involuntaria del
 * detalle al girar, altura del modal con visualViewport) ya validadas en
 * 4.1-4.3 se mantienen sin cambios — ver dismissDetail() y
 * updateViewportHeightVar() más abajo.
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
  var layoutMode = "vertical"; // 'vertical' | 'horizontal' (igual que DiagramOrientation del 4.1 real)
  var scale = 1;
  var panX = 40;
  var panY = 20;

  // Límites de zoom compartidos (ver prototipos 4.1/4.2 para el porqué de
  // estos valores concretos, sin cambios aquí).
  var MIN_SCALE = 0.08;
  var MAX_SCALE = 2.2;

  var dataIndex = {};
  var flowNameIndex = {};
  var flowTypeIndex = {};
  var nodeElements = {};
  var flowIndex = {};
  var parentOfFlowElementId = {};
  var orderContainers = [];

  var lastFocusedBeforeModal = null;

  var nextSectionId = 1;
  var nextSectionGroupId = 1;
  var nextGroupId = 1;
  var nextFlowElementId = 1;
  var nextExerciseOccurrenceId = 1;
  var nextPrescriptionValueId = 1;

  // formContext.kind: 'section' | 'group' | 'subgroup' | 'exercise-add' | 'exercise-change'
  var formContext = null;
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
  function groupKeyById(groupId) {
    return "group:" + groupId;
  }
  function exKeyById(exerciseOccurrenceId) {
    return "ex:" + exerciseOccurrenceId;
  }

  function byPosition(a, b) {
    return a.position - b.position;
  }

  function findCatalogExercise(exerciseId) {
    for (var i = 0; i < EXERCISE_CATALOG.length; i++) {
      if (EXERCISE_CATALOG[i].exerciseId === exerciseId) {
        return EXERCISE_CATALOG[i];
      }
    }
    return null;
  }

  // ---------- Escenarios ----------
  function recomputeIdCounters() {
    var maxSection = 0, maxSectionGroup = 0, maxGroup = 0, maxFlow = 0, maxExerciseOccurrence = 0, maxPrescriptionValue = 0;
    function walkGroup(g) {
      maxGroup = Math.max(maxGroup, g.groupId);
      maxFlow = Math.max(maxFlow, g.flowElementId);
      g.content.forEach(function (ci) {
        if (ci.kind === "group") {
          walkGroup(ci.item);
        } else {
          maxFlow = Math.max(maxFlow, ci.item.flowElementId);
          maxExerciseOccurrence = Math.max(maxExerciseOccurrence, ci.item.exerciseOccurrenceId);
          ci.item.prescriptionDetail.forEach(function (v) {
            maxPrescriptionValue = Math.max(maxPrescriptionValue, v.valueId);
          });
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
    nextExerciseOccurrenceId = maxExerciseOccurrence + 1;
    nextPrescriptionValueId = maxPrescriptionValue + 1;
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
      // Quién es el padre (contenedor) real de cada elemento, por
      // flowElementId: permite, al dibujar una transición cuyo extremo
      // queda oculto dentro de un grupo contraído, representar la relación
      // sobre el ancestro visible más cercano en vez de hacerla desaparecer
      // sin más (ver resolveVisibleAncestor).
      parentOfFlowElementId[ci.item.flowElementId] = g.flowElementId;
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
    parentOfFlowElementId = {};
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

  // Recorre TODOS los grupos del árbol (principales y, recursivamente, sus
  // subgrupos), invocando visit(contentArray, ownerGroup) una vez por cada
  // grupo — contentArray es su GROUP_CONTENT real (mezcla de subgrupos y
  // apariciones de ejercicio, en el mismo orden de posición).
  function walkAllGroupsContentArrays(visit) {
    function walkGroup(g) {
      visit(g.content, g);
      g.content.forEach(function (ci) {
        if (ci.kind === "group") {
          walkGroup(ci.item);
        }
      });
    }
    TREE.sections.forEach(function (s) {
      s.groups.forEach(function (mg) {
        walkGroup(mg.group);
      });
    });
  }

  // Localiza cualquier Group del árbol (principal o subgrupo, cualquier
  // profundidad) por su groupId — igual que findGroupNode en describe.ts.
  function findGroupNode(groupId) {
    var result = null;
    function walkGroup(g) {
      if (result) {
        return;
      }
      if (g.groupId === groupId) {
        result = g;
        return;
      }
      g.content.forEach(function (ci) {
        if (!result && ci.kind === "group") {
          walkGroup(ci.item);
        }
      });
    }
    TREE.sections.forEach(function (s) {
      s.groups.forEach(function (mg) {
        walkGroup(mg.group);
      });
    });
    return result;
  }

  function findExerciseOccurrence(exerciseOccurrenceId) {
    var result = null;
    walkAllGroupsContentArrays(function (contentArray) {
      if (result) {
        return;
      }
      for (var i = 0; i < contentArray.length; i++) {
        if (contentArray[i].kind === "exercise" && contentArray[i].item.exerciseOccurrenceId === exerciseOccurrenceId) {
          result = contentArray[i].item;
          return;
        }
      }
    });
    return result;
  }

  // Devuelve el GROUP_CONTENT (array), la posición del elemento buscado
  // dentro de él y su grupo padre real — necesario para "Subir"/"Bajar"
  // (que reordena esa secuencia completa) y para mostrar el nombre del
  // grupo contenedor en los formularios.
  function findContentArrayAndIndexForGroup(groupId) {
    var result = null;
    walkAllGroupsContentArrays(function (contentArray, ownerGroup) {
      if (result) {
        return;
      }
      for (var i = 0; i < contentArray.length; i++) {
        if (contentArray[i].kind === "group" && contentArray[i].item.groupId === groupId) {
          result = { contentArray: contentArray, index: i, parentGroup: ownerGroup };
          return;
        }
      }
    });
    return result;
  }

  function findContentArrayAndIndexForExercise(exerciseOccurrenceId) {
    var result = null;
    walkAllGroupsContentArrays(function (contentArray, ownerGroup) {
      if (result) {
        return;
      }
      for (var i = 0; i < contentArray.length; i++) {
        if (contentArray[i].kind === "exercise" && contentArray[i].item.exerciseOccurrenceId === exerciseOccurrenceId) {
          result = { contentArray: contentArray, index: i, parentGroup: ownerGroup };
          return;
        }
      }
    });
    return result;
  }

  // ---------- Mutaciones: secciones (sin cambios respecto al 4.2) ----------
  function renumberSections() {
    TREE.sections.forEach(function (s, idx) {
      s.position = idx + 1;
    });
  }

  function renumberGroups(sec) {
    sec.groups.forEach(function (mg, idx) {
      mg.position = idx + 1;
    });
  }

  // Misma técnica de renumerado 1..N a partir del orden final del array,
  // ahora reutilizada también para GROUP_CONTENT (subgrupos + ejercicios).
  function renumberContentArray(contentArray) {
    contentArray.forEach(function (ci, idx) {
      ci.position = idx + 1;
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

  // ---------- Mutaciones: grupos principales (sin cambios respecto al 4.2) ----------
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

  // ---------- Mutaciones: subgrupos (nuevo en 4.3) ----------
  function createSubgroupLocal(parentGroupId, name, description) {
    var parent = findGroupNode(parentGroupId);
    if (!parent) {
      return null;
    }
    var g = grp(nextGroupId++, nextFlowElementId++, name, description, []);
    parent.content.push(contentItem(parent.content.length + 1, g));
    return g;
  }

  function updateSubgroupLocal(groupId, name, description) {
    var g = findGroupNode(groupId);
    if (!g) {
      return;
    }
    g.name = name;
    g.description = description || "";
  }

  function moveSubgroupBy(groupId, delta) {
    var found = findContentArrayAndIndexForGroup(groupId);
    if (!found) {
      return;
    }
    var newIndex = found.index + delta;
    if (newIndex < 0 || newIndex >= found.contentArray.length) {
      return;
    }
    var moved = found.contentArray.splice(found.index, 1)[0];
    found.contentArray.splice(newIndex, 0, moved);
    renumberContentArray(found.contentArray);
    afterMutation(selectedKey);
  }

  function deleteSubgroupLocal(groupId) {
    var found = findContentArrayAndIndexForGroup(groupId);
    if (!found) {
      return;
    }
    found.contentArray.splice(found.index, 1);
    renumberContentArray(found.contentArray);
  }

  // ---------- Mutaciones: apariciones de ejercicio (nuevo en 4.3) ----------
  function createExerciseOccurrenceLocal(parentGroupId, exerciseId, prescriptionDescription) {
    var parent = findGroupNode(parentGroupId);
    var catalogEntry = findCatalogExercise(exerciseId);
    if (!parent || !catalogEntry) {
      return null;
    }
    var e = exOcc(
      nextExerciseOccurrenceId++,
      nextFlowElementId++,
      catalogEntry.name,
      null,
      [],
      prescriptionDescription,
      catalogEntry.exerciseId
    );
    parent.content.push(contentItem(parent.content.length + 1, e));
    return e;
  }

  function changeExerciseLocal(exerciseOccurrenceId, newExerciseId) {
    var occ = findExerciseOccurrence(exerciseOccurrenceId);
    var catalogEntry = findCatalogExercise(newExerciseId);
    if (!occ || !catalogEntry) {
      return;
    }
    occ.exerciseId = catalogEntry.exerciseId;
    occ.exerciseName = catalogEntry.name;
  }

  function moveExerciseOccurrenceBy(exerciseOccurrenceId, delta) {
    var found = findContentArrayAndIndexForExercise(exerciseOccurrenceId);
    if (!found) {
      return;
    }
    var newIndex = found.index + delta;
    if (newIndex < 0 || newIndex >= found.contentArray.length) {
      return;
    }
    var moved = found.contentArray.splice(found.index, 1)[0];
    found.contentArray.splice(newIndex, 0, moved);
    renumberContentArray(found.contentArray);
    afterMutation(selectedKey);
  }

  function deleteExerciseOccurrenceLocal(exerciseOccurrenceId) {
    var found = findContentArrayAndIndexForExercise(exerciseOccurrenceId);
    if (!found) {
      return;
    }
    found.contentArray.splice(found.index, 1);
    renumberContentArray(found.contentArray);
  }

  // ---------- Mutaciones: valores de la prescripción (nuevo en 4.4) ----------
  // Todas direccionan por (exerciseOccurrenceId, valueId), igual que el
  // backend real direcciona por (workoutId, parentGroupId, groupContentId,
  // valueId) — nunca por un id de prescripción suelto.
  function magnitudesUsedInPrescription(occ, excludeValueId) {
    return occ.prescriptionDetail
      .filter(function (v) {
        return v.valueId !== excludeValueId;
      })
      .map(function (v) {
        return v.magnitude;
      });
  }

  function renumberPrescriptionValues(occ) {
    occ.prescriptionDetail.sort(byPosition);
    occ.prescriptionDetail.forEach(function (v, i) {
      v.position = i + 1;
    });
  }

  function addPrescriptionValueLocal(exerciseOccurrenceId, unitId, minValue, maxValue) {
    var occ = findExerciseOccurrence(exerciseOccurrenceId);
    var unit = findPrescriptionUnit(unitId);
    if (!occ || !unit) {
      return null;
    }
    var created = pv(nextPrescriptionValueId++, occ.prescriptionDetail.length + 1, minValue, maxValue, unitId);
    occ.prescriptionDetail.push(created);
    unit.historicallyUsed = true;
    return created;
  }

  function updatePrescriptionValueLocal(exerciseOccurrenceId, valueId, unitId, minValue, maxValue) {
    var occ = findExerciseOccurrence(exerciseOccurrenceId);
    var unit = findPrescriptionUnit(unitId);
    if (!occ || !unit) {
      return;
    }
    var value = occ.prescriptionDetail.filter(function (v) {
      return v.valueId === valueId;
    })[0];
    if (!value) {
      return;
    }
    value.unitId = unitId;
    value.magnitude = unit.magnitude;
    value.minValue = minValue;
    value.maxValue = typeof maxValue === "number" ? maxValue : null;
    unit.historicallyUsed = true;
  }

  function movePrescriptionValueBy(exerciseOccurrenceId, valueId, delta) {
    var occ = findExerciseOccurrence(exerciseOccurrenceId);
    if (!occ) {
      return;
    }
    occ.prescriptionDetail.sort(byPosition);
    var index = occ.prescriptionDetail.findIndex(function (v) {
      return v.valueId === valueId;
    });
    var newIndex = index + delta;
    if (index === -1 || newIndex < 0 || newIndex >= occ.prescriptionDetail.length) {
      return;
    }
    var moved = occ.prescriptionDetail.splice(index, 1)[0];
    occ.prescriptionDetail.splice(newIndex, 0, moved);
    renumberPrescriptionValues(occ);
    afterMutation(exKeyById(exerciseOccurrenceId));
  }

  function deletePrescriptionValueLocal(exerciseOccurrenceId, valueId) {
    var occ = findExerciseOccurrence(exerciseOccurrenceId);
    if (!occ) {
      return;
    }
    occ.prescriptionDetail = occ.prescriptionDetail.filter(function (v) {
      return v.valueId !== valueId;
    });
    renumberPrescriptionValues(occ);
  }

  // ---------- Mutación: nota libre de la prescripción (nuevo en 4.4) ----------
  // Mismo contrato real que PUT .../prescription (UpdatePrescriptionDescriptionRequest):
  // independiente de los valores y del ejercicio asignado, reutilizado aquí
  // y en "Cambiar ejercicio" (4.3) sin duplicar la operación.
  function updatePrescriptionDescriptionLocal(exerciseOccurrenceId, newDescription) {
    var occ = findExerciseOccurrence(exerciseOccurrenceId);
    if (!occ) {
      return;
    }
    occ.prescriptionDescription = newDescription || null;
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
      "<textarea id=\"fSectionDesc\">" + desc + "</textarea></div>"
    );
  }

  function buildGroupFormHtml(sec, existing) {
    var name = existing ? esc(existing.name) : "";
    var desc = existing ? esc(existing.description || "") : "";
    return (
      '<p class="field-hint">Sección: <strong>' + esc(sec.name) + "</strong></p>" +
      '<p class="form-scope-note">Campos reales admitidos por el backend (<code>SectionGroupRequest</code>): nombre obligatorio, descripción libre. Para añadir subgrupos o ejercicios a este grupo, guárdalo primero y usa sus acciones en el panel de detalle.</p>' +
      '<div class="field"><label for="fGroupName">Nombre *</label>' +
      '<input type="text" id="fGroupName" value="' + name + '" maxlength="120" /></div>' +
      '<div id="fGroupNameError" class="field-error" style="display:none;"></div>' +
      '<div class="field"><label for="fGroupDesc">Descripción</label>' +
      "<textarea id=\"fGroupDesc\">" + desc + "</textarea></div>"
    );
  }

  function buildSubgroupFormHtml(parent, existing) {
    var name = existing ? esc(existing.name) : "";
    var desc = existing ? esc(existing.description || "") : "";
    return (
      '<p class="field-hint">Grupo contenedor: <strong>' + esc(parent.name) + "</strong></p>" +
      '<p class="form-scope-note">Campos reales admitidos por el backend (<code>SubgroupRequest</code>): nombre obligatorio, descripción libre. Un subgrupo puede a su vez contener más subgrupos y ejercicios, sin límite de profundidad en el backend. Su configuración dinámica se gestionará en el bloque 4.6 y sus transiciones en el 4.5.</p>' +
      '<div class="field"><label for="fSubgroupName">Nombre *</label>' +
      '<input type="text" id="fSubgroupName" value="' + name + '" maxlength="255" /></div>' +
      '<div id="fSubgroupNameError" class="field-error" style="display:none;"></div>' +
      '<div class="field"><label for="fSubgroupDesc">Descripción</label>' +
      "<textarea id=\"fSubgroupDesc\">" + desc + "</textarea></div>"
    );
  }

  function buildExercisePickerFormHtml(contextNode, mode) {
    var activeExercises = EXERCISE_CATALOG.filter(function (e) {
      return e.active;
    });
    var options = activeExercises
      .map(function (e) {
        return '<option value="' + e.exerciseId + '">' + esc(e.name) + "</option>";
      })
      .join("");

    var intro;
    if (mode === "add") {
      intro =
        '<p class="field-hint">Grupo contenedor: <strong>' + esc(contextNode.name) + "</strong></p>" +
        '<p class="form-scope-note">Mismo contrato real que <code>POST .../exercise-occurrences</code> (<code>ExerciseOccurrenceRequest</code>): <code>exerciseId</code> obligatorio (del catálogo, solo ejercicios activos) y <code>prescriptionDescription</code> libre y opcional. La prescripción nace siempre sin valores estructurados; esos se gestionarán en el bloque 4.4.</p>';
    } else {
      intro =
        '<p class="field-hint">Aparición actual: <strong>' + esc(contextNode.exerciseName) + "</strong></p>" +
        '<p class="form-scope-note">Mismo contrato real que <code>POST .../exercise-occurrences/{id}/change-exercise</code>: solo cambia el ejercicio del catálogo asociado; se conserva la misma prescripción (descripción y, si los hubiera, sus valores).</p>';
    }

    var noteField =
      mode === "add"
        ? '<div class="field"><label for="fExerciseNote">Nota de prescripción (opcional)</label>' +
          '<textarea id="fExerciseNote" placeholder="Ej.: 3 rondas a ritmo ligero"></textarea></div>'
        : "";

    return (
      intro +
      '<div class="field"><label for="fExerciseSelect">Ejercicio del catálogo *</label>' +
      '<select id="fExerciseSelect">' + options + "</select></div>" +
      '<p class="field-hint">Solo se listan ejercicios activos del catálogo (' + activeExercises.length + " de " + EXERCISE_CATALOG.length +
      "), igual que <code>GET /api/catalog/exercises?active=true</code>. Los inactivos (p. ej. deshabilitados desde el catálogo) no aparecen aquí.</p>" +
      noteField
    );
  }

  // Resumen en lenguaje natural de un valor de prescripción (magnitud,
  // unidad real y su rango o su valor exacto si no tiene máximo) — nunca
  // expone "COUNT"/"unitId" al entrenador, igual que el resto de la
  // interfaz (§2.5 del contexto maestro).
  function formatPrescriptionValue(v) {
    var unit = findPrescriptionUnit(v.unitId);
    var symbol = unit ? unit.symbol : "?";
    var magLabel = MAGNITUDE_LABELS[v.magnitude] || v.magnitude;
    var amount = v.maxValue !== null && v.maxValue !== undefined ? v.minValue + "–" + v.maxValue : String(v.minValue);
    return magLabel + ": " + amount + " " + symbol;
  }

  // Resumen siempre calculado a partir de los valores REALES actuales
  // (nunca un texto fijo guardado aparte): así el nodo del diagrama, la
  // fila de la lista y el panel de detalle nunca pueden desincronizarse
  // entre sí tras añadir, editar, mover o eliminar un valor.
  function prescriptionSummaryText(e) {
    if (!e.prescriptionDetail.length) {
      return e.prescriptionSummary || null;
    }
    return e.prescriptionDetail
      .slice()
      .sort(byPosition)
      .map(formatPrescriptionValue)
      .join(" · ");
  }

  function buildPrescriptionValueFormHtml(occ, existingValue) {
    var usedMagnitudes = magnitudesUsedInPrescription(occ, existingValue ? existingValue.valueId : null);
    var eligibleUnits = PRESCRIPTION_UNITS.filter(function (u) {
      return u.active && usedMagnitudes.indexOf(u.magnitude) === -1;
    });
    var options = eligibleUnits
      .map(function (u) {
        var selected = existingValue && existingValue.unitId === u.unitId ? " selected" : "";
        return '<option value="' + u.unitId + '"' + selected + '>' + esc(u.label) + " (" + esc(u.symbol) + ", " + esc(MAGNITUDE_LABELS[u.magnitude]) + ")</option>";
      })
      .join("");

    var intro = existingValue
      ? '<p class="field-hint">Valor actual: <strong>' + esc(formatPrescriptionValue(existingValue)) + "</strong></p>" +
        '<p class="form-scope-note">Mismo contrato real que <code>PUT .../prescription/values/{valueId}</code> (<code>UpdatePrescriptionValueRequest</code>): unidad, valor mínimo y valor máximo se reenvían siempre juntos, sin actualización parcial. Se puede cambiar de unidad, incluso de magnitud (DEC-047), salvo a una ya usada por otro valor de esta misma prescripción.</p>'
      : '<p class="field-hint">Aparición: <strong>' + esc(occ.exerciseName) + "</strong></p>" +
        '<p class="form-scope-note">Mismo contrato real que <code>POST .../prescription/values</code> (<code>AddPrescriptionValueRequest</code>): unidad obligatoria (solo activas), valor mínimo obligatorio y no negativo, valor máximo opcional (si se indica, mayor que el mínimo). Solo se listan unidades de una magnitud que esta prescripción todavía no tenga: el backend real rechaza con 409 un segundo valor de la misma magnitud ("La prescripcion con id X ya tiene un valor de magnitud Y") — aquí se evita de raíz, no solo se avisa.</p>';

    if (eligibleUnits.length === 0) {
      return (
        intro +
        '<p class="field-error">No queda ninguna magnitud disponible: esta prescripción ya tiene un valor de cada una de las cinco magnitudes del dominio (repeticiones, tiempo, distancia, peso/carga, energía).</p>'
      );
    }

    return (
      intro +
      '<div class="field"><label for="fValueUnit">Unidad *</label>' +
      '<select id="fValueUnit">' + options + "</select></div>" +
      '<div class="field"><label for="fValueMin">Valor mínimo *</label>' +
      '<input type="number" id="fValueMin" step="0.01" min="0" value="' + (existingValue ? existingValue.minValue : "") + '" /></div>' +
      '<div id="fValueMinError" class="field-error" style="display:none;"></div>' +
      '<div class="field"><label for="fValueMax">Valor máximo (opcional)</label>' +
      '<input type="number" id="fValueMax" step="0.01" min="0" value="' + (existingValue && existingValue.maxValue !== null ? existingValue.maxValue : "") + '" /></div>' +
      '<p class="field-hint">Déjalo vacío para un valor exacto (p. ej. "30 segundos"); rellénalo para un rango (p. ej. "60–65 kg").</p>' +
      '<div id="fValueMaxError" class="field-error" style="display:none;"></div>'
    );
  }

  function buildPrescriptionNoteFormHtml(occ) {
    var note = esc(occ.prescriptionDescription || "");
    return (
      '<p class="field-hint">Aparición: <strong>' + esc(occ.exerciseName) + "</strong></p>" +
      '<p class="form-scope-note">Mismo contrato real que <code>PUT .../prescription</code> (<code>UpdatePrescriptionDescriptionRequest</code>): texto libre, puede quedar vacío. Operación independiente de los valores estructurados y del ejercicio asignado — el mismo formulario real que usa "Cambiar ejercicio" (bloque 4.3) para este mismo campo, sin duplicar esa lógica aquí.</p>' +
      '<div class="field"><label for="fPrescriptionNote">Nota de prescripción</label>' +
      '<textarea id="fPrescriptionNote">' + note + "</textarea></div>"
    );
  }

  function openSectionForm(sectionId) {
    var existing = sectionId ? findSection(sectionId) : null;
    formContext = { kind: "section", sectionId: null, editId: sectionId || null };
    document.getElementById("formTitle").textContent = existing ? "Editar sección" : "Añadir sección";
    document.getElementById("formBody").innerHTML = buildSectionFormHtml(existing);
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
    openOverlay("formOverlay", "fGroupName");
  }

  function openSubgroupForm(parentGroupId, groupId) {
    var parent = findGroupNode(parentGroupId);
    if (!parent) {
      return;
    }
    var existing = groupId ? findGroupNode(groupId) : null;
    formContext = { kind: "subgroup", parentGroupId: parentGroupId, editId: groupId || null };
    document.getElementById("formTitle").textContent = existing ? "Editar subgrupo" : "Añadir subgrupo";
    document.getElementById("formBody").innerHTML = buildSubgroupFormHtml(parent, existing);
    openOverlay("formOverlay", "fSubgroupName");
  }

  function openExerciseAddForm(parentGroupId) {
    var parent = findGroupNode(parentGroupId);
    if (!parent) {
      return;
    }
    formContext = { kind: "exercise-add", parentGroupId: parentGroupId };
    document.getElementById("formTitle").textContent = "Añadir ejercicio";
    document.getElementById("formBody").innerHTML = buildExercisePickerFormHtml(parent, "add");
    openOverlay("formOverlay", "fExerciseSelect");
  }

  function requestChangeExercise(exerciseOccurrenceId) {
    var occ = findExerciseOccurrence(exerciseOccurrenceId);
    if (!occ) {
      return;
    }
    if (occ.prescriptionDetail.length > 0) {
      openConfirm({
        title: "No es posible cambiar este ejercicio",
        blocked: true,
        html:
          '<p class="confirm-consequences">La aparición de «' + esc(occ.exerciseName) + "» ya tiene " + occ.prescriptionDetail.length + " valor(es) de prescripción registrados.</p>" +
          '<p class="confirm-warning">El backend real (<code>ExerciseOccurrenceService.changeExercise</code>) solo permite cambiar el ejercicio mientras su prescripción no tenga ningún valor asociado; en caso contrario, lo rechaza con un error 409. Elimínalos antes desde el panel de detalle, en «Valores de la prescripción».</p>',
      });
      return;
    }
    formContext = { kind: "exercise-change", occId: exerciseOccurrenceId };
    document.getElementById("formTitle").textContent = "Cambiar de ejercicio";
    document.getElementById("formBody").innerHTML = buildExercisePickerFormHtml(occ, "change");
    openOverlay("formOverlay", "fExerciseSelect");
  }

  function openPrescriptionValueForm(exerciseOccurrenceId, valueId) {
    var occ = findExerciseOccurrence(exerciseOccurrenceId);
    if (!occ) {
      return;
    }
    var existing = valueId
      ? occ.prescriptionDetail.filter(function (v) {
          return v.valueId === valueId;
        })[0]
      : null;
    formContext = { kind: "prescription-value", exerciseOccurrenceId: exerciseOccurrenceId, valueId: valueId || null };
    document.getElementById("formTitle").textContent = existing ? "Editar valor de la prescripción" : "Añadir valor a la prescripción";
    document.getElementById("formBody").innerHTML = buildPrescriptionValueFormHtml(occ, existing);
    openOverlay("formOverlay", "fValueUnit");
  }

  function openPrescriptionNoteForm(exerciseOccurrenceId) {
    var occ = findExerciseOccurrence(exerciseOccurrenceId);
    if (!occ) {
      return;
    }
    formContext = { kind: "prescription-note", exerciseOccurrenceId: exerciseOccurrenceId };
    document.getElementById("formTitle").textContent = "Editar nota de la prescripción";
    document.getElementById("formBody").innerHTML = buildPrescriptionNoteFormHtml(occ);
    openOverlay("formOverlay", "fPrescriptionNote");
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
      return;
    }

    if (formContext.kind === "group") {
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
      return;
    }

    if (formContext.kind === "subgroup") {
      var sgNameInput = document.getElementById("fSubgroupName");
      var sgDescInput = document.getElementById("fSubgroupDesc");
      var sgName = sgNameInput.value.trim();
      if (!sgName) {
        sgNameInput.classList.add("invalid");
        var sgErr = document.getElementById("fSubgroupNameError");
        sgErr.textContent = "El nombre del subgrupo es obligatorio.";
        sgErr.style.display = "block";
        sgNameInput.focus();
        return;
      }
      var newSubgroupKey;
      if (formContext.editId) {
        updateSubgroupLocal(formContext.editId, sgName, sgDescInput.value.trim());
        newSubgroupKey = groupKeyById(formContext.editId);
      } else {
        var createdSubgroup = createSubgroupLocal(formContext.parentGroupId, sgName, sgDescInput.value.trim());
        if (!createdSubgroup) {
          closeOverlay("formOverlay");
          return;
        }
        newSubgroupKey = groupKeyOf(createdSubgroup);
        expandedKeys.add(groupKeyById(formContext.parentGroupId));
        expandedKeys.add(newSubgroupKey);
      }
      closeOverlay("formOverlay");
      afterMutation(newSubgroupKey);
      return;
    }

    if (formContext.kind === "exercise-add") {
      var select = document.getElementById("fExerciseSelect");
      var exerciseId = Number(select.value);
      var noteInput = document.getElementById("fExerciseNote");
      var note = noteInput.value.trim();
      var createdEx = createExerciseOccurrenceLocal(formContext.parentGroupId, exerciseId, note);
      closeOverlay("formOverlay");
      if (!createdEx) {
        return;
      }
      expandedKeys.add(groupKeyById(formContext.parentGroupId));
      afterMutation(exKeyById(createdEx.exerciseOccurrenceId));
      return;
    }

    if (formContext.kind === "exercise-change") {
      var select2 = document.getElementById("fExerciseSelect");
      var newExerciseId = Number(select2.value);
      changeExerciseLocal(formContext.occId, newExerciseId);
      closeOverlay("formOverlay");
      afterMutation(exKeyById(formContext.occId));
      return;
    }

    if (formContext.kind === "prescription-value") {
      var unitSelect = document.getElementById("fValueUnit");
      if (!unitSelect) {
        // Sin ninguna magnitud disponible: el formulario solo mostraba el
        // aviso de "no queda ninguna magnitud disponible", sin campos.
        return;
      }
      var unitId = Number(unitSelect.value);
      var minInput = document.getElementById("fValueMin");
      var maxInput = document.getElementById("fValueMax");
      var minErr = document.getElementById("fValueMinError");
      var maxErr = document.getElementById("fValueMaxError");
      minErr.style.display = "none";
      maxErr.style.display = "none";
      minInput.classList.remove("invalid");
      maxInput.classList.remove("invalid");

      // Mismos mensajes reales que ExercisePrescriptionValueOperations.
      if (minInput.value.trim() === "") {
        minErr.textContent = "El valor minimo es obligatorio.";
        minErr.style.display = "block";
        minInput.classList.add("invalid");
        minInput.focus();
        return;
      }
      var minValue = Number(minInput.value);
      if (minValue < 0) {
        minErr.textContent = "El valor minimo no puede ser negativo.";
        minErr.style.display = "block";
        minInput.classList.add("invalid");
        minInput.focus();
        return;
      }
      var maxValue = maxInput.value.trim() === "" ? null : Number(maxInput.value);
      if (maxValue !== null && maxValue <= minValue) {
        maxErr.textContent = "El valor maximo debe ser mayor que el valor minimo.";
        maxErr.style.display = "block";
        maxInput.classList.add("invalid");
        maxInput.focus();
        return;
      }

      if (formContext.valueId) {
        updatePrescriptionValueLocal(formContext.exerciseOccurrenceId, formContext.valueId, unitId, minValue, maxValue);
      } else {
        addPrescriptionValueLocal(formContext.exerciseOccurrenceId, unitId, minValue, maxValue);
      }
      closeOverlay("formOverlay");
      afterMutation(exKeyById(formContext.exerciseOccurrenceId));
      return;
    }

    if (formContext.kind === "prescription-note") {
      var noteTextarea = document.getElementById("fPrescriptionNote");
      updatePrescriptionDescriptionLocal(formContext.exerciseOccurrenceId, noteTextarea.value.trim());
      closeOverlay("formOverlay");
      afterMutation(exKeyById(formContext.exerciseOccurrenceId));
      return;
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

  function requestDeleteSubgroup(groupId) {
    var g = findGroupNode(groupId);
    if (!g) {
      return;
    }
    var related = TREE.transitions.filter(function (t) {
      return t.originFlowElementId === g.flowElementId || t.destinationFlowElementId === g.flowElementId;
    });
    var blockers = [];
    if (g.content.length > 0) {
      blockers.push(g.content.length + " elemento(s) propio(s) (subgrupos y/o ejercicios)");
    }
    if (g.dynamicConfiguration) {
      blockers.push("una configuración dinámica asociada");
    }
    if (related.length) {
      blockers.push(related.length + " transición(es) asociada(s)");
    }

    if (blockers.length) {
      openConfirm({
        title: "No es posible eliminar este subgrupo",
        blocked: true,
        html:
          '<p class="confirm-consequences">El subgrupo «' + esc(g.name) + "» tiene " + blockers.join(", ") + ".</p>" +
          '<p class="confirm-warning">El backend real (<code>GroupContentService.deleteSubgroup</code>) solo permite eliminar un subgrupo vacío, sin configuración dinámica, sin plantilla y sin transiciones asociadas, rechazando el resto de casos con un error 409 — sin eliminación en cascada para subgrupos, a diferencia de un grupo principal. Vacíalo primero.</p>',
      });
      return;
    }

    openConfirm({
      title: "Eliminar subgrupo",
      html: '<p class="confirm-consequences">¿Eliminar el subgrupo «' + esc(g.name) + '»? Está vacío: no se verá afectado ningún otro elemento.</p>',
      confirmLabel: "Eliminar subgrupo",
      onConfirm: function () {
        deleteSubgroupLocal(groupId);
        closeModal();
        afterMutation(null);
      },
    });
  }

  function requestDeleteExerciseOccurrence(exerciseOccurrenceId) {
    var occ = findExerciseOccurrence(exerciseOccurrenceId);
    if (!occ) {
      return;
    }
    var related = TREE.transitions.filter(function (t) {
      return t.originFlowElementId === occ.flowElementId || t.destinationFlowElementId === occ.flowElementId;
    });
    var blockers = [];
    if (related.length) {
      blockers.push(related.length + " transición(es) asociada(s)");
    }
    if (occ.prescriptionDetail.length > 0) {
      blockers.push("valores de prescripción ya registrados");
    }

    if (blockers.length) {
      openConfirm({
        title: "No es posible eliminar este ejercicio",
        blocked: true,
        html:
          '<p class="confirm-consequences">La aparición de «' + esc(occ.exerciseName) + "» tiene " + blockers.join(" y ") + ".</p>" +
          '<p class="confirm-warning">El backend real (<code>ExerciseOccurrenceService.deleteExerciseOccurrence</code>) rechaza la eliminación en estos casos con un error 409, sin eliminación en cascada. Elimina antes esas dependencias.</p>',
      });
      return;
    }

    openConfirm({
      title: "Eliminar ejercicio",
      html:
        '<p class="confirm-consequences">¿Eliminar la aparición de «' + esc(occ.exerciseName) + '» en este punto del entrenamiento?</p>' +
        '<p class="confirm-consequences">El ejercicio en sí seguirá disponible en el catálogo: solo se elimina esta aparición concreta.</p>',
      confirmLabel: "Eliminar ejercicio",
      onConfirm: function () {
        deleteExerciseOccurrenceLocal(exerciseOccurrenceId);
        closeModal();
        afterMutation(null);
      },
    });
  }

  // El backend real (ExercisePrescriptionValueOperations.deleteValue) no
  // impone ninguna restricción de negocio al eliminar un valor concreto —
  // a diferencia de eliminar la aparición entera. Se pide confirmación de
  // todas formas por ser una acción destructiva, nunca porque el backend
  // la bloquee.
  function requestDeletePrescriptionValue(exerciseOccurrenceId, valueId) {
    var occ = findExerciseOccurrence(exerciseOccurrenceId);
    if (!occ) {
      return;
    }
    var value = occ.prescriptionDetail.filter(function (v) {
      return v.valueId === valueId;
    })[0];
    if (!value) {
      return;
    }
    openConfirm({
      title: "Eliminar valor de la prescripción",
      html:
        '<p class="confirm-consequences">¿Eliminar el valor «' + esc(formatPrescriptionValue(value)) + "» de la aparición de «" + esc(occ.exerciseName) + '»?</p>' +
        '<p class="confirm-consequences">El backend real no restringe esta operación: a diferencia de eliminar la aparición completa, un valor concreto siempre se puede quitar.</p>',
      confirmLabel: "Eliminar valor",
      onConfirm: function () {
        // A diferencia de eliminar la aparición entera, el ejercicio sigue
        // existiendo: no se cierra el modal de detalle (si estuviera
        // abierto en móvil), solo se refresca con la misma selección.
        deletePrescriptionValueLocal(exerciseOccurrenceId, valueId);
        afterMutation(exKeyById(exerciseOccurrenceId));
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
        return (ci.kind === "group" ? "Subgrupo: " : "Ejercicio: ") + esc(ci.kind === "group" ? ci.item.name : ci.item.exerciseName);
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

    var addButtons =
      '<button type="button" class="btn btn-secondary" data-action="add-subgroup" data-parent-group-id="' + g.groupId + '">+ Añadir subgrupo</button>' +
      '<button type="button" class="btn btn-secondary" data-action="add-exercise" data-parent-group-id="' + g.groupId + '">+ Añadir ejercicio</button>';
    var dynamicDisabled = '<button type="button" class="btn btn-secondary" disabled title="Fuera de alcance de 4.4">Configurar dinámica (bloque 4.6)</button>';

    var actionsHtml;
    var blockedNote = "";

    if (sectionGroupId !== null && depth === 1) {
      // Grupo principal (depth 1): acciones ya aprobadas en 4.2, más las
      // nuevas de 4.3 para añadir contenido directamente en él.
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
        addButtons +
        dynamicDisabled;
    } else {
      // Subgrupo (depth > 1): acciones nuevas de 4.3 — gestionado mediante
      // GROUP_CONTENT, nunca SECTION_GROUP (por eso no tiene sectionGroupId).
      var found = findContentArrayAndIndexForGroup(g.groupId);
      var sgIsFirst = !found || found.index === 0;
      var sgIsLast = !found || found.index === found.contentArray.length - 1;
      var parentGroupId = found ? found.parentGroup.groupId : null;

      actionsHtml =
        '<button type="button" class="btn btn-secondary" data-action="edit-subgroup" data-parent-group-id="' + parentGroupId + '" data-group-id="' + g.groupId + '">Editar subgrupo</button>' +
        '<button type="button" class="btn btn-secondary" data-action="move-subgroup-up" data-group-id="' + g.groupId + '"' + (sgIsFirst ? " disabled" : "") + '>Subir</button>' +
        '<button type="button" class="btn btn-secondary" data-action="move-subgroup-down" data-group-id="' + g.groupId + '"' + (sgIsLast ? " disabled" : "") + '>Bajar</button>' +
        '<button type="button" class="btn btn-danger" data-action="delete-subgroup" data-group-id="' + g.groupId + '">Eliminar subgrupo</button>' +
        addButtons +
        dynamicDisabled;

      if (g.content.length > 0 || g.dynamicConfiguration || related.length > 0) {
        var reasons = [];
        if (g.content.length > 0) {
          reasons.push(g.content.length + " elemento(s) propio(s)");
        }
        if (g.dynamicConfiguration) {
          reasons.push("una configuración dinámica");
        }
        if (related.length > 0) {
          reasons.push(related.length + " transición(es)");
        }
        blockedNote =
          '<p class="detail-blocked-note">Este subgrupo no se puede eliminar todavía: tiene ' + reasons.join(", ") +
          ". El backend real rechaza la eliminación mientras existan (sin cascada para subgrupos, a diferencia de un grupo principal).</p>";
      }
    }

    return (
      '<h3 class="detail-title">' + esc(g.name) + '</h3><div class="detail-kind">' +
      (depth === 1 ? "Grupo principal" : "Subgrupo (nivel " + depth + ")") +
      "</div>" +
      rowsHtml(rows) +
      '<div class="detail-actions">' + actionsHtml + "</div>" +
      blockedNote
    );
  }

  // Lista de valores reales (ordenados por posición) con sus acciones
  // Subir/Bajar/Editar/Eliminar, y el botón "+ Añadir valor" — deshabilitado
  // solo cuando ya hay un valor de cada una de las cinco magnitudes del
  // dominio (nunca porque el usuario no pueda, siempre explicado).
  function buildPrescriptionValuesHtml(e) {
    var sorted = e.prescriptionDetail.slice().sort(byPosition);
    var usedMagnitudes = e.prescriptionDetail.map(function (v) {
      return v.magnitude;
    });
    var canAddMore = PRESCRIPTION_UNITS.some(function (u) {
      return u.active && usedMagnitudes.indexOf(u.magnitude) === -1;
    });

    var rowsHtmlStr = sorted.length
      ? sorted
          .map(function (v, i) {
            var isFirst = i === 0;
            var isLast = i === sorted.length - 1;
            return (
              '<li class="prescription-value-row">' +
              '<span class="prescription-value-position">' + v.position + "</span>" +
              '<span class="prescription-value-text">' + esc(formatPrescriptionValue(v)) + "</span>" +
              '<span class="prescription-value-actions">' +
              '<button type="button" class="btn btn-tiny" data-action="move-prescription-value-up" data-exercise-occurrence-id="' + e.exerciseOccurrenceId + '" data-value-id="' + v.valueId + '"' + (isFirst ? " disabled" : "") + '>Subir</button>' +
              '<button type="button" class="btn btn-tiny" data-action="move-prescription-value-down" data-exercise-occurrence-id="' + e.exerciseOccurrenceId + '" data-value-id="' + v.valueId + '"' + (isLast ? " disabled" : "") + '>Bajar</button>' +
              '<button type="button" class="btn btn-tiny" data-action="edit-prescription-value" data-exercise-occurrence-id="' + e.exerciseOccurrenceId + '" data-value-id="' + v.valueId + '">Editar</button>' +
              '<button type="button" class="btn btn-tiny btn-danger" data-action="delete-prescription-value" data-exercise-occurrence-id="' + e.exerciseOccurrenceId + '" data-value-id="' + v.valueId + '">Eliminar</button>' +
              "</span></li>"
            );
          })
          .join("")
      : '<li class="prescription-value-empty">Sin valores estructurados todavía.</li>';

    var addBtn = canAddMore
      ? '<button type="button" class="btn btn-secondary" data-action="add-prescription-value" data-exercise-occurrence-id="' + e.exerciseOccurrenceId + '">+ Añadir valor</button>'
      : '<button type="button" class="btn btn-secondary" disabled title="Ya hay un valor de cada una de las cinco magnitudes del dominio (repeticiones, tiempo, distancia, peso/carga, energía)">+ Añadir valor</button>';

    return '<ul class="prescription-values-list">' + rowsHtmlStr + "</ul>" + addBtn;
  }

  function detailHtmlForExercise(e) {
    var relatedEx = TREE.transitions.filter(function (t) {
      return t.originFlowElementId === e.flowElementId || t.destinationFlowElementId === e.flowElementId;
    });
    var rows = [["Resumen de la prescripción", esc(prescriptionSummaryText(e) || "(sin prescripción)")]];
    rows.push(["Transiciones relacionadas", describeRelatedTransitions(relatedEx)]);

    var found = findContentArrayAndIndexForExercise(e.exerciseOccurrenceId);
    var isFirst = !found || found.index === 0;
    var isLast = !found || found.index === found.contentArray.length - 1;

    var blockers = [];
    if (relatedEx.length) {
      blockers.push(relatedEx.length + " transición(es)");
    }
    if (e.prescriptionDetail.length > 0) {
      blockers.push(e.prescriptionDetail.length + " valor(es) de prescripción");
    }

    var actions =
      '<button type="button" class="btn btn-secondary" data-action="change-exercise" data-exercise-occurrence-id="' + e.exerciseOccurrenceId + '">Cambiar de ejercicio</button>' +
      '<button type="button" class="btn btn-secondary" data-action="move-exercise-up" data-exercise-occurrence-id="' + e.exerciseOccurrenceId + '"' + (isFirst ? " disabled" : "") + '>Subir</button>' +
      '<button type="button" class="btn btn-secondary" data-action="move-exercise-down" data-exercise-occurrence-id="' + e.exerciseOccurrenceId + '"' + (isLast ? " disabled" : "") + '>Bajar</button>' +
      '<button type="button" class="btn btn-danger" data-action="delete-exercise" data-exercise-occurrence-id="' + e.exerciseOccurrenceId + '">Eliminar ejercicio</button>';

    var blockedNote = blockers.length
      ? '<p class="detail-blocked-note">Esta aparición tiene ' + blockers.join(" y ") +
        ": eliminarla o cambiar su ejercicio quedará bloqueado por el backend real mientras existan (comprobado al pulsar el botón correspondiente).</p>"
      : "";

    var noteSection =
      '<div class="detail-row"><div class="detail-row-label">Nota de prescripción (texto libre)</div><div class="detail-row-value">' +
      (e.prescriptionDescription ? esc(e.prescriptionDescription) : "(sin nota)") +
      ' <button type="button" class="btn btn-tiny" data-action="edit-prescription-note" data-exercise-occurrence-id="' + e.exerciseOccurrenceId + '">Editar nota</button>' +
      "</div></div>";

    var valuesSection =
      '<div class="detail-row"><div class="detail-row-label">Valores de la prescripción</div><div class="detail-row-value">' +
      buildPrescriptionValuesHtml(e) +
      "</div></div>";

    return (
      '<h3 class="detail-title">' + esc(e.exerciseName) + '</h3><div class="detail-kind">Ejercicio (aparición en el flujo)</div>' +
      rowsHtml(rows) +
      noteSection +
      valuesSection +
      '<div class="detail-actions">' + actions + "</div>" +
      blockedNote +
      '<p class="detail-readonly-note">Las transiciones (bloque 4.5) y la configuración dinámica del grupo que lo contiene (bloque 4.6) se muestran de solo lectura aquí; su edición llegará en esos bloques.</p>'
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

  // Misma condición combinada que useIsNarrowViewport(760) en el bloque 4.1
  // real (ver prototipos 4.1/4.2 para el detalle de por qué, sin cambios).
  var NARROW_MEDIA_QUERY = "(max-width: 760px), (max-height: 500px) and (pointer: coarse)";

  function isNarrowViewport() {
    return window.matchMedia(NARROW_MEDIA_QUERY).matches;
  }

  function effectiveDetailMode() {
    return isNarrowViewport() ? "modal" : detailStyleMode;
  }

  function renderDetail() {
    var html = selectedKey ? detailHtmlForKey(selectedKey) : null;
    var title = selectedKey && dataIndex[selectedKey] ? titleOf(dataIndex[selectedKey]) : "Detalle";
    var placeholder = '<p class="detail-panel-placeholder">Selecciona una sección, un grupo, un subgrupo o un ejercicio del diagrama o de la lista para ver y gestionar aquí sus datos.</p>';

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

  // ---------- Alto real del viewport visible (Android: barra de Chrome y teclado) ----------
  // 100vh en Chrome Android se basa en el viewport "grande" (como si la
  // barra de direcciones estuviera siempre oculta) y, en el dispositivo real
  // de la prueba, no se reajustaba de forma fiable justo al girar. 100dvh ya
  // se ajusta, pero su soporte para el teclado en pantalla varía según
  // versión de Chrome. window.visualViewport.height es el único valor que
  // refleja de inmediato el alto EXACTO y realmente visible en los tres
  // casos a la vez (barra de Chrome visible/oculta, giro y teclado), así que
  // se expone como variable CSS (--app-vvh) que el propio CSS usa para que
  // .modal-overlay y .modal nunca puedan medir más que eso. 100dvh y 100vh
  // quedan como reserva en cascada para navegadores sin soporte de
  // visualViewport (ver .modal-overlay/.modal en editor.css: cada
  // declaración de altura repite la propiedad tres veces, de la más
  // compatible a la más exacta, y gana la última que el navegador entienda).
  function updateViewportHeightVar() {
    var vv = window.visualViewport;
    var h = vv ? vv.height : window.innerHeight;
    document.documentElement.style.setProperty("--app-vvh", h + "px");
  }
  updateViewportHeightVar();
  if (window.visualViewport) {
    // "resize" cubre giro, aparición/ocultación de la barra de Chrome y
    // apertura/cierre del teclado; "scroll" cubre el desplazamiento del
    // visualViewport que el propio teclado produce en algunas versiones
    // sin disparar necesariamente "resize".
    window.visualViewport.addEventListener("resize", updateViewportHeightVar);
    window.visualViewport.addEventListener("scroll", updateViewportHeightVar);
  } else {
    window.addEventListener("resize", updateViewportHeightVar);
    window.addEventListener("orientationchange", updateViewportHeightVar);
  }

  // ---------- Overlays (modal de detalle, formulario, confirmación) ----------
  function openOverlay(id, focusId) {
    var overlay = document.getElementById(id);
    if (overlay.classList.contains("open")) {
      return;
    }
    lastFocusedBeforeModal = document.activeElement;
    overlay.classList.add("open");
    // Siempre se abre mostrando su propia parte superior: si una apertura
    // anterior dejó el overlay desplazado (red de seguridad de
    // overflow-y:auto en editor.css), que no se note en la siguiente.
    overlay.scrollTop = 0;
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

  // Causa real de la apertura involuntaria del detalle al girar el móvil:
  // cerrar el modal (closeModal) nunca vaciaba selectedKey. El listener de
  // "resize" (más abajo) vuelve a llamar a renderDetail() en cada cambio de
  // orientación mientras selectedKey siga apuntando a algo — y, en móvil,
  // renderDetail() en modo "modal" reabre el overlay con openModal() si hay
  // html que mostrar. Como closeModal() no tocaba selectedKey, cualquier
  // giro posterior a haber cerrado un detalle lo reabría solo, sin ningún
  // toque intencionado. dismissDetail() es el único cierre que cuenta como
  // "deseleccionar" (botón ✕, clic fuera del modal, Escape): por eso vacía
  // selectedKey, a diferencia de closeModal(), que renderDetail() también
  // usa en modo panel como simple medida de seguridad en cada repintado y
  // que por tanto NO debe vaciar la selección (si lo hiciera, el panel
  // lateral de escritorio perdería su elemento resaltado en cada mutación).
  function dismissDetail() {
    selectedKey = null;
    applySelectionHighlight();
    closeModal();
  }

  // ---------- Diagrama ----------
  function hasOutgoingTransition(flowElementId) {
    return TREE.transitions.some(function (t) {
      return t.originFlowElementId === flowElementId;
    });
  }

  function buildExerciseEl(e) {
    var key = exKeyOf(e);
    var el = document.createElement("div");
    el.className = "node node-exercise" + (hasOutgoingTransition(e.flowElementId) ? " has-outgoing-transition" : "");
    el.dataset.key = key;
    el.dataset.flowElementId = e.flowElementId;
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", "Ejercicio: " + e.exerciseName + ", " + (prescriptionSummaryText(e) || ""));
    el.innerHTML =
      '<span class="node-kind-label">Ejercicio</span><span class="node-name">' +
      esc(e.exerciseName) +
      '</span><span class="node-exercise-summary">' +
      esc(prescriptionSummaryText(e) || "") +
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
    el.className = "node node-group depth-" + Math.min(depth, 4) + (hasOutgoingTransition(g.flowElementId) ? " has-outgoing-transition" : "");
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

  function resolveVisibleAncestor(flowElementId) {
    var current = flowElementId;
    var guard = 0;
    while (current !== undefined && current !== null && guard++ < 30) {
      var el = flowIndex[current];
      if (isVisible(el)) {
        return el;
      }
      current = parentOfFlowElementId[current];
    }
    return null;
  }

  function segmentIntersectsRect(p1, p2, rect) {
    var minY = Math.min(p1.y, p2.y);
    var maxY = Math.max(p1.y, p2.y);
    var rTop = rect.top;
    var rBottom = rect.top + rect.height;
    if (rBottom < minY || rTop > maxY) {
      return false;
    }
    var sampleYs = [Math.max(minY, rTop), Math.min(maxY, rBottom), (Math.max(minY, rTop) + Math.min(maxY, rBottom)) / 2];
    for (var i = 0; i < sampleYs.length; i++) {
      var y = sampleYs[i];
      var t = p2.y === p1.y ? 0 : (y - p1.y) / (p2.y - p1.y);
      var x = p1.x + t * (p2.x - p1.x);
      if (x >= rect.left - 2 && x <= rect.left + rect.width + 2) {
        return true;
      }
    }
    return false;
  }

  function findBlockingRect(aEl, bEl, p1, p2) {
    for (var key in nodeElements) {
      var el = nodeElements[key];
      if (!el || el === aEl || el === bEl || !isVisible(el)) {
        continue;
      }
      if (aEl.contains(el) || bEl.contains(el) || el.contains(aEl) || el.contains(bEl)) {
        continue;
      }
      var r = nodeRect(el);
      if (segmentIntersectsRect(p1, p2, r)) {
        return r;
      }
    }
    return null;
  }

  var routeChannel = 0;

  function routeAround(aEl, bEl, blockingRect) {
    var ra = nodeRect(aEl);
    var rb = nodeRect(bEl);
    var gutterX = Math.max(ra.left + ra.width, rb.left + rb.width, blockingRect.left + blockingRect.width) + 10 + routeChannel * 14;
    routeChannel = (routeChannel + 1) % 3;
    var p1 = { x: ra.left + ra.width, y: ra.top + ra.height / 2 };
    var p2 = { x: rb.left + rb.width, y: rb.top + rb.height / 2 };
    return [p1, { x: gutterX, y: p1.y }, { x: gutterX, y: p2.y }, p2];
  }

  function drawConnector(svg, points, markerId, strokeColor, strokeWidth, dashed, label) {
    var ns = "http://www.w3.org/2000/svg";
    var d = "M " + points[0].x + "," + points[0].y;
    for (var i = 1; i < points.length; i++) {
      d += " L " + points[i].x + "," + points[i].y;
    }
    var path = document.createElementNS(ns, "path");
    path.setAttribute("d", d);
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", strokeColor);
    path.setAttribute("stroke-width", String(strokeWidth));
    if (dashed) {
      path.setAttribute("stroke-dasharray", "7,5");
    }
    path.setAttribute("marker-end", "url(#" + markerId + ")");
    svg.appendChild(path);

    if (label) {
      var bestLen = -1, labelX = 0, labelY = 0;
      for (var j = 0; j < points.length - 1; j++) {
        var dx = points[j + 1].x - points[j].x;
        var dy = points[j + 1].y - points[j].y;
        var len = Math.sqrt(dx * dx + dy * dy);
        if (len > bestLen) {
          bestLen = len;
          labelX = (points[j].x + points[j + 1].x) / 2;
          labelY = (points[j].y + points[j + 1].y) / 2 + 3;
        }
      }
      var text = document.createElementNS(ns, "text");
      text.setAttribute("x", labelX);
      text.setAttribute("y", labelY);
      text.setAttribute("text-anchor", "middle");
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

  function connectorPointsFor(aEl, bEl) {
    var pts = edgePoints(aEl, bEl);
    var blocking = findBlockingRect(aEl, bEl, pts.p1, pts.p2);
    if (!blocking) {
      return [pts.p1, pts.p2];
    }
    return routeAround(aEl, bEl, blocking);
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
    routeChannel = 0;

    var w = Math.max(treeRoot.scrollWidth, 10);
    var h = Math.max(treeRoot.scrollHeight, 10);
    svg.setAttribute("width", w);
    svg.setAttribute("height", h);

    var transitionPairs = {};
    TREE.transitions.forEach(function (t) {
      transitionPairs[t.originFlowElementId + ">" + t.destinationFlowElementId] = true;
    });

    if (orderStyleMode === "B") {
      orderContainers.forEach(function (ids) {
        for (var i = 0; i < ids.length - 1; i++) {
          var a = flowIndex[ids[i]];
          var b = flowIndex[ids[i + 1]];
          if (!isVisible(a) || !isVisible(b)) {
            continue;
          }
          if (transitionPairs[ids[i] + ">" + ids[i + 1]]) {
            continue;
          }
          var bothGroups = flowTypeIndex[ids[i]] === "group" && flowTypeIndex[ids[i + 1]] === "group";
          var points = connectorPointsFor(a, b);
          if (bothGroups) {
            drawConnector(svg, points, "arrow-order-group", "#64748b", 2.5, false, null);
          } else {
            drawConnector(svg, points, "arrow-order-exercise", "#9aa1ad", 1.5, false, null);
          }
        }
      });
    }

    TREE.transitions.forEach(function (t) {
      var a = resolveVisibleAncestor(t.originFlowElementId);
      var b = resolveVisibleAncestor(t.destinationFlowElementId);
      if (!a || !b || a === b) {
        return;
      }
      var parts = ["Transición"];
      if (t.duration) {
        parts.push(t.duration.value + " " + t.duration.unit);
      }
      if (t.activity) {
        parts.push("+ actividad");
      }
      var points = connectorPointsFor(a, b);
      drawConnector(svg, points, "arrow-transition", "#c2410c", 2.5, true, parts.join(" · "));
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
      esc(prescriptionSummaryText(e) || "") +
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

  function zoomAt(x, y, delta) {
    var newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale + delta));
    var worldX = (x - panX) / scale;
    var worldY = (y - panY) / scale;
    scale = newScale;
    panX = x - worldX * newScale;
    panY = y - worldY * newScale;
    applyTransform();
    requestAnimationFrame(drawArrows);
  }

  function zoomBy(delta) {
    var viewport = document.getElementById("canvasViewport");
    zoomAt(viewport.clientWidth / 2, viewport.clientHeight / 2, delta);
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
    scale = Math.max(MIN_SCALE, s);
    panX = Math.max(10, (vw - tw * scale) / 2);
    panY = 16;
    applyTransform();
    requestAnimationFrame(drawArrows);
  }

  function wireCanvasInteraction() {
    var viewport = document.getElementById("canvasViewport");
    var isPanning = false;
    var dragMoved = false;
    var startX = 0;
    var startY = 0;
    var origX = 0;
    var origY = 0;

    var DRAG_THRESHOLD = 10;

    var suppressNextClick = false;
    viewport.addEventListener(
      "click",
      function (ev) {
        if (suppressNextClick) {
          suppressNextClick = false;
          ev.stopPropagation();
          ev.preventDefault();
        }
      },
      true
    );

    viewport.addEventListener("mousedown", function (ev) {
      if (ev.button !== 0) {
        return;
      }
      isPanning = true;
      dragMoved = false;
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
      var dx = ev.clientX - startX;
      var dy = ev.clientY - startY;
      if (!dragMoved && dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) {
        dragMoved = true;
      }
      if (dragMoved) {
        panX = origX + dx;
        panY = origY + dy;
        applyTransform();
      }
    });
    window.addEventListener("mouseup", function () {
      if (isPanning) {
        isPanning = false;
        viewport.classList.remove("panning");
        if (dragMoved) {
          suppressNextClick = true;
          requestAnimationFrame(drawArrows);
        }
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
          dragMoved = false;
          beginPan(ev.touches[0]);
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
          dragMoved = true;
          var newDist = touchDistance(ev.touches[0], ev.touches[1]);
          var ratio = newDist / pinchStartDist;
          var newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinchStartScale * ratio));
          var worldX = (pinchMidX - pinchStartPanX) / pinchStartScale;
          var worldY = (pinchMidY - pinchStartPanY) / pinchStartScale;
          scale = newScale;
          panX = pinchMidX - worldX * newScale;
          panY = pinchMidY - worldY * newScale;
          applyTransform();
        } else if (ev.touches.length === 1) {
          if (touchMode === "pan") {
            var dx = ev.touches[0].clientX - touchStartX;
            var dy = ev.touches[0].clientY - touchStartY;
            if (!dragMoved && dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) {
              dragMoved = true;
            }
            if (dragMoved) {
              ev.preventDefault();
              panX = touchOrigX + dx;
              panY = touchOrigY + dy;
              applyTransform();
            }
          } else if (touchMode === "pinch") {
            beginPan(ev.touches[0]);
          }
        }
      },
      { passive: false }
    );

    function endTouch(ev) {
      if (ev.touches.length === 0) {
        if (touchMode === "pan" && dragMoved) {
          suppressNextClick = true;
          requestAnimationFrame(drawArrows);
        }
        touchMode = null;
      } else if (ev.touches.length === 1) {
        dragMoved = false;
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
        var rect = viewport.getBoundingClientRect();
        zoomAt(ev.clientX - rect.left, ev.clientY - rect.top, ev.deltaY < 0 ? 0.1 : -0.1);
      },
      { passive: false }
    );

    document.getElementById("btnZoomIn").addEventListener("click", function () {
      zoomBy(0.15);
    });
    document.getElementById("btnZoomOut").addEventListener("click", function () {
      zoomBy(-0.15);
    });
    document.getElementById("btnFitView").addEventListener("click", function () {
      requestAnimationFrame(fitView);
    });
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

  function setLayoutMode(mode) {
    layoutMode = mode;
    document.getElementById("canvasTree").classList.toggle("layout-horizontal", mode === "horizontal");
    requestAnimationFrame(fitView);
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
      '<span class="badge badge-editing">Prescripciones, valores y unidades (4.4)</span>';
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
        case "add-subgroup":
          openSubgroupForm(Number(btn.dataset.parentGroupId), null);
          break;
        case "edit-subgroup":
          openSubgroupForm(Number(btn.dataset.parentGroupId), Number(btn.dataset.groupId));
          break;
        case "move-subgroup-up":
          moveSubgroupBy(Number(btn.dataset.groupId), -1);
          break;
        case "move-subgroup-down":
          moveSubgroupBy(Number(btn.dataset.groupId), 1);
          break;
        case "delete-subgroup":
          requestDeleteSubgroup(Number(btn.dataset.groupId));
          break;
        case "add-exercise":
          openExerciseAddForm(Number(btn.dataset.parentGroupId));
          break;
        case "change-exercise":
          requestChangeExercise(Number(btn.dataset.exerciseOccurrenceId));
          break;
        case "move-exercise-up":
          moveExerciseOccurrenceBy(Number(btn.dataset.exerciseOccurrenceId), -1);
          break;
        case "move-exercise-down":
          moveExerciseOccurrenceBy(Number(btn.dataset.exerciseOccurrenceId), 1);
          break;
        case "delete-exercise":
          requestDeleteExerciseOccurrence(Number(btn.dataset.exerciseOccurrenceId));
          break;
        case "edit-prescription-note":
          openPrescriptionNoteForm(Number(btn.dataset.exerciseOccurrenceId));
          break;
        case "add-prescription-value":
          openPrescriptionValueForm(Number(btn.dataset.exerciseOccurrenceId), null);
          break;
        case "edit-prescription-value":
          openPrescriptionValueForm(Number(btn.dataset.exerciseOccurrenceId), Number(btn.dataset.valueId));
          break;
        case "move-prescription-value-up":
          movePrescriptionValueBy(Number(btn.dataset.exerciseOccurrenceId), Number(btn.dataset.valueId), -1);
          break;
        case "move-prescription-value-down":
          movePrescriptionValueBy(Number(btn.dataset.exerciseOccurrenceId), Number(btn.dataset.valueId), 1);
          break;
        case "delete-prescription-value":
          requestDeletePrescriptionValue(Number(btn.dataset.exerciseOccurrenceId), Number(btn.dataset.valueId));
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
    document.getElementById("modalCloseBtn").addEventListener("click", dismissDetail);
    document.getElementById("modalOverlay").addEventListener("click", function (ev) {
      if (ev.target === ev.currentTarget) {
        dismissDetail();
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
    document.getElementById("formCancelBtn").addEventListener("click", function () {
      closeOverlay("formOverlay");
    });
    document.getElementById("formSaveBtn").addEventListener("click", function () {
      saveForm();
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
        dismissDetail();
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
    wireSegControl("segLayout", setLayoutMode);

    resetToScenario(currentScenarioKey);

    window.addEventListener("resize", function () {
      requestAnimationFrame(drawArrows);
      if (selectedKey) {
        renderDetail();
      }
    });
  });
})();
