import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Resume Co-Pilot",
  description: "Privacy-first conversational resume builder",
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

