import { countDisputedOrders } from "./repo";
import { listPayoutsForAdmin } from "./payments";
import { getVerificationQueueCounts } from "./sellerVerification";
import { getSellerRiskSignals } from "./risk";
import { getOpenTicketCount, getOpenPriorityTicketCount } from "./support";

// The admin alert center — deliberately NOT a new signal. Every item here
// is a count this app already computes for its own dedicated screen
// (Sellers/Payments/Verification/Risk/Support tabs); this just pulls
// whichever of those are currently non-zero into one feed so an admin
// doesn't have to click through five tabs to see what needs attention.

export type AdminAlert = {
  id: string;
  severity: "critical" | "warning";
  title: string;
  description: string;
  count: number;
  tab: string; // which AdminQueue tab this alert should open
};

// Same threshold RiskSignals already uses to color a seller's dispute rate
// red in the Risk tab (see AdminQueue.jsx) — reused here, not redefined.
const HIGH_RISK_DISPUTE_RATE = 0.3;

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

export async function getAdminAlerts(): Promise<AdminAlert[]> {
  const [openDisputes, manualPayouts, verificationCounts, riskSignals, openTickets, openPriorityTickets] = await Promise.all([
    countDisputedOrders(),
    listPayoutsForAdmin("manual_required"),
    getVerificationQueueCounts(),
    getSellerRiskSignals(),
    getOpenTicketCount(),
    getOpenPriorityTicketCount(),
  ]);

  const highRiskSellerCount = riskSignals.filter((s) => s.disputeRate >= HIGH_RISK_DISPUTE_RATE).length;

  const alerts: AdminAlert[] = [];

  if (openDisputes > 0) {
    alerts.push({
      id: "disputes",
      severity: "critical",
      title: "Payments held on a reported problem",
      description: `${plural(openDisputes, "order")} waiting on a refund/release decision.`,
      count: openDisputes,
      tab: "sellers",
    });
  }

  if (manualPayouts.length > 0) {
    alerts.push({
      id: "payouts",
      severity: "critical",
      title: "Seller payouts need a manual transfer",
      description: `${plural(manualPayouts.length, "payout")} couldn't be sent automatically.`,
      count: manualPayouts.length,
      tab: "payments",
    });
  }

  if (verificationCounts.pending > 0) {
    alerts.push({
      id: "verification",
      severity: "warning",
      title: "Seller verification submissions pending",
      description: `${plural(verificationCounts.pending, "submission")} waiting on review.`,
      count: verificationCounts.pending,
      tab: "verification",
    });
  }

  if (highRiskSellerCount > 0) {
    alerts.push({
      id: "risk",
      severity: "warning",
      title: "Sellers with a high dispute rate",
      description: `${plural(highRiskSellerCount, "seller")} at or above a ${Math.round(HIGH_RISK_DISPUTE_RATE * 100)}% dispute rate.`,
      count: highRiskSellerCount,
      tab: "risk",
    });
  }

  if (openTickets > 0) {
    // A priority ticket (Business Store/Pro Store/FindIt Pro — see
    // lib/support.ts#hasPrioritySupport) bumps this to critical and says so
    // plainly, rather than sitting in the same "warning" bucket as every
    // other open ticket — the whole point of paying for priority support is
    // that it doesn't go unnoticed.
    alerts.push({
      id: "tickets",
      severity: openPriorityTickets > 0 ? "critical" : "warning",
      title: openPriorityTickets > 0 ? "Priority support tickets waiting" : "Open support tickets",
      description:
        openPriorityTickets > 0
          ? `${plural(openPriorityTickets, "priority ticket")} waiting, out of ${openTickets} total.`
          : `${plural(openTickets, "ticket")} waiting on a reply.`,
      count: openTickets,
      tab: "support",
    });
  }

  return alerts;
}
