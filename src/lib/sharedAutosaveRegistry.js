import {SharedAutosave} from './sharedAutosave';
import {collaborationRequest,normalizeInviteCode,tokenFor} from './collaboration';
const stores=new Map();
export function sharedAutosaveStore(code){
  const key=normalizeInviteCode(code);
  if(!stores.has(key))stores.set(key,new SharedAutosave({code,send:flight=>collaborationRequest('saveContributions',{code,guestToken:tokenFor('guest',code),requestId:flight.requestId,items:flight.items})}));
  return stores.get(key);
}
