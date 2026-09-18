const STORE = {
  timeZone: "Asia/Jerusalem",
  sheets: {
    settings: "Settings",
    products: "Products",
    availability: "Availability",
    orders: "Orders",
    appointments: "Appointments"
  },
  headers: {
    settings: ["key", "value", "description"],
    products: ["id", "slug", "category", "nameEn", "nameHe", "subtitleEn", "subtitleHe", "descriptionEn", "descriptionHe", "price", "imageUrls", "badgeEn", "badgeHe", "inventory", "active", "sortOrder"],
    availability: ["id", "startsAt", "endsAt", "location", "status", "closureReason", "appointmentNumber"],
    orders: ["orderNumber", "submittedAt", "name", "email", "phone", "language", "currency", "total", "itemsJson", "status", "requestId"],
    appointments: ["appointmentNumber", "submittedAt", "slotId", "startsAt", "endsAt", "location", "name", "email", "phone", "occasion", "message", "language", "status", "requestId"]
  }
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Ruth Talia Store")
    .addItem("Set up store sheets", "setupStore")
    .addItem("Generate next 12 weeks", "generateAvailability")
    .addToUi();
}

function setupStore() {
  const spreadsheet = SpreadsheetApp.getActive();
  spreadsheet.setSpreadsheetTimeZone(STORE.timeZone);
  Object.keys(STORE.sheets).forEach(key => {
    ensureSheet_(spreadsheet, STORE.sheets[key], STORE.headers[key]);
  });
  seedSettings_();
  seedProducts_();
  generateAvailability();
  SpreadsheetApp.getUi().alert("Store sheets are ready. Edit Settings and Products, then deploy the script as a web app.");
}

function generateAvailability() {
  const sheet = getSheet_("availability");
  const existing = new Set(readRows_(sheet).map(row => String(row.id)));
  const rows = [];
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 84);

  for (let date = new Date(now.getFullYear(), now.getMonth(), now.getDate()); date < end; date.setDate(date.getDate() + 1)) {
    const day = date.getDay();
    if (day === 5 || day === 6) continue;
    for (let hour = 10; hour < 18; hour += 1) {
      if (hour === 13) continue;
      const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, 0, 0);
      if (start <= now) continue;
      const finish = new Date(start.getTime() + 60 * 60 * 1000);
      const id = Utilities.formatDate(start, STORE.timeZone, "yyyy-MM-dd'T'HH:mm");
      if (!existing.has(id)) {
        rows.push([id, start, finish, "atelier", "OPEN", "", ""]);
        existing.add(id);
      }
    }
  }
  if (rows.length) sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
}

function doGet(event) {
  try {
    const action = String(event && event.parameter && event.parameter.action || "bootstrap");
    let result;
    if (action === "health") result = {ok: true, service: "ruth-talia-sheets"};
    else if (action === "requestStatus") result = requestStatus_(event.parameter.requestId);
    else if (action === "bootstrap") {
      result = {ok: true, products: publicProducts_(), slots: publicSlots_()};
    } else throw new Error("Unknown action.");
    return output_(result, event && event.parameter && event.parameter.prefix);
  } catch (error) {
    console.error(error);
    return output_({ok: false, error: safeError_(error)}, event && event.parameter && event.parameter.prefix);
  }
}

function doPost(event) {
  let requestId = "";
  try {
    const payload = JSON.parse(event && event.postData && event.postData.contents || "{}");
    requestId = String((payload.customer || payload.appointment || {}).requestId || "");
    validateRequestId_(requestId);
    validateHumanRequest_(payload.customer || payload.appointment || {});
    let result;
    if (payload.action === "createOrder") result = withLock_(() => createOrder_(payload));
    else if (payload.action === "createAppointment") result = withLock_(() => createAppointment_(payload));
    else throw new Error("Unknown action.");
    cacheRequestStatus_(requestId, {ok: true, status: "complete", result});
    return output_(result);
  } catch (error) {
    console.error(error);
    if (/^[A-Za-z0-9-]{16,100}$/.test(requestId)) {
      cacheRequestStatus_(requestId, {ok: true, status: "failed", error: safeError_(error)});
    }
    return output_({ok: false, error: safeError_(error)});
  }
}

function createOrder_(payload) {
  const customer = payload.customer || {};
  validateCustomer_(customer);
  const requestId = requireText_(customer.requestId, "Request ID", 100);
  const orders = getSheet_("orders");
  const previous = findRow_(orders, "requestId", requestId);
  if (previous) return {ok: true, orderNumber: previous.orderNumber, duplicate: true};
  throttle_(customer.email, "order");

  const catalog = new Map(publicProducts_().map(product => [String(product.id), product]));
  if (!Array.isArray(payload.items) || !payload.items.length) throw new Error("The order is empty.");
  let total = 0;
  const items = payload.items.map(item => {
    const product = catalog.get(String(item.productId));
    const quantity = Math.max(1, Math.min(10, Number(item.quantity) || 1));
    const size = requireText_(item.size, "Size", 20);
    if (!product || product.price === null) throw new Error("One of the selected products is unavailable.");
    if (product.inventory > 0 && quantity > product.inventory) throw new Error("The requested quantity is unavailable.");
    total += product.price * quantity;
    return {
      productId: product.id,
      slug: product.slug,
      nameEn: product.nameEn,
      nameHe: product.nameHe,
      size,
      quantity,
      unitPrice: product.price
    };
  });

  const orderNumber = reference_("RT");
  orders.appendRow([
    orderNumber,
    new Date(),
    cleanText_(customer.name, 120),
    normalizeEmail_(customer.email),
    cleanText_(customer.phone, 50),
    cleanText_(customer.language || "en", 5),
    "ILS",
    total,
    JSON.stringify(items),
    "NEW",
    requestId
  ]);
  const mail = sendOrderEmail_(orderNumber, customer, items, total);
  return {ok: true, orderNumber, total, emailDelivered: mail.delivered, emailWarning: mail.warning};
}

function createAppointment_(payload) {
  const appointment = payload.appointment || {};
  validateCustomer_(appointment);
  const requestId = requireText_(appointment.requestId, "Request ID", 100);
  const appointments = getSheet_("appointments");
  const previous = findRow_(appointments, "requestId", requestId);
  if (previous) return {ok: true, appointmentNumber: previous.appointmentNumber, duplicate: true};
  throttle_(appointment.email, "appointment");

  const slotId = requireText_(appointment.slotId, "Appointment time", 100);
  const availability = getSheet_("availability");
  const slot = findRow_(availability, "id", slotId);
  if (!slot || String(slot.status).toUpperCase() !== "OPEN") {
    throw new Error("That appointment time is no longer available. Please choose another time.");
  }
  const startsAt = asDate_(slot.startsAt);
  if (startsAt <= new Date()) throw new Error("That appointment time has already passed.");

  const appointmentNumber = reference_("AP");
  appointments.appendRow([
    appointmentNumber,
    new Date(),
    slotId,
    startsAt,
    asDate_(slot.endsAt),
    cleanText_(slot.location || "atelier", 30),
    cleanText_(appointment.name, 120),
    normalizeEmail_(appointment.email),
    cleanText_(appointment.phone, 50),
    cleanText_(appointment.occasion, 50),
    cleanText_(appointment.message, 2000),
    cleanText_(appointment.language || "en", 5),
    "NEW",
    requestId
  ]);
  availability.getRange(slot._rowNumber, STORE.headers.availability.indexOf("status") + 1).setValue("BOOKED");
  availability.getRange(slot._rowNumber, STORE.headers.availability.indexOf("appointmentNumber") + 1).setValue(appointmentNumber);
  const mail = sendAppointmentEmail_(appointmentNumber, appointment, slot);
  return {ok: true, appointmentNumber, emailDelivered: mail.delivered, emailWarning: mail.warning};
}

function publicProducts_() {
  return readRows_(getSheet_("products"))
    .filter(row => truthy_(row.active))
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0))
    .map(row => ({
      id: Number(row.id),
      slug: String(row.slug || ""),
      category: String(row.category || ""),
      nameEn: String(row.nameEn || ""),
      nameHe: String(row.nameHe || ""),
      subtitleEn: String(row.subtitleEn || ""),
      subtitleHe: String(row.subtitleHe || ""),
      descriptionEn: String(row.descriptionEn || ""),
      descriptionHe: String(row.descriptionHe || ""),
      price: row.price === "" ? null : Number(row.price),
      imageUrls: parseImages_(row.imageUrls),
      badgeEn: String(row.badgeEn || ""),
      badgeHe: String(row.badgeHe || ""),
      inventory: Number(row.inventory || 0),
      active: true
    }));
}

function publicSlots_() {
  return readRows_(getSheet_("availability"))
    .filter(row => String(row.status).toUpperCase() === "OPEN" && asDate_(row.startsAt) > new Date())
    .sort((left, right) => asDate_(left.startsAt) - asDate_(right.startsAt))
    .map(row => ({
      id: String(row.id),
      starts_at: Utilities.formatDate(asDate_(row.startsAt), STORE.timeZone, "yyyy-MM-dd'T'HH:mm"),
      ends_at: Utilities.formatDate(asDate_(row.endsAt), STORE.timeZone, "yyyy-MM-dd'T'HH:mm"),
      location: String(row.location || "atelier")
    }));
}

function sendOrderEmail_(number, customer, items, total) {
  const settings = settings_();
  const language = String(customer.language) === "he" ? "he" : "en";
  const customerLines = items.map(item =>
    `${language === "he" ? item.nameHe : item.nameEn} | ${item.size} | ${item.quantity} × ₪${item.unitPrice}`
  ).join("\n");
  const ownerBody = `New order request ${number}\n\nName: ${cleanText_(customer.name, 120)}\nEmail: ${normalizeEmail_(customer.email)}\nPhone: ${cleanText_(customer.phone, 50)}\n\n${customerLines}\n\nTotal: ₪${total}`;
  const customerBody = language === "he"
    ? `תודה שפנית לרות טליה קוטור.\nבקשת ההזמנה ${number} התקבלה. רות תיצור איתך קשר לפני כל תשלום.`
    : `Thank you for contacting Ruth Talia Couture.\nYour order request ${number} was received. Ruth will contact you before any payment.`;
  return sendNotifications_(settings.notifyEmail, normalizeEmail_(customer.email), `Order request ${number}`, ownerBody, customerBody);
}

function sendAppointmentEmail_(number, appointment, slot) {
  const settings = settings_();
  const language = String(appointment.language) === "he" ? "he" : "en";
  const formatted = Utilities.formatDate(asDate_(slot.startsAt), STORE.timeZone, "dd/MM/yyyy HH:mm");
  const ownerBody = `New appointment ${number}\n\nDate: ${formatted}\nName: ${cleanText_(appointment.name, 120)}\nEmail: ${normalizeEmail_(appointment.email)}\nPhone: ${cleanText_(appointment.phone, 50)}\nOccasion: ${cleanText_(appointment.occasion, 50)}\nMessage: ${cleanText_(appointment.message, 2000)}`;
  const customerBody = language === "he"
    ? `הפגישה שלך עם רות טליה נשמרה ל-${formatted}.\nמספר הפגישה: ${number}`
    : `Your Ruth Talia appointment is reserved for ${formatted}.\nAppointment number: ${number}`;
  return sendNotifications_(settings.notifyEmail, normalizeEmail_(appointment.email), `Appointment ${number}`, ownerBody, customerBody);
}

function sendNotifications_(owner, customer, subject, ownerBody, customerBody) {
  if (!owner || String(owner).includes("example.com")) {
    return {delivered: false, warning: "Set notifyEmail in the Settings sheet to enable email."};
  }
  try {
    MailApp.sendEmail(owner, `[Ruth Talia] ${subject}`, ownerBody);
    MailApp.sendEmail(customer, `Ruth Talia Couture — ${subject}`, customerBody);
    return {delivered: true, warning: ""};
  } catch (error) {
    console.error(error);
    return {delivered: false, warning: "The request was saved, but email delivery failed."};
  }
}

function validateHumanRequest_(data) {
  if (String(data.website || "").trim()) throw new Error("Request rejected.");
  const startedAt = Number(data.startedAt);
  const age = Date.now() - startedAt;
  if (!startedAt || age < 2000 || age > 24 * 60 * 60 * 1000) throw new Error("Please refresh the page and try again.");
}

function validateCustomer_(data) {
  requireText_(data.name, "Name", 120);
  normalizeEmail_(data.email);
  requireText_(data.phone, "Phone", 50);
}

function validateRequestId_(value) {
  if (!/^[A-Za-z0-9-]{16,100}$/.test(String(value))) throw new Error("The request identifier is invalid.");
}

function requestStatus_(requestId) {
  validateRequestId_(requestId);
  const cached = CacheService.getScriptCache().get(`request:${requestId}`);
  return cached ? JSON.parse(cached) : {ok: true, status: "pending"};
}

function cacheRequestStatus_(requestId, result) {
  CacheService.getScriptCache().put(`request:${requestId}`, JSON.stringify(result), 300);
}

function throttle_(email, action) {
  const digest = Utilities.base64EncodeWebSafe(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    `${action}:${normalizeEmail_(email)}`
  )).slice(0, 32);
  const cache = CacheService.getScriptCache();
  if (cache.get(digest)) throw new Error("Please wait one minute before submitting another request.");
  cache.put(digest, "1", 60);
}

function withLock_(operation) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return operation();
  } finally {
    lock.releaseLock();
  }
}

function settings_() {
  const result = {};
  readRows_(getSheet_("settings")).forEach(row => {
    result[String(row.key)] = String(row.value || "");
  });
  return result;
}

function seedSettings_() {
  const sheet = getSheet_("settings");
  if (sheet.getLastRow() > 1) return;
  sheet.getRange(2, 1, 3, 3).setValues([
    ["notifyEmail", "ruth@example.com", "Replace with Ruth's email address"],
    ["brandName", "Ruth Talia Couture", "Used in notifications"],
    ["timeZone", STORE.timeZone, "Keep aligned with the spreadsheet time zone"]
  ]);
}

function seedProducts_() {
  const sheet = getSheet_("products");
  if (sheet.getLastRow() > 1) return;
  const products = [
    [1, "alma-gown", "bridal", "The Alma Gown", "שמלת אלמה", "Silk-crepe bridal gown", "שמלת כלה מקרפ משי", "A clean, sculpted neckline and fluid skirt create quiet drama. Built-in structure offers support without stiffness.", "מחשוף נקי ומפוסל וחצאית זורמת יוצרים דרמה שקטה. מבנה פנימי מעניק תמיכה ללא נוקשות.", 12800, "https://images.unsplash.com/photo-1594552072238-b8a33785b261?auto=format&fit=crop&w=1000&q=88|https://images.unsplash.com/photo-1519657337289-077653f724ed?auto=format&fit=crop&w=1000&q=88", "New", "חדש", 8, true, 1],
    [2, "noa-midnight", "evening", "Noa in Midnight", "נועה בחצות", "Draped evening dress", "שמלת ערב בדרייפינג", "Soft draping follows the body without clinging, finished with an asymmetric neckline and a subtle open back.", "דרייפינג רך עוקב אחר הגוף בלי להיצמד, עם מחשוף א־סימטרי וגב פתוח בעדינות.", 4650, "https://images.unsplash.com/photo-1566174053879-31528523f8ae?auto=format&fit=crop&w=1000&q=88|https://images.unsplash.com/photo-1539008835657-9e8e9680c956?auto=format&fit=crop&w=1000&q=88", "Signature", "סיגנצ׳ר", 12, true, 2],
    [3, "liora-dress", "signature", "The Liora Dress", "שמלת ליאורה", "Sculpted occasion dress", "שמלת אירוע מפוסלת", "A confident column silhouette with an architectural shoulder and movement through the skirt.", "צללית עמוד בטוחה עם כתף אדריכלית ותנועה רכה בחצאית.", 5250, "https://images.unsplash.com/photo-1539008835657-9e8e9680c956?auto=format&fit=crop&w=1000&q=88|https://images.unsplash.com/photo-1591369822096-ffd140ec948f?auto=format&fit=crop&w=1000&q=88", "Limited", "מהדורה מוגבלת", 6, true, 3],
    [4, "talia-couture", "bridal", "The Talia Gown", "שמלת טליה", "Made-to-measure bridal couture", "קוטור כלות בהתאמה אישית", "A made-to-measure statement gown developed through private fittings and hand-finished draping.", "שמלת הצהרה בהתאמה אישית, הנוצרת בסדרת מדידות ועם דרייפינג בעבודת יד.", "", "https://images.unsplash.com/photo-1519657337289-077653f724ed?auto=format&fit=crop&w=1000&q=88|https://images.unsplash.com/photo-1594552072238-b8a33785b261?auto=format&fit=crop&w=1000&q=88", "Couture", "קוטור", 0, true, 4],
    [5, "mila-ivory", "bridal", "Mila in Ivory", "מילה באייבורי", "Soft satin bridal gown", "שמלת כלה מסאטן רך", "A luminous satin gown with a softly shaped bodice, elegant waist definition, and a sweeping skirt designed for effortless movement.", "שמלת סאטן זוהרת עם מחוך רך, הדגשה אלגנטית של המותן וחצאית נשפכת שנועדה לתנועה טבעית.", 11900, "https://images.unsplash.com/photo-1544078751-58fee2d8a03b?auto=format&fit=crop&w=1000&q=88|https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1000&q=88", "Bridal", "כלות", 7, true, 5],
    [6, "eden-silk", "evening", "The Eden Dress", "שמלת עדן", "Fluid silk evening dress", "שמלת ערב ממשי זורם", "A refined silk silhouette with delicate gathering, a graceful neckline, and a skirt that moves beautifully from dinner to dancing.", "צללית משי מעודנת עם כיווצים עדינים, מחשוף אלגנטי וחצאית שנעה ביופי מארוחת הערב ועד הריקודים.", 4950, "https://images.unsplash.com/photo-1568252542512-9fe8fe9c87bb?auto=format&fit=crop&w=1000&q=88|https://images.unsplash.com/photo-1595777457583-95e059d581b8?auto=format&fit=crop&w=1000&q=88", "New", "חדש", 10, true, 6],
    [7, "maya-sculpted", "signature", "Maya Sculpted", "מאיה המפוסלת", "Modern structured occasion dress", "שמלת אירוע מודרנית ומובנית", "Modern tailoring meets feminine ease in a structured silhouette with a clean neckline and considered volume.", "חייטות מודרנית פוגשת רכות נשית בצללית מובנית, מחשוף נקי ונפח מדויק.", 5450, "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=1000&q=88|https://images.unsplash.com/photo-1485968579580-b6d095142e6e?auto=format&fit=crop&w=1000&q=88", "Studio Edit", "בחירת הסטודיו", 9, true, 7],
    [8, "leah-couture", "bridal", "Leah Couture", "לאה קוטור", "Hand-draped made-to-measure gown", "שמלת קוטור בדרייפינג ובהתאמה אישית", "A personal couture composition shaped during private fittings, with hand-draped fabric and finishing created for one woman only.", "יצירת קוטור אישית הנבנית במהלך מדידות פרטיות, עם בד המעוצב ביד וגימורים שנוצרו עבור אישה אחת בלבד.", "", "https://images.unsplash.com/photo-1591604466107-ec97de577aff?auto=format&fit=crop&w=1000&q=88|https://images.unsplash.com/photo-1595407753234-0882f1e77954?auto=format&fit=crop&w=1000&q=88", "Made to Measure", "בהתאמה אישית", 0, true, 8]
  ];
  sheet.getRange(2, 1, products.length, products[0].length).setValues(products);
}

function ensureSheet_(spreadsheet, name, headers) {
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) sheet.appendRow(headers);
  const actual = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  if (headers.some((header, index) => actual[index] !== header)) {
    throw new Error(`The ${name} sheet headers do not match the expected schema.`);
  }
  sheet.setFrozenRows(1);
  return sheet;
}

function getSheet_(key) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(STORE.sheets[key]);
  if (!sheet) throw new Error(`Missing ${STORE.sheets[key]} sheet. Run setupStore first.`);
  return sheet;
}

function readRows_(sheet) {
  if (sheet.getLastRow() < 2) return [];
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues().map((values, index) => {
    const row = {_rowNumber: index + 2};
    headers.forEach((header, column) => {
      row[header] = values[column];
    });
    return row;
  });
}

function findRow_(sheet, key, value) {
  return readRows_(sheet).find(row => String(row[key]) === String(value));
}

function parseImages_(value) {
  return String(value || "").split(/\r?\n|\s*\|\s*/).map(item => item.trim()).filter(item => /^https:\/\//i.test(item));
}

function truthy_(value) {
  return value === true || ["true", "yes", "1", "active"].includes(String(value).trim().toLowerCase());
}

function asDate_(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("An availability date is invalid.");
  return date;
}

function normalizeEmail_(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error("Enter a valid email address.");
  return email;
}

function requireText_(value, label, maximum) {
  const text = cleanText_(value, maximum);
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function cleanText_(value, maximum) {
  const text = String(value || "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, maximum);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function reference_(prefix) {
  return `${prefix}-${Utilities.formatDate(new Date(), STORE.timeZone, "yyyyMMdd")}-${Utilities.getUuid().slice(0, 8).toUpperCase()}`;
}

function safeError_(error) {
  return error && error.message ? String(error.message) : "The request could not be completed.";
}

function output_(value, prefix) {
  if (prefix) {
    if (!/^[A-Za-z_$][A-Za-z0-9_$]{0,100}$/.test(String(prefix))) throw new Error("Invalid callback.");
    return ContentService.createTextOutput(`${prefix}(${JSON.stringify(value)})`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
