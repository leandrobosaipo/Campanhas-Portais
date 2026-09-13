import json,sqlite3,subprocess,tempfile
from pathlib import Path
root=Path(__file__).parent
with tempfile.TemporaryDirectory() as d:
 d=Path(d); src=d/'d1.sqlite'; db=sqlite3.connect(src); db.execute('create table ops_jobs(id text primary key,status text,at text)'); db.execute("insert into ops_jobs values('a','old','2026-01-01')"); db.execute("insert into ops_jobs values('c','delete','2026-01-01')"); db.commit();db.close()
 events=[{'sequencia':1,'tabela':'ops_jobs','operacao':'INSERT','anterior':None,'posterior':{'id':'b','status':'new','at':'2026-01-02'}},{'sequencia':2,'tabela':'ops_jobs','operacao':'UPDATE','anterior':{'id':'a','status':'old','at':'2026-01-01'},'posterior':{'id':'a','status':'done','at':'2026-01-03'}},{'sequencia':3,'tabela':'ops_jobs','operacao':'DELETE','anterior':{'id':'c','status':'delete','at':'2026-01-01'},'posterior':None}]
 (d/'j.jsonl').write_text('\n'.join(json.dumps(x) for x in events)); (d/'r.json').write_text('[]')
 subprocess.run(['python3',root/'prepare-d1-rollback.py','--snapshot',src,'--journal',d/'j.jsonl','--output',d/'out.sqlite','--replay',d/'replay.sql','--resolutions',d/'r.json'],check=True)
 out=sqlite3.connect(d/'out.sqlite'); assert out.execute('select id,status from ops_jobs order by id').fetchall()==[('a','done'),('b','new')]
 assert 'BEGIN TRANSACTION' not in (d/'replay.sql').read_text() and 'INSERT INTO' in (d/'replay.sql').read_text()
 cod5_extra={'sequencia':4,'tabela':'ops_jobs','operacao':'UPDATE','anterior':{'id':'pg','status':'before','at':'2026-01-01'},'posterior':{'id':'pg','status':{'json':['after']},'at':'2026-01-02'}}
 (d/'extra.jsonl').write_text(json.dumps(cod5_extra)+'\n')
 subprocess.run(['python3',root/'prepare-d1-rollback.py','--snapshot',src,'--journal',d/'extra.jsonl','--output',d/'extra.sqlite','--replay',d/'extra.sql','--resolutions',d/'r.json'],check=True)
 assert sqlite3.connect(d/'extra.sqlite').execute("select status from ops_jobs where id='pg'").fetchone()[0]=='{"json":["after"]}'
 cod5_pk={**events[1],'posterior':{'id':'other','status':'done','at':'2026-01-03'}}
 (d/'pk.jsonl').write_text(json.dumps(cod5_pk)+'\n')
 assert subprocess.run(['python3',root/'prepare-d1-rollback.py','--snapshot',src,'--journal',d/'pk.jsonl','--output',d/'pk.sqlite','--replay',d/'pk.sql','--resolutions',d/'r.json'],capture_output=True).returncode != 0 and not (d/'pk.sqlite').exists()
 (d/'bad.jsonl').write_text(json.dumps({**events[1],'anterior':{'id':'a','status':'wrong','at':'2026-01-01'}})+'\n')
 assert subprocess.run(['python3',root/'prepare-d1-rollback.py','--snapshot',src,'--journal',d/'bad.jsonl','--output',d/'bad.sqlite','--replay',d/'bad.sql','--resolutions',d/'r.json'],capture_output=True).returncode != 0
print('ok')
