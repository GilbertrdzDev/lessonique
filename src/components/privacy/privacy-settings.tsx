"use client";

import { Dialog } from "@base-ui/react/dialog";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { usePrivacyConsent } from "./privacy-provider";
import { ClassroomStorageClearError } from "@/features/privacy/clear-classroom-data";

export function PrivacySettingsButton({ onClearClassroom }: Readonly<{ onClearClassroom?: () => Promise<void> }> = {}) {
  const { store, snapshot } = usePrivacyConsent();
  const [open, setOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<string>();
  const clearClassroom = async () => {
    if (!onClearClassroom) return;
    setClearing(true);
    setMessage(undefined);
    try {
      await onClearClassroom();
      setConfirmClear(false);
      setMessage("Classroom data cleared from this tab. Your theme and privacy choice were kept. Other open classroom tabs may have their own active data.");
    } catch (error) {
      setMessage(error instanceof ClassroomStorageClearError ? error.message : "The classroom could not be reset. Try again before clearing saved recovery data.");
    } finally { setClearing(false); }
  };
  return (
    <Dialog.Root open={open} onOpenChange={(value) => { setOpen(value); if (!value) { setConfirmClear(false); setMessage(undefined); } }}>
      <Dialog.Trigger render={<Button size="sm" variant="outline" />}>
        <ShieldCheck aria-hidden="true" />Privacy settings
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[100] bg-background/70 backdrop-blur-sm" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-[101] max-h-[calc(100dvh-2rem)] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border bg-popover p-6 text-popover-foreground shadow-floating outline-none">
          <Dialog.Title className="text-xl font-semibold">Privacy settings</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">Choose whether to share anonymous visit statistics. Rejecting analytics keeps learning features available. Essential hosting, browser storage, and communication with your connected learning agent are separate.</Dialog.Description>
          <p className="mt-4 text-sm" role="status">Analytics: {snapshot.record?.choice === "accepted" ? "accepted" : snapshot.record?.choice === "rejected" ? "rejected" : "not enabled"}</p>
          {snapshot.memoryOnly ? <p className="mt-2 text-xs text-muted-foreground">Your browser could not save this preference. It applies only to this page session.</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" size="lg" onClick={() => store.choose("accepted")}>Accept analytics</Button>
            <Button variant="outline" size="lg" onClick={() => store.choose("rejected")}>Reject analytics</Button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">You can withdraw permission here at any time. This stops future analytics; it does not erase statistics already collected. An adult should manage privacy choices for supervised children.</p>
          <nav aria-label="Privacy information" className="mt-4 flex flex-wrap gap-4 text-sm text-primary underline underline-offset-4">
            <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>
            <a href="/storage" target="_blank" rel="noopener noreferrer">Storage &amp; Analytics</a>
          </nav>
          {onClearClassroom ? <div className="mt-5 border-t pt-4">
            {confirmClear ? <>
              <p className="mb-3 text-sm">Delete this tab&apos;s files, code, lesson, progress, and temporary activity? This cannot be undone.</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="destructive" size="lg" disabled={clearing} onClick={() => void clearClassroom()}>{clearing ? "Clearing…" : "Confirm clear classroom data"}</Button>
                <Button variant="outline" size="lg" disabled={clearing} onClick={() => setConfirmClear(false)}>Cancel</Button>
              </div>
            </> : <Button variant="outline" size="lg" onClick={() => setConfirmClear(true)}>Clear classroom data</Button>}
          </div> : null}
          {message ? <p role="status" className="mt-3 text-sm">{message}</p> : null}
          <Dialog.Close render={<Button variant="ghost" className="mt-5" />}>Close</Dialog.Close>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
