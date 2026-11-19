import {schemeStatus} from './load-scheme.js';
// A load direction is user input. A mesh alone cannot determine how a part works.
export function validWorkAxis(axis){return Array.isArray(axis)&&axis.length===3&&axis.every(Number.isFinite)&&Math.hypot(...axis)>1e-8;}
export function strengthStatus(settings={}){
 if(settings.taskMethod==='scheme')return schemeStatus(settings.loadScheme);
 const load=settings.loadType||'unknown';
 if(load==='compression')return {ready:false,code:'compression',short:'Не оценивается',title:'Для сжатия индекс прочности не определён',message:'Для сжатия нужны свойства сжатия и проверка устойчивости. Здесь доступны сравнение геометрии и параметры печати; индекс по растяжению к сжатию не применяется.',target:'loadType'};
 if(load==='torsion')return {ready:false,code:'torsion',short:'Не оценивается',title:'Для кручения индекс прочности не определён',message:'При кручении важен межслойный сдвиг. В используемых TDS нет нужных данных, поэтому здесь сравниваются геометрия и удобство печати.',target:'loadType'};
 if(!['bending','tension','impact'].includes(load))return {ready:false,code:'load',short:'Нужны данные',title:'Укажите, как работает деталь',message:'После загрузки модели характер работы ещё не задан. Выберите изгиб, растяжение или удары, затем укажите и подтвердите направление на модели.',target:'loadType'};
 if(!validWorkAxis(settings.workAxis))return {ready:false,code:'axis',short:'Нужно направление',title:'Укажите направление работы детали',message:'Выберите X, Y или Z исходной модели либо задайте направление двумя точками вдоль нагруженного плеча или тяги.',target:'workAxis'};
 if(settings.directionConfirmed!==true)return {ready:false,code:'confirmation',short:'Подтвердите направление',title:'Подтвердите направление на модели',message:'Для изгиба стрелка должна идти вдоль плеча от крепления к свободному концу; для растяжения — вдоль тяги. Проверьте её в 3D и отметьте «Направление указано верно».',target:'directionConfirmed'};
 return {ready:true,code:'ready',short:'Индекс / 100',title:'Направление работы задано',message:'Доступен относительный индекс ориентации слоёв. Он не является допустимой нагрузкой или прочностью готовой детали в МПа.',target:null};
}
