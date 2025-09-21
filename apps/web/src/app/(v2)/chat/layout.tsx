import type { Metadata } from "next";
import "../../globals.css";
import React, { Suspense } from "react";

export const metadata: Metadata = {
  title: "PwC Code Assistant - Chat",
  description: "PwC AI development chat interface",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>;
}
