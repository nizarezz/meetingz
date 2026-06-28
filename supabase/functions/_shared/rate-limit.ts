const store = new Map<string, number[]>();

const WINDOW_MS = 60 * 60 * 1000;

export function checkRateLimit(
  key: string,
  maxRequests: number = 10,
  label: string = "requests",
): void {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  let timestamps = store.get(key);
  if (!timestamps) {
    timestamps = [];
    store.set(key, timestamps);
  }

  const recent = timestamps.filter((t) => t > windowStart);

  if (recent.length >= maxRequests) {
    throw new Response(
      JSON.stringify({ error: `Too many ${label}. Try again later.` }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  recent.push(now);
  store.set(key, recent);
}
