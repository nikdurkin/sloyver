import {getLanguage} from './i18n.js';
// Standard gravity used only for intuitive static weight/lever equivalents.
export const STANDARD_GRAVITY=9.80665;
export const FORCE_UNITS={N:{label:'Н',factor:1},kgf:{label:'кгс',factor:STANDARD_GRAVITY},lbf:{label:'фунт-сила',factor:4.4482216152605}};
export const MOMENT_UNITS={Nm:{label:'Н·м',factor:1},Nmm:{label:'Н·мм',factor:.001},kgfcm:{label:'кгс·см',factor:STANDARD_GRAVITY*.01},kgfm:{label:'кгс·м',factor:STANDARD_GRAVITY}};
export const loadUnits=type=>type==='moment'?MOMENT_UNITS:FORCE_UNITS;
export function toSI(value,unit,type='force'){const u=loadUnits(type)[unit];if(!u||!Number.isFinite(value)||value<=0||value*u.factor>1e9)throw new Error('Введите положительную нагрузку в выбранных единицах (до 10⁹ в СИ).');return value*u.factor;}
export function convertLoad(value,from,to,type='force'){const u=loadUnits(type)[to];if(!u)throw new Error('Неизвестная единица нагрузки.');return toSI(value,from,type)/u.factor;}
export function loadHint(type,value,unit,leverCm=10){const si=toSI(value,unit,type);const f=(n,d=2)=>new Intl.NumberFormat(getLanguage()==='en'?'en-US':'ru-RU',{maximumFractionDigits:d}).format(n);if(type==='force')return `${f(si)} Н ≈ вес ${f(si/STANDARD_GRAVITY)} кг. Это эквивалент неподвижного груза; удары и ускорения дают другую нагрузку.`;if(!Number.isFinite(leverCm)||leverCm<=0)throw new Error('Укажите положительное плечо.');const force=si/(leverCm/100);return `${f(si)} Н·м ≈ вес ${f(force/STANDARD_GRAVITY)} кг на плече ${f(leverCm)} см, перпендикулярно рычагу.`;}
export function loadLabel(load){const u=loadUnits(load.type)[load.unit];return `${new Intl.NumberFormat(getLanguage()==='en'?'en-US':'ru-RU',{maximumFractionDigits:4}).format(load.value)} ${u?.label||load.unit}`;}
