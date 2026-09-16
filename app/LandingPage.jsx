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
    <div className="min-h-screen bg-[#FAFAFF]">
      <header className="max-w-4xl mx-auto px-5 py-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Logo size={30} />
          <Wordmark size="text-[18px]" />
        </div>
        <button
          onClick={onGetStarted}
          className="text-[13px] font-semibold text-[#7C3AED] px-4 py-2 rounded-full border border-[#ECE9F7] bg-white"
        >
          Log in
        </button>
      </header>

      <main>
        <section className="max-w-4xl mx-auto px-5 pt-8 pb-14 text-center">
          <h1
            className="text-[28px] sm:text-[36px] font-bold text-[#1E1B4B] leading-tight max-w-2xl mx-auto mb-4"
            style={{ fontFamily: "Fraunces, serif" }}
          >
            Can&rsquo;t find it? <span style={{ background: "linear-gradient(90deg,#A855F7,#7C3AED)", WebkitBackgroundClip: "text", color: "transparent" }}>Ask FindIt.</span>
          </h1>
          <p className="text-[14px] sm:text-[15px] text-[#6B6483] max-w-xl mx-auto mb-8 leading-relaxed">
            A request-first marketplace connecting buyers to verified sellers, starting in Nigeria. Tell us what
            you&rsquo;re looking for and real sellers near you send offers — every order is escrow-protected until
            you confirm it arrived.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={onGetStarted}
              className="text-white text-[13.5px] font-semibold px-6 py-3.5 rounded-full"
              style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
            >
              Get started — it&rsquo;s free
            </button>
            <button
              onClick={onGetStarted}
              className="flex items-center gap-1.5 text-[13.5px] font-semibold text-[#1E1B4B] px-6 py-3.5 rounded-full border border-[#ECE9F7] bg-white"
            >
              <Search size={15} /> Browse the catalogue
            </button>
          </div>
        </section>

        <section className="bg-white border-y border-[#ECE9F7] py-14">
          <div className="max-w-4xl mx-auto px-5">
            <h2 className="text-[12px] font-semibold text-[#7C3AED] uppercase tracking-wide text-center mb-2">
              How it works
            </h2>
            <p className="text-[20px] font-bold text-[#1E1B4B] text-center mb-10" style={{ fontFamily: "Fraunces, serif" }}>
              From request to your door, safely
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {STEPS.map((step, i) => (
                <div key={step.title} className="text-center">
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
                    style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
                  >
                    <step.icon size={20} className="text-white" strokeWidth={1.8} />
                  </div>
                  <p className="text-[13px] font-semibold text-[#1E1B4B] mb-1.5">
                    {i + 1}. {step.title}
                  </p>
                  <p className="text-[12px] text-[#6B6483] leading-relaxed">{step.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {categories.length > 0 && (
          <section className="max-w-4xl mx-auto px-5 py-14">
            <h2 className="text-[20px] font-bold text-[#1E1B4B] text-center mb-2" style={{ fontFamily: "Fraunces, serif" }}>
              Shop by category
            </h2>
            <p className="text-[13px] text-[#6B6483] text-center mb-8">
              Real, verified sellers across every category on FindIt.
            </p>
            <div className="flex flex-wrap justify-center gap-2.5">
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={onGetStarted}
                  className="text-[12.5px] font-medium text-[#514B67] px-4 py-2.5 rounded-full border border-[#ECE9F7] bg-white"
                >
                  {c.label}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="bg-white border-y border-[#ECE9F7] py-14">
          <div className="max-w-4xl mx-auto px-5 text-center">
            <h2 className="text-[20px] font-bold text-[#1E1B4B] mb-2" style={{ fontFamily: "Fraunces, serif" }}>
              Built on trust, not luck
            </h2>
            <p className="text-[13px] text-[#6B6483] max-w-lg mx-auto mb-8 leading-relaxed">
              Every seller goes through FindIt&rsquo;s verification review before they can sell. Every order is
              held in escrow — the seller is never paid until you confirm delivery yourself.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl mx-auto text-left">
              <div className="flex items-start gap-2.5">
                <ShieldCheck size={18} className="text-[#7C3AED] shrink-0 mt-0.5" />
                <p className="text-[12px] text-[#6B6483]"><span className="font-semibold text-[#1E1B4B]">Escrow-protected payment</span> — held by FindIt, released only when you confirm.</p>
              </div>
              <div className="flex items-start gap-2.5">
                <ShieldCheck size={18} className="text-[#7C3AED] shrink-0 mt-0.5" />
                <p className="text-[12px] text-[#6B6483]"><span className="font-semibold text-[#1E1B4B]">Verified sellers</span> — every seller is reviewed before they can list.</p>
              </div>
              <div className="flex items-start gap-2.5">
                <ShieldCheck size={18} className="text-[#7C3AED] shrink-0 mt-0.5" />
                <p className="text-[12px] text-[#6B6483]"><span className="font-semibold text-[#1E1B4B]">Real reviews</span> — from buyers who actually completed an order.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-2xl mx-auto px-5 py-16 text-center">
          <h2 className="text-[22px] font-bold text-[#1E1B4B] mb-3" style={{ fontFamily: "Fraunces, serif" }}>
            Ready to find it?
          </h2>
          <button
            onClick={onGetStarted}
            className="text-white text-[13.5px] font-semibold px-7 py-3.5 rounded-full"
            style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
          >
            Get started — it&rsquo;s free
          </button>
        </section>
      </main>

      <footer className="max-w-4xl mx-auto px-5 py-8 border-t border-[#ECE9F7] flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Logo size={20} />
          <span className="text-[12px] text-[#6B6483]">© {new Date().getFullYear()} FindIt</span>
        </div>
        <div className="flex items-center gap-4">
          <a href="/privacy" className="text-[12px] text-[#6B6483]">Privacy</a>
          <a href="/terms" className="text-[12px] text-[#6B6483]">Terms</a>
          <button onClick={onGetStarted} className="text-[12px] font-medium text-[#7C3AED]">
            Sell on FindIt →
          </button>
        </div>
      </footer>
    </div>
  );
}
