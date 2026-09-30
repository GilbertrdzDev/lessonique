import type { BeforeSendEvent } from "@vercel/analytics";

export const PRIVACY_STORAGE_KEY = "lessonique.privacy.v1";
export const PRIVACY_NOTICE_VERSION = "1";
export const CONSENT_DURATION_MS = 180 * 24 * 60 * 60 * 1_000;

export type AnalyticsChoice = "accepted" | "rejected";
export type ConsentRecord = Readonly<{
  choice: AnalyticsChoice;
  noticeVersion: string;
  decidedAt: number;
  expiresAt: number;
}>;
export type ConsentSnapshot = Readonly<{
  ready: boolean;
  record: ConsentRecord | null;
  dismissed: boolean;
  memoryOnly: boolean;
}>;
type ConsentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const INITIAL_SNAPSHOT: ConsentSnapshot = {
  ready: false, record: null, dismissed: false, memoryOnly: false,
};

export function parseConsent(serialized: string | null, now: number): ConsentRecord | null {
  if (!serialized || serialized.length > 1_000) return null;
  try {
    const record: unknown = JSON.parse(serialized);
    if (!record || typeof record !== "object") return null;
    const value = record as Record<string, unknown>;
    if (
      (value.choice !== "accepted" && value.choice !== "rejected") ||
      value.noticeVersion !== PRIVACY_NOTICE_VERSION ||
      typeof value.decidedAt !== "number" || !Number.isFinite(value.decidedAt) ||
      typeof value.expiresAt !== "number" || !Number.isFinite(value.expiresAt) ||
      value.decidedAt > now || value.decidedAt < 0 ||
      value.expiresAt !== value.decidedAt + CONSENT_DURATION_MS || value.expiresAt <= now
    ) return null;
    return {
      choice: value.choice, noticeVersion: value.noticeVersion,
      decidedAt: value.decidedAt, expiresAt: value.expiresAt,
    };
  } catch { return null; }
}

export class ConsentStore {
  readonly #storage: () => ConsentStorage;
  readonly #now: () => number;
  readonly #listeners = new Set<() => void>();
  #snapshot = INITIAL_SNAPSHOT;

  constructor(storage: () => ConsentStorage, now: () => number = Date.now) {
    this.#storage = storage;
    this.#now = now;
  }

  getSnapshot = (): ConsentSnapshot => this.#snapshot;
  getServerSnapshot = (): ConsentSnapshot => INITIAL_SNAPSHOT;
  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  };

  refresh = (): void => {
    try {
      const storage = this.#storage();
      const serialized = storage.getItem(PRIVACY_STORAGE_KEY);
      const record = parseConsent(serialized, this.#now());
      if (serialized && !record) storage.removeItem(PRIVACY_STORAGE_KEY);
      this.#update({ ready: true, record, dismissed: this.#snapshot.dismissed, memoryOnly: false });
    } catch {
      this.#update({ ready: true, record: null, dismissed: this.#snapshot.dismissed, memoryOnly: true });
    }
  };

  expire = (): void => {
    if (this.#snapshot.memoryOnly) {
      if ((this.#snapshot.record?.expiresAt ?? 0) <= this.#now()) {
        this.#update({ ...this.#snapshot, record: null, dismissed: false });
      }
    } else { this.refresh(); }
  };

  choose = (choice: AnalyticsChoice): void => {
    const decidedAt = this.#now();
    const record: ConsentRecord = {
      choice, noticeVersion: PRIVACY_NOTICE_VERSION, decidedAt,
      expiresAt: decidedAt + CONSENT_DURATION_MS,
    };
    let memoryOnly = false;
    try { this.#storage().setItem(PRIVACY_STORAGE_KEY, JSON.stringify(record)); }
    catch {
      memoryOnly = true;
      try { this.#storage().removeItem(PRIVACY_STORAGE_KEY); } catch { /* Storage is unavailable. */ }
    }
    this.#update({ ready: true, record, dismissed: false, memoryOnly });
  };

  dismiss = (): void => { this.#update({ ...this.#snapshot, dismissed: true }); };

  isAnalyticsAllowed = (): boolean => {
    if (!this.#snapshot.ready) return false;
    if (this.#snapshot.memoryOnly) {
      return this.#snapshot.record?.choice === "accepted" && this.#snapshot.record.expiresAt > this.#now();
    }
    try {
      return parseConsent(this.#storage().getItem(PRIVACY_STORAGE_KEY), this.#now())?.choice === "accepted";
    } catch { return false; }
  };

  filterEvent = (event: BeforeSendEvent): BeforeSendEvent | null => {
    if (!this.isAnalyticsAllowed() || event.type !== "pageview") return null;
    try {
      const url = new URL(event.url);
      if (!["/", "/privacy", "/storage"].includes(url.pathname)) return null;
      url.search = "";
      url.hash = "";
      return { type: "pageview", url: url.href };
    } catch { return null; }
  };

  #update(snapshot: ConsentSnapshot): void {
    if (JSON.stringify(snapshot) === JSON.stringify(this.#snapshot)) return;
    this.#snapshot = snapshot;
    this.#listeners.forEach((listener) => listener());
  }
}
