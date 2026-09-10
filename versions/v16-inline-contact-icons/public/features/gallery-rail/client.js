(() => {
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

  document.querySelectorAll("[data-gallery-rail]").forEach(rail => {
    const viewport = rail.querySelector("[data-gallery-rail-viewport]");
    const track = rail.querySelector("[data-gallery-rail-track]");
    const previous = rail.querySelector("[data-gallery-previous]");
    const next = rail.querySelector("[data-gallery-next]");
    let page = 0;
    let dragging = false;
    let startX = 0;
    let dragX = 0;
    let baseX = 0;
    let pointerId = null;

    const perPage = () => window.innerWidth <= 700 ? 1 : window.innerWidth <= 1050 ? 2 : 3;
    const maxPage = () => Math.max(0, Math.ceil(track.children.length / perPage()) - 1);
    const pageWidth = () => viewport.clientWidth + 14;

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
    track.querySelectorAll("img").forEach(image => {
      image.draggable = false;
    });
    viewport.addEventListener("pointerdown", event => {
      if (event.button !== undefined && event.button !== 0) return;
      event.preventDefault();
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
    window.addEventListener("resize", () => render(false), { passive: true });
    render(false);
  });
})();
