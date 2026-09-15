import initial from '../../data/discoveries.json' with {type:'json'};
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
