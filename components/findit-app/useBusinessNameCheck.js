"use client";

import { useEffect, useState } from "react";
import { api } from "./api";

// Debounced, soft "is this business name already in use" warning — shared
// by Login.jsx (seller signup), BecomeSeller.jsx, and AccountDetails.jsx
// (renaming later). Never blocks anything it's used in; see
// lib/auth.ts#isBusinessNameTaken for why a shared business name is an
// accepted case on FindIt, not an error — this is advisory only.
const DEBOUNCE_MS = 500;
const MIN_LENGTH = 2;

export function useBusinessNameTakenWarning(name, { skip = false } = {}) {
  const [taken, setTaken] = useState(false);

  useEffect(() => {
    const trimmed = name.trim();
    if (skip || trimmed.length < MIN_LENGTH) {
      setTaken(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      api
        .checkBusinessNameTaken(trimmed)
        .then((result) => {
          if (!cancelled) setTaken(Boolean(result));
        })
        .catch(() => {
          // Best-effort — a failed check just means no warning shows,
          // never a blocker.
          if (!cancelled) setTaken(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [name, skip]);

  return taken;
}
