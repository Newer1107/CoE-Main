/**
 * Portal (profile hub) layout — no hackathon sub-navigation.
 * The profile page is the user's own surface, so it renders without the
 * "Hackathons | Browse Events | Opportunities | Learning" bar. Top padding
 * only offsets the global navbar (notice ticker ~32px + main navbar ~72/80px).
 */
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-surface pt-[104px] md:pt-[112px]">
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
