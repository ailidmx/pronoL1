# Google Analytics and Google Ads setup

The public application uses one Google tag foundation for GA4 and Google Ads.
It does not initialize Firebase Analytics separately, which would duplicate
page views. Firebase may still own/link the GA4 property.

## Required configuration

Configure these public identifiers in the public app hosting environment:

- `NEXT_PUBLIC_GOOGLE_ANALYTICS_ID=G-3QE39K3F79`
- `NEXT_PUBLIC_GOOGLE_ADS_ID=AW-...`

They are routing identifiers, not secrets. Never add service-account JSON,
API secrets or credentials to these variables.

The GA4 Measurement ID is committed in `public-web/apphosting.yaml` so Firebase
App Hosting injects it at build and runtime. The Firebase browser API key shown
when registering the web app is also a public client identifier, but it is not
required by the direct Google tag integration. Firebase SDK configuration will
be introduced separately when the public app starts consuming Auth/Firestore.

In Firebase Console, link or create the GA4 property for the public web app,
then copy its Web stream Measurement ID (`G-...`). In Google Ads, link that
GA4 property and copy the Google Ads tag ID (`AW-...`).

## Consent behavior

Consent Mode v2 defaults all four signals to `denied` before the Google tag
loads: `analytics_storage`, `ad_storage`, `ad_user_data` and
`ad_personalization`. Visitors can accept all, allow audience measurement only,
or reject all, and can reopen their choices from the footer.

The implementation uses advanced consent mode. A certified CMP may replace the
first-party banner before serving personalized ads in regulated markets. Legal
copy, privacy policy, retention settings and regional requirements still need
owner/legal validation before production advertising.

## Event contract

- page views are emitted on App Router navigation
- product events use `trackEvent`
- Ads conversions use `trackGoogleAdsConversion` with a configured
  `AW-.../conversion-label` destination
- every business conversion should also carry experiment and monetization
  policy context once the analytics event model is introduced

Validate production with Tag Assistant, GA4 DebugView and a test Ads conversion
before enabling campaigns.
