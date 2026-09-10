(() => {
  const context = window.STORE_CONTEXT;
  const byId = id => context.products.find(product => product.id === Number(id));
  const money = value => new Intl.NumberFormat(context.lang === "he" ? "he-IL" : "en-IL", {
    style: "currency", currency: context.currency, maximumFractionDigits: 0
  }).format(value);
  const words = context.lang === "he" ? {
    empty: "הסל שלך מחכה למשהו יפה.", size: "מידה", remove: "הסרה", choose: "יש לבחור מידה.",
    added: "נוסף לסל.", saved: "הבקשה נשמרה. ניצור איתך קשר בהקדם.",
    order: "ההזמנה נשמרה. מספר ההזמנה שלך:", error: "לא הצלחנו להשלים את הפעולה."
  } : {
    empty: "Your bag is waiting for something beautiful.", size: "Size", remove: "Remove", choose: "Please select a size.",
    added: "Added to your bag.", saved: "Your request was saved. We will contact you shortly.",
    order: "Your order was saved. Your order number is:", error: "We could not complete that action."
  };

  const overlay = document.querySelector("[data-overlay]");
  const cartDrawer = document.querySelector("[data-cart]");
  const productDialog = document.querySelector("[data-product-dialog]");
  const checkoutDialog = document.querySelector("[data-checkout-dialog]");
  const productTrack = productDialog.querySelector("[data-product-media-track]");
  let cart = context.cart;
  let selectedProduct;
  let selectedSize;
  let selectedImageIndex = 0;
  let imageScrollTimer;
  let productJumping = false;
  let galleryScrollTimer;
  let galleryJumping = false;

  async function request(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {"Content-Type": "application/json", ...(options.headers || {})}
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || words.error);
    return body;
  }

  function showOverlay() {
    overlay.classList.add("open");
    document.body.classList.add("locked");
  }

  function closeDrawers() {
    cartDrawer.classList.remove("open");
    overlay.classList.remove("open");
    document.body.classList.remove("locked");
  }

  function renderCart() {
    document.querySelector("[data-cart-count]").textContent = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    document.querySelector("[data-cart-total]").textContent = money(cart.total);
    document.querySelector("[data-cart-items]").innerHTML = cart.items.length ? cart.items.map(item => {
      const product = item.product;
      const name = context.lang === "he" ? product.nameHe : product.nameEn;
      return `<article class="cart-item">
        <img src="${product.imageUrl}" alt="">
        <div><h3>${name}</h3><p>${words.size}: ${item.size} · × ${item.quantity}</p><strong>${money(item.lineTotal)}</strong></div>
        <button type="button" data-remove="${product.id}" data-remove-size="${item.size}">${words.remove}</button>
      </article>`;
    }).join("") : `<p class="empty-cart">${words.empty}</p>`;
    document.querySelectorAll("[data-remove]").forEach(button => button.addEventListener("click", async () => {
      try {
        cart = await request(`/api/cart/items/${button.dataset.remove}/${encodeURIComponent(button.dataset.removeSize)}`, {method:"DELETE"});
        renderCart();
      } catch (error) {
        alert(error.message);
      }
    }));
  }

  function productImages() {
    return selectedProduct?.imageUrls?.length ? selectedProduct.imageUrls : [selectedProduct.imageUrl];
  }

  function updateProductDots() {
    productDialog.querySelectorAll("[data-image-index]").forEach((button, index) => {
      button.classList.toggle("active", index === selectedImageIndex);
    });
  }

  function jumpProductToPhysical(physicalIndex) {
    productJumping = true;
    productTrack.classList.add("is-jumping");
    productTrack.scrollLeft = productTrack.clientWidth * physicalIndex;
    requestAnimationFrame(() => {
      productTrack.classList.remove("is-jumping");
      productJumping = false;
    });
  }

  function scrollProductTo(logicalIndex) {
    const images = productImages();
    selectedImageIndex = (logicalIndex + images.length) % images.length;
    productTrack.scrollTo({
      left: productTrack.clientWidth * (selectedImageIndex + 1),
      behavior: "smooth"
    });
    updateProductDots();
  }

  function renderProductCarousel() {
    const images = productImages();
    const extendedImages = [
      {image: images.at(-1), logicalIndex: images.length - 1, clone: "last"},
      ...images.map((image, logicalIndex) => ({image, logicalIndex, clone: ""})),
      {image: images[0], logicalIndex: 0, clone: "first"}
    ];
    productTrack.innerHTML = extendedImages.map(item =>
      `<div class="product-media-slide" data-logical-index="${item.logicalIndex}" ${item.clone ? `data-clone="${item.clone}"` : ""}><img src="${item.image}" alt="${context.lang === "he" ? selectedProduct.nameHe : selectedProduct.nameEn} — ${item.logicalIndex + 1}"></div>`
    ).join("");
    productDialog.querySelector("[data-image-dots]").innerHTML = images.map((_, index) =>
      `<button type="button" class="${index === 0 ? "active" : ""}" data-image-index="${index}" aria-label="Image ${index + 1}"></button>`
    ).join("");
    productDialog.querySelectorAll("[data-image-index]").forEach(button => button.addEventListener("click", () => {
      scrollProductTo(Number(button.dataset.imageIndex));
    }));
    selectedImageIndex = 0;
    requestAnimationFrame(() => jumpProductToPhysical(1));
  }

  productTrack.addEventListener("scroll", () => {
    if (productJumping) return;
    clearTimeout(imageScrollTimer);
    imageScrollTimer = setTimeout(() => {
      if (!productTrack.clientWidth) return;
      const images = productImages();
      const physicalIndex = Math.round(productTrack.scrollLeft / productTrack.clientWidth);
      if (physicalIndex <= 0) {
        selectedImageIndex = images.length - 1;
        jumpProductToPhysical(images.length);
      } else if (physicalIndex >= images.length + 1) {
        selectedImageIndex = 0;
        jumpProductToPhysical(1);
      } else {
        selectedImageIndex = physicalIndex - 1;
      }
      updateProductDots();
    }, 90);
  }, {passive: true});

  document.querySelectorAll("[data-filter]").forEach(button => button.addEventListener("click", () => {
    document.querySelectorAll("[data-filter]").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    document.querySelectorAll(".product").forEach(product => {
      product.hidden = button.dataset.filter !== "all" && product.dataset.category !== button.dataset.filter;
    });
  }));

  document.querySelectorAll("[data-product-open]").forEach(button => button.addEventListener("click", () => {
    selectedProduct = byId(button.dataset.productOpen);
    selectedSize = "";
    const isHebrew = context.lang === "he";
    renderProductCarousel();
    productDialog.querySelector("[data-dialog-name]").textContent = isHebrew ? selectedProduct.nameHe : selectedProduct.nameEn;
    productDialog.querySelector("[data-dialog-category]").textContent = selectedProduct.category;
    productDialog.querySelector("[data-dialog-price]").textContent = selectedProduct.price === null
      ? (isHebrew ? "מחיר לפי בקשה" : "Price on request")
      : money(selectedProduct.price);
    productDialog.querySelector("[data-dialog-description]").textContent = isHebrew ? selectedProduct.descriptionHe : selectedProduct.descriptionEn;
    productDialog.querySelector(".sizes").hidden = selectedProduct.price === null;
    productDialog.querySelector("[data-add-cart]").hidden = selectedProduct.price === null;
    productDialog.querySelector(".consultation").hidden = selectedProduct.price !== null;
    productDialog.querySelectorAll("[data-size]").forEach(size => size.classList.remove("active"));
    productDialog.showModal();
  }));

  productDialog.querySelector("[data-image-previous]").addEventListener("click", () => {
    const physicalIndex = Math.round(productTrack.scrollLeft / productTrack.clientWidth);
    productTrack.scrollTo({left: productTrack.clientWidth * (physicalIndex - 1), behavior: "smooth"});
  });
  productDialog.querySelector("[data-image-next]").addEventListener("click", () => {
    const physicalIndex = Math.round(productTrack.scrollLeft / productTrack.clientWidth);
    productTrack.scrollTo({left: productTrack.clientWidth * (physicalIndex + 1), behavior: "smooth"});
  });

  productDialog.querySelectorAll("[data-size]").forEach(button => button.addEventListener("click", () => {
    selectedSize = button.dataset.size;
    productDialog.querySelectorAll("[data-size]").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
  }));

  productDialog.querySelector("[data-add-cart]").addEventListener("click", async () => {
    if (!selectedSize) return alert(words.choose);
    try {
      cart = await request("/api/cart/items", {
        method: "POST",
        body: JSON.stringify({productId: selectedProduct.id, size: selectedSize, quantity: 1})
      });
      renderCart();
      productDialog.close();
      alert(words.added);
    } catch (error) {
      alert(error.message);
    }
  });

  const galleryCarousel = document.querySelector("[data-gallery-carousel]");
  const originalGalleryItems = [...galleryCarousel.querySelectorAll(".gallery-item")];
  originalGalleryItems.forEach((item, index) => item.dataset.logicalIndex = index);
  const galleryLastClone = originalGalleryItems.at(-1).cloneNode(true);
  galleryLastClone.dataset.clone = "last";
  const galleryFirstClone = originalGalleryItems[0].cloneNode(true);
  galleryFirstClone.dataset.clone = "first";
  galleryCarousel.prepend(galleryLastClone);
  galleryCarousel.append(galleryFirstClone);

  function gallerySlides() {
    return [...galleryCarousel.querySelectorAll(".gallery-item")];
  }

  function jumpGalleryTo(slide) {
    galleryJumping = true;
    galleryCarousel.classList.add("is-jumping");
    galleryCarousel.scrollLeft = slide.offsetLeft;
    requestAnimationFrame(() => {
      galleryCarousel.classList.remove("is-jumping");
      galleryJumping = false;
    });
  }

  function closestGallerySlide() {
    return gallerySlides().reduce((closest, slide) =>
      Math.abs(slide.offsetLeft - galleryCarousel.scrollLeft) <
      Math.abs(closest.offsetLeft - galleryCarousel.scrollLeft) ? slide : closest
    );
  }

  function moveGallery(direction) {
    const slides = gallerySlides();
    const current = slides.indexOf(closestGallerySlide());
    const target = slides[Math.max(0, Math.min(slides.length - 1, current + direction))];
    galleryCarousel.scrollTo({left: target.offsetLeft, behavior: "smooth"});
  }

  galleryCarousel.addEventListener("scroll", () => {
    if (galleryJumping) return;
    clearTimeout(galleryScrollTimer);
    galleryScrollTimer = setTimeout(() => {
      const slide = closestGallerySlide();
      if (slide.dataset.clone === "last") {
        jumpGalleryTo(originalGalleryItems.at(-1));
      } else if (slide.dataset.clone === "first") {
        jumpGalleryTo(originalGalleryItems[0]);
      }
    }, 100);
  }, {passive: true});

  window.addEventListener("load", () => jumpGalleryTo(originalGalleryItems[0]), {once: true});
  document.querySelector("[data-gallery-previous]").addEventListener("click", () => {
    moveGallery(-1);
  });
  document.querySelector("[data-gallery-next]").addEventListener("click", () => {
    moveGallery(1);
  });

  document.querySelector("[data-cart-open]").addEventListener("click", () => {
    cartDrawer.classList.add("open");
    showOverlay();
  });
  document.querySelector("[data-cart-close]").addEventListener("click", closeDrawers);
  overlay.addEventListener("click", closeDrawers);
  document.querySelector("[data-dialog-close]").addEventListener("click", () => productDialog.close());

  const mobileMenu = document.querySelector("[data-mobile-menu]");
  document.querySelector("[data-menu-open]").addEventListener("click", () => mobileMenu.classList.add("open"));
  document.querySelector("[data-menu-close]").addEventListener("click", () => mobileMenu.classList.remove("open"));
  mobileMenu.querySelectorAll("a").forEach(link => link.addEventListener("click", () => mobileMenu.classList.remove("open")));

  document.querySelector("[data-checkout-open]").addEventListener("click", () => {
    if (!cart.items.length) return;
    closeDrawers();
    checkoutDialog.showModal();
  });
  document.querySelector("[data-checkout-close]").addEventListener("click", () => checkoutDialog.close());

  document.querySelector("[data-checkout-form]").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = form.querySelector(".form-status");
    try {
      const result = await request("/api/orders", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(form)))
      });
      status.textContent = `${words.order} ${result.orderNumber}`;
      cart = {items: [], total: 0};
      renderCart();
      form.reset();
    } catch (error) {
      status.textContent = error.message;
    }
  });

  document.querySelector("[data-appointment-form]").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = form.querySelector(".form-status");
    try {
      const result = await request("/api/appointments", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(form)))
      });
      status.textContent = result.emailDelivered ? words.saved : `${words.saved} ${result.emailWarning || ""}`;
      form.reset();
    } catch (error) {
      status.textContent = error.message;
    }
  });

  renderCart();
})();
