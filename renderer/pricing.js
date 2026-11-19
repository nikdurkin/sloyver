export const defaultQuote={quantity:1,hourRate:100,preparation:150,postprocessing:0,markup:30,reserve:5,waste:10,minimum:300,averageFlow:6,addSupports:true,supportInfill:15,slicerMass:null,slicerHours:null,slicerContext:null,priceOverrides:{},supportPrice:0,interfaceGrams:0,interfacePrice:0,purgeGrams:0,brimGrams:0,supportRemovalMinutes:0,laborRate:600,plateSetup:0};
export function estimatedMass(mesh,pose,profile,material){
  if(!mesh?.closed||!mesh.volume||!pose)return null;
  // First-order shell volume, with overlaps clamped to total volume. This is
  // deliberately an estimate of extrusion, not a substitute for slicing.
  const shell=Math.min(mesh.volume,pose.wallSurfaceArea*profile.wallThickness+pose.upProjectedArea*profile.top*profile.layer+pose.downProjectedArea*profile.bottom*profile.layer);
  const baseVolume=shell+(mesh.volume-shell)*profile.infill/100,extra=Number.isFinite(profile.reinforcementVolume)?Math.max(0,profile.reinforcementVolume):0;
  const extrudedVolume=Math.min(mesh.volume,baseVolume+extra);
  return {grams:extrudedVolume/1000*material.density,extrudedVolume};
}
export function calculateQuote({mesh,pose,profile,material,pricePerKg,options,context,statistics=null}){
  const q={...defaultQuote,...options},estimate=estimatedMass(mesh,pose,profile,material);
  const stats=statistics?.confirmed&&statistics.context===context?statistics:null;
  if(!(pricePerKg>0)&&stats?.filaments?.length)pricePerKg=stats.prices?.[stats.filaments[0].id];
  const manual=q.slicerContext===context,massManual=manual&&Number.isFinite(q.slicerMass)&&q.slicerMass>0,timeManual=manual&&Number.isFinite(q.slicerHours)&&q.slicerHours>0;
  // Projection-to-bed envelope is only a coarse upper-shape proxy: it does not
  // ray-trace existing model material, bridges or the actual tree supports.
  const envelopeCap=Math.max(0,pose.size[0]*pose.size[1]*pose.size[2]-(mesh.volume||0));
  const envelope=Math.min(pose.supportEnvelopeVolume||0,envelopeCap);
  const supportVolume=q.addSupports&&!massManual&&!stats?envelope*q.supportInfill/100+(pose.projectedOverhang||0)*profile.layer*2:0;
  let supportGrams=supportVolume/1000*material.density;
  const extraGrams=massManual||stats?0:q.interfaceGrams+q.purgeGrams+q.brimGrams;
  let grams=stats?stats.grams/stats.quantity:massManual?q.slicerMass:estimate?estimate.grams+supportGrams+extraGrams:null;
  const extrusionVolume=massManual||stats?grams/material.density*1000:estimate?estimate.extrudedVolume+supportVolume+extraGrams/material.density*1000:null;
  let hours=stats?stats.hours/stats.quantity:timeManual?q.slicerHours:extrusionVolume!==null?(extrusionVolume/q.averageFlow*1.5/3600+(pose.size[2]/profile.layer)/3600):null;
  if(!Number.isFinite(grams)||!Number.isFinite(hours)||!(pricePerKg>0)||!(q.averageFlow>0)||!(q.quantity>=1))return null;
  let rawMaterialCost=(grams-supportGrams-extraGrams)*pricePerKg/1000+supportGrams*(q.supportPrice||pricePerKg)/1000;
  rawMaterialCost+=(q.interfaceGrams*(q.interfacePrice||q.supportPrice||pricePerKg)+(q.purgeGrams+q.brimGrams)*pricePerKg)/1000*(massManual||stats?0:1);
  let plates=null,chargedQuantity=q.quantity;
  if(stats){
    const filaments=stats.filaments||[];
    if(filaments.length>1){if(filaments.some(f=>!(stats.prices?.[f.id]>0)||!Number.isFinite(f.grams)))return null;const accounted=filaments.reduce((s,f)=>s+f.grams,0);if(Math.abs(accounted-stats.grams)>Math.max(1,stats.grams*.02))return null;rawMaterialCost=filaments.reduce((s,f)=>s+f.grams*stats.prices[f.id]/1000,0)/stats.quantity;}
    else{pricePerKg=stats.prices?.[filaments[0]?.id]||pricePerKg;rawMaterialCost=grams*pricePerKg/1000;}
    supportGrams=Number.isFinite(stats.supportGrams)?stats.supportGrams/stats.quantity:0;
    if(stats.scope==='plate'){plates=Math.ceil(q.quantity/stats.quantity);chargedQuantity=plates*stats.quantity;}
  }
  const materialCost=rawMaterialCost*(1+q.waste/100),machineCost=hours*q.hourRate,removalCost=q.supportRemovalMinutes/60*q.laborRate;
  const direct=(materialCost+machineCost)*chargedQuantity+(q.postprocessing+removalCost)*q.quantity+q.preparation+(plates||q.quantity)*q.plateSetup;
  const beforeMinimum=direct*(1+q.reserve/100)*(1+q.markup/100),total=Math.ceil(Math.max(beforeMinimum,q.minimum)/10)*10;
  const supportMaterialCost=stats?null:supportGrams*(1+q.waste/100)*(q.supportPrice||pricePerKg)/1000;
  return {grams,hours,massManual:massManual||!!stats,timeManual:timeManual||!!stats,fromSlicer:!!stats,supportGrams,supportMaterialCost,supportIncludedInManual:massManual||!!stats,supportVolume,materialCost,machineCost,removalCost,plates,chargedQuantity,batchGrams:grams*chargedQuantity,batchHours:hours*chargedQuantity,direct,beforeMinimum,minimumApplied:q.minimum>beforeMinimum,total,perPiece:total/q.quantity,quantity:q.quantity,pricePerKg,options:q};
}
