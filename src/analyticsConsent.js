import * as CookieConsent from "vanilla-cookieconsent";

const GOOGLE_TAG_MANAGER_ID = "GTM-WRRKFWJC";
const MICROSOFT_CLARITY_ID = "zinx0glfhe";

export function getAnalyticsCategory() {
  return {
    enabled: true,
    autoClear: {
      cookies: [
        { name: /^_ga/ },
        { name: /^_gid$/ },
        { name: /^_gat/ },
        { name: "_gcl_au" },
        { name: /^_dc_gtm_/ },
        { name: /^_gac_/ },
        { name: "_clck" },
        { name: "_clsk" },
        { name: "_cltk" },
        { name: "CLID" },
        { name: "ANONCHK" },
        { name: "MR" },
        { name: "MUID" },
        { name: "SM" },
      ],
      reloadPage: true,
    },
    services: {
      google_tag_manager: {
        label: "Google Tag Manager",
      },
      microsoft_clarity: {
        label: "Microsoft Clarity",
      },
    },
  };
}

export function syncAnalyticsWithConsent() {
  if (!CookieConsent.acceptedCategory("analytics")) return;

  if (!document.getElementById("google-tag-manager")) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
    window.gtag("js", new Date());

    const googleTagManager = document.createElement("script");
    googleTagManager.id = "google-tag-manager";
    googleTagManager.async = true;
    googleTagManager.src = `https://www.googletagmanager.com/gtm.js?id=${GOOGLE_TAG_MANAGER_ID}`;
    document.head.append(googleTagManager);
  }

  if (!document.getElementById("microsoft-clarity")) {
    const clarity = document.createElement("script");
    clarity.id = "microsoft-clarity";
    clarity.textContent = `(function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "${MICROSOFT_CLARITY_ID}");`;
    document.head.append(clarity);
  }
}
