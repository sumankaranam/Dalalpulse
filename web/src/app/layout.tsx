import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";

export const metadata: Metadata = {
  title: "DalalPulse — NSE Retail Sentiment Radar",
  description: "Personal, zero-cost retail sentiment intelligence pipeline for NSE equities.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DalalPulse",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0B0F19",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#0B0F19] text-slate-100 flex flex-col pb-20 sm:pb-8">
        <Navbar />
        <main className="flex-1 max-w-5xl w-full mx-auto p-4">{children}</main>
      </body>
    </html>
  );
}
