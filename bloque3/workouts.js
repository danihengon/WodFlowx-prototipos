// Prototipo de la gestión básica de entrenamientos (bloque 3). Todo el
// estado vive en memoria, en este script: no hay ninguna llamada real a
// /api/workouts. Las reglas reproducen exactamente las verificadas en el
// backend real (WorkoutService, WorkoutControllerIT):
//   - DAILY_CLASS exige fecha; PERSONAL exige fecha = null (ambas, error
//     400 real si no se cumplen, no una comodidad del formulario).
//   - El tipo es inmutable tras crear el entrenamiento (WorkoutUpdateRequest
//     no admite ese campo; un intento de cambiarlo se ignora en silencio).
//   - No existe ninguna regla de título duplicado para Workout (a
//     diferencia de Exercise): no se simula ningún error 409 aquí.
//   - Desactivar/reactivar no tiene ninguna restricción por asignaciones ni
//     por estructura existente (verificado en WorkoutService: ningún
//     método comprueba PersonalWorkoutAssignment al desactivar).

var INITIAL_WORKOUTS = [
  { id: 1, type: "DAILY_CLASS", title: "CrossTraining matinal", description: "Clase general de alta intensidad.", date: "2026-11-20", active: true },
  { id: 2, type: "DAILY_CLASS", title: "Fuerza — tren superior", description: "Clase de fuerza, grupos reducidos.", date: "2026-11-21", active: true },
  { id: 3, type: "DAILY_CLASS", title: "HIIT 30 minutos", description: "", date: "2026-11-22", active: true },
  { id: 4, type: "DAILY_CLASS", title: "Clase de movilidad (antigua)", description: "Sustituida por una rutina más completa.", date: "2026-10-05", active: false },
  { id: 5, type: "PERSONAL", title: "Plan de Marta — bloque 1", description: "Preparación de prueba física, primeras 4 semanas.", date: null, active: true },
  { id: 6, type: "PERSONAL", title: "Plan de Marta — bloque 2", description: "Continuación, aumenta la carga.", date: null, active: true },
  { id: 7, type: "PERSONAL", title: "Readaptación rodilla — Javier", description: "", date: null, active: true },
  { id: 8, type: "PERSONAL", title: "Plan antiguo — Laura (descartado)", description: "Sustituido por un plan con otra estructura.", date: null, active: false },
];

var state = {
  workouts: [],
  nextId: 9,
  typeFilter: "all",
  statusFilter: "active",
  search: "",
  editingId: null,
  deactivatingId: null,
  forceEmptyDemo: false,
  forceSaveError: false,
};

function cloneSeed() {
  var copy = [];
  for (var i = 0; i < INITIAL_WORKOUTS.length; i++) {
    var w = INITIAL_WORKOUTS[i];
    copy.push({ id: w.id, type: w.type, title: w.title, description: w.description, date: w.date, active: w.active });
  }
  return copy;
}

state.workouts = cloneSeed();

function byId(id) {
  return document.getElementById(id);
}

function findWorkout(id) {
  for (var i = 0; i < state.workouts.length; i++) {
    if (state.workouts[i].id === id) {
      return state.workouts[i];
    }
  }
  return null;
}

function normalized(text) {
  return (text || "").trim().toLowerCase();
}

function formatDate(isoDate) {
  if (!isoDate) {
    return null;
  }
  var parts = isoDate.split("-");
  var months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  return parseInt(parts[2], 10) + " " + months[parseInt(parts[1], 10) - 1] + " " + parts[0];
}

// Filtro de tipo y estado: igual que los parámetros reales de
// GET /api/workouts (type=.../active=true|false, o ausentes). La búsqueda
// por título es, a propósito, solo local (ver nota en entrenamientos.html).
function matchesFilters(workout) {
  if (state.typeFilter !== "all" && workout.type !== state.typeFilter) {
    return false;
  }
  if (state.statusFilter === "active" && !workout.active) {
    return false;
  }
  if (state.statusFilter === "inactive" && workout.active) {
    return false;
  }
  var search = normalized(state.search);
  if (search && workout.title.toLowerCase().indexOf(search) === -1) {
    return false;
  }
  return true;
}

function hideAllBanners() {
  byId("bannerOffline").classList.remove("open");
  byId("bannerSession").classList.remove("open");
  byId("bannerForbidden").classList.remove("open");
}

function setBlockedView(bannerId) {
  hideAllBanners();
  byId(bannerId).classList.add("open");
  byId("searchInput").disabled = true;
  byId("btnNuevo").disabled = true;
  var tabs = document.querySelectorAll(".status-tab");
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].disabled = true;
  }
  byId("workoutList").style.display = "none";
  byId("emptyState").style.display = "none";
}

function clearBlockedView() {
  hideAllBanners();
  byId("searchInput").disabled = false;
  byId("btnNuevo").disabled = false;
  var tabs = document.querySelectorAll(".status-tab");
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].disabled = false;
  }
  byId("workoutList").style.display = "flex";
}

function render() {
  var list = byId("workoutList");
  var empty = byId("emptyState");
  list.innerHTML = "";

  var visible = [];
  if (!state.forceEmptyDemo) {
    for (var i = 0; i < state.workouts.length; i++) {
      if (matchesFilters(state.workouts[i])) {
        visible.push(state.workouts[i]);
      }
    }
  }

  if (visible.length === 0) {
    list.style.display = "none";
    empty.style.display = "block";
    if (state.forceEmptyDemo) {
      byId("emptyTitle").textContent = "No hay entrenamientos";
      byId("emptyText").textContent = "Todavía no se ha creado ningún entrenamiento.";
    } else if (normalized(state.search)) {
      byId("emptyTitle").textContent = "Sin resultados";
      byId("emptyText").textContent = "Ningún título coincide con “" + state.search + "” (búsqueda local).";
    } else {
      byId("emptyTitle").textContent = "Nada que mostrar aquí";
      byId("emptyText").textContent = "No hay entrenamientos en este filtro.";
    }
    return;
  }

  list.style.display = "flex";
  empty.style.display = "none";

  for (var j = 0; j < visible.length; j++) {
    list.appendChild(buildRow(visible[j]));
  }
}

function buildRow(workout) {
  var row = document.createElement("div");
  row.className = "workout-row";

  var main = document.createElement("div");
  main.className = "workout-main";
  var title = document.createElement("div");
  title.className = "workout-title";
  title.textContent = workout.title;
  main.appendChild(title);

  var meta = document.createElement("div");
  meta.className = "workout-meta";

  var typeBadge = document.createElement("span");
  typeBadge.className = "badge " + (workout.type === "DAILY_CLASS" ? "badge-daily" : "badge-personal");
  typeBadge.textContent = workout.type === "DAILY_CLASS" ? "Clase del día" : "Personal";
  meta.appendChild(typeBadge);

  if (workout.type === "DAILY_CLASS") {
    var dateBadge = document.createElement("span");
    dateBadge.className = "badge badge-date";
    dateBadge.textContent = formatDate(workout.date);
    meta.appendChild(dateBadge);
  }

  var statusBadge = document.createElement("span");
  statusBadge.className = "badge " + (workout.active ? "badge-active" : "badge-inactive");
  statusBadge.textContent = workout.active ? "Activo" : "Inactivo";
  meta.appendChild(statusBadge);

  main.appendChild(meta);

  var desc = document.createElement("div");
  desc.className = "workout-desc";
  desc.textContent = workout.description || "Sin descripción.";
  main.appendChild(desc);

  var actions = document.createElement("div");
  actions.className = "workout-actions";

  var editBtn = document.createElement("button");
  editBtn.className = "btn btn-secondary";
  editBtn.type = "button";
  editBtn.textContent = "Editar";
  editBtn.addEventListener("click", function () {
    openFormModal(workout.id);
  });
  actions.appendChild(editBtn);

  if (workout.active) {
    var deactivateBtn = document.createElement("button");
    deactivateBtn.className = "btn btn-outline-danger";
    deactivateBtn.type = "button";
    deactivateBtn.textContent = "Desactivar";
    deactivateBtn.addEventListener("click", function () {
      openConfirmModal(workout.id);
    });
    actions.appendChild(deactivateBtn);
  } else {
    var reactivateBtn = document.createElement("button");
    reactivateBtn.className = "btn btn-secondary";
    reactivateBtn.type = "button";
    reactivateBtn.textContent = "Reactivar";
    reactivateBtn.addEventListener("click", function () {
      reactivateWorkout(workout.id);
    });
    actions.appendChild(reactivateBtn);
  }

  // Acción futura (bloque 4): deshabilitada a propósito, no debe parecer
  // una funcionalidad ya disponible.
  var futureBtn = document.createElement("button");
  futureBtn.className = "btn btn-secondary";
  futureBtn.type = "button";
  futureBtn.textContent = "Editar estructura";
  futureBtn.disabled = true;
  futureBtn.title = "Próximamente (bloque 4): editor visual con React Flow para secciones, grupos y ejercicios.";
  actions.appendChild(futureBtn);

  row.appendChild(main);
  row.appendChild(actions);
  return row;
}

// ---------- Modal de alta / edición ----------

function openFormModal(workoutId) {
  state.editingId = workoutId || null;
  var workout = workoutId ? findWorkout(workoutId) : null;

  byId("formModalTitle").textContent = workout ? "Editar entrenamiento" : "Nuevo entrenamiento";
  byId("fieldTitle").value = workout ? workout.title : "";
  byId("fieldDescription").value = workout ? workout.description || "" : "";
  byId("errorTitle").style.display = "none";
  byId("errorDate").style.display = "none";

  var typeSelect = byId("fieldType");
  var typeStatic = byId("fieldTypeStatic");
  var typeEditHint = byId("typeEditHint");
  var labelType = byId("labelType");

  if (workout) {
    // Edición: el tipo es fijo, nunca editable (igual que el backend real).
    typeSelect.style.display = "none";
    labelType.style.display = "none";
    typeStatic.style.display = "block";
    typeStatic.textContent = workout.type === "DAILY_CLASS" ? "Clase del día" : "Personal";
    typeEditHint.style.display = "block";
    applyDateFieldForType(workout.type);
    byId("fieldDate").value = workout.date || "";
  } else {
    typeSelect.style.display = "block";
    labelType.style.display = "block";
    typeStatic.style.display = "none";
    typeEditHint.style.display = "none";
    typeSelect.value = "DAILY_CLASS";
    applyDateFieldForType("DAILY_CLASS");
    byId("fieldDate").value = "";
  }

  var caution = byId("editingCaution");
  var reactivarBtn = byId("btnReactivarDesdeForm");
  if (workout && !workout.active) {
    caution.style.display = "block";
    caution.textContent = "Este entrenamiento está inactivo. Puedes editarlo igualmente, o reactivarlo desde aquí.";
    reactivarBtn.style.display = "inline-block";
  } else {
    caution.style.display = "none";
    reactivarBtn.style.display = "none";
  }

  byId("formModalOverlay").classList.add("open");
  byId("fieldTitle").focus();
}

// Muestra/oculta y habilita/deshabilita el campo de fecha según el tipo.
// Al cambiar a PERSONAL se vacía la fecha ya introducida: el backend real
// rechaza con 400 cualquier fecha enviada para un entrenamiento PERSONAL,
// así que nunca debe quedar un valor residual que violaría esa regla.
function applyDateFieldForType(type) {
  var wrapper = byId("dateFieldWrapper");
  var dateInput = byId("fieldDate");
  var hint = byId("dateHint");
  if (type === "DAILY_CLASS") {
    wrapper.style.display = "block";
    dateInput.disabled = false;
    hint.textContent = "Obligatoria para una clase del día.";
  } else {
    dateInput.value = "";
    wrapper.style.display = "none";
    dateInput.disabled = true;
  }
}

function closeModals() {
  byId("formModalOverlay").classList.remove("open");
  byId("confirmModalOverlay").classList.remove("open");
  state.editingId = null;
  state.deactivatingId = null;
}

function showToast(message, isError) {
  var stack = byId("toastStack");
  var toast = document.createElement("div");
  toast.className = "toast " + (isError ? "toast-error" : "toast-success");
  toast.textContent = message;
  stack.appendChild(toast);
  setTimeout(function () {
    stack.removeChild(toast);
  }, 3200);
}

function saveForm() {
  var titleInput = byId("fieldTitle");
  var title = titleInput.value.trim();
  var errorTitleEl = byId("errorTitle");
  var errorDateEl = byId("errorDate");
  errorTitleEl.style.display = "none";
  errorDateEl.style.display = "none";

  if (!title) {
    errorTitleEl.textContent = "El título del entrenamiento es obligatorio.";
    errorTitleEl.style.display = "block";
    return;
  }

  var existing = state.editingId ? findWorkout(state.editingId) : null;
  var type = existing ? existing.type : byId("fieldType").value;
  var date = byId("fieldDate").value || null;

  // Misma validación real que WorkoutService.requireDateMatchesType: no es
  // una comodidad del formulario, es el error 400 que el backend devolvería.
  if (type === "DAILY_CLASS" && !date) {
    errorDateEl.textContent = "Una clase del día (DAILY_CLASS) requiere una fecha.";
    errorDateEl.style.display = "block";
    return;
  }
  if (type === "PERSONAL" && date) {
    errorDateEl.textContent = "Un entrenamiento personal (PERSONAL) no puede tener fecha.";
    errorDateEl.style.display = "block";
    return;
  }

  var description = byId("fieldDescription").value.trim();

  var saveBtn = byId("btnGuardar");
  saveBtn.disabled = true;
  saveBtn.textContent = "Guardando…";

  setTimeout(function () {
    saveBtn.disabled = false;
    saveBtn.textContent = "Guardar";

    if (state.forceSaveError) {
      showToast("No se ha podido guardar el entrenamiento. Inténtalo de nuevo.", true);
      return;
    }

    if (existing) {
      existing.title = title;
      existing.description = description;
      existing.date = type === "DAILY_CLASS" ? date : null;
      showToast("Entrenamiento actualizado correctamente.", false);
    } else {
      state.workouts.push({
        id: state.nextId++,
        type: type,
        title: title,
        description: description,
        date: type === "DAILY_CLASS" ? date : null,
        active: true,
      });
      showToast("Entrenamiento creado correctamente.", false);
    }

    closeModals();
    render();
  }, 450);
}

// ---------- Desactivar / reactivar ----------

function openConfirmModal(workoutId) {
  state.deactivatingId = workoutId;
  var workout = findWorkout(workoutId);
  byId("confirmModalText").textContent =
    "¿Seguro que quieres desactivar “" + workout.title + "”?";
  byId("confirmModalOverlay").classList.add("open");
}

function confirmDeactivate() {
  var workout = findWorkout(state.deactivatingId);
  if (workout) {
    workout.active = false;
    showToast("“" + workout.title + "” desactivado.", false);
  }
  closeModals();
  render();
}

function reactivateWorkout(workoutId) {
  var workout = findWorkout(workoutId);
  if (workout) {
    workout.active = true;
    showToast("“" + workout.title + "” reactivado.", false);
  }
  render();
}

// ---------- Eventos ----------

document.addEventListener("DOMContentLoaded", function () {
  render();

  byId("searchInput").addEventListener("input", function (event) {
    state.search = event.target.value;
    render();
  });

  var typeTabs = document.querySelectorAll("#typeTabs .status-tab");
  for (var i = 0; i < typeTabs.length; i++) {
    typeTabs[i].addEventListener("click", function (event) {
      for (var j = 0; j < typeTabs.length; j++) {
        typeTabs[j].classList.remove("active");
      }
      event.target.classList.add("active");
      state.typeFilter = event.target.getAttribute("data-type");
      render();
    });
  }

  var statusTabs = document.querySelectorAll("#statusTabs .status-tab");
  for (var s = 0; s < statusTabs.length; s++) {
    statusTabs[s].addEventListener("click", function (event) {
      for (var k = 0; k < statusTabs.length; k++) {
        statusTabs[k].classList.remove("active");
      }
      event.target.classList.add("active");
      state.statusFilter = event.target.getAttribute("data-status");
      render();
    });
  }

  byId("fieldType").addEventListener("change", function (event) {
    applyDateFieldForType(event.target.value);
  });

  byId("btnNuevo").addEventListener("click", function () {
    openFormModal(null);
  });

  byId("btnGuardar").addEventListener("click", saveForm);
  byId("btnConfirmarDesactivar").addEventListener("click", confirmDeactivate);
  byId("btnReactivarDesdeForm").addEventListener("click", function () {
    var id = state.editingId;
    closeModals();
    reactivateWorkout(id);
  });

  var closeButtons = document.querySelectorAll("[data-close-modal]");
  for (var c = 0; c < closeButtons.length; c++) {
    closeButtons[c].addEventListener("click", closeModals);
  }

  document.querySelectorAll(".modal-overlay").forEach(function (overlay) {
    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) {
        closeModals();
      }
    });
  });

  // ---------- Panel de simulación de estados ----------
  document.querySelectorAll("[data-demo]").forEach(function (button) {
    button.addEventListener("click", function () {
      var kind = button.getAttribute("data-demo");
      if (kind === "empty") {
        clearBlockedView();
        state.forceEmptyDemo = true;
        render();
      } else if (kind === "no-results") {
        clearBlockedView();
        state.forceEmptyDemo = false;
        state.search = "xyz-sin-coincidencias";
        byId("searchInput").value = state.search;
        render();
      } else if (kind === "save-error") {
        state.forceSaveError = true;
        showToast("Simulación activada: el próximo guardado fallará.", true);
      } else if (kind === "offline") {
        setBlockedView("bannerOffline");
      } else if (kind === "session") {
        setBlockedView("bannerSession");
      } else if (kind === "forbidden") {
        setBlockedView("bannerForbidden");
      } else if (kind === "reset") {
        state.workouts = cloneSeed();
        state.nextId = 9;
        state.typeFilter = "all";
        state.statusFilter = "active";
        state.search = "";
        state.forceEmptyDemo = false;
        state.forceSaveError = false;
        byId("searchInput").value = "";
        for (var t = 0; t < typeTabs.length; t++) {
          typeTabs[t].classList.remove("active");
        }
        typeTabs[0].classList.add("active");
        for (var u = 0; u < statusTabs.length; u++) {
          statusTabs[u].classList.remove("active");
        }
        statusTabs[0].classList.add("active");
        clearBlockedView();
        render();
        showToast("Datos de ejemplo restablecidos.", false);
      }
    });
  });

  document.querySelectorAll("[data-demo-retry]").forEach(function (button) {
    button.addEventListener("click", function () {
      clearBlockedView();
      render();
    });
  });
});
