import type { Metadata } from "next";
import Link from "next/link";
import { Logo, Wordmark } from "@/components/findit-app/shared";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What FindIt collects, why, and how it's protected.",
};

const SUPPORT_EMAIL = "virttechnologies.official@outlook.com";

// Real, specific to what this codebase actually does — every claim here is
// checkable against lib/auth.ts, lib/repo.ts, lib/storage.ts, lib/paystack.ts,
// lib/sms.ts, and the Supabase schema, not generic boilerplate. This is what
// both Google Play's Data Safety form and a genuine user need: an accurate
// account of real practice, not a template. It is not a substitute for a
// lawyer's review before this handles real money at scale — see the note at
// the bottom.
export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-[#FAFAFF]">
      <header className="max-w-2xl mx-auto px-5 py-6 flex items-center gap-2">
        <Link href="/" className="flex items-center gap-2">
          <Logo size={26} />
          <Wordmark size="text-[16px]" />
        </Link>
      </header>

      <main className="max-w-2xl mx-auto px-5 pb-20">
        <h1
          className="text-[24px] font-bold text-[#1E1B4B] mb-2"
          style={{ fontFamily: "Fraunces, serif" }}
        >
          Privacy Policy
        </h1>
        <p className="text-[12px] text-[#8A8372] mb-8">Last updated: {new Date().toISOString().slice(0, 10)}</p>

        <div className="space-y-8 text-[13.5px] text-[#514B67] leading-relaxed">
          <section>
            <h2 className="text-[15px] font-semibold text-[#1E1B4B] mb-2">What this covers</h2>
            <p>
              This policy describes what FindIt (&ldquo;we&rdquo;, &ldquo;us&rdquo;) collects when you use the
              FindIt app or website, why, and what we do with it. FindIt is a request-first marketplace
              connecting buyers to verified sellers, starting in Nigeria.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold text-[#1E1B4B] mb-2">Information you give us</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><span className="font-medium text-[#1E1B4B]">Phone number</span> — required to create an account. It&rsquo;s how you sign in, and how buyers and sellers are matched to real, contactable people.</li>
              <li><span className="font-medium text-[#1E1B4B]">Password</span> — stored as a one-way cryptographic hash (scrypt with a unique salt per account). We cannot see or recover your actual password.</li>
              <li><span className="font-medium text-[#1E1B4B]">Name and, for sellers, business details</span> — business name, category, description, years selling, and (if you submit seller verification) evidence like product or shop photos and social links, so FindIt can review and verify your store.</li>
              <li><span className="font-medium text-[#1E1B4B]">Email</span> (optional) — used only for payment receipts and account recovery. FindIt is phone-first; you never need an email to use it.</li>
              <li><span className="font-medium text-[#1E1B4B]">Location</span> (optional) — only if you explicitly grant your browser&rsquo;s location permission, used to sort listings and sellers by distance. We never infer or guess your location, and never default it to a city you haven&rsquo;t confirmed.</li>
              <li><span className="font-medium text-[#1E1B4B]">Bank account details</span> (sellers only) — account number, bank, and the resolved account name, collected so FindIt can pay you for completed orders through our payment processor, Paystack.</li>
              <li><span className="font-medium text-[#1E1B4B]">Content you post</span> — product listings and photos, buyer requests, messages to other users, reviews, and support tickets.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold text-[#1E1B4B] mb-2">Information collected automatically</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><span className="font-medium text-[#1E1B4B]">Session cookie</span> — a single secure, HTTP-only cookie that keeps you signed in. It isn&rsquo;t used for advertising or cross-site tracking.</li>
              <li><span className="font-medium text-[#1E1B4B]">IP address</span> — used only for basic abuse prevention (rate-limiting login attempts and similar), never for tracking or advertising.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold text-[#1E1B4B] mb-2">Payments</h2>
            <p>
              FindIt never sees or stores your card details. Payments are handled entirely by{" "}
              <a href="https://paystack.com" target="_blank" rel="noreferrer" className="text-[#7C3AED] underline">Paystack</a>,
              a licensed payment processor — you pay on Paystack&rsquo;s own secure checkout page. FindIt only
              receives confirmation that a payment succeeded, never your card number. Money you pay for an
              order is held by FindIt (escrow) until you confirm delivery, at which point it&rsquo;s released to
              the seller through Paystack.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold text-[#1E1B4B] mb-2">Who we share information with</h2>
            <p className="mb-2">We share data only with the services that make FindIt work, and only what each one needs:</p>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><span className="font-medium text-[#1E1B4B]">Paystack</span> — to process payments and pay sellers.</li>
              <li><span className="font-medium text-[#1E1B4B]">Termii</span> — to deliver SMS verification codes, only if phone verification is turned on for your account action. Only your phone number and a one-time code are sent.</li>
              <li><span className="font-medium text-[#1E1B4B]">Supabase</span> — our database and file storage provider. All FindIt data lives here.</li>
              <li><span className="font-medium text-[#1E1B4B]">Vercel</span> — hosts the FindIt application itself.</li>
              <li><span className="font-medium text-[#1E1B4B]">Sentry</span> — error monitoring, so we notice and fix bugs. It receives technical error details, not your account content.</li>
            </ul>
            <p className="mt-2">We do not sell your data, and we do not share it with advertisers.</p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold text-[#1E1B4B] mb-2">What other FindIt users can see</h2>
            <p>
              A seller&rsquo;s storefront (business name, category, description, ratings, and listings) is
              public. A buyer&rsquo;s name and phone number are shared with a seller only once an order is
              placed with them, or a message is sent — never before that, and never with any other seller.
              Your exact shop address (if you have a physical store) is used only for FindIt&rsquo;s own
              verification review and is never shown publicly.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold text-[#1E1B4B] mb-2">How long we keep data</h2>
            <p>
              We keep account and order data for as long as your account is active, and as needed to resolve
              disputes, meet legal/accounting obligations, and keep an audit trail for financial transactions.
              You can ask us to delete your account — see &ldquo;Your choices&rdquo; below.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold text-[#1E1B4B] mb-2">Your choices</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>You can review and update your profile, notification preferences, and location permission at any time in the app.</li>
              <li>You can turn location off at any time in your browser/device settings.</li>
              <li>You can ask us to access, correct, or delete your data by emailing{" "}
                <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[#7C3AED] underline">{SUPPORT_EMAIL}</a>.
                We may need to keep certain records (like completed transaction history) where we have a
                legal or financial-reporting reason to.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold text-[#1E1B4B] mb-2">Children</h2>
            <p>FindIt is not directed at children and is not intended for use by anyone under 18.</p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold text-[#1E1B4B] mb-2">Changes to this policy</h2>
            <p>
              If this policy changes in a material way, we&rsquo;ll update the date at the top of this page.
              Continuing to use FindIt after a change means you accept the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold text-[#1E1B4B] mb-2">Contact us</h2>
            <p>
              Questions about this policy or your data:{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[#7C3AED] underline">{SUPPORT_EMAIL}</a>
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
