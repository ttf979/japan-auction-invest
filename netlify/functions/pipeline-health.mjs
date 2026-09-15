import prepared from '../../data/prepared-covers.json' with {type:'json'};
export default async()=>Response.json({
 ok:true,
 extraction:'verified-build',
 preparedCases:Object.keys(prepared),
 schedule:{timezone:'Asia/Taipei',discovery:'07:00',enrichment:['08:00','09:00','10:00','11:00','12:00']}
},{headers:{'cache-control':'no-store'}});
export const config={path:'/api/pipeline-health'};
