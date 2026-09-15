(() => {
  const context = window.STORE_CONTEXT;
  const isHebrew = context.lang === "he";
  const api = new window.StoreApi(window.RUTH_TALIA_CONFIG);
  const storageKey = "ruth-talia-cart-v18";
  const words = isHebrew ? {
    empty: "הסל שלך מחכה למשהו יפה.", size: "מידה", remove: "הסרה", choose: "יש לבחור מידה.",
    added: "נוסף לסל.", saved: "הפגישה נשמרה. ניצור איתך קשר בהקדם.",
    order: "בקשת ההזמנה נשמרה. מספר הבקשה שלך:", error: "לא הצלחנו להשלים את הפעולה.",
    chooseDay: "בחרי יום מודגש כדי לראות שעות פנויות.", chooseTime: "בחרי שעה פנויה.",
    atelier: "אטלייה", online: "אונליין", requestUnavailable: "הטפסים עדיין אינם מחוברים ל-Google Sheets.",
    loadingError: "לא ניתן היה לרענן את הנתונים. מוצגת הקולקציה השמורה באתר.",
    priceRequest: "מחיר לפי בקשה", openDetails: "פתיחת פרטים עבור", previousImage: "תמונה קודמת",
    nextImage: "תמונה הבאה", viewDetails: "לצפייה בפרטים"
  } : {
    empty: "Your bag is waiting for something beautiful.", size: "Size", remove: "Remove", choose: "Please select a size.",
    added: "Added to your bag.", saved: "Your appointment was saved. We will contact you shortly.",
    order: "Your order request was saved. Your request number is:", error: "We could not complete that action.",
    chooseDay: "Select a highlighted day to see available times.", chooseTime: "Choose an available time.",
    atelier: "Atelier", online: "Online", requestUnavailable: "Forms are not connected to Google Sheets yet.",
    loadingError: "Live data could not be refreshed. The saved website catalog is shown.",
    priceRequest: "Price on request", openDetails: "Open details for", previousImage: "Previous image",
    nextImage: "Next image", viewDetails: "View details"
  };

  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
  const safeImageUrl = value => {
    try {
      const url = new URL(String(value));
      return url.protocol === "https:" ? url.href : "";
    } catch {
      return "";
    }
  };
  const money = value => new Intl.NumberFormat(isHebrew ? "he-IL" : "en-IL", {
    style: "currency", currency: context.currency, maximumFractionDigits: 0
  }).format(value);
  const newRequestId = () => globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  let products = context.products.map(normalizeProduct);
  let slots = [...context.slots];
  let selectedProduct;
  let selectedSize = "";
  let selectedImageIndex = 0;
  let productCarousel;
  let cart = loadCart();

  function normalizeProduct(product, index = 0) {
    const imageUrls = Array.isArray(product.imageUrls)
      ? product.imageUrls.map(safeImageUrl).filter(Boolean)
      : String(product.imageUrls || "").split(/\r?\n|\s*\|\s*/).map(safeImageUrl).filter(Boolean);
    return {
      ...product,
      id: Number(product.id) || index + 1,
      price: product.price === null || product.price === "" ? null : Number(product.price),
      inventory: Number(product.inventory || 0),
      active: product.active !== false && String(product.active).toLowerCase() !== "false",
      imageUrls,
      imageUrl: imageUrls[0] || ""
    };
  }

  function loadCart() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  }

  function saveCart() {
    localStorage.setItem(storageKey, JSON.stringify(cart));
  }

  function productById(id) {
    return products.find(product => product.id === Number(id));
  }

  function cartDetails() {
    const items = cart.map(item => {
      const product = productById(item.productId);
      if (!product) return null;
      return {
        ...item,
        product,
        lineTotal: product.price * item.quantity
      };
    }).filter(Boolean);
    return {
      items,
      total: items.reduce((sum, item) => sum + item.lineTotal, 0)
    };
  }

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
      this.animating = false;
      this.pendingDelta = 0;
      this.suppressClickUntil = 0;
      this.pointerCaptured = false;
      this.pointerId = null;
      this.startX = 0;
      this.dragX = 0;
      if (!this.count) return;

      const lastClone = this.originals.at(-1).cloneNode(true);
      const firstClone = this.originals[0].cloneNode(true);
      track.replaceChildren(lastClone, ...this.originals.map(node => node.cloneNode(true)), firstClone);
      track.addEventListener("transitionend", event => {
        if (event.target === track) this.finishMove();
      }, {signal: this.controller.signal});
      for (const eventName of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) {
        this.viewport.addEventListener(eventName, event => {
          if (eventName === "pointerdown") this.startDrag(event);
          else if (eventName === "pointermove") this.drag(event);
          else this.endDrag(event);
        }, {signal: this.controller.signal});
      }
      window.addEventListener("resize", () => this.render(false), {passive: true, signal: this.controller.signal});
      requestAnimationFrame(() => this.render(false));
    }

    step() {
      const slide = this.track.children[0];
      const gap = Number.parseFloat(getComputedStyle(this.track).columnGap) || 0;
      return slide ? slide.getBoundingClientRect().width + gap : 0;
    }

    translate(value) {
      this.track.style.transform = `translate3d(${-value}px,0,0)`;
    }

    render(animate = true) {
      if (!this.count) return;
      this.track.classList.toggle("is-jumping", !animate);
      this.translate(this.index * this.step());
      clearTimeout(this.transitionTimer);
      this.animating = animate;
      if (animate) this.transitionTimer = setTimeout(() => this.finishMove(), 520);
      else requestAnimationFrame(() => this.track.classList.remove("is-jumping"));
    }

    report() {
      this.logicalIndex = ((this.index - 1) % this.count + this.count) % this.count;
      this.onChange(this.logicalIndex);
    }

    go(index) {
      if (this.animating || this.dragging || !this.count) return;
      this.index = ((index % this.count) + this.count) % this.count + 1;
      this.render();
      this.report();
    }

    move(delta) {
      if (this.dragging || !this.count) return;
      if (this.animating) {
        this.pendingDelta += delta;
        return;
      }
      this.index += delta;
      this.render();
      this.report();
    }

    finishMove() {
      clearTimeout(this.transitionTimer);
      if (this.index === 0) {
        this.index = this.count;
        this.render(false);
      } else if (this.index === this.count + 1) {
        this.index = 1;
        this.render(false);
      }
      this.animating = false;
      this.report();
      if (this.pendingDelta) {
        const delta = Math.sign(this.pendingDelta);
        this.pendingDelta -= delta;
        requestAnimationFrame(() => this.move(delta));
      }
    }

    startDrag(event) {
      if ((event.button !== undefined && event.button !== 0)
        || event.target.closest(".card-arrow,.media-arrow,.media-dots button")
        || this.animating) return;
      this.dragging = true;
      this.pointerId = event.pointerId;
      this.startX = event.clientX;
      this.dragX = 0;
      this.track.classList.add("is-dragging");
    }

    drag(event) {
      if (!this.dragging) return;
      this.dragX = event.clientX - this.startX;
      if (Math.abs(this.dragX) > 8) {
        this.suppressClickUntil = Date.now() + 300;
        if (!this.pointerCaptured) {
          this.viewport.setPointerCapture?.(this.pointerId);
          this.pointerCaptured = true;
        }
      }
      this.translate(this.index * this.step() - this.dragX);
    }

    endDrag() {
      if (!this.dragging) return;
      this.dragging = false;
      this.track.classList.remove("is-dragging");
      if (this.pointerCaptured) this.viewport.releasePointerCapture?.(this.pointerId);
      this.pointerCaptured = false;
      this.pointerId = null;
      const threshold = Math.min(70, this.viewport.clientWidth * .16);
      if (Math.abs(this.dragX) >= threshold) this.index += this.dragX < 0 ? 1 : -1;
      this.dragX = 0;
      this.render();
      this.report();
    }

    destroy() {
      this.controller.abort();
      clearTimeout(this.transitionTimer);
    }
  }

  function productCard(product) {
    const name = isHebrew ? product.nameHe : product.nameEn;
    const subtitle = isHebrew ? product.subtitleHe : product.subtitleEn;
    const badge = isHebrew ? product.badgeHe : product.badgeEn;
    const images = product.imageUrls.map((image, index) =>
      `<div class="product-card-slide"><img src="${escapeHtml(image)}" alt="${escapeHtml(name)} — ${index + 1}" loading="lazy"></div>`
    ).join("");
    return `<article class="product" data-category="${escapeHtml(product.category)}">
      <div class="product-card-media" data-card-carousel data-product-id="${product.id}">
        <div class="product-card-track" data-card-track>${images}</div>
        <button class="product-card-open" type="button" data-product-card-open aria-label="${escapeHtml(words.openDetails)} ${escapeHtml(name)}"></button>
        <button class="card-arrow previous" type="button" data-card-previous aria-label="${escapeHtml(words.previousImage)}">&lt;</button>
        <button class="card-arrow next" type="button" data-card-next aria-label="${escapeHtml(words.nextImage)}">&gt;</button>
        ${badge ? `<span>${escapeHtml(badge)}</span>` : ""}
      </div>
      <div class="product-details">
        <h3>${escapeHtml(name)}</h3>
        <strong>${product.price === null ? words.priceRequest : money(product.price)}</strong>
        <p>${escapeHtml(subtitle)}</p>
        <button class="product-view" type="button" data-product-open="${product.id}">${escapeHtml(words.viewDetails)}</button>
      </div>
    </article>`;
  }

  function renderProducts() {
    const track = document.querySelector("[data-product-rail-track]");
    track.innerHTML = products.filter(product => product.active && product.imageUrls.length).map(productCard).join("");
    document.querySelector("[data-product-rail]").dataset.railReady = "false";
    initializeProductCards();
    window.ProductRail.init();
  }

  function initializeProductCards() {
    document.querySelectorAll("[data-card-carousel]").forEach(container => {
      const carousel = new InfiniteCarousel(container.querySelector("[data-card-track]"));
      const previous = container.querySelector("[data-card-previous]");
      const next = container.querySelector("[data-card-next]");
      previous.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        carousel.move(-1);
      });
      next.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        carousel.move(1);
      });
      container.querySelector("[data-product-card-open]").addEventListener("click", event => {
        if (Date.now() < carousel.suppressClickUntil) return event.preventDefault();
        openProduct(container.dataset.productId);
      });
    });
    document.querySelectorAll("[data-product-open]").forEach(button => {
      button.addEventListener("click", () => openProduct(button.dataset.productOpen));
    });
  }

  const overlay = document.querySelector("[data-overlay]");
  const cartDrawer = document.querySelector("[data-cart]");
  const productDialog = document.querySelector("[data-product-dialog]");
  const checkoutDialog = document.querySelector("[data-checkout-dialog]");
  const productTrack = productDialog.querySelector("[data-product-media-track]");

  function renderProductCarousel() {
    productCarousel?.destroy();
    productTrack.innerHTML = selectedProduct.imageUrls.map((image, index) =>
      `<div class="product-media-slide"><img src="${escapeHtml(image)}" alt="${escapeHtml(isHebrew ? selectedProduct.nameHe : selectedProduct.nameEn)} — ${index + 1}"></div>`
    ).join("");
    productDialog.querySelector("[data-image-dots]").innerHTML = selectedProduct.imageUrls.map((_, index) =>
      `<button type="button" class="${index === 0 ? "active" : ""}" data-image-index="${index}" aria-label="Image ${index + 1}"></button>`
    ).join("");
    selectedImageIndex = 0;
    productCarousel = new InfiniteCarousel(productTrack, logicalIndex => {
      selectedImageIndex = logicalIndex;
      productDialog.querySelectorAll("[data-image-index]").forEach((button, index) => {
        button.classList.toggle("active", index === selectedImageIndex);
      });
    });
    productDialog.querySelectorAll("[data-image-index]").forEach(button => {
      button.addEventListener("click", () => productCarousel.go(Number(button.dataset.imageIndex)));
    });
  }

  function openProduct(id) {
    selectedProduct = productById(id);
    if (!selectedProduct) return;
    selectedSize = "";
    renderProductCarousel();
    productDialog.querySelector("[data-dialog-name]").textContent = isHebrew ? selectedProduct.nameHe : selectedProduct.nameEn;
    productDialog.querySelector("[data-dialog-category]").textContent = selectedProduct.category;
    productDialog.querySelector("[data-dialog-price]").textContent = selectedProduct.price === null
      ? words.priceRequest : money(selectedProduct.price);
    productDialog.querySelector("[data-dialog-description]").textContent =
      isHebrew ? selectedProduct.descriptionHe : selectedProduct.descriptionEn;
    productDialog.querySelector(".sizes").hidden = selectedProduct.price === null;
    productDialog.querySelector("[data-add-cart]").hidden = selectedProduct.price === null;
    productDialog.querySelector(".consultation").hidden = selectedProduct.price !== null;
    productDialog.querySelectorAll("[data-size]").forEach(size => size.classList.remove("active"));
    productDialog.showModal();
  }

  function renderCart() {
    const details = cartDetails();
    document.querySelector("[data-cart-count]").textContent =
      details.items.reduce((sum, item) => sum + item.quantity, 0);
    document.querySelector("[data-cart-total]").textContent = money(details.total);
    document.querySelector("[data-cart-items]").innerHTML = details.items.length ? details.items.map(item => {
      const name = isHebrew ? item.product.nameHe : item.product.nameEn;
      return `<article class="cart-item">
        <img src="${escapeHtml(item.product.imageUrl)}" alt="">
        <div><h3>${escapeHtml(name)}</h3><p>${words.size}: ${escapeHtml(item.size)} · × ${item.quantity}</p><strong>${money(item.lineTotal)}</strong></div>
        <button type="button" data-remove="${item.product.id}" data-remove-size="${escapeHtml(item.size)}">${words.remove}</button>
      </article>`;
    }).join("") : `<p class="empty-cart">${words.empty}</p>`;
    document.querySelectorAll("[data-remove]").forEach(button => {
      button.addEventListener("click", () => {
        cart = cart.filter(item => item.productId !== Number(button.dataset.remove) || item.size !== button.dataset.removeSize);
        saveCart();
        renderCart();
      });
    });
  }

  function setStatus(form, message, successful = false) {
    const status = form.querySelector(".form-status");
    status.textContent = message;
    status.classList.toggle("success", successful);
    status.classList.toggle("error", !successful);
  }

  function initializeForm(form) {
    form.elements.requestId.value = newRequestId();
    form.elements.startedAt.value = Date.now();
  }

  const appointmentForm = document.querySelector("[data-appointment-form]");
  const calendarTitle = appointmentForm.querySelector("[data-calendar-title]");
  const calendarWeekdays = appointmentForm.querySelector("[data-calendar-weekdays]");
  const calendarDays = appointmentForm.querySelector("[data-calendar-days]");
  const calendarTimes = appointmentForm.querySelector("[data-calendar-times]");
  const slotInput = appointmentForm.querySelector("[data-slot-id]");
  const appointmentSubmit = appointmentForm.querySelector('button[type="submit"]');
  const weekdays = isHebrew ? ["א", "ב", "ג", "ד", "ה", "ו", "ש"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  let calendarMonth = new Date();
  let selectedDate = "";

  function slotsForDate(date) {
    return slots.filter(slot => slot.starts_at.slice(0, 10) === date);
  }

  function renderTimes() {
    const daySlots = selectedDate ? slotsForDate(selectedDate) : [];
    calendarTimes.innerHTML = daySlots.length
      ? daySlots.map(slot => `<button type="button" data-slot-choice="${escapeHtml(slot.id)}">${escapeHtml(slot.starts_at.slice(11, 16))} · ${escapeHtml(words[slot.location] || slot.location)}</button>`).join("")
      : `<p class="calendar-message">${selectedDate ? words.chooseTime : words.chooseDay}</p>`;
    calendarTimes.querySelectorAll("[data-slot-choice]").forEach(button => {
      button.addEventListener("click", () => {
        calendarTimes.querySelectorAll("button").forEach(item => item.classList.remove("selected"));
        button.classList.add("selected");
        slotInput.value = button.dataset.slotChoice;
        appointmentSubmit.disabled = false;
      });
    });
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
      const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push(slotsForDate(key).length
        ? `<button type="button" class="${selectedDate === key ? "selected" : ""}" data-calendar-date="${key}">${day}</button>`
        : `<span>${day}</span>`);
    }
    calendarDays.innerHTML = cells.join("");
    calendarDays.querySelectorAll("[data-calendar-date]").forEach(button => {
      button.addEventListener("click", () => {
        selectedDate = button.dataset.calendarDate;
        slotInput.value = "";
        appointmentSubmit.disabled = true;
        renderCalendar();
        renderTimes();
      });
    });
    renderTimes();
  }

  function initializeUi() {
    renderProducts();
    renderCart();
    initializeForm(appointmentForm);
    initializeForm(document.querySelector("[data-checkout-form]"));
    document.querySelectorAll("[data-filter]").forEach(button => {
      button.addEventListener("click", () => {
        document.querySelectorAll("[data-filter]").forEach(item => item.classList.remove("active"));
        button.classList.add("active");
        document.querySelectorAll(".product").forEach(product => {
          product.hidden = button.dataset.filter !== "all" && product.dataset.category !== button.dataset.filter;
        });
      });
    });
    productDialog.querySelector("[data-image-previous]").addEventListener("click", () => productCarousel.move(-1));
    productDialog.querySelector("[data-image-next]").addEventListener("click", () => productCarousel.move(1));
    productDialog.querySelectorAll("[data-size]").forEach(button => {
      button.addEventListener("click", () => {
        selectedSize = button.dataset.size;
        productDialog.querySelectorAll("[data-size]").forEach(item => item.classList.remove("active"));
        button.classList.add("active");
      });
    });
    productDialog.querySelector("[data-add-cart]").addEventListener("click", () => {
      if (!selectedSize) return alert(words.choose);
      const existing = cart.find(item => item.productId === selectedProduct.id && item.size === selectedSize);
      if (existing) existing.quantity += 1;
      else cart.push({productId: selectedProduct.id, size: selectedSize, quantity: 1});
      saveCart();
      renderCart();
      productDialog.close();
      alert(words.added);
    });

    document.querySelector("[data-cart-open]").addEventListener("click", () => {
      cartDrawer.classList.add("open");
      overlay.classList.add("open");
      document.body.classList.add("locked");
    });
    const closeCart = () => {
      cartDrawer.classList.remove("open");
      overlay.classList.remove("open");
      document.body.classList.remove("locked");
    };
    document.querySelector("[data-cart-close]").addEventListener("click", closeCart);
    overlay.addEventListener("click", closeCart);
    document.querySelector("[data-dialog-close]").addEventListener("click", () => productDialog.close());
    const mobileMenu = document.querySelector("[data-mobile-menu]");
    document.querySelector("[data-menu-open]").addEventListener("click", () => mobileMenu.classList.add("open"));
    document.querySelector("[data-menu-close]").addEventListener("click", () => mobileMenu.classList.remove("open"));
    mobileMenu.querySelectorAll("a").forEach(link => link.addEventListener("click", () => mobileMenu.classList.remove("open")));
    document.querySelector("[data-checkout-open]").addEventListener("click", () => {
      if (!cart.length) return;
      closeCart();
      checkoutDialog.showModal();
    });
    document.querySelector("[data-checkout-close]").addEventListener("click", () => checkoutDialog.close());
    appointmentForm.querySelector("[data-calendar-previous]").addEventListener("click", () => {
      calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
      renderCalendar();
    });
    appointmentForm.querySelector("[data-calendar-next]").addEventListener("click", () => {
      calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
      renderCalendar();
    });
  }

  document.querySelector("[data-checkout-form]").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const details = cartDetails();
    if (!details.items.length) return;
    try {
      const result = await api.submit("createOrder", {
        customer: Object.fromEntries(new FormData(form)),
        currency: context.currency,
        total: details.total,
        items: details.items.map(item => ({
          productId: item.product.id,
          slug: item.product.slug,
          nameEn: item.product.nameEn,
          nameHe: item.product.nameHe,
          size: item.size,
          quantity: item.quantity,
          unitPrice: item.product.price
        }))
      });
      setStatus(form, `${words.order} ${result.orderNumber}`, true);
      cart = [];
      saveCart();
      renderCart();
      form.reset();
      initializeForm(form);
    } catch (error) {
      setStatus(form, error.message || words.error);
    }
  });

  appointmentForm.addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const payload = Object.fromEntries(new FormData(form));
      const bookedSlotId = String(payload.slotId);
      await api.submit("createAppointment", {appointment: payload});
      setStatus(form, words.saved, true);
      slots = slots.filter(slot => String(slot.id) !== bookedSlotId);
      form.reset();
      initializeForm(form);
      selectedDate = "";
      appointmentSubmit.disabled = true;
      renderCalendar();
    } catch (error) {
      setStatus(form, error.message || words.error);
    }
  });

  async function start() {
    if (api.configured) {
      try {
        const bootstrap = await api.bootstrap();
        if (Array.isArray(bootstrap?.products) && bootstrap.products.length) {
          products = bootstrap.products.map(normalizeProduct).filter(product => product.active);
        }
        if (Array.isArray(bootstrap?.slots)) slots = bootstrap.slots;
      } catch {
        setStatus(appointmentForm, words.loadingError);
      }
    } else {
      setStatus(appointmentForm, words.requestUnavailable);
    }
    if (slots.length) {
      const first = new Date(`${slots[0].starts_at}:00`);
      calendarMonth = new Date(first.getFullYear(), first.getMonth(), 1);
    }
    initializeUi();
    appointmentSubmit.disabled = true;
    renderCalendar();
  }

  start();
})();
