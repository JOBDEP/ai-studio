import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Studio",
  description: "Prompt-driven AI image & video generation, powered by fal.ai + Claude.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
