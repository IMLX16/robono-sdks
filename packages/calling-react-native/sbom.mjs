import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
const manifest=JSON.parse(readFileSync(new URL('./package.json',import.meta.url)));
const files=[];
function scan(path) {
  for (const item of readdirSync(new URL(path+'/',import.meta.url),{withFileTypes:true})) {
    if (item.isDirectory() && ['build','.gradle'].includes(item.name)) continue;
    const name=path+'/'+item.name;
    if(item.isDirectory()) scan(name);
    else {
      const data=readFileSync(new URL(name,import.meta.url));
      files.push({fileName:'./'+name,SPDXID:'SPDXRef-File-'+files.length,
        checksums:[{algorithm:'SHA256',checksumValue:createHash('sha256').update(data).digest('hex')},{algorithm:'SHA1',checksumValue:createHash('sha1').update(data).digest('hex')}],
        licenseConcluded:'LicenseRef-RobonoSDK',licenseInfoInFiles:['LicenseRef-RobonoSDK'],copyrightText:'Copyright (c) 2026 Add to Loop LLC.'});
    }
  }
}
for(const directory of ['dist','assets','examples','android','ios']) scan(directory);
const verification=createHash('sha1').update(files.map(f=>f.checksums[1].checksumValue).sort().join('')).digest('hex');
const namespace=`https://robono.com/sbom/calling-react-native/${manifest.version}/${verification}`;
const destination=new URL('./SBOM.spdx.json',import.meta.url);
let created=new Date().toISOString();
if(existsSync(destination)) {try {const old=JSON.parse(readFileSync(destination));if(old.documentNamespace===namespace)created=old.creationInfo.created;} catch {}}
// Peers are supplied by the host, not embedded in this SDK archive. This SBOM
// inventories the actual distributed files, not the Mac's dependency tree.
writeFileSync(destination,JSON.stringify({spdxVersion:'SPDX-2.3',dataLicense:'CC0-1.0',SPDXID:'SPDXRef-DOCUMENT',
  name:manifest.name+'@'+manifest.version,documentNamespace:namespace,
  creationInfo:{created,creators:['Organization: Robono (support@robono.com)']},
  packages:[{name:manifest.name,SPDXID:'SPDXRef-Package',versionInfo:manifest.version,downloadLocation:'NOASSERTION',filesAnalyzed:true,
    packageVerificationCode:{packageVerificationCodeValue:verification},licenseConcluded:'LicenseRef-RobonoSDK',licenseDeclared:'LicenseRef-RobonoSDK',
    licenseInfoFromFiles:['LicenseRef-RobonoSDK'],copyrightText:'Copyright (c) 2026 Add to Loop LLC.',
    comment:'Host-supplied peer dependencies (not bundled): '+JSON.stringify(manifest.peerDependencies)}],
  files,relationships:[{spdxElementId:'SPDXRef-DOCUMENT',relationshipType:'DESCRIBES',relatedSpdxElement:'SPDXRef-Package'},
    ...files.map(f=>({spdxElementId:'SPDXRef-Package',relationshipType:'CONTAINS',relatedSpdxElement:f.SPDXID}))],
  hasExtractedLicensingInfos:[{licenseId:'LicenseRef-RobonoSDK',extractedText:readFileSync(new URL('./LICENSE',import.meta.url),'utf8')}],
},null,2)+'\n');
