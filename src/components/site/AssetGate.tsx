'use client';

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { DevelopingLoader } from './DevelopingLoader';
import { useGateTiming } from './useAssetsReady';

/**
 * The stills wall's hold-then-cascade, for a region whose media is scattered
 * across components the region does not render directly — the motion page's
 * rows inside its rolls, the home page's strip and clips.
 *
 * Where the wall knows up front how many frames it is waiting on, a region does
 * not, so each asset registers itself instead: the gate opens when everything
 * registered has settled. Registration happens in layout effects, which run
 * child-first, so by the time the gate's own layout effect marks it as having
 * looked, every asset in the first commit has already counted itself in — an
 * empty count before that point is only a gate that has not looked yet.
 *
 * The count lives in a small store rather than in state: assets register from
 * their effects, and a store is what an effect is meant to write to. It also
 * means sixty frames registering is sixty increments, not sixty renders.
 *
 * Two contexts rather than one: `register` is stable, and keeping it apart from
 * `showLoader` means the loader appearing does not re-run every asset's
 * registration effect — which would unregister and re-register assets that had
 * already settled, and shut the gate on them again.
 */

type Register = () => () => void;

function createGateStore() {
  let pending = 0;
  let looked = false;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((listener) => listener());

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    settled: () => looked && pending === 0,
    look() {
      looked = true;
      emit();
    },
    register: (() => {
      pending += 1;
      emit();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        pending -= 1;
        emit();
      };
    }) as Register,
  };
}

const serverSettled = () => false;

const RegisterContext = createContext<Register | null>(null);
const LoaderContext = createContext(false);

export function AssetGate({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [store] = useState(createGateStore);
  const settled = useSyncExternalStore(store.subscribe, store.settled, serverSettled);

  useLayoutEffect(() => store.look(), [store]);

  const { ready, showLoader } = useGateTiming(settled);

  return (
    <RegisterContext.Provider value={store.register}>
      <LoaderContext.Provider value={showLoader}>
        <div data-assets-loading={ready ? undefined : 'true'} className={className}>
          {children}
        </div>
      </LoaderContext.Provider>
    </RegisterContext.Provider>
  );
}

/**
 * Counts one asset into the enclosing gate, if there is one. Returns the handler
 * to pass to the asset's load *and* error events — a failed image has still
 * finished being waited for.
 *
 * `enabled` is for assets that may never load: anything lazy and far below the
 * fold would hold the gate until its cap, so callers enable only the ones a
 * visitor will see first.
 */
export function useGatedAsset(enabled = true): () => void {
  const register = useContext(RegisterContext);
  const release = useRef<(() => void) | null>(null);
  // An image already in the cache can fire its load before this asset's layout
  // effect has registered it — the ref callback that notices a complete image
  // runs earlier in the same commit. Remembered here, so the asset is never
  // counted in at all rather than counted in and never out.
  const settledEarly = useRef(false);

  useLayoutEffect(() => {
    if (!register || !enabled || settledEarly.current) return;
    const done = register();
    release.current = done;
    return () => {
      release.current = null;
      done();
    };
  }, [register, enabled]);

  return useCallback(() => {
    if (release.current) release.current();
    else settledEarly.current = true;
  }, []);
}

/**
 * Holds the gate shut while `active`, for a component that has assets to come
 * but has not rendered them yet — the home page's strip, which cannot place its
 * frames until it has measured its own width. Released in the same commit that
 * renders the frames, after they have registered (children's layout effects run
 * first), so the gate never sees an empty set in between.
 */
export function useGateHold(active: boolean) {
  const register = useContext(RegisterContext);
  useLayoutEffect(() => {
    if (!register || !active) return;
    return register();
  }, [register, active]);
}

/**
 * The enclosing gate's loader, wherever the caller puts it — over the strip on
 * the home page, over the first roll on /motion. Overlaid rather than in flow:
 * the content beneath is already laid out, only held at opacity 0. The caller
 * provides the positioned ancestor.
 */
export function GateLoader() {
  return useContext(LoaderContext) ? <DevelopingLoader overlay /> : null;
}
