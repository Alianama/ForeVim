import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "ForeVim — VM Monitoring & Forecasting Platform",
  description:
    "Enterprise-grade VM monitoring, Prometheus metrics, AI forecasting, and real-time alerts.",
  keywords: "VM monitoring, Prometheus, observability, forecasting, DevOps",
  authors: [{ name: "ForeVim" }],
  robots: "noindex",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
