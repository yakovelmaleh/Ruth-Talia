(() => {
  const payload = {
    path: `${location.pathname}${location.search}`,
    language: document.documentElement.lang,
    referrer: document.referrer,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screenWidth: window.innerWidth
  };
  fetch("/features/analytics/visit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true
  }).catch(() => {});
})();
