export default function Footer() {
  return (
    <footer className="w-full border-t border-hairline bg-surface-container">
      <div className="grid w-full max-w-full grid-cols-1 gap-8 px-6 py-12 md:grid-cols-2 md:px-12 lg:grid-cols-3 lg:gap-12 lg:py-16">
        <div>
          <h3 className="mb-4 font-headline text-lg font-bold uppercase tracking-tight text-primary md:mb-6 md:text-xl">
            TCET Centre of Excellence
          </h3>
          <div className="space-y-1 font-body text-xs leading-relaxed text-on-surface-variant md:text-sm">
            <p>Thakur Village, Kandivali (E), Mumbai - 400101.</p>
            <p>Maharashtra, India.</p>
            <p className="pt-2">Email: tcet.cercd@tcetmumbai.in</p>
          </div>
          <div className="mt-6 flex gap-4">
            <span className="material-symbols-outlined cursor-pointer text-primary transition-colors hover:text-secondary">
              social_leaderboard
            </span>
            <span className="material-symbols-outlined cursor-pointer text-primary transition-colors hover:text-secondary">
              language
            </span>
            <span className="material-symbols-outlined cursor-pointer text-primary transition-colors hover:text-secondary">
              description
            </span>
          </div>
        </div>
        <div>
          <h4 className="mb-4 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-secondary md:mb-6">
            Institutional Quick Links
          </h4>
          <ul className="space-y-2 font-body text-xs md:space-y-3 md:text-sm">
            <li><a className="text-on-surface-variant underline decoration-hairline underline-offset-4 transition-colors hover:text-primary hover:decoration-primary" href="https://www.tcetmumbai.in/contact.html">Institute Address &amp; NAAC</a></li>
            <li><a className="text-on-surface-variant underline decoration-hairline underline-offset-4 transition-colors hover:text-primary hover:decoration-primary" href="https://mu.ac.in/">Mumbai University</a></li>
            <li><a className="text-on-surface-variant underline decoration-hairline underline-offset-4 transition-colors hover:text-primary hover:decoration-primary" href="#">Quick Links</a></li>
            <li><a className="text-on-surface-variant underline decoration-hairline underline-offset-4 transition-colors hover:text-primary hover:decoration-primary" href="/privacy-policy">Privacy Policy</a></li>
            <li><a className="text-on-surface-variant underline decoration-hairline underline-offset-4 transition-colors hover:text-primary hover:decoration-primary" href="#">Contact Us</a></li>
          </ul>
        </div>
        <div className="flex flex-col justify-between">
          <div className="flex flex-col gap-3 md:gap-4">
            <h4 className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-secondary">
              Accreditation
            </h4>
            <div className="flex flex-wrap gap-3 md:gap-4">
              <div className="flex h-10 w-10 items-center justify-center border border-outline-variant bg-white p-1 text-center text-[9px] font-bold md:h-12 md:w-12 md:text-[10px]">NAAC A+</div>
              <div className="flex h-10 w-10 items-center justify-center border border-outline-variant bg-white p-1 text-center text-[9px] font-bold md:h-12 md:w-12 md:text-[10px]">NBA</div>
              <div className="flex h-10 w-10 items-center justify-center border border-outline-variant bg-white p-1 text-center text-[9px] font-bold md:h-12 md:w-12 md:text-[10px]">ISO</div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-center justify-between gap-4 border-t border-hairline bg-primary px-6 py-4 text-center font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-white/70 md:flex-row md:px-12 md:text-left md:text-[10px]">
        <span>© {new Date().getFullYear()} TCET Centre of Excellence. All Rights Reserved. Designed for Academic Integrity.</span>
        <div className="flex gap-4 md:gap-8">
          <a className="transition-colors hover:text-white" href="#">Accessibility</a>
          <a className="transition-colors hover:text-white" href="#">Legal Archives</a>
        </div>
      </div>
    </footer>
  );
}
