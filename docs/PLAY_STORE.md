# FindIt on Google Play

Everything needed to publish the FindIt Android app (`com.shopwithfindit.app`). The app opens
https://www.shopwithfindit.com, so most FindIt changes go live without a new app version; a new
version is only needed when the Android side changes (`android/version.properties`).

## 1. One-time setup (owner)

1. **Google Play Developer account**: play.google.com/console, one-time US$25, ID verification.
2. **Upload key.** Google signs the app for users with its own key (Play App Signing). The upload key
   only proves an upload came from you, and Google can reset it if it's ever lost. Make it once, on a
   computer with Java:

   ```
   keytool -genkeypair -keystore findit-upload.jks -storetype PKCS12 -alias findit-upload \
     -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=FindIt"
   base64 -w0 findit-upload.jks > findit-upload.b64
   ```

   Then in GitHub: **Findit- → Settings → Secrets and variables → Actions → New repository secret**:

   | Secret | Value |
   |---|---|
   | `FINDIT_UPLOAD_KEYSTORE_B64` | the contents of `findit-upload.b64` |
   | `FINDIT_UPLOAD_STORE_PASSWORD` | the keystore password you chose |
   | `FINDIT_UPLOAD_KEY_ALIAS` | `findit-upload` |
   | `FINDIT_UPLOAD_KEY_PASSWORD` | the key password (same as above unless you chose another) |

   Keep `findit-upload.jks` and the password somewhere safe and private. Never commit them.
3. **Build the bundle**: GitHub → Actions → **Play Store bundle** → Run workflow. Download
   `FindIt-play-bundle` → `FindIt.aab`. Every PR that touches Android already proves this build works
   (with a throwaway key), so the only new thing here is the real key.

## 2. Testing before launch

New personal developer accounts must run a **closed test with at least 12 testers for 14 days** before
they can publish to everyone. Create the closed test in Play Console → Testing → Closed testing,
upload `FindIt.aab`, add the testers' Gmail addresses, and send them the opt-in link.

## 3. Store listing

| Field | Value |
|---|---|
| App name | FindIt |
| Short description (80) | Ask for what you need. Verified sellers come to you. Pay safely. |
| App icon | `docs/play-store/icon-512.png` |
| Feature graphic | `docs/play-store/feature-graphic-1024x500.png` |
| Phone screenshots | 2–8 real screenshots from a phone (Home, an item, a request, checkout, seller dashboard) |
| Category | Shopping |
| Contact email | virttechnologies.official@outlook.com |
| Website | https://www.shopwithfindit.com |
| Privacy policy | https://www.shopwithfindit.com/privacy |
| Delete account URL | https://www.shopwithfindit.com/delete-account |

**Full description**

> FindIt is a marketplace where you ask for what you need and verified sellers come to you.
>
> • Post a request: describe what you're looking for and get offers from sellers near you.
> • Shop listings from verified sellers, with photos, prices and delivery options.
> • Pay safely: your money is held until your order arrives, then released to the seller.
> • Delivery or pickup, with delivery fees shown before you pay.
> • Chat with sellers, track your orders and get alerts when something changes.
> • Sellers: list products, answer requests, manage orders and get paid to your bank.
>
> Starting in Nigeria. Payments are processed securely by Paystack.

## 4. App content answers

**Data safety.** Data is encrypted in transit (HTTPS): Yes. Users can request deletion: Yes (in the
app and at the delete-account URL). Collected (none is sold or used for advertising):

| Data | Collected | Required? | Why |
|---|---|---|---|
| Name | Yes | Required | Account, shown to the other side of an order |
| Phone number | Yes | Required | Sign-in, verification codes, order alerts |
| Email | Yes | Optional | Account |
| Approximate and precise location | Yes | Optional | Showing nearby items and sellers |
| Photos | Yes | Optional | Listing photos, profile photo, verification |
| Messages (in-app) | Yes | Optional | Buyer–seller chat |
| Purchase history | Yes | Required | Orders, refunds, records |
| Financial info (seller bank account) | Yes | Optional (sellers) | Paying sellers |
| Crash logs / diagnostics | Yes | Required | Fixing errors (Sentry) |
| Device or other IDs (push token) | Yes | Optional | Alerts |

Card details are entered on Paystack's page and never reach FindIt. Shared with service providers
only to run the app: Paystack (payments), Termii (SMS), Supabase (database), Vercel (hosting),
Sentry (errors), Google (AI that turns a buyer's description into a suggested request).

**Content rating**: marketplace with user-generated content and in-app chat; no violence, no gambling;
users can report items (Report on each item). **Target audience**: 18+. **Ads**: none.
**Financial features**: payments through Paystack, held until delivery (not a bank or lender).

## 5. Every later release

1. Raise `VERSION_NAME` in `android/version.properties` (only needed for Android-side changes).
2. Merge, then run **Play Store bundle** and upload the new `FindIt.aab` to the same track.
