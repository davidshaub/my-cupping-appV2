import { normalizeInviteCode } from './collaboration.js';

export const readSharedCuppings = () => {
  try { const entries=JSON.parse(localStorage.getItem('osito_invitations')||'[]');return Array.isArray(entries)?entries.filter(e=>e&&typeof e.code==='string'):[]; }
  catch { return []; }
};
export function rememberSharedCupping(result) {
  if (!result?.isHost || !result.invitation || !Array.isArray(result.coffees)) return;
  const entries=readSharedCuppings(),invite=result.invitation;
  const index=entries.findIndex(entry=>normalizeInviteCode(entry.code)===normalizeInviteCode(invite.code));
  const previous=entries[index]||{};
  const entry={...previous,code:invite.code,name:invite.name,date:invite.date||previous.date||invite.createdAt||'',createdAt:invite.createdAt||previous.createdAt||'',sourceSessionId:invite.sourceSessionId||'',searchVersion:1,coffees:result.coffees.map(coffee=>({syncId:coffee.syncId,ositoId:coffee.ositoId||'',lotName:coffee.lotName||'',country:coffee.country||'',processing:coffee.processing==='Other'?coffee.processingOther||'':coffee.processing||''}))};
  if(index<0)entries.unshift(entry);else entries[index]=entry;
  localStorage.setItem('osito_invitations',JSON.stringify(entries));
  return entry;
}
const normalize=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function matchesSharedCupping(entry,query) {
  const haystack=normalize([entry.name,entry.code,normalizeInviteCode(entry.code),entry.date,entry.createdAt,entry.sourceSessionId,...(entry.coffees||[]).flatMap(coffee=>[coffee.syncId,coffee.ositoId,coffee.lotName,coffee.country,coffee.processing])].join(' '));
  return normalize(query).trim().split(/\s+/).filter(Boolean).every(term=>haystack.includes(term));
}
