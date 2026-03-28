import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { verifyAccessToken } from "@/lib/jwt";

export const metadata: Metadata = {
  title: "TCET Center of Excellence | Official Portal",
  description: "TCET Center of Excellence - Bridging academic theory and industrial application through rigorous research and development.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;

  let userRole: string | null = null;
  if (token) {
    try {
      userRole = verifyAccessToken(token).role;
    } catch {
      userRole = null;
    }
  }

  return (
    <html lang="en" className="scroll-smooth">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,200..800;1,6..72,200..800&family=Public+Sans:ital,wght@0,100..900;1,100..900&family=Inter:wght@100..900&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-surface font-body text-on-surface">
        <Navbar userRole={userRole} />
        {children}
        <Footer />
      </body>
    </html>
  );
}
