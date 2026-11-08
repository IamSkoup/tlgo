import {SupabaseStore} from './persistence.mjs';
import {createGameTransport} from './transport.mjs';

const PORT=Number(process.env.PORT||8787);
const origins=(process.env.ALLOWED_ORIGINS||'http://localhost:8080').split(',');
const store=new SupabaseStore(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
const app=createGameTransport({store,origins});
app.server.listen(PORT,'0.0.0.0',()=>console.info(`Savanna game server listening on ${PORT}`));
process.on('SIGTERM',()=>app.close().then(()=>process.exit(0)));
process.on('SIGINT',()=>app.close().then(()=>process.exit(0)));
