// Public configuration only. The service_role secret belongs on the Node server.
const localGame = ['localhost', '127.0.0.1'].includes(window.location.hostname);
window.SF_CONFIG = {
  supabaseUrl: 'https://zxndmytaxmuguxjwmaij.supabase.co',
  supabasePublishableKey: 'sb_publishable_BbKYJACbZQN-QcgUwNNEhw__xdgNE_h',
  // This address becomes live only after the Render Blueprint is deployed.
  gameWebSocketUrl: localGame ? 'ws://localhost:8787/game' : 'wss://tlgo-game.onrender.com/game'
};
