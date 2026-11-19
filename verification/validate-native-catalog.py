"""Run with Bambu Studio 02.08.02.61 and its Linux dependencies available."""
import os, json, subprocess, zipfile, pathlib, xml.etree.ElementTree as ET
root=pathlib.Path(__file__).resolve().parent; research=root.parent.parent/'research'; appimage=research/'bambu/squashfs-root';env=os.environ.copy();env.update(LC_ALL='C',LD_LIBRARY_PATH=str(appimage/'bin')+':'+str(research/'ubuntu-libs/usr/lib/x86_64-linux-gnu'))
cases=json.loads((root/'catalog-temp/cases.json').read_text());results=[]
for case in cases:
 source=root/'catalog-temp'/case['filename'];target=source.with_name('read-'+source.name)
 run=subprocess.run([str(appimage/'bin/bambu-studio'),'--debug','1','--info','--export-3mf',str(target),str(source)],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=60)
 (source.with_suffix('.log')).write_bytes(run.stdout);r={k:case[k] for k in ['id','printer','nozzle']};r['exit']=run.returncode
 try:
  with zipfile.ZipFile(target) as z:
   cfg=json.loads(z.read('Metadata/project_settings.config'));settings=ET.fromstring(z.read('Metadata/model_settings.config'));mods=settings.findall('.//part[@subtype="modifier_part"]');normal=settings.findall('.//part[@subtype="normal_part"]');mv={m.attrib['key']:m.attrib['value'] for m in mods[0].findall('metadata')}
   keys=['layer_height','wall_loops','sparse_infill_density','nozzle_diameter','printable_area','printable_height'];r['settingsRetained']=all(cfg.get(k)==case['config'].get(k) for k in keys);r['physicalMeshParts']=len(normal);r['modifiers']=len(mods);r['modifierPreserved']=mv.get('sparse_infill_density')=='100%' and 'wall_loops' not in mv and mv.get('sparse_infill_pattern')=='zig-zag'
   if case['printer']=='general':r['customGcodeEmpty']=not cfg.get('machine_start_gcode') and not cfg.get('machine_end_gcode')
 except Exception as e:r['error']=str(e)
 results.append(r)
 print(case['id'],run.returncode,r.get('settingsRetained'),r.get('modifierPreserved'),flush=True)
(root/'native-catalog-checks.json').write_text(json.dumps(results,indent=2)+'\n')
assert all(r['exit']==0 and r.get('settingsRetained') and r.get('modifierPreserved') and r.get('physicalMeshParts')==1 for r in results)
print('All',len(results),'native imports and round trips passed.')
