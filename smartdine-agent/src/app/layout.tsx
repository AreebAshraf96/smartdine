import type { ReactNode } from "react";
export const metadata = { title: "SmartDine Agent", description: "AI customer service for home-based restaurants" };
export default function RootLayout({ children }: { children: ReactNode }) { return <html lang="en"><body style={{ margin: 0, background: "#fafafa", color: "#111" }}>{children}</body></html>; }
