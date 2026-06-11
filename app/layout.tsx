import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Marketing Influence Dashboard",
  description:
    "Marketing contribution to pipeline and deals — HubSpot deal companies matched to marketing touchpoints",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
