(() => {
  const context = window.STORE_CONTEXT;
  const isHebrew = context.lang === "he";
  const byId = id => context.products.find(product => product.id === Number(id));
  const money = value => new Intl.NumberFormat(isHebrew ? "he-IL" : "en-IL", {
    style: "currency", currency: context.currency, maximumFractionDigits: 0
  }).format(value);
  const words = isHebrew ? {
    empty: "הסל שלך מחכה למשהו יפה.", size: "מידה", remove: "הסרה", choose: "יש לבחור מידה.",
    added: "נוסף לסל.", saved: "הפגישה נשמרה. ניצור איתך קשר בהקדם.",
    order: "ההזמנה נשמרה. מספר ההזמנה שלך:", error: "לא הצלחנו להשלים את הפעולה.",
    chooseDay: "בחרי יום מודגש כדי לראות שעות פנויות.", chooseTime: "בחרי שעה פנויה.",
    atelier: "אטלייה", online: "אונליין"
  } : {
    empty: "Your bag is waiting for something beautiful.", size: "Size", remove: "Remove", choose: "Please select a size.",
    added: "Added to your bag.", saved: "Your appointment was saved. We will contact you shortly.",
    order: "Your order was saved. Your order number is:", error: "We could not complete that action.",
    chooseDay: "Select a highlighted day to see available times.", chooseTime: "Choose an available time.",
    atelier: "Atelier", online: "Online"
  };

  class InfiniteCarousel {
    constructor(track, onChange = () => {}) {
      this.track = track;
      this.viewport = track.parentElement;
      this.onChange = onChange;
      this.controller = new AbortController();
      this.originals = [...track.children].map(node => node.cloneNode(true));
      this.count = this.originals.length;
      this.index = 1;
      this.logicalIndex = 0;
      this.dragging = false;
      this.startX = 0;
      this.dragX = 0;
      if (!this.count) return;

      const lastClone = this.originals.at(-1).cloneNode(true);
      const firstClone = this.originals[0].cloneNode(true);
      lastClone.dataset.clone = "last";
      firstClone.dataset.clone = "first";
      track.replaceChildren(lastClone, ...this.originals.map(node => node.cloneNode(true)), firstClone);

      track.addEventListener("transitionend", event => {
        if (event.target === track) this.finishMove();
      }, { signal: this.controller.signal });
      this.viewport.addEventListener("pointerdown", event => this.startDrag(event), {
        signal: this.controller.signal
      });
      this.viewport.addEventListener("pointermove", event => this.drag(event), {
        signal: this.controller.signal
      });
      this.viewport.addEventListener("pointerup", event => this.endDrag(event), {
        signal: this.controller.signal
      });
      this.viewport.addEventListener("pointercancel", event => this.endDrag(event), {
        signal: this.controller.signal
      });
      window.addEventListener("resize", () => this.render(false), {
        passive: true, signal: this.controller.signal
      });
      requestAnimationFrame(() => this.render(false));
    }

    step() {
      const slide = this.track.children[0];
      const gap = Number.parseFloat(getComputedStyle(this.track).columnGap) || 0;
      return slide.getBoundingClientRect().width + gap;
    }

    translate(value) {
      this.track.style.transform = `translate3d(${-value}px, 0, 0)`;
    }

    render(animate = true) {
      this.track.classList.toggle("is-jumping", !animate);
      this.translate(this.index * this.step());
      if (!animate) requestAnimationFrame(() => this.track.classList.remove("is-jumping"));
    }

    report() {
      this.logicalIndex = ((this.index - 1) % this.count + this.count) % this.count;
      this.onChange(this.logicalIndex);
    }

    go(logicalIndex) {
      const normalized = ((logicalIndex % this.count) + this.count) % this.count;
      this.index = normalized + 1;
      this.render();
      this.report();
    }

    move(delta) {
      if (this.dragging) return;
      this.index += delta;
      this.render();
      this.report();
    }

    finishMove() {
      if (this.index === 0) {
        this.index = this.count;
        this.render(false);
      } else if (this.index === this.count + 1) {
        this.index = 1;
        this.render(false);
      }
      this.report();
    }

    startDrag(event) {
      if (event.button !== undefined && event.button !== 0) return;
      this.dragging = true;
      this.startX = event.clientX;
      this.dragX = 0;
      this.track.classList.add("is-dragging");
      this.viewport.setPointerCapture?.(event.pointerId);
    }

    drag(event) {
      if (!this.dragging) return;
      this.dragX = event.clientX - this.startX;
      this.translate(this.index * this.step() - this.dragX);
    }

    endDrag(event) {
      if (!this.dragging) return;
      this.dragging = false;
      this.track.classList.remove("is-dragging");
      this.viewport.releasePointerCapture?.(event.pointerId);
      const threshold = Math.min(70, this.viewport.clientWidth * .16);
      if (Math.abs(this.dragX) >= threshold) {
        this.index += this.dragX < 0 ? 1 : -1;
      }
      this.dragX = 0;
      this.render();
      this.report();
    }

    destroy() {
      this.controller.abort();
    }
  }

  const overlay = document.querySelector("[data-overlay]");
  const cartDrawer = document.querySelector("[data-cart]");
  const productDialog = document.querySelector("[data-product-dialog]");
  const checkoutDialog = document.querySelector("[data-checkout-dialog]");
  const productTrack = productDialog.querySelector("[data-product-media-track]");
  let cart = context.cart;
  let slots = [...context.slots];
  let selectedProduct;
  let selectedSize;
  let selectedImageIndex = 0;
  let productCarousel;

  async function request(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {"Content-Type": "application/json", ...(options.headers || {})}
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || words.error);
    return body;
  }

  function renderCart() {
    document.querySelector("[data-cart-count]").textContent = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    document.querySelector("[data-cart-total]").textContent = money(cart.total);
    document.querySelector("[data-cart-items]").innerHTML = cart.items.length ? cart.items.map(item => {
      const product = item.product;
      const name = isHebrew ? product.nameHe : product.nameEn;
      return `<article class="cart-item">
        <img src="${product.imageUrl}" alt="">
        <div><h3>${name}</h3><p>${words.size}: ${item.size} · × ${item.quantity}</p><strong>${money(item.lineTotal)}</strong></div>
        <button type="button" data-remove="${product.id}" data-remove-size="${item.size}">${words.remove}</button>
      </article>`;
    }).join("") : `<p class="empty-cart">${words.empty}</p>`;
    document.querySelectorAll("[data-remove]").forEach(button => button.addEventListener("click", async () => {
      try {
        cart = await request(`/api/cart/items/${button.dataset.remove}/${encodeURIComponent(button.dataset.removeSize)}`, {method: "DELETE"});
        renderCart();
      } catch (error) {
        alert(error.message);
      }
    }));
  }

  document.querySelectorAll("[data-card-carousel]").forEach(container => {
    const carousel = new InfiniteCarousel(container.querySelector("[data-card-track]"));
    container.querySelector("[data-card-previous]").addEventListener("click", () => carousel.move(-1));
    container.querySelector("[data-card-next]").addEventListener("click", () => carousel.move(1));
  });

  const galleryCarousel = new InfiniteCarousel(document.querySelector("[data-gallery-carousel]"));
  document.querySelector("[data-gallery-previous]").addEventListener("click", () => galleryCarousel.move(-1));
  document.querySelector("[data-gallery-next]").addEventListener("click", () => galleryCarousel.move(1));

  function updateProductDots() {
    productDialog.querySelectorAll("[data-image-index]").forEach((button, index) => {
      button.classList.toggle("active", index === selectedImageIndex);
    });
  }

  function renderProductCarousel() {
    productCarousel?.destroy();
    const images = selectedProduct.imageUrls;
    productTrack.innerHTML = images.map((image, index) =>
      `<div class="product-media-slide"><img src="${image}" alt="${isHebrew ? selectedProduct.nameHe : selectedProduct.nameEn} — ${index + 1}"></div>`
    ).join("");
    productDialog.querySelector("[data-image-dots]").innerHTML = images.map((_, index) =>
      `<button type="button" class="${index === 0 ? "active" : ""}" data-image-index="${index}" aria-label="Image ${index + 1}"></button>`
    ).join("");
    selectedImageIndex = 0;
    productCarousel = new InfiniteCarousel(productTrack, logicalIndex => {
      selectedImageIndex = logicalIndex;
      updateProductDots();
    });
    productDialog.querySelectorAll("[data-image-index]").forEach(button => button.addEventListener("click", () => {
      productCarousel.go(Number(button.dataset.imageIndex));
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

  productDialog.querySelector("[data-image-previous]").addEventListener("click", () => productCarousel.move(-1));
  productDialog.querySelector("[data-image-next]").addEventListener("click", () => productCarousel.move(1));
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

  const appointmentForm = document.querySelector("[data-appointment-form]");
  const calendarTitle = appointmentForm.querySelector("[data-calendar-title]");
  const calendarWeekdays = appointmentForm.querySelector("[data-calendar-weekdays]");
  const calendarDays = appointmentForm.querySelector("[data-calendar-days]");
  const calendarTimes = appointmentForm.querySelector("[data-calendar-times]");
  const slotInput = appointmentForm.querySelector("[data-slot-id]");
  const appointmentSubmit = appointmentForm.querySelector('button[type="submit"]');
  const weekdays = isHebrew ? ["א", "ב", "ג", "ד", "ה", "ו", "ש"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const initialDate = slots.length ? new Date(`${slots[0].starts_at}:00`) : new Date();
  let calendarMonth = new Date(initialDate.getFullYear(), initialDate.getMonth(), 1);
  let selectedDate = "";

  function dateKey(year, month, day) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function slotsForDate(date) {
    return slots.filter(slot => slot.starts_at.slice(0, 10) === date);
  }

  function renderTimes() {
    const daySlots = selectedDate ? slotsForDate(selectedDate) : [];
    calendarTimes.innerHTML = daySlots.length
      ? daySlots.map(slot => `<button type="button" data-slot-choice="${slot.id}">${slot.starts_at.slice(11, 16)} · ${words[slot.location] || slot.location}</button>`).join("")
      : `<p class="calendar-message">${selectedDate ? words.chooseTime : words.chooseDay}</p>`;
    calendarTimes.querySelectorAll("[data-slot-choice]").forEach(button => button.addEventListener("click", () => {
      calendarTimes.querySelectorAll("button").forEach(item => item.classList.remove("selected"));
      button.classList.add("selected");
      slotInput.value = button.dataset.slotChoice;
      appointmentSubmit.disabled = false;
    }));
  }

  function renderCalendar() {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    calendarTitle.textContent = new Intl.DateTimeFormat(isHebrew ? "he-IL" : "en-US", {
      month: "long", year: "numeric"
    }).format(calendarMonth);
    calendarWeekdays.innerHTML = weekdays.map(day => `<span>${day}</span>`).join("");
    const leading = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = Array.from({length: leading}, () => "<span></span>");
    for (let day = 1; day <= daysInMonth; day += 1) {
      const key = dateKey(year, month, day);
      const available = slotsForDate(key).length > 0;
      cells.push(available
        ? `<button type="button" class="${selectedDate === key ? "selected" : ""}" data-calendar-date="${key}">${day}</button>`
        : `<span>${day}</span>`);
    }
    calendarDays.innerHTML = cells.join("");
    calendarDays.querySelectorAll("[data-calendar-date]").forEach(button => button.addEventListener("click", () => {
      selectedDate = button.dataset.calendarDate;
      slotInput.value = "";
      appointmentSubmit.disabled = true;
      renderCalendar();
      renderTimes();
    }));
    renderTimes();
  }

  appointmentForm.querySelector("[data-calendar-previous]").addEventListener("click", () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
    renderCalendar();
  });
  appointmentForm.querySelector("[data-calendar-next]").addEventListener("click", () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
    renderCalendar();
  });
  appointmentSubmit.disabled = true;
  renderCalendar();

  document.querySelector("[data-cart-open]").addEventListener("click", () => {
    cartDrawer.classList.add("open");
    overlay.classList.add("open");
    document.body.classList.add("locked");
  });
  function closeCart() {
    cartDrawer.classList.remove("open");
    overlay.classList.remove("open");
    document.body.classList.remove("locked");
  }
  document.querySelector("[data-cart-close]").addEventListener("click", closeCart);
  overlay.addEventListener("click", closeCart);
  document.querySelector("[data-dialog-close]").addEventListener("click", () => productDialog.close());

  const mobileMenu = document.querySelector("[data-mobile-menu]");
  document.querySelector("[data-menu-open]").addEventListener("click", () => mobileMenu.classList.add("open"));
  document.querySelector("[data-menu-close]").addEventListener("click", () => mobileMenu.classList.remove("open"));
  mobileMenu.querySelectorAll("a").forEach(link => link.addEventListener("click", () => mobileMenu.classList.remove("open")));

  document.querySelector("[data-checkout-open]").addEventListener("click", () => {
    if (!cart.items.length) return;
    closeCart();
    checkoutDialog.showModal();
  });
  document.querySelector("[data-checkout-close]").addEventListener("click", () => checkoutDialog.close());
  document.querySelector("[data-checkout-form]").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = form.querySelector(".form-status");
    try {
      const result = await request("/api/orders", {
        method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(form)))
      });
      status.textContent = `${words.order} ${result.orderNumber}`;
      cart = {items: [], total: 0};
      renderCart();
      form.reset();
    } catch (error) {
      status.textContent = error.message;
    }
  });

  appointmentForm.addEventListener("submit", async event => {
    event.preventDefault();
    const status = appointmentForm.querySelector(".form-status");
    try {
      const bookedSlotId = Number(slotInput.value);
      const result = await request("/api/appointments", {
        method: "POST", body: JSON.stringify(Object.fromEntries(new FormData(appointmentForm)))
      });
      status.textContent = result.emailDelivered ? words.saved : `${words.saved} ${result.emailWarning || ""}`;
      slots = slots.filter(slot => slot.id !== bookedSlotId);
      appointmentForm.reset();
      selectedDate = "";
      slotInput.value = "";
      appointmentSubmit.disabled = true;
      renderCalendar();
    } catch (error) {
      status.textContent = error.message;
    }
  });

  renderCart();
})();
