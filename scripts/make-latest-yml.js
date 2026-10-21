'use strict';
// Creates the file read by electron-updater from the GitHub "latest" release.
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const pkg=require('../package.json');
const dist=path.join(__dirname,'..','dist');
const file=fs.readdirSync(dist).find(name=>/Setup .+\.exe$/i.test(name));
if(!file)throw new Error('Windows installer not found in dist.');
const full=path.join(dist,file),buffer=fs.readFileSync(full);
const sha512=crypto.createHash('sha512').update(buffer).digest('base64');
const q=value=>JSON.stringify(value);
const out=[
  `version: ${pkg.version}`,
  'files:',
  `  - url: ${q(file)}`,
  `    sha512: ${sha512}`,
  `    size: ${buffer.length}`,
  `path: ${q(file)}`,
  `sha512: ${sha512}`,
  `releaseDate: ${new Date().toISOString()}`,
  ''
].join('\n');
fs.writeFileSync(path.join(dist,'latest.yml'),out,'utf8');
