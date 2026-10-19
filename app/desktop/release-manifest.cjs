'use strict';
// The one artifact rule shared by desktop/builder-full.cjs (names), package-desktop-downloads.cjs (packager),
// dist/downloads.js (website validator) and the desktop updater: the release version is part of the file name,
// e.g. Waraq-Full-Setup-0.3.0-x64.exe or Waraq-Portable-0.2.0-x64.exe.
const ARTIFACT=/^Waraq-(?:(?:Full|Lite)-)?(?:Setup|Portable)-([0-9]+\.[0-9]+\.[0-9]+)-x64\.exe$/;
const newer=(a,b)=>{const x=String(a).split('.').map(Number),y=String(b).split('.').map(Number);for(let i=0;i<3;i++){if((x[i]||0)!==(y[i]||0))return (x[i]||0)>(y[i]||0);}return false;};
/** Release versions in a downloads manifest. Throws if the manifest is not one this app understands. */
function releasesFromManifest(manifest){
  if(!manifest||manifest.version!==1||!Array.isArray(manifest.artifacts)||!manifest.artifacts.length)throw Error('Unrecognized downloads manifest');
  return manifest.artifacts.map((a)=>{const v=ARTIFACT.exec(a?.filename||'')?.[1];if(!v)throw Error('Unrecognized artifact name');if(a.release!==undefined&&a.release!==v)throw Error('Artifact release does not match its file name');return v;});
}
const latestRelease=(manifest)=>releasesFromManifest(manifest).sort((a,b)=>newer(a,b)?-1:1)[0];
module.exports={ARTIFACT,newer,releasesFromManifest,latestRelease};
