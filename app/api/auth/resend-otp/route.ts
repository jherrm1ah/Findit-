// Dedicated resend endpoint per the OTP spec — but the actual logic is
// identical to send-otp's: lib/otp.ts#createOtp already looks up whether an
// active (unexpired, unused) code exists for this phone+purpose and treats
// it as a resend (new code, same record, cooldown + max-resends enforced)
// automatically, vs. a fresh send when none exists. Splitting that into two
// near-duplicate route bodies would just be two copies of the same rate-
// limit and error-handling logic to keep in sync, so this route reuses
// send-otp's handler directly rather than reimplementing it.
export { POST } from "../send-otp/route";
