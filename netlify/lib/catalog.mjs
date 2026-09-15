import base from '../../data/discoveries.json' with {type:'json'};
import extra from '../../data/discoveries-extra.json' with {type:'json'};
import prices from '../../data/auction-prices.json' with {type:'json'};
const initial=[...base,...extra].map(x=>({...x,...prices[x.id]}));
export function mergeCatalog(current=[]){
  const byId=new Map();
  for(const item of [...initial,...current]){
    const match=String(item.sourceUrl||'').match(/\/auction\/(\d+)\.html(?:[?#]|$)/);
    if(!match)continue;
    const id=match[1];
    const prev=byId.get(id);
    const newer=!prev||Date.parse(item.sourceVerifiedAt||0)>Date.parse(prev.sourceVerifiedAt||0);
    byId.set(id,newer?{...prev,...item,id}:{...item,...prev,id});
  }
  return [...byId.values()];
}
