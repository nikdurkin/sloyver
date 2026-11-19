// The beginner workflow changes presentation, never the physical conditions.
export function nextGuideAction({hasModel,busy,fixtures=0,loads=0,method='scheme',skip=false}={}){
 if(busy)return {action:'wait'};
 if(!hasModel)return {action:'model'};
 if(skip||method!=='scheme')return {action:'print'};
 if(fixtures&&loads)return {action:'check'};
 if(!fixtures&&!loads)return {action:'fixture'};
 return {action:fixtures?'load':'fixture'};
}
export function guideProgress(label=''){
 if(/невязк|итераци|систем|решател|матриц|сборк|ж[её]стк/i.test(label))return 'Проверяем, как деталь воспринимает нагрузку…';
 if(/сетк|элемент|узл/i.test(label))return 'Подготавливаем деталь к проверке…';
 if(/опор|закреп|нагруз/i.test(label))return 'Проверяем закрепления и нагрузки…';
 if(/напряж|деформац|пол[еяй]|результат/i.test(label))return 'Определяем нагруженные участки…';
 return label;
}
export function guideTaskHint(fixtures,loads){
 if(!fixtures)return 'Начните с закрепления: покажите место, за которое деталь держится.';
 if(!loads)return 'Теперь добавьте нагрузку: покажите, куда давят, тянут или поворачивают деталь.';
 return 'Проверьте величину нагрузки и направление стрелки. Затем получите рекомендации.';
}
