async function installAppEventCapture(page) {
  await page.addInitScript(() => {
    window.__E2E_APP_EVENTS = [];
    const pushEvent = (type) => (event) => {
      try {
        window.__E2E_APP_EVENTS.push({
          type,
          detail: event?.detail || null,
        });
      } catch {}
    };
    window.addEventListener("trainer:intake-commit", pushEvent("trainer:intake-commit"));
    window.addEventListener("trainer:analytics", pushEvent("trainer:analytics"));
  });
}

async function getAppEvents(page) {
  return page.evaluate(() => Array.isArray(window.__E2E_APP_EVENTS) ? window.__E2E_APP_EVENTS : []);
}

module.exports = {
  getAppEvents,
  installAppEventCapture,
};
