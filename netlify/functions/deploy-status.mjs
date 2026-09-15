export default async (req, context) => Response.json({ok:true,version:'2.7.0',photoPolicy:'bit-real-photo-v27',
  deployId:context.deploy.id,deployContext:context.deploy.context}, {headers:{'cache-control':'no-store'}});
export const config={path:'/api/deploy-status'};
