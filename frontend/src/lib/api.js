const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

export async function getRates({ base = "USD", symbols, signal } = {}) {
  const params = new URLSearchParams({ base });
  if (symbols?.length) params.set("symbols", symbols.join(","));

  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/rates?${params.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal,
    });
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw new Error(
      "Cannot reach the rates service. Check that the backend is running and try again.",
    );
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload?.error?.message || `The rates service returned HTTP ${response.status}.`;
    const error = new Error(message);
    error.status = response.status;
    error.code = payload?.error?.code;
    throw error;
  }

  if (!payload?.rates || typeof payload.rates !== "object") {
    throw new Error("The rates service returned an unexpected response.");
  }

  return payload;
}
