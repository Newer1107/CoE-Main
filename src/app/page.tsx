import Link from "next/link";
import prisma from "@/lib/prisma";
import { getSignedUrl } from "@/lib/minio";

type HomeNews = {
  id: number;
  title: string;
  caption: string;
  imageKey: string;
  publishedAt: Date;
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

  const [newsRaw, events, grants, announcements] = await Promise.all([
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
  ]);

  const news: HomeNews[] = await Promise.all(
    newsRaw.map(async (item) => ({
      ...item,
      imageUrl: await getSignedUrl(item.imageKey).catch(() => null),
    }))
  );

  const heroImage = news[0]?.imageUrl || "/vercel.svg";

  return (
    <main className="max-w-[1440px] mx-auto grid grid-cols-12 gap-0 min-h-screen pt-[100px] md:pt-[120px]">
      <div className="hidden md:flex col-span-1 border-r border-[#c4c6d3] items-start justify-center pt-12 md:pt-24 bg-[#f5f4f0]">
        <div className="rotate-180 [writing-mode:vertical-lr] flex items-center gap-6 text-[#002155] opacity-40 font-['Inter'] text-[10px] tracking-[0.3em] uppercase">
          <span>ESTABLISHED 2001</span>
          <span className="w-12 h-[1px] bg-[#002155]" />
          <span>TCET COE DOMAIN</span>
        </div>
      </div>

      <div className="col-span-12 md:col-span-8 p-4 md:p-12">
        <section className="mb-12">
          <div className="bg-[#e3e2df] aspect-[21/9] w-full overflow-hidden relative border border-[#c4c6d3]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="w-full h-full object-cover grayscale-[20%] hover:grayscale-0 transition-all duration-700"
              alt="TCET CoE highlights"
              src={heroImage}
            />
            <div className="absolute bottom-0 left-0 right-0 bg-[#002155]/90 text-white p-3 text-xs font-['Inter'] tracking-wide uppercase">
              Dynamic portal feed: live news, grants, events and announcements
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12 border-y border-[#c4c6d3] py-8">
          <div>
            <div className="text-[#002155] font-headline text-3xl font-bold">{news.length}</div>
            <div className="text-xs uppercase tracking-widest text-[#747782]">Published News</div>
          </div>
          <div>
            <div className="text-[#002155] font-headline text-3xl font-bold">{events.length}</div>
            <div className="text-xs uppercase tracking-widest text-[#747782]">Upcoming Events</div>
          </div>
          <div>
            <div className="text-[#002155] font-headline text-3xl font-bold">{grants.length}</div>
            <div className="text-xs uppercase tracking-widest text-[#747782]">Active Grants</div>
          </div>
          <div>
            <div className="text-[#002155] font-headline text-3xl font-bold">{announcements.length}</div>
            <div className="text-xs uppercase tracking-widest text-[#747782]">Live Circulars</div>
          </div>
        </section>

        <section className="mb-14">
          <div className="border-l-4 border-[#002155] pl-4 md:pl-6 mb-6 flex justify-between items-end">
            <div>
              <h2 className="font-headline text-3xl text-[#002155] tracking-tight">In the Press</h2>
              <p className="text-xs uppercase tracking-widest text-[#8c4f00] mt-1">Live from GET /api/news</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {news.length === 0 ? (
              <p className="text-sm text-[#434651] border border-dashed border-[#c4c6d3] p-6 bg-white">No news posts are available.</p>
            ) : (
              news.map((item) => (
                <article key={item.id} className="border border-[#c4c6d3] bg-white group">
                  <div className="w-full h-44 bg-[#efeeea] overflow-hidden relative border-b border-[#c4c6d3]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      className="w-full h-full object-cover grayscale opacity-85 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-500"
                      alt={item.title}
                      src={item.imageUrl || "/vercel.svg"}
                    />
                    <div className="absolute top-3 left-3 bg-[#002155] text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1">
                      {formatDate(item.publishedAt)}
                    </div>
                  </div>
                  <div className="p-5">
                    <h3 className="font-body font-semibold text-[#002155] mb-2 leading-tight">{item.title}</h3>
                    <p className="text-sm text-[#434651] line-clamp-3">{item.caption}</p>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="mb-14">
          <div className="border-l-4 border-[#002155] pl-4 md:pl-6 mb-6">
            <h2 className="text-3xl font-headline tracking-tight text-[#002155]">Current Grant Opportunities</h2>
            <p className="text-sm text-[#747782] uppercase tracking-widest mt-1">Live from GET /api/grants</p>
          </div>
          <div className="overflow-x-auto border border-[#c4c6d3] bg-white">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#002155] text-white text-[11px] uppercase tracking-widest text-left">
                  <th className="p-4 font-bold">Issuing Body</th>
                  <th className="p-4 font-bold">Grant</th>
                  <th className="p-4 font-bold">Category</th>
                  <th className="p-4 font-bold">Deadline</th>
                  <th className="p-4 font-bold">Reference</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {grants.length === 0 ? (
                  <tr>
                    <td className="p-4 text-[#434651]" colSpan={5}>No active grants found.</td>
                  </tr>
                ) : (
                  grants.map((grant, index) => (
                    <tr key={grant.id} className={`${index % 2 === 0 ? "bg-[#f5f4f0]" : "bg-white"} border-t border-[#c4c6d3]`}>
                      <td className="p-4 font-semibold text-[#002155]">{grant.issuingBody}</td>
                      <td className="p-4">{grant.title}</td>
                      <td className="p-4">{grant.category.replaceAll("_", " ")}</td>
                      <td className="p-4">{formatDate(grant.deadline)}</td>
                      <td className="p-4">
                        {grant.referenceLink ? (
                          <a className="text-[#8c4f00] font-bold underline" href={grant.referenceLink} target="_blank" rel="noreferrer">
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

        <section className="mb-10">
          <div className="border-l-4 border-[#002155] pl-4 md:pl-6 mb-6">
            <h2 className="text-3xl font-headline tracking-tight text-[#002155]">Upcoming Events</h2>
            <p className="text-sm text-[#747782] uppercase tracking-widest mt-1">Live from GET /api/events</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {events.length === 0 ? (
              <p className="text-sm text-[#434651] border border-dashed border-[#c4c6d3] p-6 bg-white">No upcoming events found.</p>
            ) : (
              events.map((event) => (
                <article key={event.id} className="border border-[#c4c6d3] bg-white p-5">
                  <p className="text-xs uppercase tracking-widest text-[#8c4f00]">{event.mode}</p>
                  <h3 className="font-body font-semibold text-[#002155] mt-1">{event.title}</h3>
                  <p className="text-xs text-[#747782] mt-2">{formatDate(event.date)}</p>
                  <p className="text-sm text-[#434651] mt-2 line-clamp-3">{event.description}</p>
                  {event.registrationLink ? (
                    <a href={event.registrationLink} target="_blank" rel="noreferrer" className="inline-block mt-3 text-xs uppercase tracking-widest text-[#8c4f00] font-bold underline">
                      Registration Link
                    </a>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </section>
      </div>

      <aside className="col-span-12 md:col-span-3 border-t md:border-t-0 md:border-l border-[#c4c6d3] bg-[#f5f4f0] min-h-full">
        <div className="sticky top-[80px]">
          <div className="p-6">
            <div className="bg-[#002155] p-4 flex items-center gap-3">
              <span className="material-symbols-outlined text-white">campaign</span>
              <h3 className="text-white text-xs font-bold uppercase tracking-widest">Latest Circulars</h3>
            </div>
            <div className="bg-white border-x border-b border-[#c4c6d3] h-[520px] overflow-y-auto custom-scrollbar">
              {announcements.length === 0 ? (
                <p className="p-5 text-sm text-[#434651]">No active announcements.</p>
              ) : (
                announcements.map((announcement) => (
                  <article key={announcement.id} className="p-5 border-b border-[#c4c6d3] hover:bg-[#faf9f5] transition-colors">
                    <span className="text-[10px] font-bold text-[#747782] uppercase tracking-tighter">
                      Expires {formatDate(announcement.expiresAt)}
                    </span>
                    <h4 className="font-body font-semibold text-[#002155] text-sm mt-1 leading-tight">
                      {announcement.text}
                    </h4>
                    {announcement.link ? (
                      <a className="inline-flex items-center text-[10px] font-bold text-[#8c4f00] uppercase mt-2 tracking-widest" href={announcement.link} target="_blank" rel="noreferrer">
                        Open Link
                      </a>
                    ) : null}
                  </article>
                ))
              )}
            </div>
          </div>

          <div className="px-6 pb-6 space-y-3">
            <Link href="/facility-booking" className="border-l-2 border-[#8c4f00] pl-4 py-2 bg-white border border-[#c4c6d3] flex items-center justify-between group">
              <div>
                <span className="text-[9px] font-bold text-[#747782] uppercase tracking-widest">Booking Portal</span>
                <h5 className="text-xs font-bold text-[#002155] uppercase">Lab Seat Reservation</h5>
              </div>
              <span className="material-symbols-outlined text-[#8c4f00] mr-2 group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </Link>
            <Link href="/faculty" className="border-l-2 border-[#8c4f00] pl-4 py-2 bg-white border border-[#c4c6d3] flex items-center justify-between group">
              <div>
                <span className="text-[9px] font-bold text-[#747782] uppercase tracking-widest">Faculty Desk</span>
                <h5 className="text-xs font-bold text-[#002155] uppercase">Publish Content</h5>
              </div>
              <span className="material-symbols-outlined text-[#8c4f00] mr-2 group-hover:translate-x-1 transition-transform">arrow_forward</span>
            </Link>
          </div>
        </div>
      </aside>
    </main>
  );
}
