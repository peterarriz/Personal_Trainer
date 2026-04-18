import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSaveFeedbackModel,
  SAVE_FEEDBACK_PHASES,
} from "../src/services/save-feedback-service.js";
import {
  SYNC_STATE_IDS,
} from "../src/services/sync-state-service.js";

test("saved state stays quiet and confident when account sync is healthy", () => {
  const model = buildSaveFeedbackModel({
    phase: SAVE_FEEDBACK_PHASES.saved,
    syncState: {
      id: SYNC_STATE_IDS.synced,
      reasonKey: "synced",
    },
    savedAtLabel: "4:12 PM",
  });

  assert.equal(model.show, true);
  assert.equal(model.tone, "success");
  assert.equal(model.chipLabel, "Saved");
  assert.equal(model.title, "Saved 4:12 PM");
  assert.equal(model.detail, "Everything is up to date.");
});

test("retrying sync reframes saved work as local-first instead of ambiguous retrying", () => {
  const model = buildSaveFeedbackModel({
    phase: SAVE_FEEDBACK_PHASES.saved,
    syncState: {
      id: SYNC_STATE_IDS.retrying,
      reasonKey: "timeout",
    },
    savedAtLabel: "4:13 PM",
  });

  assert.equal(model.tone, "caution");
  assert.equal(model.chipLabel, "Saved here");
  assert.equal(model.detail, "We are still sending this to your account.");
  assert.match(model.support, /do not need to enter it again/i);
});

test("offline saves explain whether the user is offline or signed out", () => {
  const offlineModel = buildSaveFeedbackModel({
    phase: SAVE_FEEDBACK_PHASES.saved,
    syncState: {
      id: SYNC_STATE_IDS.offlineLocal,
      reasonKey: "browser_offline",
    },
    savedAtLabel: "4:14 PM",
  });
  const signedOutModel = buildSaveFeedbackModel({
    phase: SAVE_FEEDBACK_PHASES.saved,
    syncState: {
      id: SYNC_STATE_IDS.offlineLocal,
      reasonKey: "signed_out",
    },
    savedAtLabel: "4:14 PM",
  });

  assert.equal(offlineModel.chipLabel, "Saved offline");
  assert.match(offlineModel.support, /after you reconnect/i);
  assert.equal(signedOutModel.chipLabel, "Saved here");
  assert.match(signedOutModel.support, /sign in again/i);
});

test("save errors stay direct and actionable", () => {
  const model = buildSaveFeedbackModel({
    phase: SAVE_FEEDBACK_PHASES.error,
    errorMessage: "Save did not finish. Try again.",
  });

  assert.equal(model.tone, "critical");
  assert.equal(model.chipLabel, "Not saved");
  assert.equal(model.title, "Save did not finish");
  assert.equal(model.detail, "Save did not finish. Try again.");
});
