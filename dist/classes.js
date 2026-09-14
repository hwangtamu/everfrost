export const HERO_CLASSES={
 vanguard:{name:'Vanguard',icon:'shield',color:'#d4bd7b',description:'A steadfast front-line guardian who turns armor and heavy weapons into staying power.',trait:'Highest base armor and life · built for close combat',preferred:['sword','greatsword'],base:{attack:9,attackPerLevel:3,defense:2,defensePerLevel:1,maxHp:90,hpPerLevel:15,crit:.08,critMultiplier:1.8,movementSpeed:5.8}},
 ranger:{name:'Ranger',icon:'bow',color:'#9fca87',description:'A swift hunter who controls distance with rapid shots and high critical accuracy.',trait:'High critical chance · fastest base movement',preferred:['bow'],base:{attack:8,attackPerLevel:3.1,defense:1.5,defensePerLevel:.8,maxHp:82,hpPerLevel:13,crit:.12,critMultiplier:1.9,movementSpeed:6.35}},
 mage:{name:'Mage',icon:'staff',color:'#aeb8ef',description:'A runecaster who fights from range and channels elemental damage through a staff.',trait:'+20% elemental damage · strongest class abilities',preferred:['staff'],base:{attack:10,attackPerLevel:3.2,defense:1,defensePerLevel:.65,maxHp:76,hpPerLevel:12,crit:.1,critMultiplier:2,movementSpeed:5.8}}
};
export const HERO_CLASS_IDS=Object.keys(HERO_CLASSES);
export const heroClass=s=>HERO_CLASSES[s?.heroClass]||HERO_CLASSES.vanguard;

export const SKILLS=[
 {id:'cleave',classId:'vanguard',name:'Runic cleave',icon:'swords',key:'1',level:1,cooldown:9,range:'weaponPlus',physical:3,elemental:3,description:'Deal 3× attack damage within weapon range + 1.1 tiles. Each target can critically strike.'},
 {id:'mend',classId:'vanguard',name:'Forest blessing',icon:'leaf',key:'2',level:3,cooldown:18,heal:.45,cleanse:true,description:'Restore 45% of maximum health and remove chill.'},
 {id:'storm',classId:'vanguard',name:'Thunderstrike',icon:'zap',key:'3',level:5,cooldown:25,range:6,physical:0,attackAsElemental:5,elemental:5,description:'Strike visible enemies within 6 tiles for 5× attack as lightning damage.'},
 {id:'volley',classId:'ranger',name:'Splinter volley',icon:'bow',key:'1',level:1,cooldown:7,range:'weaponPlusSmall',physical:2.4,elemental:2.4,description:'Loose a piercing volley at every foe within weapon range + 0.7 tiles for 2.4× damage.'},
 {id:'secondWind',classId:'ranger',name:'Second wind',icon:'leaf',key:'2',level:3,cooldown:15,heal:.38,cleanse:true,description:'Restore 38% of maximum health, remove chill, and quickly return to the hunt.'},
 {id:'arrowRain',classId:'ranger',name:'Rain of arrows',icon:'arrows',key:'3',level:5,cooldown:22,range:7,physical:4.2,elemental:4.2,description:'Rain arrows on every visible foe within 7 tiles for 4.2× damage.'},
 {id:'arcaneNova',classId:'mage',name:'Arcane nova',icon:'sparkles',key:'1',level:1,cooldown:8,range:4.5,physical:0,attackAsElemental:3.2,elemental:3.2,description:'Release a 4.5-tile nova for 3.2× spell damage that bypasses armor.'},
 {id:'manaWard',classId:'mage',name:'Runic ward',icon:'shield',key:'2',level:3,cooldown:17,heal:.42,cleanse:true,description:'Restore 42% of maximum health and remove chill with a protective ward.'},
 {id:'meteor',classId:'mage',name:'Falling star',icon:'meteor',key:'3',level:5,cooldown:24,range:7,physical:0,attackAsElemental:6,elemental:6,description:'Call a falling star against every visible foe within 7 tiles for 6× spell damage.'}
];
export const skillsFor=s=>SKILLS.filter(skill=>skill.classId===(HERO_CLASSES[s?.heroClass]?s.heroClass:'vanguard'));
export const skillById=id=>SKILLS.find(skill=>skill.id===id);
