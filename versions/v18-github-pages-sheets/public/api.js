(() => {
  class StoreApi {
    constructor(config = {}) {
      this.apiUrl = String(config.apiUrl || "").trim();
    }

    get configured() {
      return this.apiUrl.startsWith("https://script.google.com/");
    }

    jsonp(parameters) {
      return new Promise((resolve, reject) => {
        const callback = `ruthTaliaJsonp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const script = document.createElement("script");
        const timeout = setTimeout(() => finish(new Error("The service did not respond.")), 8000);
        const finish = (error, value) => {
          clearTimeout(timeout);
          script.remove();
          delete window[callback];
          if (error) reject(error);
          else if (!value || value.ok === false) reject(new Error(value?.error || "The service returned an invalid response."));
          else resolve(value);
        };
        window[callback] = value => finish(null, value);
        script.onerror = () => finish(new Error("The service could not be reached."));
        const url = new URL(this.apiUrl);
        Object.entries({...parameters, prefix: callback, _: Date.now()}).forEach(([key, value]) => {
          url.searchParams.set(key, value);
        });
        script.src = url.href;
        document.head.append(script);
      });
    }

    bootstrap() {
      return this.configured ? this.jsonp({action: "bootstrap"}) : Promise.resolve(null);
    }

    async requestStatus(requestId) {
      for (let attempt = 0; attempt < 15; attempt += 1) {
        await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 400 : 800));
        const result = await this.jsonp({action: "requestStatus", requestId});
        if (result.status === "complete") return result.result;
        if (result.status === "failed") throw new Error(result.error || "The request failed.");
      }
      throw new Error("The request may still be processing. Contact Ruth before submitting it again.");
    }

    async submit(action, payload) {
      if (!this.configured) {
        throw new Error("Online requests are not connected yet. Configure the Google Apps Script URL.");
      }
      const requestId = payload.customer?.requestId || payload.appointment?.requestId;
      if (!requestId) throw new Error("The request identifier is missing.");
      await fetch(this.apiUrl, {
        method: "POST",
        mode: "no-cors",
        redirect: "follow",
        headers: {"Content-Type": "text/plain;charset=utf-8"},
        body: JSON.stringify({action, ...payload})
      });
      return this.requestStatus(requestId);
    }
  }

  window.StoreApi = StoreApi;
})();
