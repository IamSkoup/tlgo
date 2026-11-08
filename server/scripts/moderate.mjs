// Admin-only terminal utility. Run on the secured game server with its .env.
// It is intentionally not exposed as a public API or a player-side command.
import {SupabaseStore} from '../src/persistence.mjs';

const store=new SupabaseStore(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const api=store.api;
const [command,id,hours,...reasonParts]=process.argv.slice(2);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unwrap=({data,error})=>{if(error)throw Error(error.message);return data};
const usage='Run: npm run moderate -- reports | ban USER_UUID HOURS REASON | unban USER_UUID';
try{
  if(command==='reports'){
    const rows=unwrap(await api.from('reports').select('id,reporter,reported,body,created_at').order('created_at',{ascending:false}).limit(50));
    console.log(JSON.stringify(rows,null,2));
  }else if(command==='ban'){
    if(!uuid.test(id)||!Number.isInteger(Number(hours))||Number(hours)<1||Number(hours)>24*365||reasonParts.join(' ').trim().length<8)throw Error(usage);
    const reason=reasonParts.join(' ').trim().slice(0,500);
    const expires_at=new Date(Date.now()+Number(hours)*3600000).toISOString();
    unwrap(await api.from('sanctions').insert({user_id:id,reason,expires_at}));
    unwrap(await api.from('game_audit').insert({actor:null,kind:'admin_ban',details:{user_id:id,expires_at,reason}}));
    console.log('Sanction created for',id,'until',expires_at);
  }else if(command==='unban'){
    if(!uuid.test(id))throw Error(usage);
    const removed=unwrap(await api.from('sanctions').delete().eq('user_id',id).select('id'));
    unwrap(await api.from('game_audit').insert({actor:null,kind:'admin_unban',details:{user_id:id,removed:removed.length}}));
    console.log('Removed',removed.length,'sanctions for',id);
  }else throw Error(usage);
}catch(error){console.error('Moderation failed:',error.message);process.exitCode=1}
