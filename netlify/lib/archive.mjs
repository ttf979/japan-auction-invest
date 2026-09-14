import { getStore, getDeployStore } from '@netlify/blobs';

export function runtimeStore(name,{consistency='strong'}={}){
  try{
    const context=Netlify.context?.deploy?.context;
    if(context==='production') return getStore(name,{consistency});
    return getDeployStore({name,consistency});
  }catch{
    return getStore(name,{consistency});
  }
}

export const ingestStore=()=>runtimeStore('auction-ingest');
export const documentStore=()=>runtimeStore('auction-documents');
export const mediaStore=()=>runtimeStore('auction-media');

export function safeCaseId(value){
  return typeof value==='string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
}

export function safeDocId(value){
  return typeof value==='string' && /^[A-Za-z0-9._-]{1,120}$/.test(value);
}

export function safeFilePart(value='document'){
  const v=String(value).normalize('NFKC').replace(/[\\/:*?"<>|\s]+/g,'-').replace(/[^\p{L}\p{N}._-]+/gu,'-').replace(/^-+|-+$/g,'');
  return (v||'document').slice(0,80);
}
