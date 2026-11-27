/*
 * Datos ficticios del prototipo del subbloque 4.4 (prescripciones, valores y
 * unidades). Son ILUSTRATIVOS: viven solo en memoria JavaScript, nunca se
 * envían a PostgreSQL ni proceden de ninguna llamada real a
 * GET /api/workouts/{workoutId}/tree, GET /api/catalog/exercises ni
 * GET /api/catalog/units.
 *
 * Mismos CUATRO escenarios (A/B/C/D) que el prototipo aprobado 4.3,
 * reutilizados sin cambiar su estructura general (mismas secciones, grupos,
 * subgrupos, ids). Lo único nuevo de este archivo:
 *  - PRESCRIPTION_UNITS, que simula el catálogo real de unidades
 *    (GET /api/catalog/units), con su magnitud y su estado activo/inactivo
 *    — igual que PrescriptionUnitController/PrescriptionUnit.
 *  - El contenido de "detail" en cada exOcc(): antes era un marcador de
 *    posición [{label, value}] sin contrato real; ahora son objetos con la
 *    forma exacta de PrescriptionValueResponse real
 *    (valueId, position, minValue, maxValue, unitId, magnitude — DEC-198,
 *    sin unidad anidada). Se construyen con pv(...), que además comprueba
 *    que la magnitud coincide con la de la unidad elegida (igual que
 *    PrescriptionValue.setUnit en el dominio real: la magnitud SIEMPRE se
 *    deriva de la unidad, nunca se fija de forma independiente).
 */

// ---------- Catálogo de unidades de prescripción (simula GET /api/catalog/units) ----------
// Mismas cinco magnitudes reales y cerradas del dominio (enum Magnitude:
// COUNT/DURATION/DISTANCE/LOAD/ENERGY — DEC-199, confirmado contra el
// código del backend, no hay una sexta). "Kilómetros" se deja inactiva a
// propósito, igual que algunos ejercicios del catálogo en el prototipo
// 4.3, para comprobar que el selector de unidades al AÑADIR o EDITAR un
// valor solo ofrece unidades activas (requireActiveUnit real).
var PRESCRIPTION_UNITS = [
  { unitId: 1, code: "REPS", label: "Repeticiones", symbol: "reps", magnitude: "COUNT", active: true, historicallyUsed: true },
  { unitId: 2, code: "RONDAS", label: "Rondas", symbol: "rondas", magnitude: "COUNT", active: true, historicallyUsed: false },
  { unitId: 3, code: "SEG", label: "Segundos", symbol: "s", magnitude: "DURATION", active: true, historicallyUsed: true },
  { unitId: 4, code: "MIN", label: "Minutos", symbol: "min", magnitude: "DURATION", active: true, historicallyUsed: true },
  { unitId: 5, code: "M", label: "Metros", symbol: "m", magnitude: "DISTANCE", active: true, historicallyUsed: true },
  { unitId: 6, code: "KM", label: "Kilómetros", symbol: "km", magnitude: "DISTANCE", active: false, historicallyUsed: true },
  { unitId: 7, code: "KG", label: "Kilogramos", symbol: "kg", magnitude: "LOAD", active: true, historicallyUsed: true },
  { unitId: 8, code: "LB", label: "Libras", symbol: "lb", magnitude: "LOAD", active: true, historicallyUsed: false },
  { unitId: 9, code: "KCAL", label: "Kilocalorías", symbol: "kcal", magnitude: "ENERGY", active: true, historicallyUsed: false },
];

// Etiquetas en lenguaje natural de cada magnitud (DEC de interfaz, §2.5 del
// contexto maestro: la pantalla no debe exponer el término técnico "COUNT",
// "DURATION", etc. al entrenador).
var MAGNITUDE_LABELS = {
  COUNT: "Repeticiones",
  DURATION: "Tiempo",
  DISTANCE: "Distancia",
  LOAD: "Peso / carga",
  ENERGY: "Energía",
};

function findPrescriptionUnit(unitId) {
  return PRESCRIPTION_UNITS.filter(function (u) {
    return u.unitId === unitId;
  })[0] || null;
}

// Construye un valor de prescripción con la forma exacta de
// PrescriptionValueResponse (valueId, position, minValue, maxValue, unitId,
// magnitude). La magnitud se deriva siempre de la unidad, nunca se pasa de
// forma independiente — igual que el dominio real.
function pv(valueId, position, minValue, maxValue, unitId) {
  var unit = findPrescriptionUnit(unitId);
  return {
    valueId: valueId,
    position: position,
    minValue: minValue,
    maxValue: typeof maxValue === "number" ? maxValue : null,
    unitId: unitId,
    magnitude: unit ? unit.magnitude : null,
  };
}

function exOcc(id, flowElementId, name, summary, detail, prescriptionDescription, exerciseId) {
  return {
    kind: "exercise",
    exerciseOccurrenceId: id,
    flowElementId: flowElementId,
    exerciseId: exerciseId || null,
    exerciseName: name,
    prescriptionId: 9000 + id,
    prescriptionSummary: summary,
    // Valores estructurados reales (PrescriptionValueResponse[]), siempre
    // ordenados por "position" — igual que
    // ExercisePrescriptionService.findValuesOrdered.
    prescriptionDetail: detail || [],
    // Texto libre de ExercisePrescription.description: operación real
    // independiente de los valores (PUT .../prescription), reutilizada aquí
    // y en "Cambiar ejercicio" (bloque 4.3) sin duplicar lógica.
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
// Igual estructura (secciones, grupos, subgrupos, ids) que el prototipo
// aprobado 4.3: aquí cambia únicamente el CONTENIDO de la prescripción de
// cada ejercicio, con valores reales representativos:
//  - Algunos con un único valor sin máximo (p. ej. "15 repeticiones":
//    minValue=15, maxValue=null — caso real, no un error de datos: el
//    backend permite maxValue null para un valor exacto, no un rango).
//  - Algunos con dos valores de magnitudes distintas (p. ej. repeticiones +
//    peso), para probar que el selector de "Añadir valor" excluye las
//    magnitudes ya usadas.
//  - "Sentadilla con barra" con un RANGO real (60–65 kg) para probar la
//    visualización de un intervalo, no solo un valor exacto.
var SCENARIO_C = {
  workout: { workoutId: 501, title: "Fuerza y acondicionamiento — clase del día", type: "DAILY_CLASS", date: "2026-11-23", active: true },
  sections: [
    section(1, 1, "Calentamiento", [
      mainGroup(101, 1, grp(11, 1001, "Movilidad articular", "Pasada suave, sin carga, para preparar la sesión.", [
        contentItem(1, exOcc(2001, 2001, "Rotaciones de hombros", "15 repeticiones", [pv(30001, 1, 15, null, 1)])),
        contentItem(2, exOcc(2010, 2010, "Movilidad de cadera", "10 repeticiones por lado", [pv(30002, 1, 10, null, 1)], "Por lado")),
      ], { dynamicName: "Circuito", parameters: [{ label: "Rondas", value: "2" }] })),
      mainGroup(104, 2, grp(17, 1007, "Activación", "", [
        contentItem(1, exOcc(2002, 2002, "Sentadillas", "12 repeticiones", [pv(30003, 1, 12, null, 1)])),
        contentItem(2, exOcc(2003, 2003, "Plancha", "30 segundos", [pv(30004, 1, 30, null, 3)])),
      ], null)),
      mainGroup(105, 3, grp(18, 1008, "Preparación cardiovascular", "", [
        contentItem(1, exOcc(2013, 2013, "Jumping jacks", "20 repeticiones", [pv(30005, 1, 20, null, 1)])),
        contentItem(2, exOcc(2014, 2014, "Carrera suave", "3 minutos", [pv(30006, 1, 3, null, 4)])),
      ], null)),
    ]),
    section(2, 2, "Fuerza", [
      mainGroup(102, 1, grp(12, 1002, "Bloque de fuerza", "Pareja de ejercicios con carga, con cambio de estación entre ambos.", [
        contentItem(1, grp(13, 1003, "Sentadilla y peso muerto", "", [
          contentItem(1, exOcc(2004, 2004, "Sentadilla con barra", "5 repeticiones @ 60–65 kg", [
            pv(30007, 1, 5, null, 1),
            pv(30008, 2, 60, 65, 7),
          ])),
          contentItem(2, exOcc(2005, 2005, "Peso muerto", "5 repeticiones @ 70 kg", [
            pv(30009, 1, 5, null, 1),
            pv(30010, 2, 70, null, 7),
          ])),
        ], null)),
      ], null)),
    ]),
    section(3, 3, "Circuito final", [
      mainGroup(103, 1, grp(14, 1004, "AMRAP 12 minutos", "El máximo número de rondas posibles en el tiempo indicado.", [
        contentItem(1, grp(15, 1005, "Ronda principal", "", [
          contentItem(1, grp(16, 1006, "Pareja de trabajo", "", [
            contentItem(1, exOcc(2006, 2006, "Burpees", "10 repeticiones", [pv(30011, 1, 10, null, 1)])),
            contentItem(2, exOcc(2007, 2007, "Remo", "250 metros", [pv(30012, 1, 250, null, 5)])),
          ], null)),
          contentItem(2, exOcc(2009, 2009, "Sprint corto", "20 metros", [pv(30013, 1, 20, null, 5)])),
        ], null)),
        contentItem(2, exOcc(2008, 2008, "Carrera final", "400 metros", [pv(30014, 1, 400, null, 5)])),
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
// Pensado específicamente para este subbloque: ejercicios SIN ningún valor
// todavía (para probar "Añadir primer valor" y confirmar que "Cambiar
// ejercicio"/"Eliminar ejercicio" siguen permitidos mientras no tengan
// ninguno) frente a ejercicios CON valores ya registrados (para probar que
// esas dos operaciones quedan bloqueadas, igual que el backend real:
// ExerciseOccurrenceService.changeExercise/deleteExerciseOccurrence).
var SCENARIO_D = {
  workout: { workoutId: 604, title: "Entrenamiento de prueba — operaciones sensibles", type: "DAILY_CLASS", date: "2026-11-25", active: true },
  sections: [
    section(401, 1, "Calentamiento", [
      mainGroup(4001, 1, grp(41, 4101, "Movilidad", "", [
        contentItem(1, exOcc(5001, 5101, "Rotación de hombros", null, [])),
      ], null)),
    ]),
    section(402, 2, "Fuerza", [
      mainGroup(4002, 1, grp(42, 4102, "Bloque de fuerza", "Contiene un subgrupo con dos ejercicios ya con valores de prescripción: no se pueden cambiar de ejercicio ni eliminar mientras los conserven.", [
        contentItem(1, grp(43, 4103, "Sentadilla y peso muerto", "", [
          contentItem(1, exOcc(5002, 5102, "Sentadilla con barra", "5 repeticiones @ 60 kg", [pv(30101, 1, 5, null, 1), pv(30102, 2, 60, null, 7)])),
          contentItem(2, exOcc(5003, 5103, "Peso muerto", "5 repeticiones @ 70 kg", [pv(30103, 1, 5, null, 1), pv(30104, 2, 70, null, 7)])),
        ], null)),
      ], null)),
      mainGroup(4003, 2, grp(44, 4104, "Accesorio", "", [
        contentItem(1, exOcc(5004, 5104, "Curl de bíceps", null, [])),
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
