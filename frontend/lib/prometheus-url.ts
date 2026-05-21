/**
 * Normalisasi input URL/IP Prometheus ke format http://host:port
 */
export function normalizePrometheusUrl(input: string): string {
  let url = input.trim();
  if (!url) return url;

  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }

  try {
    const parsed = new URL(url);
    if (!parsed.port) {
      parsed.port = "9090";
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return url;
  }
}
