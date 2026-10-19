'use strict';
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'";
function isLocalUrl(value, origin) {
  try { const url = new URL(value); return url.origin === origin && !url.username && !url.password; } catch { return false; }
}
function allowedRequest(value, origin) {
  if (isLocalUrl(value,origin)) return true;
  try { const url = new URL(value); return url.protocol==='data:' || (url.protocol==='blob:' && url.origin===origin); } catch { return false; }
}
function safeExternalUrl(value) {
  if (typeof value!=='string' || value.length>4096 || /[\u0000-\u001f\u007f]/.test(value)) return null;
  try { const url=new URL(value); return url.protocol==='https:' && !url.username && !url.password && url.hostname ? url.href : null; } catch { return null; }
}
module.exports={CSP,isLocalUrl,allowedRequest,safeExternalUrl};
