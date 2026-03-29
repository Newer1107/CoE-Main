import Link from "next/link";
import Image from "next/image";
import prisma from "@/lib/prisma";
import { getSignedUrl } from "@/lib/minio";
import NewsCard from "@/components/NewsModal";
import HeroCarousel, { type HeroSlide } from "@/components/HeroCarousel";
import NewOpportunitiesModal from "@/components/NewOpportunitiesModal";

type HomeNews = {
  id: number;
  title: string;
  caption: string;
  imageKey: string;
  publishedAt: Date;
  imageUrl: string | null;
};

type HeroSlideRecord = {
  id: number;
  title: string;
  caption: string;
  imageKey: string;
  imageUrl: string | null;
};

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatDate(dateInput: Date | string) {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  return dateFormatter.format(date);
}

export default async function HomePage() {
  const now = new Date();

  const [heroSlidesRaw, newsRaw, events, grants, announcements, openHackathons, openProblems] =
    await Promise.all([
      prisma.heroSlide.findMany({
        where: { isActive: true },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      prisma.newsPost.findMany({
        where: { isVisible: true },
        orderBy: { publishedAt: "desc" },
        take: 6,
      }),
      prisma.event.findMany({
        where: { isVisible: true, date: { gte: now } },
        orderBy: { date: "asc" },
        take: 6,
      }),
      prisma.grant.findMany({
        where: { isActive: true },
        orderBy: { deadline: "asc" },
        take: 8,
      }),
      prisma.announcement.findMany({
        where: { expiresAt: { gt: now } },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      prisma.hackathonEvent.findMany({
        where: { status: { in: ["ACTIVE", "UPCOMING"] } },
        orderBy: { startTime: "asc" },
        take: 5,
        select: { id: true, title: true, status: true, endTime: true },
      }),
      prisma.problem.findMany({
        where: {
          status: "OPENED",
          mode: "OPEN",
          eventId: null,
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          title: true,
          tags: true,
          _count: { select: { openSubmissions: true } },
        },
      }),
    ]);

  const news: HomeNews[] = await Promise.all(
    newsRaw.map(async (item) => ({
      ...item,
      imageUrl: await getSignedUrl(item.imageKey).catch(() => null),
    })),
  );

  const heroSlidesDb: HeroSlideRecord[] = await Promise.all(
    heroSlidesRaw.map(async (item) => ({
      ...item,
      imageUrl: await getSignedUrl(item.imageKey).catch(() => null),
    })),
  );

  const heroSlides: HeroSlide[] =
    heroSlidesDb.length > 0
      ? heroSlidesDb.slice(0, 5).map((item) => ({
        id: String(item.id),
        image: item.imageUrl || "/vercel.svg",
        title: item.title,
        description: item.caption,
      }))
      : [
        {
          id: "fallback",
          image: "/vercel.svg",
          title: "Welcome to the TCET Center of Excellence",
          description:
            "Live hero slides will appear here once admins publish them via the hero slides API.",
        },
      ];

  return (
    <main className="max-w-[1560px] mx-auto grid grid-cols-12 gap-0 min-h-screen pt-[100px] sm:pt-[108px] md:pt-[120px]">
      <NewOpportunitiesModal
        hackathons={openHackathons}
        problems={openProblems}
      />
      <div className="hidden lg:block col-span-1 border-r border-[#c4c6d3] bg-[#f5f4f0]">
        <div className="sticky top-12 flex justify-center pt-24">
          <div className="rotate-180 [writing-mode:vertical-lr] flex items-center gap-6 text-[#002155] opacity-40 font-['Inter'] text-[10px] tracking-[0.3em] uppercase">
            <span>ESTABLISHED 2001</span>
            <span className="w-12 h-[1px] bg-[#002155]" />
            <span>TCET COE DOMAIN</span>
          </div>
        </div>
      </div>

      <div className="col-span-12 md:col-span-9 lg:col-span-9 p-3 sm:p-4 md:p-8 lg:p-12 bg-[#fffefc] md:bg-white md:border-x border-[#d8dae6] md:shadow-[0_0_0_1px_rgba(0,33,85,0.03)]">
        <HeroCarousel slides={heroSlides} intervalMs={4000} />

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-10 md:mb-12 border-y border-[#c4c6d3] py-6 md:py-8 mt-12">
          <div>
            <div className="text-[#002155] font-headline text-2xl sm:text-3xl font-bold">
              {news.length}
            </div>
            <div className="text-xs uppercase tracking-widest text-[#747782]">
              Published News
            </div>
          </div>
          <div>
            <div className="text-[#002155] font-headline text-2xl sm:text-3xl font-bold">
              {events.length}
            </div>
            <div className="text-xs uppercase tracking-widest text-[#747782]">
              Upcoming Events
            </div>
          </div>
          <div>
            <div className="text-[#002155] font-headline text-2xl sm:text-3xl font-bold">
              {grants.length}
            </div>
            <div className="text-xs uppercase tracking-widest text-[#747782]">
              Active Grants
            </div>
          </div>
          <div>
            <div className="text-[#002155] font-headline text-2xl sm:text-3xl font-bold">
              {announcements.length}
            </div>
            <div className="text-xs uppercase tracking-widest text-[#747782]">
              Live Circulars
            </div>
          </div>
        </section>

        <section id="verticals" className="mb-14">
          <div className="border-l-4 border-[#002155] pl-4 md:pl-6 mb-6">
            <h2 className="text-3xl font-headline tracking-tight text-[#002155]">
              Verticals
            </h2>
            <p className="text-xs uppercase tracking-widest text-[#8c4f00] mt-1">
              Explore CoE Domains
            </p>
          </div>

          {(() => {
            const verticals = [
              {
                title: "Facility Booking",
                subtitle: "Reserve labs & resources",
                href: "/facility-booking",
                image: "/Faculty Booking.png",
              },
              {
                title: "Coding Platform",
                subtitle: "Practice & compete",
                href: "#",
                image: "/Coding Platform.png",
              },
              {
                title: "Project Showcase",
                subtitle: "Display innovations",
                href: "https://dash.raunakcodes.me",
                image: "/Project Showcase.png",
              },
              {
                title: "Content Creation",
                subtitle: "Share knowledge",
                href: "#",
                image: "/Content Creation.jpeg",
              },
              {
                title: "Hackathon",
                subtitle: "Build under pressure",
                href: "/innovation",
                image: "/Hackathon.jpeg",
              },
              {
                title: "Industry Internship",
                subtitle: "Real-world exposure",
                href: "#",
                image: "/Industry Internship.png",
              },
              {
                title: "Problem Statements",
                subtitle: "Solve real challenges",
                href: "/innovation/problems",
                image: "/Problem Statements.png",
              },
              {
                title: "Grants",
                subtitle: "Funding opportunities",
                href: "#",
                image: "/Grants.png",
              },
              {
                title: "MOU's",
                subtitle: "Strategic collaborations",
                href: "#",
                image: "/MOUs.jpeg",
              },
            ];

            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {verticals.map((item) => (
                  <Link key={item.title} href={item.href}>
                    <div className="relative h-48 md:h-56 border border-[#c4c6d3] overflow-hidden group bg-[#efeeea] cursor-pointer">
                      <Image
                        src={item.image}
                        alt={item.title}
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 ease-out"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-4 flex items-end justify-between">
                        <div>
                          <h3 className="text-white text-sm md:text-base font-semibold uppercase tracking-wide leading-tight">
                            {item.title}
                          </h3>
                          <p className="text-[10px] md:text-xs text-white/80 mt-1 tracking-wide">
                            {item.subtitle}
                          </p>
                        </div>
                        <span className="material-symbols-outlined text-white text-lg translate-x-0 group-hover:translate-x-1 transition-transform duration-300">
                          arrow_forward
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            );
          })()}
        </section>

        <section id="news" className="mb-14">
          <div className="border-l-4 border-[#002155] pl-4 md:pl-6 mb-6 flex justify-between items-end">
            <div>
              <h2 className="font-headline text-2xl sm:text-3xl text-[#002155] tracking-tight">
                In the Press
              </h2>
              <p className="text-xs uppercase tracking-widest text-[#8c4f00] mt-1">
                Live from GET /api/news
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {news.length === 0 ? (
              <p className="text-sm text-[#434651] border border-dashed border-[#c4c6d3] p-6 bg-white">
                No news posts are available.
              </p>
            ) : (
              news.map((item) => <NewsCard key={item.id} item={item} />)
            )}
          </div>
        </section>

        <section id="grants" className="mb-14">
          <div className="border-l-4 border-[#002155] pl-4 md:pl-6 mb-6">
            <h2 className="text-2xl sm:text-3xl font-headline tracking-tight text-[#002155]">
              Current Grant Opportunities
            </h2>
            <p className="text-sm text-[#747782] uppercase tracking-widest mt-1">
              Live from GET /api/grants
            </p>
          </div>
          <div className="overflow-x-auto border border-[#c4c6d3] bg-white">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr className="bg-[#002155] text-white text-[11px] uppercase tracking-widest text-left">
                  <th className="p-3 md:p-4 font-bold">Issuing Body</th>
                  <th className="p-3 md:p-4 font-bold">Grant</th>
                  <th className="p-3 md:p-4 font-bold">Category</th>
                  <th className="p-3 md:p-4 font-bold">Deadline</th>
                  <th className="p-3 md:p-4 font-bold">Reference</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {grants.length === 0 ? (
                  <tr>
                    <td className="p-3 md:p-4 text-[#434651]" colSpan={5}>
                      No active grants found.
                    </td>
                  </tr>
                ) : (
                  grants.map((grant, index) => (
                    <tr
                      key={grant.id}
                      className={`${index % 2 === 0 ? "bg-[#f5f4f0]" : "bg-white"} border-t border-[#c4c6d3]`}
                    >
                      <td className="p-3 md:p-4 font-semibold text-[#002155]">
                        {grant.issuingBody}
                      </td>
                      <td className="p-3 md:p-4">{grant.title}</td>
                      <td className="p-3 md:p-4">
                        {grant.category.replaceAll("_", " ")}
                      </td>
                      <td className="p-3 md:p-4">
                        {formatDate(grant.deadline)}
                      </td>
                      <td className="p-3 md:p-4">
                        {grant.referenceLink ? (
                          <a
                            className="text-[#8c4f00] font-bold underline"
                            href={grant.referenceLink}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open
                          </a>
                        ) : (
                          <span className="text-[#747782]">N/A</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section id="events" className="mb-10">
          <div className="border-l-4 border-[#002155] pl-4 md:pl-6 mb-6">
            <h2 className="text-2xl sm:text-3xl font-headline tracking-tight text-[#002155]">
              Upcoming Events
            </h2>
            <p className="text-sm text-[#747782] uppercase tracking-widest mt-1">
              Live from GET /api/events
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {events.length === 0 ? (
              <p className="text-sm text-[#434651] border border-dashed border-[#c4c6d3] p-6 bg-white">
                No upcoming events found.
              </p>
            ) : (
              events.map((event) => (
                <article
                  key={event.id}
                  className="border border-[#c4c6d3] bg-white p-5"
                >
                  <p className="text-xs uppercase tracking-widest text-[#8c4f00]">
                    {event.mode}
                  </p>
                  <h3 className="font-body font-semibold text-[#002155] mt-1">
                    {event.title}
                  </h3>
                  <p className="text-xs text-[#747782] mt-2">
                    {formatDate(event.date)}
                  </p>
                  <p className="text-sm text-[#434651] mt-2 line-clamp-3">
                    {event.description}
                  </p>
                  {event.registrationLink ? (
                    <a
                      href={event.registrationLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block mt-3 text-xs uppercase tracking-widest text-[#8c4f00] font-bold underline"
                    >
                      Registration Link
                    </a>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      <aside className="col-span-12 md:col-span-3 lg:col-span-2 border-t md:border-t-0 md:border-l border-[#c4c6d3] bg-[#f5f4f0] min-h-full">
        <div className="md:sticky md:top-[112px] flex flex-col gap-0">

          {/* Latest Circulars — halved height */}
          <div className="p-4">
            <div className="bg-[#002155] px-4 py-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-white text-[16px]">campaign</span>
              <h3 className="text-white text-[10px] font-bold uppercase tracking-widest">Latest Circulars</h3>
            </div>
            <div className="bg-white border-x border-b border-[#c4c6d3] h-[220px] overflow-y-auto custom-scrollbar">
              {announcements.length === 0 ? (
                <p className="px-4 py-3 text-xs text-[#434651]">No active announcements.</p>
              ) : (
                announcements.map((announcement) => (
                  <article key={announcement.id} className="px-4 py-3 border-b border-[#c4c6d3] hover:bg-[#faf9f5] transition-colors">
                    <span className="text-[9px] font-bold text-[#747782] uppercase tracking-tighter">
                      Expires {formatDate(announcement.expiresAt)}
                    </span>
                    <h4 className="font-body font-semibold text-[#002155] text-xs mt-0.5 leading-snug">
                      {announcement.text}
                    </h4>
                    {announcement.link ? (
                      <a
                        className="inline-flex items-center text-[9px] font-bold text-[#8c4f00] uppercase mt-1 tracking-widest"
                        href={announcement.link}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open Link
                      </a>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </div>

          {/* Open Innovation */}
          <div className="px-4 pb-4">
            <div className="bg-[#0b6b2e] px-4 py-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-white text-[16px]">rocket_launch</span>
              <h3 className="text-white text-[10px] font-bold uppercase tracking-widest">Open Innovation</h3>
            </div>
            <div className="bg-white border-x border-b border-[#c4c6d3]">

              {/* Open Hackathons */}
              <div className="border-b border-[#c4c6d3]">
                <div className="px-4 py-2 bg-[#eef0f5] flex items-center justify-between">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-[#002155]">Hackathons</span>
                  <Link href="/innovation/events" className="text-[9px] font-bold uppercase tracking-widest text-[#8c4f00] hover:underline">
                    View all
                  </Link>
                </div>
                {openHackathons.length === 0 ? (
                  <p className="px-4 py-3 text-[11px] text-[#747782]">No active hackathons.</p>
                ) : (
                  openHackathons.map((hackathon) => (
                    <Link key={hackathon.id} href={`/innovation/events/${hackathon.id}`}>
                      <article className="px-4 py-2.5 border-b border-[#f0efe9] last:border-b-0 hover:bg-[#faf9f5] transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-[11px] font-semibold text-[#002155] leading-snug line-clamp-2 flex-1">
                            {hackathon.title}
                          </h4>
                          <span className={`flex-shrink-0 text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 mt-0.5 ${hackathon.status === 'ACTIVE' ? 'bg-[#e6f4ec] text-[#0b6b2e]' : 'bg-[#fff3e0] text-[#8c4f00]'}`}>
                            {hackathon.status}
                          </span>
                        </div>
                        <p className="text-[9px] text-[#747782] mt-0.5">Ends {formatDate(hackathon.endTime)}</p>
                      </article>
                    </Link>
                  ))
                )}
              </div>

              {/* Open Problem Statements */}
              <div>
                <div className="px-4 py-2 bg-[#eef0f5] flex items-center justify-between">
                  <span className="text-[9px] font-bold uppercase tracking-widest text-[#002155]">Problem Statements</span>
                  <Link href="/innovation/problems" className="text-[9px] font-bold uppercase tracking-widest text-[#8c4f00] hover:underline">
                    View all
                  </Link>
                </div>
                {openProblems.length === 0 ? (
                  <p className="px-4 py-3 text-[11px] text-[#747782]">No open problem statements.</p>
                ) : (
                  openProblems.map((problem) => (
                    <Link key={problem.id} href="/innovation/problems">
                      <article className="px-4 py-2.5 border-b border-[#f0efe9] last:border-b-0 hover:bg-[#faf9f5] transition-colors">
                        <h4 className="text-[11px] font-semibold text-[#002155] leading-snug line-clamp-2">
                          {problem.title}
                        </h4>
                        <div className="flex items-center justify-between mt-0.5">
                          {problem.tags ? (
                            <span className="text-[9px] text-[#747782] truncate max-w-[65%]">
                              {problem.tags.split(',')[0].trim()}
                            </span>
                          ) : <span />}
                          <span className="text-[9px] font-bold text-[#0b6b2e]">
                            {problem._count.openSubmissions} registered
                          </span>
                        </div>
                      </article>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="px-4 pb-4 space-y-2">
            {[
              { href: "/facility-booking", label: "Booking Portal", title: "Lab Seat Reservation" },
              { href: "/faculty", label: "Faculty Desk", title: "Publish Content" },
              { href: "/innovation", label: "Innovation Hub", title: "Problems & Hackathons" },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="border-l-2 border-[#8c4f00] pl-3 py-2 bg-white border border-[#c4c6d3] flex items-center justify-between group"
              >
                <div>
                  <span className="text-[8px] font-bold text-[#747782] uppercase tracking-widest">{link.label}</span>
                  <h5 className="text-[10px] font-bold text-[#002155] uppercase leading-tight">{link.title}</h5>
                </div>
                <span className="material-symbols-outlined text-[#8c4f00] text-[16px] mr-1 group-hover:translate-x-1 transition-transform">
                  arrow_forward
                </span>
              </Link>
            ))}
          </div>

        </div>
      </aside>
    </main>
  );
}