import { ingestStore, safeCaseId } from '../lib/archive.mjs';
export default async(req)=>{
  if(req.method!=='GET')return Response.json({ok:false,error:'method_not_allowed'},{status:405});
  const id=new URL(req.url).searchParams.get('id')||'';if(!safeCaseId(id))return Response.json({ok:false,error:'bad_case_id'},{status:400});
  const record=await ingestStore().get(`cases/${id}`,{type:'json'}).catch(()=>null);return record?Response.json({ok:true,record},{headers:{'cache-control':'no-store'}}):Response.json({ok:false,error:'not_found'},{status:404});
};
export const config={path:'/api/case-record'};
