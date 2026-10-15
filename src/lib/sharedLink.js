export function sharedCodeFromUrl(value) {
  const url=new URL(value);
  return (url.searchParams.get('shared') || new URLSearchParams(url.hash.slice(1)).get('shared') || '').trim();
}
export function sharedInvitationUrl(value,code) {
  const url=new URL(value);
  url.searchParams.set('shared',code);
  url.hash='';
  return url.href;
}
export function withoutSharedLink(value) {
  const url=new URL(value);
  url.searchParams.delete('shared');
  if(new URLSearchParams(url.hash.slice(1)).has('shared'))url.hash='';
  return url.pathname+url.search+url.hash;
}
