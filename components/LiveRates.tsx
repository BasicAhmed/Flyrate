"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { subscribeLiveRates, type RateRow } from "@/lib/rates";
import { subscribeDisabledFlows } from "@/lib/flows";

interface Live {
  rates: RateRow[];
  disabledFlows: string[];
}

const LiveRatesContext = createContext<Live | null>(null);

/** Starts from the server-rendered prices (instant first paint), then keeps
 *  them live: any change saved in /admin or by the daily cron reaches every
 *  open page within a second, no reload. The listener attaches just after
 *  first paint so it never delays the page becoming usable. */
export function LiveRatesProvider({
  initialRates,
  initialFlows,
  children,
}: {
  initialRates: RateRow[];
  initialFlows: string[];
  children: React.ReactNode;
}) {
  const [rates, setRates] = useState(initialRates);
  const [disabledFlows, setDisabledFlows] = useState(initialFlows);

  // A fresh server render (router refresh / revalidation) wins over old state
  useEffect(() => setRates(initialRates), [initialRates]);
  useEffect(() => setDisabledFlows(initialFlows), [initialFlows]);

  useEffect(() => {
    let offRates = () => {};
    let offFlows = () => {};
    const start = () => {
      offRates = subscribeLiveRates(setRates);
      offFlows = subscribeDisabledFlows(setDisabledFlows);
    };
    const timer = window.setTimeout(start, 400);
    return () => {
      window.clearTimeout(timer);
      offRates();
      offFlows();
    };
  }, []);

  return <LiveRatesContext.Provider value={{ rates, disabledFlows }}>{children}</LiveRatesContext.Provider>;
}

/** Live values when inside the provider; otherwise the props passed in. */
export function useLiveRates(fallbackRates: RateRow[], fallbackFlows: string[] = []): Live {
  const live = useContext(LiveRatesContext);
  return live ?? { rates: fallbackRates, disabledFlows: fallbackFlows };
}
