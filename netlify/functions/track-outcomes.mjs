import {trackOutcomes} from '../lib/outcome-tracking.mjs';
export default async()=>{console.log(JSON.stringify(await trackOutcomes()));};
export const config={schedule:'15 1 * * *'};
