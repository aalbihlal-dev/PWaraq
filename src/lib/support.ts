// "Report a problem": opens the website's support page with the version, system and language already in the link's
// fragment (the part after # never reaches the server; the page reads it in the browser).
import { isDesktop, openExternal } from './desktop';
import { version } from './update.svelte';
import { i18n } from './i18n.svelte';

function system(): string {
  if (isDesktop) return 'Windows app';
  const ua = navigator.userAgent, nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'browser';
  const platform = nav.userAgentData?.platform || (/Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '');
  return `${browser} on ${platform}`.trim();
}
export const supportUrl = () => `https://www.pwaraq.com/support#v=${encodeURIComponent(version)}&os=${encodeURIComponent(system())}&lang=${i18n.lang}`;
export const reportProblem = () => (isDesktop ? openExternal(supportUrl()).catch(() => {}) : void window.open(supportUrl(), '_blank', 'noopener'));
