"use client";

import { Logo, Wordmark } from "./shared";

export default function About() {
  return (
    <div className="px-5 pt-6 pb-10">
      <div className="flex flex-col items-center text-center mb-8 mt-4">
        <Logo size={56} />
        <div className="mt-3">
          <Wordmark size="text-[22px]" />
        </div>
      </div>

      <div className="bg-white border border-[#ECE9F7] rounded-[20px] p-5 mb-4">
        <p className="text-[13px] text-[#1E1B4B] leading-relaxed">
          FindIt is a request-first marketplace: tell us what you need, and real sellers near you send offers —
          instead of you scrolling through listings hoping someone has it.
        </p>
      </div>

      <div className="bg-white border border-[#ECE9F7] rounded-[20px] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-[#ECE9F7]">
          <p className="text-[13px] text-[#1E1B4B]">Version</p>
          <p className="text-[13px] text-[#6B6483]">0.1.0</p>
        </div>
        <div className="flex items-center justify-between px-4 py-3.5">
          <p className="text-[13px] text-[#1E1B4B]">Made for</p>
          <p className="text-[13px] text-[#6B6483]">Nigeria</p>
        </div>
      </div>
    </div>
  );
}
