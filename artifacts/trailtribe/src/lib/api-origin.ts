export const APP_BASE_URL = (
  import.meta.env.VITE_API_ORIGIN ??
  import.meta.env.BASE_URL ??
  ""
).replace(/\/$/, "");