import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from "react";

/**
 * Form state that can be seeded from server data, but is never overwritten by a
 * background refetch once the user has typed into it.
 *
 * Background refetches (React Query's refetch-on-window-focus, realtime updates,
 * manual invalidations) hand us a fresh object on every tab switch. Hydrating
 * blindly from that object wipes in-progress input. `hydrate()` therefore only
 * applies while the field is still pristine; `set()` marks it dirty.
 *
 * After a successful submit, call `resetDirty()` (optionally with a fresh value)
 * so the form can pick up server data again.
 */
export function useHydratedState<T>(initial: T) {
  const [value, setValue] = useState<T>(initial);
  const dirty = useRef(false);

  const set = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    dirty.current = true;
    setValue(next);
  }, []);

  const hydrate = useCallback((next: T) => {
    if (dirty.current) return;
    setValue(next);
  }, []);

  const resetDirty = useCallback((next?: T) => {
    dirty.current = false;
    if (next !== undefined) setValue(next);
  }, []);

  const isDirty = useCallback(() => dirty.current, []);

  return { value, set, hydrate, resetDirty, isDirty };
}
