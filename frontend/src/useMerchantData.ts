import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import type { Assessment, CaseBundle, MerchantProfile, NetworkGraph, Timeseries } from "./api";

export interface Loadable<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export interface MerchantData {
  profile: Loadable<MerchantProfile>;
  assessment: Loadable<Assessment>;
  timeseries: Loadable<Timeseries>;
  network: Loadable<NetworkGraph>;
  caseBundle: Loadable<CaseBundle>;
}

const idle = <T,>(): Loadable<T> => ({ data: null, error: null, loading: true });
const initial = (): MerchantData => ({
  profile: idle(),
  assessment: idle(),
  timeseries: idle(),
  network: idle(),
  caseBundle: idle(),
});

/**
 * Loads everything the console shows for one merchant. Each resource is loaded and
 * errors independently so a failing endpoint never blanks the whole view.
 * `reload(parts)` refreshes a subset while keeping the current data on screen.
 */
export function useMerchantData(merchantId: string | null) {
  const [state, setState] = useState<MerchantData>(initial);
  const generation = useRef(0);

  const load = useCallback(
    (parts: (keyof MerchantData)[], keepData: boolean) => {
      if (!merchantId) return Promise.resolve();
      const gen = generation.current;
      const fetchers: { [K in keyof MerchantData]: () => Promise<NonNullable<MerchantData[K]["data"]>> } = {
        profile: () => api.merchant(merchantId),
        assessment: () => api.assessment(merchantId),
        timeseries: () => api.timeseries(merchantId),
        network: () => api.network(merchantId),
        caseBundle: () => api.caseBundle(merchantId),
      };
      setState((s) => {
        const next = { ...s };
        for (const p of parts) next[p] = { data: keepData ? s[p].data : null, error: null, loading: true } as never;
        return next;
      });
      return Promise.all(
        parts.map((p) =>
          fetchers[p]().then(
            (data) => {
              if (generation.current !== gen) return;
              setState((s) => ({ ...s, [p]: { data, error: null, loading: false } }));
            },
            (e: Error) => {
              if (generation.current !== gen) return;
              setState((s) => ({ ...s, [p]: { data: keepData ? s[p].data : null, error: e.message, loading: false } }));
            },
          ),
        ),
      ).then(() => undefined);
    },
    [merchantId],
  );

  useEffect(() => {
    generation.current += 1;
    setState(initial());
    void load(["profile", "assessment", "timeseries", "network", "caseBundle"], false);
  }, [load]);

  const reload = useCallback(
    (parts: (keyof MerchantData)[] = ["profile", "assessment", "timeseries", "network", "caseBundle"]) => load(parts, true),
    [load],
  );

  return { ...state, reload };
}
