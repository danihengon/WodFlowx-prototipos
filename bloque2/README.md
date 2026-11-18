# Prototipo visual — Bloque 2 (catálogo de ejercicios, TRAINER)

Prototipo HTML/CSS/JS estático y navegable, sin backend ni dependencias, solo
para revisión y aprobación de diseño antes de implementar el catálogo real en
React. Reutiliza literalmente la identidad visual ya implementada en el
bloque 1 (`frontend/src/styles/app.css`): mismos colores, cabecera, menú
lateral/móvil.

**No realiza ninguna petición real al backend, no modifica ninguna base de
datos y no incluye autenticación real.** Los datos son ficticios y viven solo
en memoria del navegador mientras la página está abierta; al recargar,
vuelven a su estado inicial.

## Cómo probarlo

Abre `inicio.html` directamente en el navegador (doble clic). No requiere
servidor. Desde ahí, el enlace "Ejercicios" lleva a `ejercicios.html`, la
pantalla principal de este prototipo.

Usa el selector de ancho de tu navegador (o ábrelo en el móvil) para probar
el diseño en escritorio y en móvil — la cabecera y el menú responden al
ancho real, igual que en la app ya implementada.

## Archivos

- `inicio.html` — contexto de navegación del entrenador (igual que el real),
  con "Ejercicios" habilitado.
- `ejercicios.html` — el catálogo: buscador, pestañas de estado, listado,
  modales de alta/edición y de confirmación, avisos simulados.
- `shared.css` — cabecera/menú/navegación, copiados tal cual del bloque 1 real.
- `catalog.css` — estilos propios del catálogo (listado, modal, badges, toasts).
- `nav.js` — abrir/cerrar el menú móvil (misma lógica que el bloque 1 real).
- `catalog.js` — datos de ejemplo y toda la interacción simulada.

## Recorrido que puedes probar

1. **Listar y buscar**: pestañas "Activos / Inactivos / Todos" (los tres
   únicos estados que admite realmente `GET /api/catalog/exercises`), y el
   buscador filtra por nombre a medida que escribes.
2. **Crear**: "+ Añadir ejercicio" abre un modal con Nombre (obligatorio),
   Descripción e Imagen (URL de texto — no hay subida de archivo real).
3. **Editar**: "Editar" en cualquier fila abre el mismo modal, con los datos
   cargados y el título "Editar ejercicio".
4. **Validación**: intenta guardar con el nombre en blanco, o con un nombre
   que ya exista (p. ej. "burpees" en minúsculas, ya hay un "Burpees") — el
   prototipo reproduce las mismas reglas que el backend real (nombre
   obligatorio, nombre duplicado sin distinguir mayúsculas/minúsculas).
5. **Desactivar**: el botón "Desactivar" pide confirmación antes de actuar, y
   avisa de que un ejercicio desactivado seguiría apareciendo en
   entrenamientos ya creados (comportamiento real verificado en el backend).
6. **Encontrar y reactivar un inactivo**: pestaña "Inactivos" (o "Todos"), y
   "Reactivar" en la fila o dentro del propio formulario de edición.
7. **Estados y errores** — panel al final de la página ("Panel de pruebas del
   prototipo", claramente separado del diseño real): catálogo vacío, sin
   resultados de búsqueda, error al guardar, sin conexión, sesión caducada,
   acceso sin permiso. Cada botón simula esa situación sin tener que
   provocarla de verdad; "Restablecer datos de ejemplo" vuelve al estado
   inicial.

## Qué NO es este prototipo

- No es la implementación funcional del catálogo: eso es la siguiente
  petición, solo tras tu aprobación expresa de este diseño.
- No incluye el selector de archivo de imagen (el backend no lo soporta
  todavía — ver el informe de compatibilidad).
- No incluye paginación ni ordenación: el backend real tampoco las ofrece
  (devuelve la lista completa sin `Pageable`); con pocos ejercicios no hace
  falta, y el buscador ya cubre la necesidad de encontrar uno.
