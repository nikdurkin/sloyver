from pathlib import Path
import os, subprocess, json
root=Path(__file__).resolve().parent; research=root.parent.parent.parent/'research';bambu=research/'bambu/squashfs-root';env=os.environ.copy();env.update(LC_ALL='C',LD_LIBRARY_PATH=str(bambu/'bin')+':'+str(research/'ubuntu-libs/usr/lib/x86_64-linux-gnu'));checks=[]
for case in ['baseline','walls-eight','infill-only']:
 args=[str(bambu/'bin/bambu-studio'),'--debug','1','--load-settings',str(research/'machine-resolved.json')+';'+str(research/'process-resolved.json'),'--load-filaments',str(research/'filament-resolved.json'),'--slice','0','--outputdir',str(root),'--export-3mf','sliced-'+case+'.3mf',str(root/(case+'.3mf'))]
 run=subprocess.run(args,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=120);(root/(case+'.log')).write_bytes(run.stdout);checks.append({'case':case,'exit':run.returncode});print(case,run.returncode,flush=True)
(root/'slice-results.json').write_text(json.dumps(checks,indent=2)+'\n');assert all(x['exit']==0 for x in checks)
