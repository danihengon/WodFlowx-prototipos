// Prototipo del catálogo de ejercicios (bloque 2). Todo el estado vive en
// memoria, en este script: no hay ninguna llamada real a /api/catalog/**.
// Las reglas de validación (nombre obligatorio, nombre duplicado sin
// distinguir mayúsculas/minúsculas) imitan exactamente las del backend real
// (ExerciseService), para que el recorrido se sienta fiel a como se
// comportará la implementación definitiva.

var INITIAL_EXERCISES = [
  { id: 1, name: "Sentadilla con peso corporal", description: "Piernas y glúteos, sin material.", imagePath: "", active: true },
  { id: 2, name: "Burpees", description: "Ejercicio completo de alta intensidad.", imagePath: "", active: true },
  { id: 3, name: "Plancha abdominal", description: "Core, isométrico.", imagePath: "", active: true },
  { id: 4, name: "Remo con mancuerna", description: "Espalda, un brazo a la vez.", imagePath: "", active: true },
  { id: 5, name: "Zancadas", description: "Piernas, alternando.", imagePath: "", active: true },
  { id: 6, name: "Press de banca", description: "Pecho, con barra.", imagePath: "", active: true },
  { id: 7, name: "Dominadas", description: "Espalda y brazos, con barra fija.", imagePath: "", active: true },
  { id: 8, name: "Peso muerto", description: "Cadena posterior completa, con barra.", imagePath: "", active: true },
  { id: 9, name: "Jumping jacks (antiguo)", description: "Sustituido por una variante más clara en las rutinas actuales.", imagePath: "", active: false },
  { id: 10, name: "Abdominales bicicleta", description: "Descartado del catálogo por duplicar \"Plancha abdominal\" en la mayoría de rutinas.", imagePath: "", active: false },
];

var state = {
  exercises: [],
  nextId: 11,
  status: "active",
  search: "",
  editingId: null,
  deactivatingId: null,
  forceEmptyDemo: false,
  forceSaveError: false,
};

function cloneSeed() {
  var copy = [];
  for (var i = 0; i < INITIAL_EXERCISES.length; i++) {
    var e = INITIAL_EXERCISES[i];
    copy.push({ id: e.id, name: e.name, description: e.description, imagePath: e.imagePath, active: e.active });
  }
  return copy;
}

state.exercises = cloneSeed();

function byId(id) {
  return document.getElementById(id);
}

function findExercise(id) {
  for (var i = 0; i < state.exercises.length; i++) {
    if (state.exercises[i].id === id) {
      return state.exercises[i];
    }
  }
  return null;
}

function normalized(text) {
  return (text || "").trim().toLowerCase();
}

// Mismo criterio que ExerciseController real: un filtro de nombre vacío o
// en blanco equivale a "sin filtro", nunca se envía tal cual a la búsqueda.
function matchesFilters(exercise) {
  if (state.status === "active" && !exercise.active) {
    return false;
  }
  if (state.status === "inactive" && exercise.active) {
    return false;
  }
  var search = normalized(state.search);
  if (search && exercise.name.toLowerCase().indexOf(search) === -1) {
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
  byId("exerciseList").style.display = "none";
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
  byId("exerciseList").style.display = "flex";
}

function render() {
  var list = byId("exerciseList");
  var empty = byId("emptyState");
  list.innerHTML = "";

  var visible = [];
  if (!state.forceEmptyDemo) {
    for (var i = 0; i < state.exercises.length; i++) {
      if (matchesFilters(state.exercises[i])) {
        visible.push(state.exercises[i]);
      }
    }
  }

  if (visible.length === 0) {
    list.style.display = "none";
    empty.style.display = "block";
    if (state.forceEmptyDemo) {
      byId("emptyTitle").textContent = "No hay ejercicios";
      byId("emptyText").textContent = "Todavía no se ha creado ningún ejercicio en el catálogo.";
    } else if (normalized(state.search)) {
      byId("emptyTitle").textContent = "Sin resultados";
      byId("emptyText").textContent = "Ningún ejercicio coincide con “" + state.search + "”.";
    } else {
      byId("emptyTitle").textContent = "Nada que mostrar aquí";
      byId("emptyText").textContent = "No hay ejercicios en este filtro.";
    }
    return;
  }

  list.style.display = "flex";
  empty.style.display = "none";

  for (var j = 0; j < visible.length; j++) {
    list.appendChild(buildRow(visible[j]));
  }
}

function buildRow(exercise) {
  var row = document.createElement("div");
  row.className = "exercise-row";

  var main = document.createElement("div");
  main.className = "exercise-main";
  var name = document.createElement("div");
  name.className = "exercise-name";
  name.textContent = exercise.name;
  var desc = document.createElement("div");
  desc.className = "exercise-desc";
  desc.textContent = exercise.description || "Sin descripción.";
  main.appendChild(name);
  main.appendChild(desc);

  var badge = document.createElement("span");
  badge.className = "badge " + (exercise.active ? "badge-active" : "badge-inactive");
  badge.textContent = exercise.active ? "Activo" : "Inactivo";

  var actions = document.createElement("div");
  actions.className = "exercise-actions";

  var editBtn = document.createElement("button");
  editBtn.className = "btn btn-secondary";
  editBtn.type = "button";
  editBtn.textContent = "Editar";
  editBtn.addEventListener("click", function () {
    openFormModal(exercise.id);
  });
  actions.appendChild(editBtn);

  if (exercise.active) {
    var deactivateBtn = document.createElement("button");
    deactivateBtn.className = "btn btn-outline-danger";
    deactivateBtn.type = "button";
    deactivateBtn.textContent = "Desactivar";
    deactivateBtn.addEventListener("click", function () {
      openConfirmModal(exercise.id);
    });
    actions.appendChild(deactivateBtn);
  } else {
    var reactivateBtn = document.createElement("button");
    reactivateBtn.className = "btn btn-secondary";
    reactivateBtn.type = "button";
    reactivateBtn.textContent = "Reactivar";
    reactivateBtn.addEventListener("click", function () {
      reactivateExercise(exercise.id);
    });
    actions.appendChild(reactivateBtn);
  }

  row.appendChild(main);
  row.appendChild(badge);
  row.appendChild(actions);
  return row;
}

// ---------- Modal de alta / edición ----------

function openFormModal(exerciseId) {
  state.editingId = exerciseId || null;
  var exercise = exerciseId ? findExercise(exerciseId) : null;

  byId("formModalTitle").textContent = exercise ? "Editar ejercicio" : "Nuevo ejercicio";
  byId("fieldName").value = exercise ? exercise.name : "";
  byId("fieldDescription").value = exercise ? exercise.description || "" : "";
  byId("fieldImage").value = exercise ? exercise.imagePath || "" : "";
  byId("errorName").style.display = "none";

  var caution = byId("editingCaution");
  var reactivarBtn = byId("btnReactivarDesdeForm");
  if (exercise && !exercise.active) {
    caution.style.display = "block";
    caution.textContent = "Este ejercicio está inactivo. Puedes editarlo igualmente, o reactivarlo desde aquí.";
    reactivarBtn.style.display = "inline-block";
  } else {
    caution.style.display = "none";
    reactivarBtn.style.display = "none";
  }

  byId("formModalOverlay").classList.add("open");
  byId("fieldName").focus();
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
  var nameInput = byId("fieldName");
  var name = nameInput.value.trim();
  var errorEl = byId("errorName");

  if (!name) {
    errorEl.textContent = "El nombre del ejercicio es obligatorio.";
    errorEl.style.display = "block";
    return;
  }

  var duplicate = null;
  for (var i = 0; i < state.exercises.length; i++) {
    var candidate = state.exercises[i];
    if (candidate.id !== state.editingId && candidate.name.toLowerCase() === name.toLowerCase()) {
      duplicate = candidate;
      break;
    }
  }
  if (duplicate) {
    errorEl.textContent = "Ya existe un ejercicio con el nombre “" + duplicate.name + "” (sin distinguir mayúsculas y minúsculas).";
    errorEl.style.display = "block";
    return;
  }
  errorEl.style.display = "none";

  var description = byId("fieldDescription").value.trim();
  var imagePath = byId("fieldImage").value.trim();

  var saveBtn = byId("btnGuardar");
  saveBtn.disabled = true;
  saveBtn.textContent = "Guardando…";

  setTimeout(function () {
    saveBtn.disabled = false;
    saveBtn.textContent = "Guardar";

    if (state.forceSaveError) {
      showToast("No se ha podido guardar el ejercicio. Inténtalo de nuevo.", true);
      return;
    }

    if (state.editingId) {
      var existing = findExercise(state.editingId);
      existing.name = name;
      existing.description = description;
      existing.imagePath = imagePath;
      showToast("Ejercicio actualizado correctamente.", false);
    } else {
      state.exercises.push({
        id: state.nextId++,
        name: name,
        description: description,
        imagePath: imagePath,
        active: true,
      });
      showToast("Ejercicio creado correctamente.", false);
    }

    closeModals();
    render();
  }, 450);
}

// ---------- Desactivar / reactivar ----------

function openConfirmModal(exerciseId) {
  state.deactivatingId = exerciseId;
  var exercise = findExercise(exerciseId);
  byId("confirmModalText").textContent =
    "¿Seguro que quieres desactivar “" + exercise.name + "”?";
  byId("confirmModalOverlay").classList.add("open");
}

function confirmDeactivate() {
  var exercise = findExercise(state.deactivatingId);
  if (exercise) {
    exercise.active = false;
    showToast("“" + exercise.name + "” desactivado.", false);
  }
  closeModals();
  render();
}

function reactivateExercise(exerciseId) {
  var exercise = findExercise(exerciseId);
  if (exercise) {
    exercise.active = true;
    showToast("“" + exercise.name + "” reactivado.", false);
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

  var tabs = document.querySelectorAll(".status-tab");
  for (var i = 0; i < tabs.length; i++) {
    tabs[i].addEventListener("click", function (event) {
      for (var j = 0; j < tabs.length; j++) {
        tabs[j].classList.remove("active");
      }
      event.target.classList.add("active");
      state.status = event.target.getAttribute("data-status");
      render();
    });
  }

  byId("btnNuevo").addEventListener("click", function () {
    openFormModal(null);
  });

  byId("btnGuardar").addEventListener("click", saveForm);
  byId("btnConfirmarDesactivar").addEventListener("click", confirmDeactivate);
  byId("btnReactivarDesdeForm").addEventListener("click", function () {
    var id = state.editingId;
    closeModals();
    reactivateExercise(id);
  });

  var closeButtons = document.querySelectorAll("[data-close-modal]");
  for (var k = 0; k < closeButtons.length; k++) {
    closeButtons[k].addEventListener("click", closeModals);
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
        state.exercises = cloneSeed();
        state.nextId = 11;
        state.status = "active";
        state.search = "";
        state.forceEmptyDemo = false;
        state.forceSaveError = false;
        byId("searchInput").value = "";
        for (var t = 0; t < tabs.length; t++) {
          tabs[t].classList.remove("active");
        }
        tabs[0].classList.add("active");
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
