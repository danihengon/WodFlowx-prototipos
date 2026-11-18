// Menú "☰ Menú" de móvil — misma lógica que el bloque 1 real y que el
// prototipo del bloque 2.
document.addEventListener("DOMContentLoaded", function () {
  var menuToggle = document.querySelector(".menu-toggle");
  var mobileMenu = document.querySelector(".mobile-menu");
  if (!menuToggle || !mobileMenu) {
    return;
  }
  menuToggle.addEventListener("click", function () {
    var isOpen = mobileMenu.classList.toggle("open");
    menuToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });
});
