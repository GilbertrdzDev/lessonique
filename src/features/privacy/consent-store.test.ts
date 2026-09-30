import { describe, expect, it } from "vitest";

import { CONSENT_DURATION_MS, ConsentStore, parseConsent, PRIVACY_NOTICE_VERSION, PRIVACY_STORAGE_KEY } from "./consent-store";

function setup() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
  let now = 1_000_000;
  const store = new ConsentStore(() => storage, () => now);
  return { values, store, storage, advance: (amount: number) => { now += amount; } };
}

describe("analytics consent", () => {
  it("fails closed before hydration, on missing data, dismissal, and rejection", () => {
    const { store } = setup();
    expect(store.isAnalyticsAllowed()).toBe(false);
    store.refresh();
    store.dismiss();
    expect(store.getSnapshot().dismissed).toBe(true);
    expect(store.isAnalyticsAllowed()).toBe(false);
    store.choose("rejected");
    expect(store.isAnalyticsAllowed()).toBe(false);
  });

  it("remembers either choice and sanitizes only public page views", () => {
    const { store, storage } = setup();
    store.refresh();
    store.choose("accepted");
    const restored = new ConsentStore(() => storage, () => 1_000_000);
    restored.refresh();
    expect(restored.isAnalyticsAllowed()).toBe(true);
    expect(restored.filterEvent({ type: "pageview", url: "https://lessonique.com/privacy?email=private#code" }))
      .toEqual({ type: "pageview", url: "https://lessonique.com/privacy" });
    expect(restored.filterEvent({ type: "event", url: "https://lessonique.com/" })).toBeNull();
    expect(restored.filterEvent({ type: "pageview", url: "https://lessonique.com/person/private" })).toBeNull();
    expect(restored.filterEvent({ type: "pageview", url: "invalid" })).toBeNull();
    restored.choose("rejected");
    store.refresh();
    expect(store.getSnapshot().record?.choice).toBe("rejected");
  });

  it("rechecks stored consent at send time before cross-tab events are delivered", () => {
    const { store, storage } = setup();
    store.refresh();
    store.choose("accepted");
    const other = new ConsentStore(() => storage, () => 1_000_000);
    other.refresh();
    other.choose("rejected");
    expect(store.filterEvent({ type: "pageview", url: "https://lessonique.com/" })).toBeNull();
    storage.removeItem(PRIVACY_STORAGE_KEY);
    expect(store.isAnalyticsAllowed()).toBe(false);
    store.refresh();
    expect(store.getSnapshot().record).toBeNull();
  });

  it("expires consent exactly at 180 days even before UI refresh", () => {
    const { store, advance } = setup();
    store.refresh();
    store.choose("accepted");
    advance(CONSENT_DURATION_MS - 1);
    expect(store.isAnalyticsAllowed()).toBe(true);
    advance(1);
    expect(store.isAnalyticsAllowed()).toBe(false);
    store.expire();
    expect(store.getSnapshot().record).toBeNull();
  });

  it("rejects corrupt, future, old-version, and excessive-duration records", () => {
    const valid = { choice: "accepted", noticeVersion: PRIVACY_NOTICE_VERSION, decidedAt: 1_000, expiresAt: 1_000 + CONSENT_DURATION_MS };
    for (const record of [null, "garbage", "[]", JSON.stringify({ ...valid, noticeVersion: "old" }), JSON.stringify({ ...valid, decidedAt: 3_000 }), JSON.stringify({ ...valid, expiresAt: valid.expiresAt + 1 }), JSON.stringify({ ...valid, choice: "yes" })]) {
      expect(parseConsent(record, 2_000)).toBeNull();
    }
  });

  it("keeps a session-only choice when storage cannot be accessed", () => {
    let now = 1_000;
    const store = new ConsentStore(() => { throw new Error("storage blocked"); }, () => now);
    store.refresh();
    expect(store.isAnalyticsAllowed()).toBe(false);
    store.choose("accepted");
    expect(store.getSnapshot().memoryOnly).toBe(true);
    expect(store.isAnalyticsAllowed()).toBe(true);
    store.expire();
    expect(store.isAnalyticsAllowed()).toBe(true);
    store.choose("rejected");
    expect(store.isAnalyticsAllowed()).toBe(false);
    store.choose("accepted");
    now += CONSENT_DURATION_MS;
    store.expire();
    expect(store.isAnalyticsAllowed()).toBe(false);
  });

  it("fails closed if storage becomes unreadable after acceptance", () => {
    const { storage } = setup();
    let blocked = false;
    const store = new ConsentStore(() => { if (blocked) throw new Error("blocked"); return storage; }, () => 1_000);
    store.refresh();
    store.choose("accepted");
    blocked = true;
    expect(store.isAnalyticsAllowed()).toBe(false);
  });
});
