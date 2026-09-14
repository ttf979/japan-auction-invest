const DRIVE_API='https://www.googleapis.com/drive/v3';
const UPLOAD_API='https://www.googleapis.com/upload/drive/v3';
const SHEETS_API='https://sheets.googleapis.com/v4/spreadsheets';
function env(name){try{return Netlify.env.get(name);}catch{return null;}}
function qesc(s=''){return String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");}
export function driveConfigStatus(){const required=['GOOGLE_CLIENT_ID','GOOGLE_CLIENT_SECRET','GOOGLE_REFRESH_TOKEN'];const missing=required.filter(k=>!env(k));return {configured:missing.length===0,missing};}
export async function getDriveAccessToken(){
  const status=driveConfigStatus(); if(!status.configured){const e=new Error('drive_not_configured');e.code='drive_not_configured';e.missing=status.missing;throw e;}
  const body=new URLSearchParams({client_id:env('GOOGLE_CLIENT_ID'),client_secret:env('GOOGLE_CLIENT_SECRET'),refresh_token:env('GOOGLE_REFRESH_TOKEN'),grant_type:'refresh_token'});
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body});
  const data=await r.json().catch(()=>({})); if(!r.ok||!data.access_token){const e=new Error('drive_token_failed');e.detail=data;throw e;} return data.access_token;
}
async function driveFetch(url,options={}){const token=options.token||await getDriveAccessToken();const headers={...(options.headers||{}),authorization:`Bearer ${token}`};const r=await fetch(url,{...options,headers});if(!r.ok){const text=await r.text().catch(()=>r.statusText);const e=new Error(`drive_http_${r.status}`);e.status=r.status;e.detail=text;throw e;}return r;}
async function sheetsFetch(url,options={}){const token=options.token||await getDriveAccessToken();const headers={...(options.headers||{}),authorization:`Bearer ${token}`};const r=await fetch(url,{...options,headers});if(!r.ok){const text=await r.text().catch(()=>r.statusText);const e=new Error(`sheets_http_${r.status}`);e.status=r.status;e.detail=text;throw e;}return r;}

export async function findDriveItem(name,parentId,{mimeType}={}){
  const parts=[`name='${qesc(name)}'`,`trashed=false`]; if(parentId)parts.push(`'${qesc(parentId)}' in parents`); if(mimeType)parts.push(`mimeType='${qesc(mimeType)}'`);
  const u=`${DRIVE_API}/files?q=${encodeURIComponent(parts.join(' and '))}&fields=files(id,name,mimeType,size,webViewLink,parents)&pageSize=10`;
  const r=await driveFetch(u); const data=await r.json(); return data.files?.[0]||null;
}
export async function createDriveFolder(name,parentId){const token=await getDriveAccessToken();const body={name,mimeType:'application/vnd.google-apps.folder'};if(parentId)body.parents=[parentId];const r=await driveFetch(`${DRIVE_API}/files?fields=id,name,webViewLink,parents`,{token,method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return r.json();}
export async function ensureDriveFolder(name,parentId){return await findDriveItem(name,parentId,{mimeType:'application/vnd.google-apps.folder'})||await createDriveFolder(name,parentId);}
export async function uploadDriveFile({name,parentId,mimeType='application/octet-stream',bytes}){const token=await getDriveAccessToken();const boundary='chatgpt_netlify_'+Math.random().toString(36).slice(2);const meta={name};if(parentId)meta.parents=[parentId];const enc=new TextEncoder();const head=enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);const tail=enc.encode(`\r\n--${boundary}--`);const raw=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);const body=new Uint8Array(head.length+raw.length+tail.length);body.set(head,0);body.set(raw,head.length);body.set(tail,head.length+raw.length);const r=await driveFetch(`${UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,parents`,{token,method:'POST',headers:{'content-type':`multipart/related; boundary=${boundary}`},body});return r.json();}
export async function upsertDriveFile({name,parentId,mimeType='application/octet-stream',bytes}){
  const existing=await findDriveItem(name,parentId); if(!existing)return uploadDriveFile({name,parentId,mimeType,bytes});
  const token=await getDriveAccessToken(); const raw=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  const r=await driveFetch(`${UPLOAD_API}/files/${encodeURIComponent(existing.id)}?uploadType=media&fields=id,name,mimeType,size,webViewLink,parents`,{token,method:'PATCH',headers:{'content-type':mimeType},body:raw});
  const data=await r.json(); return {...existing,...data};
}

export async function upsertDriveIndexCase(x){
  const fileId=env('GDRIVE_INDEX_FILE_ID'); if(!fileId)return {skipped:true,reason:'GDRIVE_INDEX_FILE_ID_missing'};
  const token=await getDriveAccessToken(); const colRange='案件索引!A2:A10000';
  const read=await sheetsFetch(`${SHEETS_API}/${encodeURIComponent(fileId)}/values/${encodeURIComponent(colRange)}`,{token});
  const data=await read.json(); const ids=(data.values||[]).map(r=>String(r?.[0]||'')); const idx=ids.indexOf(String(x.caseId));
  const row=[x.caseId,new Date().toISOString().slice(0,10),'競売公売.com',x.sourceUrl,x.courtId||'',x.saleUnitId||'',x.bitUrl||'',x.court||'','',x.prefecture||'',x.city||'','',x.title||'',x.type||'',x.price||'',x.area||'','', '',x.bid||'',x.docStatus||'',x.docFolderUrl||'',x.imageStatus||'',x.imageFolderUrl||'',x.analysisFolderUrl||'',x.updatedAt||'',x.error||'','待分析','未評分','','','','',''];
  if(idx>=0){const rowNum=idx+2,range=`案件索引!A${rowNum}:AG${rowNum}`;const r=await sheetsFetch(`${SHEETS_API}/${encodeURIComponent(fileId)}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`,{token,method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({range,majorDimension:'ROWS',values:[row]})});return {updated:true,row:rowNum,response:await r.json()};}
  const range='案件索引!A:AG';const r=await sheetsFetch(`${SHEETS_API}/${encodeURIComponent(fileId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,{token,method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({range,majorDimension:'ROWS',values:[row]})});return {appended:true,response:await r.json()};
}
