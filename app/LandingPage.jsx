import { ShieldCheck, MessageCircle, Truck, PackageSearch, Search } from "lucide-react";
import { Logo, Wordmark } from "@/components/findit-app/shared";

const STEPS = [
  { icon: MessageCircle, title: "Tell FindIt what you need", body: "Post a request with your budget, or search the catalogue directly if you already know what you want." },
  { icon: PackageSearch, title: "Real sellers send offers", body: "Verified sellers near you respond with price, delivery time and warranty — you pick the one you trust." },
  { icon: ShieldCheck, title: "Pay into escrow, not the seller", body: "Your payment is held by FindIt the moment you order — the seller is only paid once you confirm it arrived." },
  { icon: Truck, title: "Confirm delivery, leave a review", body: "Release the payment yourself when your order is right, and rate the seller for the next buyer." },
];

export default function LandingPage({ categories, onGetStarted }) {
  return (
    <div className="min-h-screen bg-white">
      <header className="max-w-4xl mx-auto px-5 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Logo size={30} />
          <Wordmark size="text-[18px]" />
        </div>
        <button
          onClick={onGetStarted}
          className="text-[13px] font-semibold text-[#1E1B4B] px-4 py-2 rounded-lg border border-[#D8D6E3]"
        >
          Log in
        </button>
      </header>

      <main>
        <section className="max-w-4xl mx-auto px-5 pt-10 pb-16 text-center">
          <h1
            className="text-[32px] sm:text-[44px] font-bold text-[#12101E] leading-[1.05] tracking-tight max-w-2xl mx-auto mb-5"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            Can&rsquo;t find it? <span className="text-[#7C3AED]">Ask FindIt.</span>
          </h1>
          <p className="text-[14px] sm:text-[15px] text-[#5B5770] max-w-xl mx-auto mb-9 leading-relaxed">
            A request-first marketplace connecting buyers to verified sellers, starting in Nigeria. Tell us what
            you&rsquo;re looking for and real sellers near you send offers — every order is escrow-protected until
            you confirm it arrived.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={onGetStarted}
              className="bg-[#12101E] text-white text-[13.5px] font-semibold px-6 py-3.5 rounded-lg"
            >
              Get started — it&rsquo;s free
            </button>
            <button
              onClick={onGetStarted}
              className="flex items-center gap-1.5 text-[13.5px] font-semibold text-[#12101E] px-6 py-3.5 rounded-lg border border-[#D8D6E3]"
            >
              <Search size={15} /> Browse the catalogue
            </button>
          </div>
        </section>

        <section className="bg-[#12101E] py-14">
          <div className="max-w-4xl mx-auto px-5">
            <h2 className="text-[12px] font-semibold text-[#B7AFD6] uppercase tracking-wider text-center mb-2">
              How it works
            </h2>
            <p className="text-[22px] font-bold text-white text-center mb-10" style={{ fontFamily: "Fraunces, serif" }}>
              From request to your door, safely
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-white/10">
              {STEPS.map((step, i) => (
                <div key={step.title} className="bg-[#12101E] px-5 py-2 text-center">
                  <step.icon size={20} className="text-[#7C3AED] mx-auto mb-3" strokeWidth={1.8} />
                  <p className="text-[13px] font-semibold text-white mb-1.5">
                    {i + 1}. {step.title}
                  </p>
                  <p className="text-[12px] text-[#9C97B8] leading-relaxed">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {categories.length > 0 && (
          <section className="max-w-4xl mx-auto px-5 py-14">
            <h2 className="text-[22px] font-bold text-[#12101E] text-center mb-2" style={{ fontFamily: "Fraunces, serif" }}>
              Shop by category
            </h2>
            <p className="text-[13px] text-[#5B5770] text-center mb-8">
              Real, verified sellers across every category on FindIt.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={onGetStarted}
                  className="text-[12.5px] font-medium text-[#12101E] px-4 py-2.5 rounded-lg border border-[#D8D6E3]"
                >
                  {c.label}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="border-y border-[#EBE9F2] py-14">
          <div className="max-w-4xl mx-auto px-5 text-center">
            <h2 className="text-[22px] font-bold text-[#12101E] mb-2" style={{ fontFamily: "Fraunces, serif" }}>
              Built on trust, not luck
            </h2>
            <p className="text-[13px] text-[#5B5770] max-w-lg mx-auto mb-8 leading-relaxed">
              Every seller goes through FindIt&rsquo;s verification review before they can sell. Every order is
              held in escrow — the seller is never paid until you confirm delivery yourself.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl mx-auto text-left">
              <div className="flex items-start gap-2.5">
                <ShieldCheck size={18} className="text-[#12101E] shrink-0 mt-0.5" strokeWidth={1.8} />
                <p className="text-[12px] text-[#5B5770]"><span className="font-semibold text-[#12101E]">Escrow-protected payment</span> — held by FindIt, released only when you confirm.</p>
              </div>
              <div className="flex items-start gap-2.5">
                <ShieldCheck size={18} className="text-[#12101E] shrink-0 mt-0.5" strokeWidth={1.8} />
                <p className="text-[12px] text-[#5B5770]"><span className="font-semibold text-[#12101E]">Verified sellers</span> — every seller is reviewed before they can list.</p>
              </div>
              <div className="flex items-start gap-2.5">
                <ShieldCheck size={18} className="text-[#12101E] shrink-0 mt-0.5" strokeWidth={1.8} />
                <p className="text-[12px] text-[#5B5770]"><span className="font-semibold text-[#12101E]">Real reviews</span> — from buyers who actually completed an order.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-2xl mx-auto px-5 py-16 text-center">
          <h2 className="text-[24px] font-bold text-[#12101E] mb-4 tracking-tight" style={{ fontFamily: "Fraunces, serif" }}>
            Ready to find it?
          </h2>
          <button
            onClick={onGetStarted}
            className="bg-[#12101E] text-white text-[13.5px] font-semibold px-7 py-3.5 rounded-lg"
          >
            Get started — it&rsquo;s free
          </button>
        </section>
      </main>

      <footer className="max-w-4xl mx-auto px-5 py-8 border-t border-[#EBE9F2] flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Logo size={20} />
          <span className="text-[12px] text-[#5B5770]">© {new Date().getFullYear()} FindIt</span>
        </div>
        <div className="flex items-center gap-4">
          <a href="/privacy" className="text-[12px] text-[#5B5770]">Privacy</a>
          <a href="/terms" className="text-[12px] text-[#5B5770]">Terms</a>
          <button onClick={onGetStarted} className="text-[12px] font-semibold text-[#7C3AED]">
            Sell on FindIt →
          </button>
        </div>
      </footer>
    </div>
  );
}
