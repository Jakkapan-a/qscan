import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cn } from "@/lib/utils";
import { ScanProvider } from "./_components/provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "QScan: TLS & Security Header Scanner",
  description: "Check TLS versions, post-quantum ML-KEM support, SSL certificates and HTTP security headers.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={cn(geistSans.variable, geistMono.variable, "h-full antialiased")}>
      {/* @container/content drives the width breakpoints used by <Main> */}
      <body className="@container/content flex min-h-full flex-col">
        <ScanProvider>{children}</ScanProvider>
      </body>
    </html>
  );
}
