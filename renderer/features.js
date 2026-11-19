// Sampled normal thickness. It is a geometry aid, not a complete minimum-wall check.
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function rayTriangle(origin,d,t,eps){
 const e1=sub(t.p[1],t.p[0]),e2=sub(t.p[2],t.p[0]),h=cross(d,e2),det=dot(e1,h);
 if(Math.abs(det)<1e-10)return null;
 const s=sub(origin,t.p[0]),u=dot(s,h)/det;if(u<-.000001||u>1.000001)return null;
 const q=cross(s,e1),v=dot(d,q)/det;if(v<-.000001||u+v>1.000001)return null;
 const x=dot(e2,q)/det;return x>eps?x:null;
}
export function measureFeatures(mesh){
 if(!mesh.closed)return {sampled:false,samples:[],reason:'Для проверки толщины нужна замкнутая сетка.'};
 const ts=mesh.triangles,limit=ts.length>50000?40:100,eps=Math.max(1e-5,mesh.diagonal*1e-7),samples=[];
 // Include regular triangle samples and the largest faces, to retain small ribs.
 const indices=new Set();for(let i=0;i<Math.min(limit,ts.length);i++)indices.add(Math.floor(i*ts.length/Math.min(limit,ts.length)));
 ts.map((t,i)=>({i,a:t.area})).sort((a,b)=>b.a-a.a).slice(0,12).forEach(t=>indices.add(t.i));
 for(const index of indices){const t=ts[index],d=t.normal.map(x=>-x),o=t.center.map((x,j)=>x+d[j]*eps);let hit=Infinity;
  for(let j=0;j<ts.length;j++){if(j===index||dot(ts[j].normal,d)<.05)continue;const x=rayTriangle(o,d,ts[j],eps);if(x!==null&&x<hit)hit=x;}
  if(Number.isFinite(hit))samples.push({point:t.center,normal:t.normal,thickness:hit+eps,triangle:index,area:t.area});
 }
 const sorted=[...samples].sort((a,b)=>a.thickness-b.thickness),total=sorted.reduce((s,x)=>s+x.area,0),q=p=>{let area=0;for(const x of sorted){area+=x.area;if(area>=total*p)return x.thickness;}return null;};
 return {sampled:samples.length>0,count:samples.length,p10:q(.1),median:q(.5),p90:q(.9),minimum:q(0),samples};
}
export function shapeProfile({mode='balanced',nozzle=.4,features,loadType='unknown',fastener=false,materialId='',manualInfill=null}={}){
 const line=nozzle*1.05,p10=features?.p10,median=features?.median,reasons=[],local=[];
 let walls={strength:6,accuracy:3,balanced:4}[mode]||4;
 const byLoad={bending:[30,20,35,'При изгибе начните со стенок и наружных сплошных слоёв; внутреннее заполнение поддерживает оболочку.'],tension:[35,25,45,'При растяжении сначала согласуйте направление слоёв, затем проверьте стенки и передачу нагрузки через заполнение.'],compression:[40,30,50,'Для сжатия предложен более плотный внутренний каркас; устойчивость стенок и несущая способность не рассчитаны.'],torsion:[35,25,45,'Для кручения важны непрерывная оболочка и замкнутые сечения; сдвиговая прочность этим подбором не рассчитана.'],impact:[25,15,30,'Для ударов выбран умеренный внутренний каркас; вязкость материала и переходы сечений важнее одного процента.'],unknown:[25,15,30,'Характер работы не задан: выбран умеренный стартовый профиль без предположения о требуемой несущей способности.']};
 let [infill,low,high,infillReason]=mode==='strength'?(byLoad[loadType]||byLoad.unknown):mode==='accuracy'?[15,10,20,'Для точной геометрии начните с умеренного заполнения и стабильного теплового режима; опору верхних поверхностей проверьте в слайсере.']:[25,20,35,'Для баланса выбран умеренный внутренний каркас; при необходимости усиливайте рабочие зоны локально.'];
 let layer=Math.round(Math.max(.06,nozzle*({strength:.5,accuracy:.3,balanced:.4}[mode]||.4))*100)/100;
 if(p10&&p10<line*walls*2){reasons.push('Тонкие участки могут полностью состоять из стенок; увеличение общего заполнения их не усилит.');if(features.p90&&features.p90<line*walls*2)walls=Math.max(2,Math.ceil(features.p90/(2*line)));}
 if(features?.p90&&features.p90<line*({strength:6,accuracy:3,balanced:4}[mode]||4)*2){infill=mode==='strength'?20:mode==='accuracy'?10:15;low=10;high=25;infillReason='В большинстве проверенных участков небольшая толщина: начните с '+infill+'%, проверьте сплошные слои и фактические пустоты после нарезки. Выборочная проверка не охватывает все стенки.';}
 else if(median&&median>nozzle*25&&mode!=='accuracy'&&loadType!=='compression'){infill=mode==='strength'?30:20;low=20;high=35;infillReason='В проверенных сечениях есть массивный объём: умеренное заполнение уменьшает расход; для рабочих зон используйте локальные модификаторы.';local.push('Массивный объём: сначала проверьте стенки и локальные усиления.');}
 if(loadType==='impact'){infill=Math.min(infill,25);low=Math.min(low,15);high=Math.min(high,30);local.push('Удары: проверьте переходы сечений и вязкость материала; процент заполнения сам по себе не задаёт ударостойкость.');}
 if(fastener){local.push('Вокруг крепежа: модификатор с 6–8 стенками и 80–100% заполнением; отдельно проверить вставку на вырыв.');if(mode!=='accuracy')walls=Math.min(8,walls+1);}
 if(materialId.startsWith('tpu')){infill=mode==='strength'?25:20;low=15;high=35;infillReason='Для TPU заполнение выбирают по нужной податливости. Начальная рекомендация требует пробного образца.';reasons.push('Для TPU заполнение заметно меняет податливость; профиль требует пробной печати.');}
 if(p10&&p10<line*2)reasons.push('Выборочная толщина менее двух ширин линии. Проверьте эти места в слайсере или уменьшите сопло.');
 if(mode==='accuracy'&&p10&&p10<1)layer=Math.min(layer,.12);
 const infillRange=[low,high],infillManual=manualInfill!==null;
 if(infillManual){if(!Number.isFinite(manualInfill)||manualInfill<0||manualInfill>100)throw new Error('Заполнение должно быть от 0 до 100%.');infill=manualInfill;infillReason='Ваше заполнение '+infill+'% сохранено. Автоматический ориентир: '+low+'–'+high+'%. Процент не является расчётом прочности детали.';}
 return {nozzle,layer,walls,wallThickness:walls*line,infill,infillRange,infillManual,infillReason,pattern:'Gyroid / кубический',top:Math.ceil((mode==='strength'?1.2:.8)/layer),bottom:Math.ceil(.8/layer),outerSpeed:mode==='accuracy'?25:40,innerSpeed:mode==='strength'?60:80,reasons,local};
}
