from pathlib import Path
import re,json,math,zipfile
root=Path(__file__).resolve().parent

def toolpaths(case):
 with zipfile.ZipFile(root/('sliced-'+case+'.3mf')) as z:s=z.read('Metadata/plate_1.gcode').decode()
 x=y=zpos=0.;layer=None;feature='Custom';segments=[]
 for line in s.splitlines():
  if line.startswith('; Z_HEIGHT:'):layer=float(line.split(':')[1])
  if line.startswith('; FEATURE:'):feature=line.split(':',1)[1].strip()
  tokens=line.split(';',1)[0].split()
  if not tokens or tokens[0] not in ['G0','G1','G2','G3']:continue
  vals={m[1]:float(m[2]) for t in tokens[1:] if (m:=re.fullmatch(r'([XYZEFIJP])([-+\d.]+)',t))}
  nx,ny,nz=vals.get('X',x),vals.get('Y',y),vals.get('Z',zpos)
  if vals.get('E',0)>0 and ('X'in vals or 'Y'in vals) and layer is not None and feature!='Custom':segments.append({'a':[x,y],'b':[nx,ny],'z':layer,'feature':feature,'length':math.hypot(nx-x,ny-y)})
  x,y,zpos=nx,ny,nz
 return segments

baseline=toolpaths('baseline');outer=[p for p in baseline if p['z']>1 and p['feature']=='Outer wall'];cad=[(min(p[side][i] for p in outer for side in ['a','b'])-.22,max(p[side][i] for p in outer for side in ['a','b'])+.22) for i in [0,1]]
checks=[]
for case in ['baseline','walls-eight','infill-only']:
 paths=toolpaths(case);mid=[p for p in paths if abs(p['z']-10)<1e-5];walls=[p for p in mid if p['feature'] in ['Inner wall','Outer wall']];outside=[p for p in paths if p['z']>1 and any(any(v<cad[j][0] or v>cad[j][1] for j,v in enumerate(point)) for point in [p['a'],p['b']])]
 checks.append({'case':case,'middleLayerWallLengthMm':sum(p['length'] for p in walls),'middleLayerInfillLengthMm':sum(p['length'] for p in mid if 'infill' in p['feature'].lower()),'extrusionsOutsideCAD':len(outside)})
print(json.dumps(checks,indent=2));(root/'measurements.json').write_text(json.dumps(checks,indent=2)+'\n')
assert checks[1]['middleLayerWallLengthMm']>checks[0]['middleLayerWallLengthMm']*1.2
assert abs(checks[2]['middleLayerWallLengthMm']-checks[0]['middleLayerWallLengthMm'])<0.1
assert checks[2]['middleLayerInfillLengthMm']>checks[0]['middleLayerInfillLengthMm']*1.4 and checks[2]['extrusionsOutsideCAD']==0
