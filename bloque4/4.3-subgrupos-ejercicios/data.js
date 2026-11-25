/*
 * Datos ficticios del prototipo del subbloque 4.3 (subgrupos y ejercicios
 * dentro de grupos/subgrupos). Son ILUSTRATIVOS: viven solo en memoria
 * JavaScript, nunca se envían a PostgreSQL ni proceden de ninguna llamada
 * real a GET /api/workouts/{workoutId}/tree ni a GET /api/catalog/exercises.
 *
 * Mismos CUATRO escenarios (A/B/C/D) que el prototipo aprobado 4.2,
 * reutilizados sin cambios (misma estructura, mismos ids): ya incluían
 * subgrupos anidados y ejercicios, porque el árbol completo se visualiza
 * desde el bloque 4.1. Lo único nuevo de este archivo es EXERCISE_CATALOG,
 * que simula el catálogo real de ejercicios (GET /api/catalog/exercises)
 * del que se seleccionan los ejercicios al añadir una aparición o cambiarla.
 */

function exOcc(id, flowElementId, name, summary, detail, prescriptionDescription, exerciseId) {
  return {
    kind: "exercise",
    exerciseOccurrenceId: id,
    flowElementId: flowElementId,
    exerciseId: exerciseId || null,
    exerciseName: name,
    prescriptionSummary: summary,
    prescriptionDetail: detail || [],
    // Texto libre de ExercisePrescription.description (distinto de los
    // valores estructurados de prescriptionDetail, que llegarán en el
    // bloque 4.4): solo lo rellenan las apariciones creadas en este
    // prototipo con el formulario "Añadir ejercicio".
    prescriptionDescription: prescriptionDescription || null,
  };
}

function grp(id, flowElementId, name, description, content, dynamicConfiguration) {
  return {
    kind: "group",
    groupId: id,
    flowElementId: flowElementId,
    name: name,
    description: description || "",
    dynamicConfiguration: dynamicConfiguration || null,
    content: content,
  };
}

function contentItem(position, node) {
  return { position: position, kind: node.kind, item: node };
}

function mainGroup(sectionGroupId, position, group) {
  return { sectionGroupId: sectionGroupId, position: position, group: group };
}

function section(sectionId, position, name, groups) {
  return { sectionId: sectionId, position: position, name: name, description: "", groups: groups };
}

// ---------- Catálogo de ejercicios (simula GET /api/catalog/exercises) ----------
// Mismo contrato real que ExerciseController: active=true filtra los
// inactivos (p. ej. "Press de banca" y "Zancadas", desactivados a
// propósito aquí para poder probar que el selector solo ofrece activos,
// igual que el backend). exerciseId es el id real del catálogo
// (independiente de exerciseOccurrenceId, que identifica la aparición
// dentro del entrenamiento, no el ejercicio en sí).
var EXERCISE_CATALOG = [
  { exerciseId: 1, name: "Rotaciones de hombros", active: true },
  { exerciseId: 2, name: "Movilidad de cadera", active: true },
  { exerciseId: 3, name: "Sentadillas", active: true },
  { exerciseId: 4, name: "Plancha", active: true },
  { exerciseId: 5, name: "Jumping jacks", active: true },
  { exerciseId: 6, name: "Carrera suave", active: true },
  { exerciseId: 7, name: "Sentadilla con barra", active: true },
  { exerciseId: 8, name: "Peso muerto", active: true },
  { exerciseId: 9, name: "Burpees", active: true },
  { exerciseId: 10, name: "Remo", active: true },
  { exerciseId: 11, name: "Sprint corto", active: true },
  { exerciseId: 12, name: "Carrera final", active: true },
  { exerciseId: 13, name: "Curl de bíceps", active: true },
  { exerciseId: 14, name: "Dominadas", active: true },
  { exerciseId: 15, name: "Flexiones", active: true },
  { exerciseId: 16, name: "Zancadas", active: false },
  { exerciseId: 17, name: "Press de banca", active: false },
];

// ---------- Escenario A: entrenamiento vacío ----------
var SCENARIO_A = {
  workout: { workoutId: 601, title: "Entrenamiento nuevo sin estructura", type: "PERSONAL", date: null, active: true },
  sections: [],
  transitions: [],
};

// ---------- Escenario B: una sección vacía ----------
var SCENARIO_B = {
  workout: { workoutId: 602, title: "Entrenamiento con una sección vacía", type: "DAILY_CLASS", date: "2026-11-24", active: true },
  sections: [section(201, 1, "Calentamiento", [])],
  transitions: [],
};

// ---------- Escenario C: entrenamiento con varios grupos ----------
// Misma estructura (ids incluidos) que el prototipo aprobado 4.2, reutilizada
// a propósito sin modificarla: ya contiene subgrupos anidados hasta el nivel
// 3 (AMRAP > Ronda principal > Pareja de trabajo) y ejercicios con
// transiciones — el escenario de referencia para probar este subbloque.
var SCENARIO_C = {
  workout: { workoutId: 501, title: "Fuerza y acondicionamiento — clase del día", type: "DAILY_CLASS", date: "2026-11-23", active: true },
  sections: [
    section(1, 1, "Calentamiento", [
      mainGroup(101, 1, grp(11, 1001, "Movilidad articular", "Pasada suave, sin carga, para preparar la sesión.", [
        contentItem(1, exOcc(2001, 2001, "Rotaciones de hombros", "15 repeticiones", [{ label: "Repeticiones", value: "15" }])),
        contentItem(2, exOcc(2010, 2010, "Movilidad de cadera", "10 repeticiones por lado", [{ label: "Repeticiones", value: "10 por lado" }])),
      ], { dynamicName: "Circuito", parameters: [{ label: "Rondas", value: "2" }] })),
      mainGroup(104, 2, grp(17, 1007, "Activación", "", [
        contentItem(1, exOcc(2002, 2002, "Sentadillas", "12 repeticiones", [{ label: "Repeticiones", value: "12" }])),
        contentItem(2, exOcc(2003, 2003, "Plancha", "30 segundos", [{ label: "Duración", value: "30 s" }])),
      ], null)),
      mainGroup(105, 3, grp(18, 1008, "Preparación cardiovascular", "", [
        contentItem(1, exOcc(2013, 2013, "Jumping jacks", "20 repeticiones", [{ label: "Repeticiones", value: "20" }])),
        contentItem(2, exOcc(2014, 2014, "Carrera suave", "3 minutos", [{ label: "Duración", value: "3 min" }])),
      ], null)),
    ]),
    section(2, 2, "Fuerza", [
      mainGroup(102, 1, grp(12, 1002, "Bloque de fuerza", "Pareja de ejercicios con carga, con cambio de estación entre ambos.", [
        contentItem(1, grp(13, 1003, "Sentadilla y peso muerto", "", [
          contentItem(1, exOcc(2004, 2004, "Sentadilla con barra", "5 repeticiones @ 60 kg", [{ label: "Repeticiones", value: "5" }, { label: "Peso", value: "60 kg" }])),
          contentItem(2, exOcc(2005, 2005, "Peso muerto", "5 repeticiones @ 70 kg", [{ label: "Repeticiones", value: "5" }, { label: "Peso", value: "70 kg" }])),
        ], null)),
      ], null)),
    ]),
    section(3, 3, "Circuito final", [
      mainGroup(103, 1, grp(14, 1004, "AMRAP 12 minutos", "El máximo número de rondas posibles en el tiempo indicado.", [
        contentItem(1, grp(15, 1005, "Ronda principal", "", [
          contentItem(1, grp(16, 1006, "Pareja de trabajo", "", [
            contentItem(1, exOcc(2006, 2006, "Burpees", "10 repeticiones", [{ label: "Repeticiones", value: "10" }])),
            contentItem(2, exOcc(2007, 2007, "Remo", "250 metros", [{ label: "Distancia", value: "250 m" }])),
          ], null)),
          contentItem(2, exOcc(2009, 2009, "Sprint corto", "20 metros", [{ label: "Distancia", value: "20 m" }])),
        ], null)),
        contentItem(2, exOcc(2008, 2008, "Carrera final", "400 metros", [{ label: "Distancia", value: "400 m" }])),
      ], { dynamicName: "AMRAP", parameters: [{ label: "Duración", value: "12 minutos" }] })),
    ]),
  ],
  transitions: [
    { transitionId: 9004, originFlowElementId: 1001, destinationFlowElementId: 1007, description: "Cambio de bloque", duration: { value: 20, unit: "segundos" }, activity: null },
    { transitionId: 9001, originFlowElementId: 2002, destinationFlowElementId: 2003, description: "Recuperar el aliento", duration: { value: 15, unit: "segundos" }, activity: null },
    { transitionId: 9002, originFlowElementId: 2004, destinationFlowElementId: 2005, description: "Cambio de estación", duration: { value: 90, unit: "segundos" }, activity: { exerciseName: "Desplazamiento caminando", prescriptionSummary: "20 metros" } },
    { transitionId: 9003, originFlowElementId: 2006, destinationFlowElementId: 2007, description: "Sin descanso, directo", duration: null, activity: null },
  ],
};

// ---------- Escenario D: operaciones sensibles ----------
// Pensado específicamente para probar: eliminar una sección CON grupos
// (bloqueado), eliminar un grupo con subgrupo + ejercicios + una transición
// dependientes (eliminación en cascada real, igual que GroupSubtreeDeleter),
// eliminar una sección vacía (permitido), y en este subbloque además: borrar
// un ejercicio que SÍ tiene una transición propia (bloqueado) frente a uno
// que no (permitido), y borrar un subgrupo vacío (permitido) frente a uno
// con contenido (bloqueado).
var SCENARIO_D = {
  workout: { workoutId: 604, title: "Entrenamiento de prueba — operaciones sensibles", type: "DAILY_CLASS", date: "2026-11-25", active: true },
  sections: [
    section(401, 1, "Calentamiento", [
      mainGroup(4001, 1, grp(41, 4101, "Movilidad", "", [
        contentItem(1, exOcc(5001, 5101, "Rotación de hombros", "15 repeticiones", [{ label: "Repeticiones", value: "15" }])),
      ], null)),
    ]),
    section(402, 2, "Fuerza", [
      mainGroup(4002, 1, grp(42, 4102, "Bloque de fuerza", "Contiene un subgrupo con dos ejercicios: al eliminar el grupo se elimina todo; el subgrupo en sí no se puede eliminar mientras los contenga.", [
        contentItem(1, grp(43, 4103, "Sentadilla y peso muerto", "", [
          contentItem(1, exOcc(5002, 5102, "Sentadilla con barra", "5 repeticiones @ 60 kg", [{ label: "Repeticiones", value: "5" }, { label: "Peso", value: "60 kg" }])),
          contentItem(2, exOcc(5003, 5103, "Peso muerto", "5 repeticiones @ 70 kg", [{ label: "Repeticiones", value: "5" }, { label: "Peso", value: "70 kg" }])),
        ], null)),
      ], null)),
      mainGroup(4003, 2, grp(44, 4104, "Accesorio", "", [
        contentItem(1, exOcc(5004, 5104, "Curl de bíceps", "10 repeticiones", [{ label: "Repeticiones", value: "10" }])),
      ], null)),
    ]),
    section(403, 3, "Sección vacía (eliminable)", []),
  ],
  transitions: [
    { transitionId: 9101, originFlowElementId: 4102, destinationFlowElementId: 4104, description: "Cambio de bloque", duration: { value: 30, unit: "segundos" }, activity: null },
  ],
};

var SCENARIOS = {
  A: { label: "A — Entrenamiento vacío", tree: SCENARIO_A },
  B: { label: "B — Sección vacía", tree: SCENARIO_B },
  C: { label: "C — Varios grupos", tree: SCENARIO_C },
  D: { label: "D — Operaciones sensibles", tree: SCENARIO_D },
};

function cloneScenario(key) {
  // JSON round-trip: copia profunda sencilla, suficiente porque los datos
  // de este prototipo son siempre JSON-serializables (sin funciones ni
  // referencias circulares).
  return JSON.parse(JSON.stringify(SCENARIOS[key].tree));
}
