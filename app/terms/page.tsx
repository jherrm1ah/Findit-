import type { Metadata } from "next";
import Link from "next/link";
import { Logo, Wordmark } from "@/components/findit-app/shared";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The rules for buying and selling on FindIt.",
};

const SUPPORT_EMAIL = "virttechnologies.official@outlook.com";

// Grounded in how the app actually behaves (escrow release rules in
// lib/repo.ts#confirmOrderDelivered/reportOrderIssue, the 7-day post-
// confirmation dispute window, seller verification/moderation in
// lib/productReports.ts and lib/moderationRules.ts) rather than a generic
// template — same reasoning as app/privacy/page.tsx.
export default function TermsPage() {
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
          Terms of Service
        </h1>
        <p className="text-[12px] text-[#8A8372] mb-8">Last updated: {new Date().toISOString().slice(0, 10)}</p>

        <div className="space-y-8 text-[13.5px] text-[#514B67] leading-relaxed">
          <section>
            <h2 className="text-[15px] font-semibold text-[#1E1B4B] mb-2">Agreement</h2>
            <p>
              By creating a FindIt account or using the FindIt app or website, you agree to these terms. If
              you don&rsquo;t agree, please don&rsquo;t use FindIt.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold text-[#1E1B4B] mb-2">What FindIt is</h2>
            <p>
              FindIt is a marketplace that connects buyers with independent, third-party sellers. FindIt is
              not the seller of any product listed on the platform — each listing is owned and fulfilled by
              the seller who posted it. FindIt&rsquo;s role is to run the platform, verify sellers, and hold
              payment in escrow until a buyer confirms their order arrived.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold text-[#1E1B4B] mb-2">Accounts</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>You must provide accurate information and keep your login secure. You&rsquo;re responsible for activity on your account.</li>
              <li>One phone number is tied to one account. A buyer can become a seller from their existing account; a new signup with a phone number already in use isn&rsquo;t allowed.</li>
              <li>FindIt may suspend or restrict an account for a real, stated reason — including fraud, abuse, repeated policy violations, or a listing that violates our prohibited-items rules. We&rsquo;ll always tell you why.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold text-[#1E1B4B] mb-2">Buying on FindIt</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li><span className="font-medium text-[#1E1B4B]">Escrow protection.</span> When you pay for an order, your payment is held by FindIt, not sent to the seller immediately. It&rsquo;s released to the seller only once you confirm the order was delivered as expected.</li>
              <li><span className="font-medium text-[#1E1B4B]">Reporting a problem.</span> If something&rsquo;s wrong, you can report it before confirming delivery, or within 7 days after confirming, if the issue only became apparent afterward. A FindIt admin reviews reported orders and decides whether to release payment to the seller or refund you.</li>
              <li><span className="font-medium text-[#1E1B4B]">No guarantee of availability.</span> A seller&rsquo;s offer in response to your request is their own commitment, not FindIt&rsquo;s. FindIt facilitates the transaction and holds payment safely, but doesn&rsquo;t manufacture, ship, or guarantee any product itself.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold text-[#1E1B4B] mb-2">Selling on FindIt</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Sellers go through a verification review before their store is trusted with a &ldquo;Verified&rdquo; badge, and must keep their listings accurate — real photos, honest condition (New/Used), and a real price.</li>
              <li>Prohibited items, counterfeit goods, scams, and spam are not allowed. FindIt reviews listings against these rules and buyer reports, and may flag, remove, or require changes to a listing that violates them.</li>
              <li>Sellers are paid out to their registered bank account once a buyer confirms delivery (or an admin resolves a dispute in the seller&rsquo;s favor), minus FindIt&rsquo;s platform fee.</li>
              <li>Some storefront features (a dedicated store link, branding, featured placement) are part of paid Store subscription plans, billed monthly or yearly. You can cancel anytime; a plan change takes effect at your next billing period unless stated otherwise.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold text-[#1E1B4B] mb-2">Content you post</h2>
            <p>
              You&rsquo;re responsible for what you post — listings, photos, requests, messages, and reviews.
              Don&rsquo;t post anything illegal, infringing, or false. Reviews must reflect a real completed
              order. FindIt may remove content that violates these terms.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold text-[#1E1B4B] mb-2">Fees</h2>
            <p>
              FindIt charges a platform fee on completed orders, and offers optional paid features for
              sellers (Store plans, listing boosts, FindIt Pro). Current pricing is shown in the app before
              you pay for anything — nothing is charged without your action.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold text-[#1E1B4B] mb-2">Disclaimers and limitation of liability</h2>
            <p>
              FindIt is provided &ldquo;as is.&rdquo; We work to verify sellers and hold payment safely, but we
              don&rsquo;t guarantee that every transaction will go perfectly, and we&rsquo;re not liable for a
              seller&rsquo;s conduct beyond our escrow and dispute-resolution process. To the extent permitted
              by law, FindIt&rsquo;s liability for any claim is limited to the amount actually paid through
              FindIt for the order in question.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold text-[#1E1B4B] mb-2">Changes</h2>
            <p>
              We may update these terms as FindIt grows. If a change is material, we&rsquo;ll update the date
              at the top of this page. Continuing to use FindIt after a change means you accept the updated
              terms.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold text-[#1E1B4B] mb-2">Contact us</h2>
            <p>
              Questions about these terms:{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`} className="text-[#7C3AED] underline">{SUPPORT_EMAIL}</a>
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
