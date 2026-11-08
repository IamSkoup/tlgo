export const SHOP_ITEMS = Object.freeze({
  berries: {code:'berries',name:'Лесные ягоды',category:'food',price:12,hunger:22,heal:0,description:'Лёгкий перекус, когда тропа ещё длинная.'},
  meat: {code:'meat',name:'Вяленое мясо',category:'food',price:24,hunger:46,heal:0,description:'Плотная еда для дальних переходов.'},
  fish: {code:'fish',name:'Сушёная рыба',category:'food',price:19,hunger:35,heal:0,description:'Запас еды с водопоя.'},
  fruit: {code:'fruit',name:'Плоды баобаба',category:'food',price:15,hunger:28,heal:0,description:'Сытные плоды в дорогу.'},
  herb: {code:'herb',name:'Лечебные травы',category:'medicine',price:28,hunger:0,heal:38,description:'Восстанавливает здоровье, когда безопасно остановиться.'}
});

export const SHOPS = Object.freeze({
  'shop-camp': {id:'shop-camp',name:'Ньота · Припасы',species:'gazelle',x:-61,z:50,items:['berries','meat','fruit'],description:'Запасы у лагеря. Еда для тех, кто собрался в путь.'},
  'shop-water': {id:'shop-water',name:'Бахати · Водопой',species:'monkey',x:82,z:41,items:['berries','fish','fruit'],description:'Торговля у водопоя. Можно перекусить перед дорогой.'},
  'shop-tree': {id:'shop-tree',name:'Макини · Травница',species:'monkey',x:-82,z:105,items:['herb','fruit','berries'],description:'Травы и припасы у дерева Рафики.'}
});

export const MAX_HUNGER = 100;
export const HUNGER_LOSS_PER_SECOND = 0.065;
export const HUNGER_SPRINT_MULTIPLIER = 1.7;

export function hungerAfter(hunger,seconds,sprinting=false){
  if(!Number.isFinite(seconds)||seconds<0)return hunger;
  return Math.max(0,Math.min(MAX_HUNGER,hunger)-seconds*HUNGER_LOSS_PER_SECOND*(sprinting?HUNGER_SPRINT_MULTIPLIER:1));
}

export function itemEffect(item,hunger,hp,maxHp){
  if(!item)return null;
  return {hunger:Math.min(MAX_HUNGER,hunger+item.hunger),hp:Math.min(maxHp,hp+item.heal)};
}
