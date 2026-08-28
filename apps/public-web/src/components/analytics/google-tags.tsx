"use client";

import { useEffect, Suspense } from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { googleTagConfig, primaryGoogleTagId } from "@/lib/google/config";

function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!googleTagConfig.analyticsId || typeof window.gtag !== "function") return;
    const query = searchParams.toString();
    window.gtag("event", "page_view", {
      page_location: window.location.href,
      page_path: query ? `${pathname}?${query}` : pathname,
      page_title: document.title,
      send_to: googleTagConfig.analyticsId,
    });
  }, [pathname, searchParams]);

  return null;
}

export function GoogleTags() {
  if (!primaryGoogleTagId) return null;

  return (
    <>
      <Script id="google-consent-default" strategy="beforeInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});gtag('set','ads_data_redaction',true);`}
      </Script>
      <Script
        id="google-tag-loader"
        src={`https://www.googletagmanager.com/gtag/js?id=${primaryGoogleTagId}`}
        strategy="afterInteractive"
      />
      <Script id="google-tag-config" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){dataLayer.push(arguments)};gtag('js',new Date());${googleTagConfig.analyticsId ? `gtag('config','${googleTagConfig.analyticsId}',{send_page_view:false});` : ""}${googleTagConfig.adsId ? `gtag('config','${googleTagConfig.adsId}');` : ""}`}
      </Script>
      <Suspense fallback={null}><PageViewTracker /></Suspense>
    </>
  );
}
