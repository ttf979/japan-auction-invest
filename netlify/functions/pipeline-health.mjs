import prepared from '../../data/prepared-covers.json' with {type:'json'};
export default async()=>Response.json({ok:true,extraction:'verified-build',preparedCases:Object.keys(prepared)},{headers:{'cache-control':'no-store'}});
export const config={path:'/api/pipeline-health'};
