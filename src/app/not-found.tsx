import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-13rem)] max-w-3xl flex-col items-center justify-center px-4 pb-16 pt-[100px] text-center sm:pt-[108px] md:pt-[120px]">
      <p className="font-headline text-[120px] font-bold leading-none tracking-tight text-[#002155] md:text-[160px]">
        4<span className="text-[#fd9923]">0</span>4
      </p>
      <p className="mt-2 font-headline text-2xl font-bold text-[#002155] md:text-3xl">
        This page wandered off campus
      </p>
      <p className="mt-3 max-w-md text-sm text-[#434651] md:text-base">
        The page you are looking for doesn&apos;t exist, was moved, or never made it
        past the review queue.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/"
          className="bg-[#002155] px-6 py-3 text-xs font-bold uppercase tracking-wider text-white transition-opacity hover:opacity-90"
        >
          Back to Home
        </Link>
        <Link
          href="/hackathons/browse"
          className="border border-[#002155] px-6 py-3 text-xs font-bold uppercase tracking-wider text-[#002155] transition-colors hover:bg-[#002155] hover:text-white"
        >
          Browse Hackathons
        </Link>
      </div>
    </main>
  );
}
