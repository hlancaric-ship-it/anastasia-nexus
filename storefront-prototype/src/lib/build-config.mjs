// Validate before writing dist: an offline design build must never silently replace a connected preview.
export function publicBuildConfig(env) {
  const names=['ANASTASIA_API_ORIGIN','ANASTASIA_PUBLISHABLE_KEY','ANASTASIA_REGION_ID','ANASTASIA_STRIPE_PUBLISHABLE_KEY'];
  const supplied=names.map(name=>String(env[name]||'').trim());
  if(env.ANASTASIA_OFFLINE_FIXTURES==='1'){
    if(supplied.some(Boolean))throw Error('Offline fixtures cannot be combined with a real backend configuration');
    return {offline:true,apiBaseUrl:'',publishableKey:'',regionId:'',stripePublishableKey:''};
  }
  if(supplied.some(v=>!v))throw Error('Connected build requires ANASTASIA_API_ORIGIN, ANASTASIA_PUBLISHABLE_KEY, ANASTASIA_REGION_ID and ANASTASIA_STRIPE_PUBLISHABLE_KEY. Offline tests must explicitly use ANASTASIA_OFFLINE_FIXTURES=1. Existing dist was not changed.');
  const [apiBaseUrl,publishableKey,regionId,stripePublishableKey]=supplied;
  let origin;try{origin=new URL(apiBaseUrl);}catch{throw Error('Invalid backend origin');}
  if(origin.username||origin.password||origin.search||origin.hash||origin.pathname!=='/'||!(origin.protocol==='https:'||origin.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(origin.hostname)))throw Error('Backend must be an HTTPS origin or local loopback origin');
  if(!/^pk_[A-Za-z0-9_]+$/.test(publishableKey)||!/^reg_[A-Za-z0-9_]+$/.test(regionId)||!/^pk_(test|live)_[A-Za-z0-9_]+$/.test(stripePublishableKey))throw Error('Invalid public build configuration; never use secret keys in the storefront');
  return {offline:false,apiBaseUrl:origin.origin,publishableKey,regionId,stripePublishableKey};
}
