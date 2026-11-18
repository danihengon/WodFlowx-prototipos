# Prototipo visual — Bloque 3 (gestión básica de entrenamientos, TRAINER)

Prototipo HTML/CSS/JS estático y navegable, sin backend ni dependencias, solo
para revisión y aprobación de diseño antes de implementar el bloque 3 real en
React. Reutiliza literalmente la identidad visual ya implementada en los
bloques 1 y 2 (`frontend/src/styles/app.css`): mismos colores, cabecera, menú
lateral/móvil, botones, modales y toasts.

**No realiza ninguna petición real al backend, no modifica ninguna base de
datos y no incluye autenticación real.** Los datos son ficticios y viven solo
en memoria del navegador mientras la página está abierta; al recargar,
vuelven a su estado inicial.

## Cómo probarlo

Abre `inicio.html` directamente en el navegador (doble clic). No requiere
servidor. Desde ahí, el enlace "Entrenamientos" lleva a
`entrenamientos.html`, la pantalla principal de este prototipo.

Usa el selector de ancho de tu navegador (o ábrelo en el móvil) para probar
el diseño en escritorio y en móvil — la cabecera y el menú responden al
ancho real, igual que en la app ya implementada.

## Archivos

- `inicio.html` — contexto de navegación del entrenador (igual que el real),
  con "Entrenamientos" habilitado. "Ejercicios" aparece deshabilitado aquí
  solo porque este prototipo no lo reproduce — en la app real ya está
  implementado (bloque 2).
- `entrenamientos.html` — la pantalla: buscador local, filtros de tipo y
  estado, listado, modales de alta/edición y de confirmación, avisos
  simulados.
- `shared.css` — cabecera/menú/navegación, copiados tal cual del bloque 1/2
  real.
- `workouts.css` — estilos propios de esta pantalla (listado, badges de
  tipo/fecha/estado, modal, campo de fecha condicional).
- `nav.js` — abrir/cerrar el menú móvil (misma lógica que el resto).
- `workouts.js` — datos de ejemplo y toda la interacción simulada.

## Recorrido que puedes probar

1. **Listar y filtrar**: dos filas de filtro independientes — **Tipo**
   (Todos / Clases del día / Personales, los únicos dos valores reales de
   `WorkoutType`) y **Estado** (Activos / Inactivos / Todos, igual que
   `GET /api/workouts?active=`). Se combinan entre sí, igual que en el
   backend real.
2. **Buscador**: filtra por título, pero **solo localmente**, sobre los
   entrenamientos ya cargados — el backend real no ofrece ningún parámetro
   de búsqueda por título en `GET /api/workouts`. El propio formulario lo
   indica (`search-hint` bajo el buscador) para no hacerlo pasar por una
   capacidad del servidor.
3. **Alta de clase del día**: "+ Nuevo entrenamiento" → tipo "Clase del
   día" → aparece el campo Fecha, obligatorio. Intenta guardar sin fecha:
   verás el mismo error que devolvería el backend real (400, "Una clase del
   día (DAILY_CLASS) requiere una fecha").
4. **Alta de entrenamiento personal**: cambia el tipo a "Personal" — el
   campo Fecha desaparece y se vacía automáticamente (si habías escrito algo
   antes de cambiar de tipo, se descarta: un entrenamiento PERSONAL con
   fecha es rechazado por el backend real).
5. **Edición**: "Editar" en cualquier fila abre el mismo modal, con el tipo
   mostrado como **texto fijo, no un desplegable** — el backend real no
   permite cambiar el tipo de un entrenamiento después de crearlo
   (`WorkoutUpdateRequest` no tiene ese campo; un intento de manipular el
   JSON se ignora en silencio). No existe ninguna operación de "cambiar
   tipo" en este prototipo porque el backend no la admite.
6. **Validación de título**: inténtalo con el título en blanco. **No existe
   ninguna validación de título duplicado** (a diferencia del nombre de
   ejercicio en el bloque 2): el backend real no tiene esa regla para
   `Workout`, así que el prototipo tampoco la simula.
7. **Desactivar**: pide confirmación, y el texto no afirma ninguna
   restricción por asignaciones o estructura existente — el backend real no
   impone ninguna (verificado en `WorkoutService`: desactivar nunca
   comprueba si el entrenamiento tiene asignaciones o estructura).
8. **Encontrar y reactivar un inactivo**: pestaña de estado "Inactivos" (o
   "Todos"), y "Reactivar" en la fila o dentro del propio formulario de
   edición.
9. **"Editar estructura"**: cada fila tiene un botón deshabilitado con ese
   texto (con una explicación al pasar el ratón) — representa el futuro
   acceso al editor visual del bloque 4, **todavía no implementado ni
   funcional**, solo para que el recorrido se entienda.
10. **Estados y errores** — panel al final de la página ("Panel de pruebas
    del prototipo"): catálogo vacío, sin resultados de la búsqueda local,
    error al guardar, sin conexión, sesión caducada, acceso sin permiso.
    "Restablecer datos de ejemplo" vuelve al estado inicial.

## Qué NO es este prototipo

- No es la implementación funcional del bloque 3: eso es la siguiente
  petición, solo tras tu aprobación expresa de este diseño.
- No incluye ninguna operación de cambio de tipo (el backend no la admite).
- No incluye `GET /api/workouts/daily-classes` (consulta de clases del día
  por una fecha concreta): el listado general con el filtro "Clases del
  día" ya cubre la necesidad de verlas sin exigir una fecha obligatoria;
  ese endpoint parece más adecuado para una futura vista de calendario, no
  para esta gestión básica — pendiente de tu confirmación (ver el informe).
- No incluye secciones, grupos, ejercicios, prescripciones, dinámicas,
  transiciones, plantillas, asignaciones, socios, ni ningún editor visual:
  todo eso corresponde a otros bloques.
