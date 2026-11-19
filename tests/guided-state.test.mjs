import test from 'node:test';import assert from 'node:assert/strict';
import {nextGuideAction,guideProgress,guideTaskHint} from '../renderer/guided-state.js';

test('the first-run flow cannot start a print recommendation or check without a model',()=>{
 for(const skip of [false,true])for(const method of ['scheme','axis'])assert.equal(nextGuideAction({hasModel:false,skip,method}).action,'model');
 assert.equal(nextGuideAction({hasModel:true,busy:true,fixtures:1,loads:1}).action,'wait');
});
test('partial boundary conditions request the missing input instead of silently starting a check',()=>{
 assert.equal(nextGuideAction({hasModel:true,fixtures:0,loads:1}).action,'fixture');
 assert.equal(nextGuideAction({hasModel:true,fixtures:1,loads:0}).action,'load');
 assert.equal(nextGuideAction({hasModel:true,fixtures:1,loads:1}).action,'check');
});
test('skipping physical checking is explicit and preserves the supplied conditions',()=>{
 const conditions={hasModel:true,fixtures:2,loads:1};const before=structuredClone(conditions);
 assert.equal(nextGuideAction({...conditions,skip:true}).action,'print');assert.deepEqual(conditions,before);
 assert.equal(nextGuideAction({hasModel:true,fixtures:0,loads:0}).action,'fixture');
 assert.equal(nextGuideAction({...conditions,method:'axis'}).action,'print');
});
test('beginner progress describes stages without turning residuals into a promised strength accuracy',()=>{
 const label='Решаем систему · итерация 190 · невязка 1.6e-3';
 const simple=guideProgress(label);assert.doesNotMatch(simple,/190|1\.6|невяз|%/);assert.match(simple,/нагрузку/);
 assert.match(guideProgress('Подготавливаем сетку'),/Подготавливаем/);
 assert.match(guideTaskHint(0,0),/закрепления/);assert.match(guideTaskHint(1,0),/нагрузку/);assert.match(guideTaskHint(1,1),/величину/);
});
