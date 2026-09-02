import { useCallback } from "react";

export function useAuthedFetch() {
  return useCallback((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init), []);
}