const { test, expect } = require("@playwright/test");

const {
  bootAppWithSupabaseSeeds,
  makeSession,
  makeSignedInPayload,
  mockSupabaseRuntime,
} = require("./auth-runtime-test-helpers.js");
const {
  SURFACE_CLARITY_CONTRACT,
  CONSUMER_SURFACE_BANNED_REGEX_SOURCES,
} = require("../src/services/surface-clarity-contract.js");

const normalizeSurfaceText = (value = "") => String(value || "").replace(/\s+/g, " ").trim();

async function bootSignedInSurface(page, payloadOverride = null) {
  const session = makeSession();
  const payload = payloadOverride || makeSignedInPayload();
  await mockSupabaseRuntime(page, { session, payload });
  await bootAppWithSupabaseSeeds(page, { session, payload });
  await expect(page.getByTestId("app-root")).toHaveAttribute("data-onboarding-complete", "true");
  await expect(page.getByTestId("today-tab")).toBeVisible();
}

const navigateToSurface = async (page, contract) => {
  await page.getByTestId(contract.tabTestId).click({ force: true });
  const root = page.getByTestId(contract.rootTestId);
  await expect(root).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  return root;
};

const readVisibleViewportTextMetrics = async (locator) => locator.evaluate((node) => {
  const isVisible = (element) => {
    if (!element) return false;
    if (element.closest("details:not([open])")) return false;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || 1) === 0) return false;
    if (!element.getClientRects().length) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
  };

  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
    acceptNode(textNode) {
      const textContent = textNode && typeof textNode.textContent === "string" ? textNode.textContent : "";
      if (!String(textContent || "").trim()) return NodeFilter.FILTER_REJECT;
      const parent = textNode.parentElement;
      return isVisible(parent) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });

  const chunks = [];
  while (walker.nextNode()) {
    chunks.push(String(walker.currentNode.textContent || "").replace(/\s+/g, " ").trim());
  }

  const text = chunks.join(" ").replace(/\s+/g, " ").trim();
  return {
    text,
    wordCount: text ? text.split(/\s+/).filter(Boolean).length : 0,
  };
});

const readVisibleActionButtons = async (locator, actionTestIds) => locator.evaluate((node, allowedTestIds) => {
  const isVisible = (element) => {
    if (!element) return false;
    if (element.closest("details:not([open])")) return false;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || 1) === 0) return false;
    if (!element.getClientRects().length) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
  };

  return Array.from(node.querySelectorAll("button"))
    .filter((button) => {
      const testId = button.getAttribute("data-testid") || "";
      return allowedTestIds.includes(testId) && isVisible(button);
    })
    .map((button) => ({
      testId: button.getAttribute("data-testid") || "",
      label: String(button.innerText || button.textContent || "").replace(/\s+/g, " ").trim(),
      isPrimary: button.classList.contains("btn-primary"),
    }));
}, actionTestIds);

const countVisibleByTestId = async (locator, testId) => locator.evaluate((node, targetTestId) => {
  const isVisible = (element) => {
    if (!element) return false;
    if (element.closest("details:not([open])")) return false;
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity || 1) === 0) return false;
    if (!element.getClientRects().length) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight && rect.right > 0 && rect.left < window.innerWidth;
  };

  return Array.from(node.querySelectorAll(`[data-testid="${targetTestId}"]`)).filter(isVisible).length;
}, testId);

test.describe("surface clarity guard", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
  });

  test("today, program, log, and coach keep first-load clarity on mobile", async ({ page }) => {
    const BANNED_VISIBLE_PATTERNS = CONSUMER_SURFACE_BANNED_REGEX_SOURCES.map((entry) => new RegExp(entry.source, entry.flags));
    await bootSignedInSurface(page);

    for (const contract of Object.values(SURFACE_CLARITY_CONTRACT)) {
      const root = await navigateToSurface(page, contract);

      await expect(page.getByTestId(contract.primaryActionTestId)).toBeVisible();
      await expect(page.getByTestId(contract.primaryActionTestId)).toHaveClass(/btn-primary/);

      const actionButtons = await readVisibleActionButtons(root, contract.actionLayerTestIds);
      const primaryButtons = actionButtons.filter((button) => button.isPrimary);
      expect(primaryButtons.length, `${contract.label} should not stack multiple loud primary CTAs above the fold`).toBeLessThanOrEqual(contract.primaryButtonBudget.maxVisible);
      if (primaryButtons.length) {
        expect(primaryButtons[0]?.testId, `${contract.label} should anchor the visible primary CTA to the expected action`).toBe(contract.primaryActionTestId);
      }

      for (const disclosureTestId of contract.collapsedDisclosureTestIds) {
        const disclosure = page.getByTestId(disclosureTestId);
        if (await disclosure.count()) {
          await expect(disclosure, `${contract.label} should keep ${disclosureTestId} collapsed on first load`).toHaveJSProperty("open", false);
        }
      }

      for (const budget of contract.visibleCountBudgets) {
        const visibleCount = await countVisibleByTestId(root, budget.testId);
        expect(visibleCount, `${contract.label} should keep ${budget.testId} inside its visible-count guardrail`).toBeGreaterThanOrEqual(budget.minVisible);
        expect(visibleCount, `${contract.label} should keep ${budget.testId} inside its visible-count guardrail`).toBeLessThanOrEqual(budget.maxVisible);
      }

      const textMetrics = await readVisibleViewportTextMetrics(root);
      expect(textMetrics.wordCount, `${contract.label} exceeded its first-load mobile text budget`).toBeLessThanOrEqual(contract.visibleWordBudget);
      for (const pattern of BANNED_VISIBLE_PATTERNS) {
        expect(textMetrics.text, `${contract.label} leaked internal language on first load`).not.toMatch(pattern);
      }
    }
  });

  test("today, plan, and coach keep the same current-day label and reason while Log stays execution-focused", async ({ page }) => {
    const payload = makeSignedInPayload();
    payload.personalization.settings.trainingPreferences.intensityPreference = "Aggressive";
    await bootSignedInSurface(page, payload);

    const surfaceSnapshots = {};
    for (const surfaceId of ["today", "program", "coach"]) {
      const contract = SURFACE_CLARITY_CONTRACT[surfaceId];
      const root = await navigateToSurface(page, contract);
      if (contract.reasonDisclosureTestId) {
        await page.getByTestId(contract.reasonDisclosureTestId).locator("summary").click();
      }
      surfaceSnapshots[surfaceId] = {
        label: normalizeSurfaceText(await root.getByTestId(contract.labelTestId).innerText()),
        reason: normalizeSurfaceText(await root.getByTestId(contract.reasonTestId).innerText()),
      };
    }

    const baseline = surfaceSnapshots.today;
    expect(baseline.label.length).toBeGreaterThan(3);
    expect(baseline.reason).toMatch(/aggressive preference/i);

    for (const surfaceId of ["program", "coach"]) {
      expect(surfaceSnapshots[surfaceId].label, `${surfaceId} drifted from Today's current-day label`).toBe(baseline.label);
      expect(surfaceSnapshots[surfaceId].reason, `${surfaceId} drifted away from Today's current-day reason`).toMatch(/aggressive preference/i);
      expect(
        surfaceSnapshots[surfaceId].reason.includes(baseline.reason) || baseline.reason.includes(surfaceSnapshots[surfaceId].reason),
        `${surfaceId} no longer carries the same core reason as Today`
      ).toBe(true);
    }

    const logContract = SURFACE_CLARITY_CONTRACT.log;
    const logRoot = await navigateToSurface(page, logContract);
    const logSnapshot = {
      label: normalizeSurfaceText(await logRoot.getByTestId(logContract.labelTestId).innerText()),
      reason: normalizeSurfaceText(await logRoot.getByTestId(logContract.reasonTestId).innerText()),
    };

    expect(logSnapshot.label, "log drifted from Today's current-day label").toBe(baseline.label);
    expect(logSnapshot.reason).toMatch(/prescribed loaded/i);
    expect(logSnapshot.reason).toMatch(/used later/i);
  });
});
