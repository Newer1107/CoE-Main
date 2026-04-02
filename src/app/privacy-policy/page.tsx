export default function PrivacyPolicyPage() {
  return (
    <main className="pt-[100px] md:pt-[120px] pb-16 bg-[#faf9f5] min-h-screen">
      <section className="max-w-4xl mx-auto px-4 md:px-8">
        <div className="border-l-4 border-[#002155] pl-4 md:pl-8 mb-8">
          <p className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-[#8c4f00] mb-2">
            Legal
          </p>
          <h1 className="text-3xl md:text-5xl font-headline font-bold text-[#002155] tracking-tight">
            Privacy Policy
          </h1>
          <p className="text-sm text-[#747782] mt-3">Last updated: April 2, 2026</p>
        </div>

        <div className="bg-white border border-[#c4c6d3] p-5 md:p-8 space-y-6 text-sm md:text-base text-[#434651] leading-relaxed">
          <section>
            <h2 className="text-lg md:text-2xl font-headline font-bold text-[#002155] mb-2">1. Information We Collect</h2>
            <p>
              We collect account details such as name, email address, UID, phone number, and role-based profile information to provide access to
              Center of Excellence services.
            </p>
          </section>

          <section>
            <h2 className="text-lg md:text-2xl font-headline font-bold text-[#002155] mb-2">2. How We Use Information</h2>
            <p>
              Your information is used for authentication, platform operations, faculty and student workflows, facility booking, innovation program
              administration, and official communication.
            </p>
          </section>

          <section>
            <h2 className="text-lg md:text-2xl font-headline font-bold text-[#002155] mb-2">3. Email Communications</h2>
            <p>
              We may send transactional and operational emails, including authentication notifications, booking updates, and innovation announcements.
            </p>
          </section>

          <section>
            <h2 className="text-lg md:text-2xl font-headline font-bold text-[#002155] mb-2">4. Data Sharing</h2>
            <p>
              We do not sell personal data. Information is shared only with authorized institutional staff and technical service providers strictly for
              platform operation.
            </p>
          </section>

          <section>
            <h2 className="text-lg md:text-2xl font-headline font-bold text-[#002155] mb-2">5. Data Security</h2>
            <p>
              We apply reasonable technical and organizational safeguards to protect user data. No system can guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-lg md:text-2xl font-headline font-bold text-[#002155] mb-2">6. Your Rights</h2>
            <p>
              Users may request profile corrections and account support through official CoE administration channels.
            </p>
          </section>

          <section>
            <h2 className="text-lg md:text-2xl font-headline font-bold text-[#002155] mb-2">7. Policy Updates</h2>
            <p>
              This Privacy Policy may be updated from time to time. Material changes will be reflected on this page with an updated effective date.
            </p>
          </section>

          <section>
            <h2 className="text-lg md:text-2xl font-headline font-bold text-[#002155] mb-2">8. Contact</h2>
            <p>
              For privacy-related queries, contact: <span className="font-semibold">coe@tcetmumbai.in</span>
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
