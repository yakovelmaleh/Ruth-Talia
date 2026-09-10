(() => {
  document.querySelectorAll("[data-product-rail]").forEach(rail => {
    const track = rail.querySelector("[data-product-rail-track]");
    const move = direction => {
      track.scrollBy({ left: direction * track.clientWidth, behavior: "smooth" });
    };
    rail.querySelector("[data-product-rail-previous]").addEventListener("click", () => move(-1));
    rail.querySelector("[data-product-rail-next]").addEventListener("click", () => move(1));
    document.querySelectorAll("[data-filter]").forEach(button => {
      button.addEventListener("click", () => track.scrollTo({ left: 0, behavior: "smooth" }));
    });
  });
})();
