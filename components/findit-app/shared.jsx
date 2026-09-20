import Image from "next/image";
import { Search, Lock, LogOut, Home as HomeIcon } from "lucide-react";
import { ART } from "./data";

export function Pill({ children, tone = "stone" }) {
  const tones = {
    brand: "bg-[#7C3AED]/10 text-[#6D28D9]",
    green: "bg-[#10B981]/10 text-[#0D9268]",
    gold: "bg-[#F59E0B]/12 text-[#B45309]",
    red: "bg-[#E64980]/10 text-[#C22468]",
    stone: "bg-[#6B6483]/10 text-[#514B67]",
  };
  return <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full ${tones[tone]}`}>{children}</span>;
}

// Every product/seller photo card in the app (Home, Browse, ProductDetail,
// seller storefronts, order history) renders through here — the single
// place converting to next/image (resized, re-encoded to a modern format,
// lazy-loaded below the fold) covers all of them at once. `fill` requires
// the wrapping div to stay `relative` with real dimensions, which is what
// every caller's own `className` (h-32, aspect-square, etc.) already gives
// it — this component only ever renders inside a sized container.
export function ArtBlock({ icon: Icon, art = 0, imageUrl, className = "" }) {
  if (imageUrl) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <Image
          src={imageUrl}
          alt=""
          fill
          sizes="(max-width: 640px) 45vw, 220px"
          className="object-cover"
        />
      </div>
    );
  }
  return (
    <div className={`bg-gradient-to-br ${ART[art]} flex items-center justify-center relative overflow-hidden ${className}`}>
      <div className="absolute -right-4 -top-4 w-16 h-16 rounded-full bg-white/10" />
      <Icon className="text-white relative" size={26} strokeWidth={1.6} />
    </div>
  );
}

export function Logo({ size = 28 }) {
  return (
    <div
      className="rounded-[9px] flex items-center justify-center shrink-0"
      style={{ width: size, height: size, background: "linear-gradient(135deg, #A855F7 0%, #7C3AED 45%, #4C1D95 100%)" }}
    >
      <Search size={size * 0.52} className="text-white" strokeWidth={2.6} />
    </div>
  );
}

export function Wordmark({ size = "text-[16px]" }) {
  return (
    <span className={`${size} font-bold`} style={{ fontFamily: "Fraunces, serif" }}>
      <span style={{ color: "#1E1B4B" }}>Find</span>
      <span style={{ background: "linear-gradient(90deg,#A855F7,#7C3AED)", WebkitBackgroundClip: "text", color: "transparent" }}>It</span>
    </span>
  );
}

// Shown when the signed-in account's role doesn't match the screen they
// landed on (e.g. a buyer tapped the seller-dashboard nav icon). "Go home"
// is the primary action — this is almost always an accidental tap, not a
// buyer deciding they want to sign out — so logging out is a secondary,
// much less prominent option, not the only button on the screen.
export function RoleGate({ title, message, onGoHome, onLogout, logoutLabel = "Log out" }) {
  return (
    <div className="px-5 pt-16 pb-10 flex flex-col items-center text-center min-h-[70vh]">
      <div className="w-16 h-16 rounded-full flex items-center justify-center mb-5" style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}>
        <Lock size={26} className="text-white" strokeWidth={1.8} />
      </div>
      <h1 className="text-[18px] font-bold text-[#1E1B4B] mb-2" style={{ fontFamily: "Fraunces, serif" }}>{title}</h1>
      <p className="text-[13px] text-[#6B6483] max-w-[280px] mb-6">{message}</p>
      {onGoHome && (
        <button
          onClick={onGoHome}
          className="flex items-center gap-1.5 text-white text-[13px] font-semibold px-5 py-3 rounded-xl mb-3"
          style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
        >
          <HomeIcon size={14} /> Take me home
        </button>
      )}
      {onLogout && (
        <button onClick={onLogout} className="flex items-center gap-1.5 text-[#6B6483] text-[12.5px] font-medium px-3 py-2">
          <LogOut size={13} /> {logoutLabel}
        </button>
      )}
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-[11.5px] font-medium text-[#514B67] mb-1.5">{label}</span>
      {children}
    </label>
  );
}
