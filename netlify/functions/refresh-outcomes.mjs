import {trackOutcomes} from '../lib/outcome-tracking.mjs';
export default async()=>Response.json(await trackOutcomes());
export const config={path:'/api/refresh-outcomes',method:'POST'};
