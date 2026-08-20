import { useAuth } from "@clerk/react";
import { useCallback } from "react";
import { fetchWithTimeout } from "@workspace/api-client-react";

export function useAuthedFetch() {
  const { getToken } = useAuth();

  return useCallback(
    async (url: string, options: RequestInit = {}): Promise<Response> => {
      const token = await getToken();
      const headers = new Headers(options.headers);
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      return fetchWithTimeout(url, { ...options, headers });
    },
    [getToken],
  );
}
