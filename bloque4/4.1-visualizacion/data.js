/*
 * Datos ficticios del prototipo del subbloque 4.1 (visualización de solo
 * lectura). Son ILUSTRATIVOS: están definidos localmente en este archivo,
 * no proceden de ninguna llamada real a GET /api/workouts/{workoutId}/tree.
 *
 * La FORMA de la estructura (secciones -> grupos principales -> contenido
 * mezclado de subgrupos/apariciones de ejercicio, ordenado por "position" ->
 * y una lista plana e independiente de transiciones) sí es coherente con el
 * contrato real documentado del árbol: cada grupo (principal o subgrupo)
 * tiene un flowElementId propio, las transiciones conectan flowElementId
 * de origen/destino, y nunca viven anidadas dentro de un grupo.
 *
 * Nota deliberada: en la respuesta real del árbol, el nombre del ejercicio,
 * el nombre de la dinámica y el resumen de la prescripción NO vienen en el
 * propio árbol (solo ids) — se obtienen de los catálogos aparte
 * (GET /api/catalog/exercises, /dynamics). En este prototipo, al no simular
 * llamadas HTTP, esos nombres y resúmenes están embebidos directamente aquí
 * para simplificar, pero no representan literalmente el JSON real de /tree.
 */

function exOcc(id, flowElementId, name, summary, detail) {
  return {
    kind: "exercise",
    exerciseOccurrenceId: id,
    flowElementId: flowElementId,
    exerciseName: name,
    prescriptionSummary: summary,
    prescriptionDetail: detail || [],
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

// Envuelve cada elemento de "content" con su posición, igual en todos los
// grupos (subgrupo o aparición de ejercicio, nunca ambos en el mismo item).
function contentItem(position, node) {
  return { position: position, kind: node.kind, item: node };
}

var WORKOUT_SUMMARY = {
  workoutId: 501,
  title: "Fuerza y acondicionamiento — clase del día",
  type: "DAILY_CLASS",
  date: "2026-11-23",
  active: true,
};

var WORKOUT_TREE = {
  workout: WORKOUT_SUMMARY,

  sections: [
    {
      sectionId: 1,
      position: 1,
      name: "Calentamiento",
      groups: [
        {
          sectionGroupId: 101,
          position: 1,
          group: grp(
            11,
            1001,
            "Movilidad general",
            "Dos pasadas suaves, sin carga, para preparar la sesión.",
            [
              contentItem(1, exOcc(2001, 2001, "Rotaciones de hombros", "15 repeticiones", [
                { label: "Repeticiones", value: "15" },
              ])),
              contentItem(2, exOcc(2002, 2002, "Sentadilla sin carga", "12 repeticiones", [
                { label: "Repeticiones", value: "12" },
              ])),
              contentItem(3, exOcc(2003, 2003, "Plancha", "30 segundos", [
                { label: "Duración", value: "30 s" },
              ])),
            ],
            { dynamicName: "Circuito", parameters: [{ label: "Rondas", value: "2" }] }
          ),
        },
      ],
    },

    {
      sectionId: 2,
      position: 2,
      name: "Fuerza",
      groups: [
        {
          sectionGroupId: 102,
          position: 1,
          group: grp(
            12,
            1002,
            "Bloque de fuerza",
            "Pareja de ejercicios con carga, con cambio de estación entre ambos.",
            [
              contentItem(
                1,
                grp(
                  13,
                  1003,
                  "Sentadilla y peso muerto",
                  "",
                  [
                    contentItem(1, exOcc(2004, 2004, "Sentadilla con barra", "5 repeticiones @ 60 kg", [
                      { label: "Repeticiones", value: "5" },
                      { label: "Peso", value: "60 kg" },
                    ])),
                    contentItem(2, exOcc(2005, 2005, "Peso muerto", "5 repeticiones @ 70 kg", [
                      { label: "Repeticiones", value: "5" },
                      { label: "Peso", value: "70 kg" },
                    ])),
                  ],
                  null
                )
              ),
            ],
            null
          ),
        },
      ],
    },

    {
      sectionId: 3,
      position: 3,
      name: "Circuito final",
      groups: [
        {
          sectionGroupId: 103,
          position: 1,
          group: grp(
            14,
            1004,
            "AMRAP 12 minutos",
            "El máximo número de rondas posibles en el tiempo indicado.",
            [
              contentItem(
                1,
                grp(
                  15,
                  1005,
                  "Ronda principal",
                  "",
                  [
                    contentItem(
                      1,
                      grp(
                        16,
                        1006,
                        "Pareja de trabajo",
                        "",
                        [
                          contentItem(1, exOcc(2006, 2006, "Burpees", "10 repeticiones", [
                            { label: "Repeticiones", value: "10" },
                          ])),
                          contentItem(2, exOcc(2007, 2007, "Remo", "250 metros", [
                            { label: "Distancia", value: "250 m" },
                          ])),
                        ],
                        null
                      )
                    ),
                    contentItem(2, exOcc(2009, 2009, "Sprint corto", "20 metros", [
                      { label: "Distancia", value: "20 m" },
                    ])),
                  ],
                  null
                )
              ),
              contentItem(2, exOcc(2008, 2008, "Carrera final", "400 metros", [
                { label: "Distancia", value: "400 m" },
              ])),
            ],
            { dynamicName: "AMRAP", parameters: [{ label: "Duración", value: "12 minutos" }] }
          ),
        },
      ],
    },
  ],

  // Lista plana e independiente — nunca anidada dentro de un grupo. Cada
  // transición conecta dos flowElementId, con la regla real de "mismo
  // contenedor" (nunca se cruza entre elementos de contenedores distintos:
  // p. ej. no hay transición entre "Sprint corto" y "Carrera final" aunque
  // sean visualmente consecutivos, porque están en contenedores distintos).
  transitions: [
    {
      transitionId: 9001,
      originFlowElementId: 2002,
      destinationFlowElementId: 2003,
      description: "Recuperar el aliento",
      duration: { value: 15, unit: "segundos" },
      activity: null,
    },
    {
      transitionId: 9002,
      originFlowElementId: 2004,
      destinationFlowElementId: 2005,
      description: "Cambio de estación",
      duration: { value: 90, unit: "segundos" },
      activity: {
        exerciseName: "Desplazamiento caminando",
        prescriptionSummary: "20 metros",
      },
    },
    {
      transitionId: 9003,
      originFlowElementId: 2006,
      destinationFlowElementId: 2007,
      description: "Sin descanso, directo",
      duration: null,
      activity: null,
    },
  ],
};
