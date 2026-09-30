"use client";

import { Analytics } from "@vercel/analytics/next";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";

import { ConsentStore, PRIVACY_STORAGE_KEY } from "@/features/privacy/consent-store";
import { Button } from "@/components/ui/button";

const PrivacyContext = createContext<ConsentStore | null>(null);

export function usePrivacyConsent() {
  const store = useContext(PrivacyContext);
  if (!store) throw new Error("PrivacyProvider is required.");
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return { store, snapshot };
}

function ConsentAnalytics() {
  const { store, snapshot } = usePrivacyConsent();
  useEffect(() => {
    if (!snapshot.record) return;
    let timer: ReturnType<typeof setTimeout>;
    const expiresAt = snapshot.record.expiresAt;
    const checkExpiry = () => {
      const remaining = expiresAt - Date.now();
      if (remaining <= 0) store.expire();
      else timer = setTimeout(checkExpiry, Math.min(2_147_483_647, remaining));
    };
    checkExpiry();
    return () => clearTimeout(timer);
  }, [store, snapshot]);
  return snapshot.record?.choice === "accepted" && store.isAnalyticsAllowed()
    ? <Analytics beforeSend={store.filterEvent} /> : null;
}

function ConsentBanner() {
  const { store, snapshot } = usePrivacyConsent();
  if (!snapshot.ready || snapshot.record || snapshot.dismissed) return null;
  return (
    <section aria-label="Analytics choice" className="border-b bg-card px-4 py-3 text-sm" data-scene-obstruction="true">
      <div className="mx-auto flex max-w-[120rem] flex-wrap items-center justify-between gap-3">
        <div className="max-w-2xl">
          <p className="font-semibold">Help improve Lessonique with optional analytics</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground md:hidden">With your permission, Vercel counts anonymous visits and page views. Your classroom works with either choice. Learning features and hosting process data separately.</p>
          <div className="mt-1 flex gap-4 text-xs underline underline-offset-4">
            <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>
            <a href="/storage" target="_blank" rel="noopener noreferrer">Storage &amp; Analytics</a>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="lg" variant="outline" onClick={() => store.choose("accepted")}>Accept analytics</Button>
          <Button size="lg" variant="outline" onClick={() => store.choose("rejected")}>Reject analytics</Button>
          <Button size="lg" variant="ghost" onClick={store.dismiss}>Decide later</Button>
        </div>
      </div>
    </section>
  );
}

export function PrivacyProvider({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const [store] = useState(() => new ConsentStore(() => window.localStorage));
  useEffect(() => {
    store.refresh();
    const onStorage = (event: StorageEvent) => {
      if (event.key !== PRIVACY_STORAGE_KEY && event.key !== null) return;
      try {
        if (event.storageArea === window.localStorage) store.refresh();
      } catch {
        store.refresh();
      }
    };
    const onFocus = () => { store.expire(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
    };
  }, [store]);
  return (
    <PrivacyContext.Provider value={store}>
      <div className={pathname === "/" ? "flex h-dvh flex-col" : undefined}>
        <ConsentBanner />
        <div className={pathname === "/" ? "min-h-0 flex-1" : undefined}>{children}</div>
      </div>
      <ConsentAnalytics />
    </PrivacyContext.Provider>
  );
}
