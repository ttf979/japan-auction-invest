import build from '../../data/build-info.json' with {type:'json'};
export default async () => Response.json({ok:true,...build,photoPolicy:'bit-real-photo-v27'}, {headers:{'cache-control':'no-store'}});
export const config={path:'/api/deploy-status'};
