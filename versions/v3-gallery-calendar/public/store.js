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
  let cart = context.cart;
  let selectedProduct;
  let selectedSize;
  let selectedImageIndex = 0;

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

      function renderProductImage() {
        const images = selectedProduct.imageUrls?.length ? selectedProduct.imageUrls : [selectedProduct.imageUrl];
        selectedImageIndex = (selectedImageIndex + images.length) % images.length;
        productDialog.querySelector("[data-dialog-image]").src = images[selectedImageIndex];
        productDialog.querySelector("[data-image-dots]").innerHTML = images.map((_, index) =>
          `<button type="button" class="${index === selectedImageIndex ? "active" : ""}" data-image-index="${index}" aria-label="Image ${index + 1}"></button>`
        ).join("");
        productDialog.querySelectorAll("[data-image-index]").forEach(button => button.addEventListener("click", () => {
          selectedImageIndex = Number(button.dataset.imageIndex);
          renderProductImage();
        }));
        productDialog.querySelector("[data-image-previous]").hidden = images.length < 2;
        productDialog.querySelector("[data-image-next]").hidden = images.length < 2;
      }
    }));
  }

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
    selectedImageIndex = 0;
    const isHebrew = context.lang === "he";
    renderProductImage();
    productDialog.querySelector("[data-dialog-name]").textContent = isHebrew ? selectedProduct.nameHe : selectedProduct.nameEn;
    productDialog.querySelector("[data-dialog-category]").textContent = selectedProduct.category;
    productDialog.querySelector("[data-dialog-price]").textContent = selectedProduct.price === null ? (isHebrew ? "מחיר לפי בקשה" : "Price on request") : money(selectedProduct.price);
    productDialog.querySelector("[data-dialog-description]").textContent = isHebrew ? selectedProduct.descriptionHe : selectedProduct.descriptionEn;
    productDialog.querySelector(".sizes").hidden = selectedProduct.price === null;
    productDialog.querySelector("[data-add-cart]").hidden = selectedProduct.price === null;
    productDialog.querySelector(".consultation").hidden = selectedProduct.price !== null;
    productDialog.querySelectorAll("[data-size]").forEach(size => size.classList.remove("active"));
    productDialog.showModal();
  }));

  productDialog.querySelector("[data-image-previous]").addEventListener("click", () => {
    selectedImageIndex -= 1;
    renderProductImage();
  });
  productDialog.querySelector("[data-image-next]").addEventListener("click", () => {
    selectedImageIndex += 1;
    renderProductImage();
  });
  const media = productDialog.querySelector("[data-product-media]");
  let touchStartX = null;
  media.addEventListener("touchstart", event => {
    touchStartX = event.changedTouches[0].clientX;
  }, {passive:true});
  media.addEventListener("touchend", event => {
    if (touchStartX === null) return;
    const distance = event.changedTouches[0].clientX - touchStartX;
    if (Math.abs(distance) > 45) {
      selectedImageIndex += distance < 0 ? 1 : -1;
      renderProductImage();
    }
    touchStartX = null;
  }, {passive:true});

  productDialog.querySelectorAll("[data-size]").forEach(button => button.addEventListener("click", () => {
    selectedSize = button.dataset.size;
    productDialog.querySelectorAll("[data-size]").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
  }));

  productDialog.querySelector("[data-add-cart]").addEventListener("click", async () => {
    if (!selectedSize) return alert(words.choose);
    try {
      cart = await request("/api/cart/items", {
        method: "POST", body: JSON.stringify({productId: selectedProduct.id, size: selectedSize, quantity: 1})
      });
      renderCart();
      productDialog.close();
      alert(words.added);
    } catch (error) {
      alert(error.message);
    }
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
      const result = await request("/api/orders", {method:"POST", body:JSON.stringify(Object.fromEntries(new FormData(form)))});
      status.textContent = `${words.order} ${result.orderNumber}`;
      cart = {items:[], total:0};
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
      const result = await request("/api/appointments", {method:"POST", body:JSON.stringify(Object.fromEntries(new FormData(form)))});
      status.textContent = result.emailDelivered ? words.saved : `${words.saved} ${result.emailWarning || ""}`;
      form.reset();
    } catch (error) {
      status.textContent = error.message;
    }
  });

  renderCart();
})();
