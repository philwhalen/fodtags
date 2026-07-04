import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FOD Tags Aggregator",
  description: "Field of Dreams Club Championship — standings, ratings, and OLP pot leaders.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
