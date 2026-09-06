import { Search, Lock, LogOut } from "lucide-react";
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

export function ArtBlock({ icon: Icon, art = 0, imageUrl, className = "" }) {
  if (imageUrl) {
    return (
      <div className={`relative overflow-hidden ${className}`}>
        <img src={imageUrl} alt="" className="w-full h-full object-cover" />
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

export function IconButton({ children, onClick, badge, "aria-label": ariaLabel }) {
  return (
    <button
      onClick={onClick}
      aria-label={ariaLabel}
      className="relative w-11 h-11 rounded-full bg-white shadow-md shadow-[#4C1D95]/10 flex items-center justify-center shrink-0"
    >
      {children}
      {badge && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-[#F59E0B] text-white text-[9px] font-bold flex items-center justify-center">{badge}</span>}
    </button>
  );
}

export function RoleGate({ title, message, onLogout, logoutLabel = "Log out" }) {
  return (
    <div className="px-5 pt-16 pb-10 flex flex-col items-center text-center min-h-[70vh]">
      <div className="w-16 h-16 rounded-full flex items-center justify-center mb-5" style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}>
        <Lock size={26} className="text-white" strokeWidth={1.8} />
      </div>
      <h1 className="text-[18px] font-bold text-[#1E1B4B] mb-2" style={{ fontFamily: "Fraunces, serif" }}>{title}</h1>
      <p className="text-[13px] text-[#6B6483] max-w-[280px] mb-6">{message}</p>
      {onLogout && (
        <button
          onClick={onLogout}
          className="flex items-center gap-1.5 text-white text-[13px] font-semibold px-5 py-3 rounded-xl"
          style={{ background: "linear-gradient(135deg,#A855F7,#7C3AED)" }}
        >
          <LogOut size={14} /> {logoutLabel}
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
