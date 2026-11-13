import type { Metadata } from "next";
import Link from "next/link";
import { Logo, Wordmark } from "@/components/findit-app/shared";

export const metadata: Metadata = {
  title: "Delete your FindIt account",
  description: "How to delete your FindIt account and what happens to your data.",
};

const SUPPORT_EMAIL = "virttechnologies.official@outlook.com";

// The public "delete your account" page Google Play asks every app for (the listing links here).
// It must work for someone who no longer has the app, so it explains both ways: in the app, or by
// email. What it says matches public.delete_account (supabase/migrations/048_account_deletion.sql).
export default function DeleteAccountPage() {
  return (
    <div className="min-h-screen bg-[#FAFAFF]">
      <header className="max-w-2xl mx-auto px-5 py-6 flex items-center gap-2">
        <Link href="/" className="flex items-center gap-2">
          <Logo size={26} />
          <Wordmark size="text-[16px]" />
        </Link>
      </header>

      <main className="max-w-2xl mx-auto px-5 pb-20">
        <h1 className="text-[24px] font-bold text-[#1E1B4B] mb-6" style={{ fontFamily: "Fraunces, serif" }}>
          Delete your FindIt account
        </h1>

        <div className="space-y-8 text-[13.5px] text-[#514B67] leading-relaxed">
          <section>
            <h2 className="text-[15px] font-semibold text-[#1E1B4B] mb-2">In the app (fastest)</h2>
            <ol className="list-decimal pl-5 space-y-1.5">
              <li>Open FindIt and sign in.</li>
              <li>Go to <strong>Profile</strong>, then <strong>Personal details</strong>.</li>
              <li>Scroll to <strong>Delete account</strong> and tap <strong>Delete my account</strong>.</li>
              <li>Enter your password, type DELETE and confirm. It happens straight away.</li>
            </ol>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold text-[#1E1B4B] mb-2">Without the app</h2>
            <p>
              Email{" "}
              <a href={`mailto:${SUPPORT_EMAIL}?subject=Delete%20my%20FindIt%20account`} className="text-[#7C3AED] underline">
                {SUPPORT_EMAIL}
              </a>{" "}
              from anywhere, with the subject &ldquo;Delete my FindIt account&rdquo; and the phone number on the
              account. To protect you, we confirm it&apos;s your account with a code sent to that number before
              deleting it. We do this within 7 days.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold text-[#1E1B4B] mb-2">What is deleted</h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>Your name, phone number, email, profile photo and location.</li>
              <li>Your password and every signed-in device.</li>
              <li>Saved items, alerts and your saved delivery address.</li>
              <li>If you sell: your shop and listings are taken down, and your bank details, shop address,
                pickup locations and verification documents are removed.</li>
              <li>Unpaid orders are cancelled.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold text-[#1E1B4B] mb-2">What is kept, and why</h2>
            <p>
              Records of completed orders, payments, refunds and payouts are kept for as long as the law
              requires for tax, accounting and fraud prevention. They no longer carry your name or phone
              number; they show as &ldquo;Deleted user&rdquo;. Messages you sent stay in the other person&apos;s
              conversation, also shown as &ldquo;Deleted user&rdquo;.
            </p>
          </section>

          <section>
            <h2 className="text-[15px] font-semibold text-[#1E1B4B] mb-2">When you can&apos;t delete yet</h2>
            <p>
              If you have paid orders that haven&apos;t been delivered or settled, or a payout to you is still
              being processed, those must finish first so nobody loses money. The app tells you exactly what
              is still open.
            </p>
          </section>

          <section>
            <p>
              Deleting can&apos;t be undone. You can sign up again later with the same phone number as a new
              account. See also our <Link href="/privacy" className="text-[#7C3AED] underline">Privacy Policy</Link>.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
