const DEPARTMENTS = [
 {id:"politics",keywords:["government","minister","election","parliament","politic","president","prime minister"]},
 {id:"world",keywords:["international","world","foreign","diplom","war","united nations","global"]},
 {id:"crime-safety",keywords:["crime","police","arrest","murder","terror","accident","fire"]},
 {id:"courts-legal",keywords:["court","judge","law","legal","supreme court","verdict"]},
 {id:"business-economy",keywords:["business","economy","economic","trade","industry","company","market"]},
 {id:"finance-markets",keywords:["finance","bank","stock","budget","tax","currency","inflation"]},
 {id:"sports",keywords:["sport","cricket","football","tennis","match","team","player"]},
 {id:"technology-ai",keywords:["technology","tech","ai","artificial intelligence","cyber","software"]},
 {id:"science-health",keywords:["science","health","medical","hospital","disease","research","vaccine"]},
 {id:"climate-environment",keywords:["climate","environment","weather","flood","earthquake","pollution"]},
 {id:"education",keywords:["education","school","university","student","exam","teacher"]},
 {id:"agriculture-rural",keywords:["agriculture","farmer","crop","wheat","cotton","livestock","rural"]},
 {id:"pakistan",keywords:["pakistan","pakistani","islamabad","lahore","karachi","punjab"]},
 {id:"provincial-local",keywords:["province","provincial","district","local","municipal","city council"]},
 {id:"audience-social",keywords:["viral","social media","audience","online trend"]},
 {id:"security-privacy",keywords:["security","privacy","data breach","hacking","leak"]},
 {id:"assignment-desk",keywords:[]},{id:"editor-in-chief",keywords:[]},{id:"research",keywords:[]},
 {id:"verification",keywords:[]},{id:"fact-check",keywords:[]},{id:"urdu-english",keywords:[]},
 {id:"copy-editing",keywords:[]},{id:"photo-visuals",keywords:[]},{id:"seo-distribution",keywords:[]},
 {id:"ethics-standards",keywords:[]}
];
export function routeCandidate(candidate) {
 const haystack=(candidate.title||"").toLowerCase();
 const matches=DEPARTMENTS.filter(d=>d.keywords.length && d.keywords.some(k=>haystack.includes(k))).map(d=>d.id);
 const primary=matches[0]||"assignment-desk";
 return {...candidate,departmentTargets:[...new Set(["research","verification",primary,...matches])],routingStatus:"suggested_only",status:candidate.status||"candidate_unverified"};
}
export function routeCandidates(items=[]){return items.map(routeCandidate);}
export {DEPARTMENTS};
