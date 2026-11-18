// Selector Escritorio / Móvil del prototipo
document.querySelectorAll(".toggle-btn").forEach(function (btn) {
  btn.addEventListener("click", function () {
    document.body.classList.remove("device-desktop", "device-mobile");
    document.body.classList.add("device-" + btn.dataset.device);
    document.querySelectorAll(".toggle-btn").forEach(function (other) {
      other.classList.toggle("active", other === btn);
    });
    closeMobileMenu();
  });
});

// Menú "☰ Menú" de móvil (sustituye a la barra inferior)
var menuToggle = document.querySelector(".menu-toggle");
var mobileMenu = document.querySelector(".mobile-menu");

function closeMobileMenu() {
  if (mobileMenu) {
    mobileMenu.classList.remove("open");
  }
  if (menuToggle) {
    menuToggle.setAttribute("aria-expanded", "false");
  }
}

if (menuToggle && mobileMenu) {
  menuToggle.addEventListener("click", function () {
    var isOpen = mobileMenu.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });
}

// Zoom, desplazamiento (pan) y encuadre automático del diagrama de solo lectura
var diagramViewport = document.querySelector(".diagram-viewport");
var diagramCanvas = document.querySelector(".diagram-canvas");
var fitDiagramToView = null;

if (diagramViewport && diagramCanvas) {
  // Tamaño lógico del lienzo (debe coincidir con el viewBox del SVG y con
  // las coordenadas left/top de los nodos del diagrama).
  var CONTENT_WIDTH = 700;
  var CONTENT_HEIGHT = 460;
  var FIT_MARGIN = 16;
  // Franja superior reservada para que la barra de zoom nunca tape cajas ni etiquetas.
  var TOOLBAR_RESERVE = 50;

  var scale = 1;
  var translateX = 0;
  var translateY = 0;
  var dragging = false;
  var startX = 0;
  var startY = 0;
  var baseX = 0;
  var baseY = 0;

  function applyTransform() {
    diagramCanvas.style.transform =
      "translate(" + translateX + "px, " + translateY + "px) scale(" + scale + ")";
  }

  function setScale(next) {
    scale = Math.min(2.5, Math.max(0.2, next));
    applyTransform();
  }

  // "Ver todo": calcula la escala y la posición para que el entrenamiento
  // completo quepa en el espacio disponible del visor, centrado, dejando
  // un margen y sin que la barra de zoom tape nada.
  fitDiagramToView = function () {
    var rect = diagramViewport.getBoundingClientRect();
    var availableWidth = Math.max(40, rect.width - FIT_MARGIN * 2);
    var availableHeight = Math.max(40, rect.height - TOOLBAR_RESERVE - FIT_MARGIN);
    var fitScale = Math.min(availableWidth / CONTENT_WIDTH, availableHeight / CONTENT_HEIGHT);
    fitScale = Math.min(2.5, Math.max(0.2, fitScale));

    var renderedWidth = CONTENT_WIDTH * fitScale;
    var renderedHeight = CONTENT_HEIGHT * fitScale;

    scale = fitScale;
    translateX = FIT_MARGIN + (availableWidth - renderedWidth) / 2;
    translateY = TOOLBAR_RESERVE + (availableHeight - renderedHeight) / 2;
    applyTransform();
  };

  document.querySelectorAll("[data-zoom]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      if (btn.dataset.zoom === "in") {
        setScale(scale * 1.2);
      } else if (btn.dataset.zoom === "out") {
        setScale(scale / 1.2);
      } else {
        fitDiagramToView();
      }
    });
  });

  diagramViewport.addEventListener(
    "wheel",
    function (event) {
      event.preventDefault();
      setScale(scale * (event.deltaY < 0 ? 1.1 : 1 / 1.1));
    },
    { passive: false }
  );

  diagramCanvas.addEventListener("pointerdown", function (event) {
    dragging = true;
    diagramCanvas.classList.add("dragging");
    startX = event.clientX;
    startY = event.clientY;
    baseX = translateX;
    baseY = translateY;
    diagramCanvas.setPointerCapture(event.pointerId);
  });

  diagramCanvas.addEventListener("pointermove", function (event) {
    if (!dragging) {
      return;
    }
    translateX = baseX + (event.clientX - startX);
    translateY = baseY + (event.clientY - startY);
    applyTransform();
  });

  function endDrag() {
    dragging = false;
    diagramCanvas.classList.remove("dragging");
  }

  diagramCanvas.addEventListener("pointerup", endDrag);
  diagramCanvas.addEventListener("pointercancel", endDrag);
}

// Pestañas Lista / Diagrama en "Mis entrenamientos"
var viewTabs = document.querySelectorAll(".view-tab");
if (viewTabs.length > 0) {
  viewTabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      viewTabs.forEach(function (other) {
        other.classList.toggle("active", other === tab);
      });
      document.querySelectorAll(".view-panel").forEach(function (panel) {
        panel.hidden = panel.id !== "view-" + tab.dataset.view;
      });
      if (tab.dataset.view === "diagram" && typeof fitDiagramToView === "function") {
        fitDiagramToView();
      }
    });
  });
}

// Recalcular el encuadre al girar el móvil o redimensionar la ventana,
// sin perder el zoom/desplazamiento manual mientras no cambie el tamaño.
function isDiagramViewVisible() {
  var panel = document.getElementById("view-diagram");
  return Boolean(panel) && !panel.hidden;
}

window.addEventListener("resize", function () {
  if (isDiagramViewVisible() && typeof fitDiagramToView === "function") {
    fitDiagramToView();
  }
});

window.addEventListener("orientationchange", function () {
  setTimeout(function () {
    if (isDiagramViewVisible() && typeof fitDiagramToView === "function") {
      fitDiagramToView();
    }
  }, 150);
});
