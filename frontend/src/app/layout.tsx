import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DissectTune",
  description: "AI-powered multi-track mashup & stem-mixing platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-deck-bg text-gray-100 min-h-screen">{children}</body>
    </html>
  );
}
