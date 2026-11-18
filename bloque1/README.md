# Prototipo visual — Bloque 1 (login, navegación general, Mis entrenamientos)

Prototipo HTML/CSS estático y navegable, sin backend ni dependencias, solo para
revisión y aprobación de diseño antes de empezar la implementación en React.

**Estado**: diseño aprobado y ya implementado en `frontend/` (login, sesión,
navegación y PWA instalable — ver `frontend/README.md`). Este prototipo se
conserva para poder comparar el resultado real con el diseño aprobado, no se
sustituye por la implementación.

## Cómo probarlo

Abrir `index.html` directamente en el navegador (doble clic, o
`file:///.../docs/frontend/prototipos/bloque1/index.html`). No requiere
servidor ni instalación de nada.

Desde el login se navega a la pantalla de navegación general, y desde ahí a
"Mis entrenamientos". El botón "Cerrar sesión" vuelve al login.

Arriba de cada pantalla hay un selector **Escritorio / Móvil** que simula el
ancho de un teléfono sin necesidad de redimensionar la ventana. Las páginas
también responden de forma real si se abren en un móvil o se estrecha la
ventana del navegador (`@media max-width: 640px`).

En móvil, la cabecera (nombre WodFlowX + botón "☰ Menú") permanece visible al
desplazarte por la rutina; el menú desplegable da acceso a "Inicio", "Mis
entrenamientos" y "Cerrar sesión" sin tener que volver arriba. En escritorio
se conserva el menú lateral de siempre.

En "Mis entrenamientos" hay dos pestañas justo debajo del título — **Lista** y
**Diagrama** — que cambian de vista sin recargar la página ni abrir el menú.

## Archivos

- `index.html` — pantalla de login.
- `navegacion.html` — estructura general de navegación tras iniciar sesión
  (cabecera, menú lateral en escritorio / cabecera fija + menú "☰" en móvil).
- `mis-entrenamientos.html` — boceto de la vista del socio (rol MEMBER) con un
  entrenamiento de ejemplo, en vista Lista y vista Diagrama.
- `styles.css` — estilos compartidos por las tres pantallas.
- `script.js` — selector Escritorio/Móvil, menú "☰" de móvil, pestañas
  Lista/Diagrama y el zoom/desplazamiento del diagrama (sin relación con la
  futura aplicación React).

## Datos de ejemplo en "Mis entrenamientos"

Entrenamiento inventado solo para valorar la legibilidad, con la estructura
que pediste:

- **Grupo 1 — Calentamiento** (1 ronda): jumping jacks (30 s), sentadilla con
  peso corporal (15 reps), plancha abdominal (30 s).
- Transición de descanso (20 s) entre grupos.
- **Grupo 2 — Bloque principal** (3 rondas): burpees (12 reps), remo con
  mancuerna (10 reps), plancha lateral (20 s), con descanso de 30 s entre
  rondas.

Combina a propósito ejercicios por repeticiones (azul) y por tiempo (naranja),
y repite las 3 rondas completas para que se pueda juzgar la densidad real que
tendría la pantalla en el gimnasio, en móvil.

## La vista Diagrama

Representa el mismo entrenamiento de ejemplo con el aspecto que tendrá el
futuro editor React Flow: una caja discontinua por grupo, una caja sólida por
cada ejercicio dentro de su grupo, y flechas para las transiciones. El bucle
verde discontinuo que vuelve desde el último ejercicio del "Bloque principal"
hasta el primero representa la repetición de las 3 rondas y el descanso entre
ellas, en lugar de dibujar las 3 rondas por separado.

Es de solo lectura: se puede hacer zoom (botones o rueda del ratón) y
desplazar el lienzo arrastrando, también con el dedo en móvil, pero no se
puede mover ninguna caja ni editar nada. Los mismos nombres de ejercicio y de
grupo que aparecen en "Lista" aparecen en "Diagrama", para poder identificar
cada ejercicio al cambiar de vista.

### Encuadre automático ("Ver todo")

Al abrir la pestaña "Diagrama" se calcula automáticamente la escala y la
posición para que quepan los dos grupos completos, sus ejercicios, las
flechas, los textos de descanso y el bucle de las rondas, centrados y con un
margen alrededor. La franja superior donde está la barra de zoom queda
reservada aparte, para que esos botones nunca tapen una caja ni una etiqueta.

Si giras el móvil (o cambias el tamaño de la ventana en escritorio), el
encuadre se recalcula solo para aprovechar el espacio nuevo. Mientras no
cambie el tamaño de la pantalla, el zoom y el desplazamiento manual se
mantienen tal como los dejes. El botón **"Ver todo"** (antes "Restablecer")
vuelve a centrar y ajustar el entrenamiento completo a la pantalla que estés
usando en ese momento.

El cálculo de encuadre es manual (no hay todavía una librería de distribución
de grafos) y está pensado para este ejemplo de dos grupos. Cuando
implementemos el editor real con React Flow en el bloque 4, probaremos la
distribución automática con entrenamientos de distinta complejidad —
subgrupos, más transiciones, varias rondas— y la iremos ajustando con
pruebas reales, no solo con este caso.

### Ideas pendientes (para decidir después de probar el editor real)

- Que el entrenador (TRAINER) pueda recolocar manualmente las cajas en su
  editor y guardar esa distribución, para que los socios la vean siempre así
  en modo de solo lectura (en vez de recalcularla cada vez).
- Valorar si interesa poder exportar el diagrama como imagen.

Ninguna de las dos cosas está decidida ni implementada; se revisarán cuando
el editor del bloque 4 esté funcionando.

## Qué NO es este prototipo

- No está conectado al backend ni usa datos reales.
- No es la implementación funcional de "Mis entrenamientos": esa sigue
  prevista para el bloque 6, conectada a `GET /api/users/me/assignments` y al
  árbol real del `Workout`.
- La vista Diagrama no es el editor del entrenador (TRAINER): ese editor,
  donde sí se podrán mover cajas y editar conexiones y datos con React Flow,
  sigue previsto para el bloque 4. Aquí el diagrama del socio es de solo
  lectura y está hecho con HTML, CSS, SVG y el JavaScript del prototipo.
- No incluye todavía nada de PWA (manifest, icono instalable, service worker):
  eso se añade en código real al final del bloque 1, no como prototipo visual.
- No fija el lenguaje visual definitivo (colores, tipografía, icono de la
  app): es una primera propuesta para discutir, no una decisión cerrada.

## Pendiente de tu revisión

Dime qué cambiarías de cada pantalla (colores, disposición del menú en móvil,
legibilidad de "Mis entrenamientos", el diseño del diagrama, etc.) antes de
instalar nada ni empezar el proyecto React real.
