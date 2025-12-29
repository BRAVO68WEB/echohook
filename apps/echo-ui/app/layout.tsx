import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "EchoHook - Test & Inspect Webhooks",
  description: "Create temporary webhook endpoints to test and inspect incoming HTTP requests in real-time",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased h-screen flex flex-col overflow-hidden`}
        suppressHydrationWarning
      >
        <main className="flex-1 flex flex-col overflow-y-auto relative">
          {children}
        </main>
        <footer className="shrink-0 z-50 py-4 text-center text-sm text-zinc-500/80 dark:text-zinc-500/80 backdrop-blur-md border-t border-zinc-200/50 dark:border-zinc-800/50 bg-white/50 dark:bg-black/50">
          <p>
            Made with 💌 by{" "}
            <a
              href="https://github.com/BRAVO68WEB"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-black dark:text-zinc-300 hover:underline underline-offset-4 transition-all"
            >
              @bravo68web
            </a>
          </p>
        </footer>
      </body>
    </html>
  );
}
