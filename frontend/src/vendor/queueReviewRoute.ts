/** Request identity is subordinate to its authorized business/location context. */
export function clearQueueReview(search:string){const next=new URLSearchParams(search);next.delete('request');next.delete('requestLocation');return next.toString();}
export function openQueueReview(search:string,requestId:string,locationSlug:string){const next=new URLSearchParams(search);next.set('request',requestId);next.set('requestLocation',locationSlug);return next.toString();}
export function scopedQueueReviewId(search:string,locationSlug:string){const params=new URLSearchParams(search),bound=params.get('requestLocation');return bound&&bound!==locationSlug?null:params.get('request');}
export function initialQueueLocation(locations:Array<{slug:string;isPrimary?:boolean}>,search:string){const params=new URLSearchParams(search),bound=params.get('request')?params.get('requestLocation'):null;return locations.find(item=>item.slug===bound)?.slug||locations.find(item=>item.isPrimary)?.slug||locations[0]?.slug||'';}

export function clearConfirmedDraftSelection(search:string,deletedId:string,locationSlug:string){return scopedQueueReviewId(search,locationSlug)===deletedId?clearQueueReview(search):search;}
