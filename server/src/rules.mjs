export const TICK_RATE = 20;
export const SNAPSHOT_RATE = 10;
export const ROOM_LIMIT = 18;
export const PUBLIC_ROOM_ID = '00000000-0000-4000-8000-000000000001';
export const MAX_COORD = 340;
export const SPAWN = { x: -68, z: 45 };
export const SAFE_ZONES = [
  { x: -68, z: 45, r: 35 },
  { x: -105, z: -98, r: 49 },
  { x: -45, z: 0, r: 34 }
];
export const QUESTS = {
  rafiki: { title: 'Травы для Рафики', description: 'Собери три целебных растения.', kind: 'gather', count: 3, reward: 75, xp: 65, contact: 'Рафики' },
  fuli: { title: 'Следопыт Фули', description: 'Доберись до водопоя и к скале.', kind: 'visit', count: 2, reward: 95, xp: 80, contact: 'Фули', stops: [{x:76,z:26},{x:-105,z:-98}] },
  kion: { title: 'Патруль Кайона', description: 'Победи двух агрессивных гиен.', kind: 'hunt', count: 2, reward: 130, xp: 110, contact: 'Кайон' }
};
export const COOP_OPERATION={id:'joint_patrol',title:'Совместный дозор',description:'Вдвоём соберите две связки лекарственных трав, затем остановите двух опасных гиен.',reward:220,xp:180,stages:[{key:'gather',name:'Травы для дозора',count:2},{key:'hunt',name:'Защита троп',count:2}]};
export const CONTACTS = {
  kion:{name:'Кайон',x:-45,z:0,quest:'kion',lines:['Привет. В Чужеземье опять неспокойно. Нам бы ещё пару крепких лап для патруля.','Защищать земли — это не значит бросаться на всех подряд. Сначала разберись, кто здесь действительно опасен.']},
  fuli:{name:'Фули',x:-17,z:26,quest:'fuli',lines:['Ты только посмотри на эти следы. Если доберёшься от водопоя до Скалы Прайда, я поверю, что ты знаешь наши тропы.','Ну что, бегать умеешь? Проверим. Только не жалуйся, что я слишком быстрая.']},
  rafiki:{name:'Рафики',x:-102,z:91,quest:'rafiki',lines:['Хм-м. Природа кое-что шепчет. Принеси лечебных трав, и сам увидишь, сколько пользы можно принести без драки.','Спешить иногда нужно, но сначала посмотри под ноги. Самое ценное растёт совсем рядом.']},
  simba:{name:'Симба',x:-105,z:-88,lines:['На этих землях каждый может найти своё место. Пока помнишь об ответственности перед другими.']},
  nala:{name:'Нала',x:-92,z:-85,lines:['Следи за слабым звеном своей стаи. Сила нужна не для того, чтобы ей хвастаться.']},
  kiara:{name:'Киара',x:-91,z:-66,lines:['Хочешь уйти к дальним холмам? Там удивительно красиво. И местами совсем не безопасно.']},
  jasiri:{name:'Джазири',x:146,z:-105,lines:['У нас свои дороги и свои правила. Не суди гиену по одному только имени.']},
  bunga:{name:'Банга',x:-40,z:15,lines:['Страшно? А я вот не боюсь! Ладно, иногда боюсь. Но совсем чуть-чуть.']},
  beshte:{name:'Бешти',x:70,z:47,lines:['У водопоя почти всегда можно встретить кого-нибудь интересного. Только не мутите воду.']},
  ono:{name:'Оно',x:-40,z:-7,lines:['Я уже заметил движение на дальних скалах. Если собрался туда, действуй осторожно.']},
  anga:{name:'Анга',x:-155,z:-150,lines:['С высоты видно больше, чем кажется. Изучи местность, прежде чем ввязываться в драку.']},
  makini:{name:'Макини',x:-93,z:98,lines:['Рафики опять отправил меня за травами. Надеюсь, в этот раз никто не съест наши припасы.']},
  zazu:{name:'Зазу',x:-109,z:-78,lines:['Тишины, пожалуйста! Королевские земли — не место для бесконтрольной суматохи.']},
  timon:{name:'Тимон',x:24,z:64,lines:['Главное — найти место, где вкусно кормят и никто не гоняется за тобой.']},
  pumbaa:{name:'Пумба',x:26,z:70,lines:['Своих друзей мы не бросаем. Даже если путь лежит через половину саванны.']},
  janja:{name:'Джанджа',x:254,z:-144,lines:['Заблудился? Ну тогда тебе точно не стоило заходить так далеко.']},
  cheezi:{name:'Чизи',x:262,z:-157,lines:['Хе-хе. Мы тут вообще ничего не делаем. Правда-правда.']},
  chungu:{name:'Чунгу',x:267,z:-148,lines:['Чего смотришь? Иди своей дорогой, пока не передумали.']}
};
export const RESOURCES = [
  { id:'herb-a',x:-77,z:60,type:'herb' },{ id:'herb-b',x:-23,z:62,type:'herb' },
  { id:'herb-c',x:9,z:101,type:'herb' },{ id:'herb-d',x:79,z:60,type:'herb' },
  { id:'herb-e',x:-136,z:114,type:'herb' },{ id:'herb-f',x:169,z:143,type:'herb' },
  { id:'stone-a',x:-168,z:-188,type:'relic' },{ id:'stone-b',x:185,z:-191,type:'relic' }
];
export const NPC_DEFS = [
  {id:'guard-patrol',species:'lion',name:'Страж Скалы Прайда',x:-107,z:-64,hp:180,hostile:false,guard:true},
  {id:'hyena-1',species:'hyena',name:'Дикая гиена',x:27,z:99,hp:75,hostile:true},
  {id:'hyena-2',species:'hyena',name:'Дикая гиена',x:125,z:-102,hp:75,hostile:true},
  {id:'hyena-3',species:'hyena',name:'Дикая гиена',x:202,z:-123,hp:85,hostile:true},
  {id:'gazelle-1',species:'gazelle',name:'Газель',x:43,z:111,hp:75,hostile:false},
  {id:'zebra-1',species:'zebra',name:'Зебра',x:-118,z:167,hp:125,hostile:false},
  {id:'warthog-1',species:'warthog',name:'Бородавочник',x:90,z:-74,hp:100,hostile:false}
];
export const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);
export const safe = p => SAFE_ZONES.some(s => distance(p,s) < s.r);
export const clamp = (n,min,max) => Math.min(max,Math.max(min,n));
export const cleanText = (s,max=350) => typeof s==='string' ? s.trim().slice(0,max) : '';
export function validateInput(raw) {
  const mx = Number(raw.x), mz = Number(raw.z);
  if (!Number.isFinite(mx)||!Number.isFinite(mz)||Math.abs(mx)>10||Math.abs(mz)>10) return null;
  const len = Math.hypot(mx,mz);
  return { x:len>1?mx/len:mx,z:len>1?mz/len:mz,sprint:raw.sprint===true,jump:raw.jump===true };
}
