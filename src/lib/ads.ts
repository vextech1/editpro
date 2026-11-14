// Adsterra ad units for editpro.site. Codes come from the Adsterra dashboard (Websites > Ad tags).
// Turn a unit off by setting enabled to false; nothing else needs to change.
import { SITE } from '#lib/site.ts';

export const ADS = {
  // Shown inside the page, in AdSlot.svelte.
  nativeBanner: {
    enabled: true,
    src: 'https://bauval.org/21/f9dc1e6e01756c0938d02bf426946196',
    container: 'container-f9dc1e6e01756c0938d02bf426946196'
  },
  // A small bar that slides in at the screen edge. Loaded once per visit on the pages in adPage().
  socialBar: { enabled: true, src: 'https://bauval.org/14/4122ffca4bb90152b05c69247f5b7dfa' },
  // Opens a new tab behind the page on the first click. Off by default: on a tool site the first click is
  // usually "Choose a file", and pop-unders are the ad type most likely to get a site flagged by browsers.
  popunder: { enabled: false, src: 'https://abscloud.org/1/574ff1d28328ff6498144c3c82929b60' }
};

/** Ads run only on the real site, never in development or on preview and test addresses (the units are approved for one domain). */
export function adsEnabled(): boolean {
  if (typeof location === 'undefined' || import.meta.env.DEV) return false;
  const host = new URL(SITE.origin).hostname;
  return location.hostname === host || location.hostname === `www.${host}`;
}

/** Pages that carry ads. Editors and settings stay ad-free so work is not interrupted. */
export const adPage = (path: string) => path === '/' || path === '/tools' || path.startsWith('/tools/');

export function addScript(src: string, async = false): HTMLScriptElement {
  const s = document.createElement('script');
  s.src = src; s.async = async; s.setAttribute('data-cfasync', 'false');
  document.body.appendChild(s);
  return s;
}

let siteAdsLoaded = false;
/** Loads the units that live outside the page content. Safe to call many times; it loads once. */
export function loadSiteAds() {
  if (siteAdsLoaded || !adsEnabled()) return;
  siteAdsLoaded = true;
  if (ADS.socialBar.enabled) addScript(ADS.socialBar.src);
  if (ADS.popunder.enabled) addScript(ADS.popunder.src);
}
