(() => {
  "use strict";
  const menuButton = document.querySelector(".menu-toggle");
  const mobileMenu = document.querySelector("#mobile-nav");
  const transition = document.querySelector(".app-transition");
  let navigating = false;
  function closeMenu() {
    if (!menuButton || !mobileMenu) return;
    mobileMenu.hidden = true;
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "메뉴 열기");
    menuButton.innerHTML = '<i class="ph ph-list" aria-hidden="true"></i>';
  }
  menuButton?.addEventListener("click", () => {
    const isOpening = mobileMenu.hidden;
    mobileMenu.hidden = !isOpening;
    menuButton.setAttribute("aria-expanded", String(isOpening));
    menuButton.setAttribute(
      "aria-label",
      isOpening ? "메뉴 닫기" : "메뉴 열기",
    );
    menuButton.innerHTML = `<i class="ph ${isOpening ? "ph-x" : "ph-list"}" aria-hidden="true"></i>`;
  });
  mobileMenu
    ?.querySelectorAll("a")
    .forEach((link) => link.addEventListener("click", closeMenu));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mobileMenu && !mobileMenu.hidden) {
      closeMenu();
      menuButton.focus();
    }
  });
  document.querySelectorAll("[data-launch-app]").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      )
        return;
      if (!transition) return;
      event.preventDefault();
      if (navigating) return;
      navigating = true;
      transition.hidden = false;
      document.body.setAttribute("aria-busy", "true");
      // Paint the overlay before navigation, without an artificial loading delay.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => window.location.assign(link.href)),
      );
    });
  });
  window.addEventListener("pageshow", () => {
    navigating = false;
    if (transition) transition.hidden = true;
    document.body.removeAttribute("aria-busy");
    closeMenu();
  });
  if (
    "IntersectionObserver" in window &&
    !matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    document.documentElement.classList.add("motion-ready");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 },
    );
    document
      .querySelectorAll(".reveal")
      .forEach((element) => observer.observe(element));
  }
})();
