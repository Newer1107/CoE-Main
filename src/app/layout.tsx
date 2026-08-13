import type { Metadata } from "next";
import { cookies } from "next/headers";
import { GoogleAnalytics } from "@next/third-parties/google";
import GoogleOneTap from "@/components/GoogleOneTap";
import "./globals.css";

import Navbar from "@/components/Navbar";
import ImpersonationBanner from "@/components/ImpersonationBanner";
import Footer from "@/components/Footer";
import { ProfileCompletionModal } from "@/components/ProfileCompletionModal";
import { FacultyProfileCompletionModal } from "@/components/FacultyProfileCompletionModal";
import { verifyAccessToken } from "@/lib/jwt";
import prisma from "@/lib/prisma";
import { ToastProvider } from "@/components/ToastProvider";

export const metadata: Metadata = {
  title: "TCET Centre of Excellence | Official Portal",
  description: "TCET Centre of Excellence - Bridging academic theory and industrial application through rigorous research and development.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;

  let user: { name: string; email: string; role: string; uid?: string; isImpersonating?: boolean } | null = null;
  let impersonationBannerData: {
    isImpersonating: boolean;
    impersonatedBy: { name: string; email: string } | null;
    impersonatingAs: { name: string; email: string; role: string; uid?: string | null } | null;
  } | null = null;

  if (token) {
    try {
      const payload = verifyAccessToken(token);
      user = {
        name: payload.name,
        email: payload.email,
        role: payload.role,
        uid: payload.uid,
      };

      // Detect impersonation from token
      if (payload.isImpersonating && payload.impersonation?.sessionId) {
        try {
          const session = await prisma.impersonationSession.findUnique({
            where: { id: payload.impersonation.sessionId },
          });

          if (session) {
            const [adminUser, targetUser] = await Promise.all([
              prisma.user.findUnique({
                where: { id: session.adminId },
                select: { name: true, email: true },
              }),
              prisma.user.findUnique({
                where: { id: session.targetUserId },
                select: { name: true, email: true, role: true, uid: true },
              }),
            ]);

            impersonationBannerData = {
              isImpersonating: true,
              impersonatedBy: adminUser
                ? { name: adminUser.name, email: adminUser.email }
                : null,
              impersonatingAs: targetUser
                ? {
                    name: targetUser.name,
                    email: targetUser.email,
                    role: targetUser.role,
                    uid: targetUser.uid,
                  }
                : null,
            };
            user.isImpersonating = true;
          }
        } catch {
          // Session lookup failed — continue without impersonation data
        }
      }
    } catch {
      user = null;
    }
  }

  const isPrincipalUser = user?.email
    ? (process.env.PRINCIPAL_EMAILS ?? '').split(',').map(e => e.trim().toLowerCase()).includes(user.email.toLowerCase())
    : false;

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
        <ToastProvider>
          <ImpersonationBanner
            isImpersonating={impersonationBannerData?.isImpersonating ?? false}
            impersonatedBy={impersonationBannerData?.impersonatedBy ?? null}
            impersonatingAs={impersonationBannerData?.impersonatingAs ?? null}
          />
          <Navbar user={user} />
          {children}
          {user?.role === 'STUDENT' && <ProfileCompletionModal />}
          {user?.role === 'FACULTY' && !isPrincipalUser && <FacultyProfileCompletionModal />}
          <Footer />
        </ToastProvider>
        {process.env.NEXT_PUBLIC_GA_ID && (
          <GoogleAnalytics gaId={process.env.NEXT_PUBLIC_GA_ID} />
        )}
        {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && !user && (
          <GoogleOneTap clientId={process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID} />
        )}
      </body>
    </html>
  );
}
