// Public base URL that printed QR codes point to.
// Set NEXT_PUBLIC_SITE_URL to an origin only (no path), e.g.
//   http://192.168.0.136:3000   (phones on the same Wi-Fi, local testing)
//   https://smartdine.example   (after deployment)
// Falls back to the address the dashboard is currently open on.
export function getPublicSiteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "http:" || url.protocol === "https:") return url.origin;
      console.warn("NEXT_PUBLIC_SITE_URL must use HTTP or HTTPS.");
    } catch {
      console.warn("NEXT_PUBLIC_SITE_URL is not a valid URL.");
    }
  }
  return typeof window === "undefined" ? "" : window.location.origin;
}

// True when the URL can only be opened on this computer, so a phone
// scanning the QR code would fail to load it.
export function isLocalOnly(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || hostname.endsWith(".localhost");
  } catch {
    return true;
  }
}

export function tableQrUrl(baseUrl: string, qrCodeId: string): string {
  return `${baseUrl}/r/${encodeURIComponent(qrCodeId)}`;
}
