#!/usr/bin/env python3
"""Reconcilia offline D1+journal PG; nunca conecta nem aplica replay."""
import argparse, json, os, shutil, sqlite3
from pathlib import Path

def cod5_identificador(cod5_nome):
    return '"'+cod5_nome.replace('"','""')+'"'

def cod5_normalizar(cod5_linha, cod5_colunas):
    if cod5_linha is None: return None
    if not set(cod5_colunas).issubset(cod5_linha): raise ValueError('coluna ausente no journal')
    return {cod5_c: json.dumps(cod5_linha[cod5_c],ensure_ascii=False,sort_keys=True,separators=(',',':')) if isinstance(cod5_linha[cod5_c],(dict,list)) else cod5_linha[cod5_c] for cod5_c in cod5_colunas}

def cod5_executar(cod5_snapshot,cod5_journal,cod5_saida,cod5_replay,cod5_resolucoes):
    cod5_tmp=cod5_saida.with_suffix(cod5_saida.suffix+'.tmp')
    if any(cod5_f.exists() for cod5_f in (cod5_saida,cod5_replay,cod5_tmp)): raise ValueError('saída já existe')
    if cod5_saida.resolve()==cod5_snapshot.resolve(): raise ValueError('origem preservada')
    cod5_db=None
    try:
        shutil.copyfile(cod5_snapshot,cod5_tmp);cod5_tmp.chmod(0o600)
        cod5_db=sqlite3.connect(cod5_tmp);cod5_db.row_factory=sqlite3.Row
        if cod5_db.execute('PRAGMA integrity_check').fetchone()[0]!='ok': raise ValueError('snapshot inválido')
        cod5_res={(cod5_x['tabela'],tuple(cod5_x['chave'])):cod5_x for cod5_x in cod5_resolucoes}
        cod5_eventos=sorted((json.loads(cod5_x) for cod5_x in cod5_journal.read_text().splitlines() if cod5_x.strip()),key=lambda cod5_x:cod5_x['sequencia'])
        if len({cod5_x['sequencia'] for cod5_x in cod5_eventos})!=len(cod5_eventos): raise ValueError('sequência repetida')
        for cod5_evento in cod5_eventos:
            cod5_tabela=cod5_evento['tabela'];cod5_op=cod5_evento['operacao']
            cod5_info=cod5_db.execute(f'PRAGMA table_info({cod5_identificador(cod5_tabela)})').fetchall()
            cod5_cols=[cod5_x[1] for cod5_x in cod5_info]
            cod5_pks=[cod5_x[1] for cod5_x in sorted(cod5_info,key=lambda cod5_x:cod5_x[5]) if cod5_x[5]]
            if not cod5_cols or not cod5_pks: raise ValueError('tabela/PK ausente')
            cod5_antes=cod5_normalizar(cod5_evento.get('anterior'),cod5_cols);cod5_depois=cod5_normalizar(cod5_evento.get('posterior'),cod5_cols)
            if cod5_op not in ('INSERT','UPDATE','DELETE'): raise ValueError('operação inválida')
            if (cod5_op!='INSERT' and cod5_antes is None) or (cod5_op!='DELETE' and cod5_depois is None): raise ValueError('journal incompleto')
            if cod5_op=='UPDATE' and any(cod5_antes[cod5_c]!=cod5_depois[cod5_c] for cod5_c in cod5_pks): raise ValueError('mudança de PK recusada')
            cod5_modelo=cod5_antes or cod5_depois;cod5_chave=tuple(cod5_modelo[cod5_c] for cod5_c in cod5_pks)
            cod5_onde=' AND '.join(f'{cod5_identificador(cod5_c)}=?' for cod5_c in cod5_pks)
            cod5_linha=cod5_db.execute(f'SELECT * FROM {cod5_identificador(cod5_tabela)} WHERE {cod5_onde}',cod5_chave).fetchone()
            cod5_atual=dict(cod5_linha) if cod5_linha else None
            cod5_r=cod5_res.pop((cod5_tabela,cod5_chave),None)
            cod5_resolvido=bool(cod5_r and cod5_atual==cod5_normalizar(cod5_r.get('anterior'),cod5_cols) and cod5_antes==cod5_normalizar(cod5_r.get('posterior'),cod5_cols))
            if cod5_op=='INSERT' and cod5_atual is not None and cod5_atual!=cod5_depois: raise ValueError('conflito insert')
            if cod5_op!='INSERT' and cod5_atual is not None and cod5_atual!=cod5_antes and not cod5_resolvido: raise ValueError('conflito base')
            if cod5_op=='INSERT' and cod5_atual is not None: continue
            cod5_db.execute(f'DELETE FROM {cod5_identificador(cod5_tabela)} WHERE {cod5_onde}',cod5_chave)
            if cod5_depois is not None:
                cod5_db.execute(f'INSERT INTO {cod5_identificador(cod5_tabela)} ({",".join(map(cod5_identificador,cod5_cols))}) VALUES ({",".join("?" for cod5_c in cod5_cols)})',[cod5_depois[cod5_c] for cod5_c in cod5_cols])
        if cod5_db.execute('PRAGMA integrity_check').fetchone()[0]!='ok': raise ValueError('resultado inválido')
        cod5_db.commit()
        with cod5_replay.open('x') as cod5_f:
            cod5_replay.chmod(0o600)
            for cod5_linha in cod5_db.iterdump():
                if cod5_linha not in ('BEGIN TRANSACTION;','COMMIT;'): cod5_f.write(cod5_linha+'\n')
        cod5_db.close();cod5_db=None;os.replace(cod5_tmp,cod5_saida)
    except Exception:
        if cod5_db is not None: cod5_db.close()
        for cod5_f in (cod5_tmp,cod5_saida,cod5_replay):
            if cod5_f.exists(): cod5_f.unlink()
        raise

if __name__=='__main__':
    cod5_parser=argparse.ArgumentParser()
    for cod5_nome in ('snapshot','journal','output','replay','resolutions'): cod5_parser.add_argument('--'+cod5_nome,required=True,type=Path)
    cod5_args=cod5_parser.parse_args()
    cod5_executar(cod5_args.snapshot,cod5_args.journal,cod5_args.output,cod5_args.replay,json.loads(cod5_args.resolutions.read_text()))
