// Menú "☰ Menú" de móvil — misma lógica que el bloque 1 real y los
// prototipos de los bloques 2 y 3.
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
