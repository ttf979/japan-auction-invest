import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
mkdirSync('public', {recursive:true});
for (const name of ['index.html','app.js','styles.css','data']) cpSync(name,`public/${name}`,{recursive:true});
const manifest=JSON.parse(readFileSync('DEPLOY_MANIFEST.json','utf8'));
writeFileSync('public/DEPLOY_MANIFEST.json',JSON.stringify({...manifest,commit:process.env.COMMIT_REF||null,deployId:process.env.DEPLOY_ID||null}));
