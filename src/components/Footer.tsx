export default function Footer() {
  return (
    <footer className="bg-[#f5f4f0] text-[#002155] border-t-4 border-[#002155] w-full">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-12 w-full px-6 md:px-12 py-12 lg:py-16 max-w-full">
        <div>
          <h3 className="text-base md:text-lg font-bold text-[#002155] mb-4 md:mb-6 uppercase tracking-tight">TCET Center of Excellence</h3>
          <div className="font-body leading-relaxed opacity-70 text-xs md:text-sm space-y-1">
            <p>Thakur Village, Kandivali (E), Mumbai - 400101.</p>
            <p>Maharashtra, India.</p>
            <p className="pt-2">Email: tcet.cercd@tcetmumbai.in</p>
          </div>
          <div className="flex gap-4 mt-6">
            <span className="material-symbols-outlined text-[#002155] cursor-pointer hover:text-[#fd9923] transition-colors">social_leaderboard</span>
            <span className="material-symbols-outlined text-[#002155] cursor-pointer hover:text-[#fd9923] transition-colors">language</span>
            <span className="material-symbols-outlined text-[#002155] cursor-pointer hover:text-[#fd9923] transition-colors">description</span>
          </div>
        </div>
        <div>
          <h4 className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-[#8c4f00] mb-4 md:mb-6">Institutional Quick Links</h4>
          <ul className="space-y-2 md:space-y-3 text-xs md:text-sm font-body">
            <li><a className="text-slate-600 hover:text-[#002155] underline transition-all" href="#">Institute Address &amp; NAAC</a></li>
            <li><a className="text-slate-600 hover:text-[#002155] underline transition-all" href="#">Mumbai University</a></li>
            <li><a className="text-slate-600 hover:text-[#002155] underline transition-all" href="#">Quick Links</a></li>
            <li><a className="text-slate-600 hover:text-[#002155] underline transition-all" href="/privacy-policy">Privacy Policy</a></li>
            <li><a className="text-slate-600 hover:text-[#002155] underline transition-all" href="#">Contact Us</a></li>
          </ul>
        </div>
        <div className="flex flex-col justify-between">
          <div className="flex flex-col gap-3 md:gap-4">
            <h4 className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-[#8c4f00]">Accreditation</h4>
            <div className="flex flex-wrap gap-3 md:gap-4">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-white/50 border border-[#c4c6d3] flex items-center justify-center font-bold text-[9px] md:text-[10px] text-center p-1">NAAC A+</div>
              <div className="w-10 h-10 md:w-12 md:h-12 bg-white/50 border border-[#c4c6d3] flex items-center justify-center font-bold text-[9px] md:text-[10px] text-center p-1">NBA</div>
              <div className="w-10 h-10 md:w-12 md:h-12 bg-white/50 border border-[#c4c6d3] flex items-center justify-center font-bold text-[9px] md:text-[10px] text-center p-1">ISO</div>
            </div>
          </div>
        </div>
      </div>
      <div className="bg-[#002155] text-white/70 py-4 md:py-6 px-6 md:px-12 flex flex-col md:flex-row justify-between items-center text-center md:text-left gap-4 text-[9px] md:text-[10px] font-bold uppercase tracking-widest">
        <span>© 2026 TCET Center of Excellence. All Rights Reserved. Designed for Academic Integrity.</span>
        <div className="flex gap-4 md:gap-8">
          <a className="hover:text-white transition-colors" href="#">Accessibility</a>
          <a className="hover:text-white transition-colors" href="#">Legal Archives</a>
        </div>
      </div>
    </footer>
  );
}
