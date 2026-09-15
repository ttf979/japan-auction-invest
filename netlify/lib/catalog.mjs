import initial from '../../data/discoveries.json' with {type:'json'};
export function mergeCatalog(current=[]){
  const byId=new Map();
  for(const item of [...current,...initial]){
    const match=String(item.sourceUrl||'').match(/\/auction\/(\d+)\.html(?:[?#]|$)/);
    if(!match)continue;
    const id=match[1];
    byId.set(id,{...byId.get(id),...item,id});
  }
  return [...byId.values()];
}
