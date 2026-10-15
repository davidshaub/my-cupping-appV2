import React, { useEffect, useState } from 'react';
import { hostTokenFor, readSharedReport } from '../lib/collaboration';
import { matchesSharedCupping, readSharedCuppings, rememberSharedCupping } from '../lib/sharedCuppingSearch';

export default function SharedCuppingList({ onOpen }) {
  const [entries,setEntries]=useState(readSharedCuppings),[query,setQuery]=useState(''),[indexing,setIndexing]=useState(false),[failed,setFailed]=useState(false),[retry,setRetry]=useState(0);
  useEffect(()=>{
    let active=true;
    const pending=readSharedCuppings().filter(entry=>entry.searchVersion!==1&&hostTokenFor(entry.code));
    if(!pending.length)return;
    setIndexing(true);setFailed(false);
    const worker=async()=>{
      while(active&&pending.length){
        const entry=pending.shift();
        try {
          const result=await readSharedReport(entry.code);
          if(!active)return;
          if(!result.isHost)throw new Error('Host access unavailable.');
          rememberSharedCupping(result);setEntries(readSharedCuppings());
        }catch{if(active)setFailed(true);}
      }
    };
    Promise.all([worker(),worker()]).finally(()=>{if(active)setIndexing(false);});
    return()=>{active=false;};
  },[retry]);
  const filtered=entries.filter(entry=>matchesSharedCupping(entry,query));
  return <>
    <div className="collab-shared-search"><label htmlFor="shared-cupping-search">Search shared cuppings</label><div className="collab-row"><input id="shared-cupping-search" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Session code, Osito ID, coffee name…"/>{query&&<button onClick={()=>setQuery('')}>Clear search</button>}</div></div>
    {indexing&&<p className="collab-muted" role="status">Loading coffee details for older invitations…</p>}
    {failed&&!indexing&&<p className="collab-muted">Some coffee details could not be loaded. <button onClick={()=>setRetry(value=>value+1)}>Retry</button></p>}
    <div className="collab-shared-list" aria-live="polite">{filtered.map(entry=><button className="collab-owned-invitation" key={entry.code} onClick={()=>onOpen(entry)}><span>{entry.name} · {entry.code}</span>{entry.coffees?.length>0&&<small>{entry.coffees.map(coffee=>[coffee.lotName,coffee.ositoId].filter(Boolean).join(' · ')).join('; ')}</small>}</button>)}</div>
    {!filtered.length&&<p className="collab-muted">{entries.length?'No shared cuppings match your search.':'No shared cuppings yet.'}</p>}
  </>;
}
