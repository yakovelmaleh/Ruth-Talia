(() => {
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

  function init(root = document) {
    root.querySelectorAll("[data-product-rail]").forEach(rail => {
      if (rail.dataset.railReady === "true") return;
      rail.dataset.railReady = "true";
      const viewport = rail.querySelector("[data-product-rail-viewport]");
      const track = rail.querySelector("[data-product-rail-track]");
      const previous = rail.querySelector("[data-product-rail-previous]");
      const next = rail.querySelector("[data-product-rail-next]");
      let page = 0;
      let dragging = false;
      let startX = 0;
      let dragX = 0;
      let baseX = 0;
      let pointerId = null;

      const visibleProducts = () => [...track.querySelectorAll(".product:not([hidden])")];
      const perPage = () => window.innerWidth <= 480 ? 1 : window.innerWidth <= 1000 ? 2 : 4;
      const maxPage = () => Math.max(0, Math.ceil(visibleProducts().length / perPage()) - 1);
      const pageWidth = () => viewport.clientWidth + 16;

      function translate(value) {
        track.style.transform = `translate3d(${-value}px,0,0)`;
      }

      function render(animate = true) {
        page = clamp(page, 0, maxPage());
        baseX = page * pageWidth();
        track.classList.toggle("is-jumping", !animate);
        translate(baseX);
        if (!animate) requestAnimationFrame(() => track.classList.remove("is-jumping"));
        previous.disabled = page === 0;
        next.disabled = page === maxPage();
      }

      function move(delta) {
        page = clamp(page + delta, 0, maxPage());
        render();
      }

      previous.addEventListener("click", () => move(-1));
      next.addEventListener("click", () => move(1));
      viewport.addEventListener("pointerdown", event => {
        if (event.button !== undefined && event.button !== 0) return;
        if (event.target.closest(".product-card-media,button")) return;
        dragging = true;
        pointerId = event.pointerId;
        startX = event.clientX;
        dragX = 0;
        viewport.setPointerCapture?.(pointerId);
        track.classList.add("is-dragging");
      });
      viewport.addEventListener("pointermove", event => {
        if (!dragging) return;
        dragX = event.clientX - startX;
        translate(baseX - dragX);
      });
      const finishDrag = () => {
        if (!dragging) return;
        dragging = false;
        viewport.releasePointerCapture?.(pointerId);
        pointerId = null;
        track.classList.remove("is-dragging");
        const threshold = Math.min(90, viewport.clientWidth * .14);
        if (Math.abs(dragX) >= threshold) page += dragX < 0 ? 1 : -1;
        dragX = 0;
        render();
      };
      viewport.addEventListener("pointerup", finishDrag);
      viewport.addEventListener("pointercancel", finishDrag);
      window.addEventListener("resize", () => render(false), {passive: true});
      document.querySelectorAll("[data-filter]").forEach(button => {
        button.addEventListener("click", () => {
          page = 0;
          requestAnimationFrame(() => render());
        });
      });
      render(false);
    });
  }

  window.ProductRail = { init };
})();
