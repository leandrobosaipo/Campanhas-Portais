#!/usr/bin/env python3
"""Gera SQL transacional a partir de snapshots; nunca conecta à produção."""
import argparse, hashlib, json, sqlite3
from pathlib import Path

cod5_chaves = {
    'ops_jobs': ['id'], 'cod5_drive_events': ['event_id'],
    'cod5_inbound_documents': ['id'], 'cod5_document_parse_runs': ['id'],
    'ops_incidents': ['id'], 'monthly_report_refreshes': ['competencia'],
    'daily_print_recoveries': ['target_date', 'insertion_id'], 'daily_print_alerts': ['fingerprint'],
}

def cod5_json(cod5_valor):
    return json.dumps(cod5_valor, ensure_ascii=False, sort_keys=True, separators=(',', ':'))

def cod5_hash(cod5_valor):
    return hashlib.sha256(cod5_json(cod5_valor).encode()).hexdigest()

def cod5_literal(cod5_valor):
    cod5_texto = cod5_valor if isinstance(cod5_valor, str) else cod5_json(cod5_valor)
    cod5_delimitador = '$cod5_' + hashlib.sha256(cod5_texto.encode()).hexdigest()[:16] + '$'
    assert cod5_delimitador not in cod5_texto
    return cod5_delimitador + cod5_texto + cod5_delimitador

def cod5_identificador(cod5_nome):
    return '"' + cod5_nome.replace('"', '""') + '"'

def cod5_preparar(cod5_snapshot, cod5_pasta_pg, cod5_resolucoes):
    cod5_db = sqlite3.connect('file:' + str(cod5_snapshot) + '?mode=ro', uri=True)
    cod5_db.row_factory = sqlite3.Row
    assert cod5_db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    cod5_encontradas = {cod5_linha[0] for cod5_linha in cod5_db.execute("SELECT name FROM sqlite_schema WHERE type='table'")}
    if cod5_encontradas - set(cod5_chaves) - {'d1_migrations', 'sqlite_sequence'}:
        raise ValueError('Tabela D1 não contemplada; revisão obrigatória')
    if set(cod5_chaves) - cod5_encontradas:
        raise ValueError('Snapshot incompleto')
    cod5_esquema = 'cod5_d1_archive_20260911'
    cod5_sql = ['BEGIN;', 'SET LOCAL search_path=public,pg_catalog;', "SET LOCAL lock_timeout='10s';", "SET LOCAL statement_timeout='300s';", "SELECT pg_advisory_xact_lock(hashtext('cod5_adops_d1_retirement'));", f'CREATE SCHEMA IF NOT EXISTS {cod5_esquema};', f'''CREATE TABLE IF NOT EXISTS {cod5_esquema}.origem (
      tabela text NOT NULL, chave jsonb NOT NULL, registro jsonb NOT NULL,
      PRIMARY KEY(tabela,chave));''', f'''CREATE TABLE IF NOT EXISTS {cod5_esquema}.resolucoes (
      tabela text NOT NULL, chave jsonb NOT NULL, motivo text NOT NULL,
      anterior jsonb, posterior jsonb, PRIMARY KEY(tabela,chave));''']
    cod5_relatorio = {'snapshot_sha256': hashlib.sha256(cod5_snapshot.read_bytes()).hexdigest(), 'tabelas': [], 'pausados': 0}
    for cod5_tabela, cod5_pk in cod5_chaves.items():
        cod5_nome = cod5_identificador(cod5_tabela)
        cod5_estrutura = cod5_db.execute("SELECT sql FROM sqlite_schema WHERE type='table' AND name=?", (cod5_tabela,)).fetchone()[0]
        cod5_sql.append(cod5_estrutura.replace('CREATE TABLE ', 'CREATE TABLE IF NOT EXISTS ', 1) + ';')
        cod5_colunas = [cod5_linha['name'] for cod5_linha in cod5_db.execute(f'PRAGMA table_info({cod5_nome})')]
        cod5_origem = [dict(cod5_linha) for cod5_linha in cod5_db.execute(f'SELECT * FROM {cod5_nome}')]
        cod5_arquivo_pg = cod5_pasta_pg / ('pg-' + cod5_tabela + '.jsonl')
        cod5_destino = {tuple(cod5_linha[cod5_c] for cod5_c in cod5_pk): cod5_linha for cod5_linha in (map(json.loads, cod5_arquivo_pg.read_text().splitlines()) if cod5_arquivo_pg.exists() else [])}
        cod5_permitidas, cod5_pausadas = [], []
        cod5_contagens = {'tabela': cod5_tabela, 'origem': len(cod5_origem), 'novas': 0, 'identicas': 0, 'resolvidas': 0}
        for cod5_linha in cod5_origem:
            cod5_chave = tuple(cod5_linha[cod5_c] for cod5_c in cod5_pk)
            cod5_atual = cod5_destino.get(cod5_chave)
            if cod5_atual is None:
                cod5_contagens['novas'] += 1
                if cod5_tabela == 'ops_jobs' and cod5_linha['status'] in ('queued', 'ready_for_runner', 'running'):
                    cod5_pausadas.append(cod5_linha['id'])
            elif all(cod5_atual.get(cod5_c) == cod5_linha[cod5_c] for cod5_c in cod5_colunas):
                cod5_contagens['identicas'] += 1
            else:
                cod5_decisao = next((cod5_r for cod5_r in cod5_resolucoes if cod5_r['tabela'] == cod5_tabela and tuple(cod5_r['chave']) == cod5_chave), None)
                if not cod5_decisao or cod5_decisao['origem_sha256'] != cod5_hash(cod5_linha) or cod5_decisao['destino_sha256'] != cod5_hash(cod5_atual):
                    raise ValueError('Conflito sem resolução: ' + cod5_tabela + '/' + cod5_hash(cod5_chave)[:12])
                cod5_permitidas.append(list(cod5_chave));cod5_contagens['resolvidas'] += 1
                cod5_sql.append(f'''INSERT INTO {cod5_esquema}.resolucoes VALUES ({cod5_literal(cod5_tabela)},{cod5_literal(list(cod5_chave))}::jsonb,{cod5_literal(cod5_decisao['motivo'])},{cod5_literal(cod5_linha)}::jsonb,{cod5_literal(cod5_atual)}::jsonb) ON CONFLICT DO NOTHING;''')
        cod5_campos = ','.join(map(cod5_identificador, cod5_colunas))
        cod5_chave_sql = 'jsonb_build_array(' + ','.join('cod5_fonte.' + cod5_identificador(cod5_c) for cod5_c in cod5_pk) + ')'
        cod5_igual_pk = ' AND '.join('cod5_alvo.' + cod5_identificador(cod5_c) + ' = cod5_fonte.' + cod5_identificador(cod5_c) for cod5_c in cod5_pk)
        cod5_distinto = 'ROW(' + ','.join('cod5_alvo.' + cod5_identificador(cod5_c) for cod5_c in cod5_colunas) + ') IS DISTINCT FROM ROW(' + ','.join('cod5_fonte.' + cod5_identificador(cod5_c) for cod5_c in cod5_colunas) + ')'
        cod5_sql += [f'LOCK TABLE public.{cod5_nome} IN SHARE ROW EXCLUSIVE MODE;', f'CREATE TEMP TABLE cod5_fonte_{cod5_tabela} (LIKE public.{cod5_nome}) ON COMMIT DROP;', *[f'INSERT INTO cod5_fonte_{cod5_tabela} ({cod5_campos}) SELECT {cod5_campos} FROM json_populate_recordset(NULL::public.{cod5_nome}, {cod5_literal(cod5_origem[cod5_i:cod5_i+25])}::json);' for cod5_i in range(0,len(cod5_origem),25)], f'''INSERT INTO {cod5_esquema}.origem SELECT {cod5_literal(cod5_tabela)}, {cod5_chave_sql}, to_jsonb(cod5_fonte) FROM cod5_fonte_{cod5_tabela} cod5_fonte ON CONFLICT DO NOTHING;''', f'''INSERT INTO public.{cod5_nome} ({cod5_campos}) SELECT {cod5_campos} FROM cod5_fonte_{cod5_tabela} ON CONFLICT ({','.join(map(cod5_identificador,cod5_pk))}) DO NOTHING;''', f'''DO $cod5$ BEGIN
          IF EXISTS (SELECT 1 FROM cod5_fonte_{cod5_tabela} cod5_fonte JOIN {cod5_esquema}.origem cod5_guardada ON cod5_guardada.tabela={cod5_literal(cod5_tabela)} AND cod5_guardada.chave={cod5_chave_sql} WHERE cod5_guardada.registro IS DISTINCT FROM to_jsonb(cod5_fonte))
          THEN RAISE EXCEPTION 'Snapshot arquivado divergente {cod5_tabela}'; END IF;
          IF EXISTS (SELECT 1 FROM cod5_fonte_{cod5_tabela} cod5_fonte JOIN public.{cod5_nome} cod5_alvo ON {cod5_igual_pk}
            WHERE {cod5_distinto} AND NOT EXISTS (SELECT 1 FROM {cod5_esquema}.resolucoes cod5_resolvida WHERE cod5_resolvida.tabela={cod5_literal(cod5_tabela)} AND cod5_resolvida.chave={cod5_chave_sql} AND cod5_resolvida.posterior=to_jsonb(cod5_alvo)))
          THEN RAISE EXCEPTION 'Conflito detectado durante importação {cod5_tabela}'; END IF;
          IF (SELECT count(*) FROM cod5_fonte_{cod5_tabela}) != (SELECT count(*) FROM cod5_fonte_{cod5_tabela} cod5_fonte JOIN public.{cod5_nome} cod5_alvo ON {cod5_igual_pk})
          THEN RAISE EXCEPTION 'Contagem divergente {cod5_tabela}'; END IF;
        END $cod5$;''']
        if cod5_pausadas:
            cod5_sql += [f'''INSERT INTO {cod5_esquema}.resolucoes
              SELECT 'ops_jobs',jsonb_build_array(id),'Execução legada sem retomada automática; revisar resultado antes de repetir',to_jsonb(cod5_job),NULL
              FROM public.ops_jobs cod5_job WHERE id IN (SELECT jsonb_array_elements_text({cod5_literal(cod5_pausadas)}::jsonb)) ON CONFLICT DO NOTHING;''', f'''UPDATE public.ops_jobs SET status='awaiting_human_review', error_text='Migração D1: job legado pausado para revisão; resultado e origem preservados, sem reexecução automática.'
              WHERE id IN (SELECT jsonb_array_elements_text({cod5_literal(cod5_pausadas)}::jsonb)) AND status IN ('queued','ready_for_runner','running');''', f'''UPDATE {cod5_esquema}.resolucoes cod5_resolvida SET posterior=to_jsonb(cod5_job) FROM public.ops_jobs cod5_job WHERE cod5_resolvida.tabela='ops_jobs' AND cod5_resolvida.chave=jsonb_build_array(cod5_job.id) AND cod5_job.id IN (SELECT jsonb_array_elements_text({cod5_literal(cod5_pausadas)}::jsonb));''']
            cod5_relatorio['pausados'] += len(cod5_pausadas)
        cod5_relatorio['tabelas'].append(cod5_contagens)
    cod5_sql += [f'''CREATE TABLE IF NOT EXISTS {cod5_esquema}.alteracoes (
       sequencia bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, tabela text NOT NULL,
       operacao text NOT NULL, anterior jsonb, posterior jsonb, instante timestamptz NOT NULL DEFAULT now());''', f'''CREATE OR REPLACE FUNCTION {cod5_esquema}.registrar() RETURNS trigger LANGUAGE plpgsql AS $cod5$
       BEGIN INSERT INTO {cod5_esquema}.alteracoes(tabela,operacao,anterior,posterior)
       VALUES (TG_TABLE_NAME,TG_OP,CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END,CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END);
       RETURN NULL; END $cod5$;''']
    for cod5_tabela in cod5_chaves:
        cod5_sql.append(f'DROP TRIGGER IF EXISTS cod5_d1_journal ON public.{cod5_tabela}; CREATE TRIGGER cod5_d1_journal AFTER INSERT OR UPDATE OR DELETE ON public.{cod5_tabela} FOR EACH ROW EXECUTE FUNCTION {cod5_esquema}.registrar();')
    cod5_sql += ["CREATE INDEX IF NOT EXISTS cod5_ops_jobs_ready_kind_created_idx ON public.ops_jobs(kind,created_at) WHERE status='ready_for_runner';", 'COMMIT;']
    return '\n'.join(cod5_sql) + '\n', cod5_relatorio

if __name__ == '__main__':
    cod5_parser = argparse.ArgumentParser()
    for cod5_nome in ['snapshot', 'pg-dir', 'resolutions', 'output', 'report']:
        cod5_parser.add_argument('--' + cod5_nome, required=True, type=Path)
    cod5_args = cod5_parser.parse_args()
    cod5_sql, cod5_relatorio = cod5_preparar(cod5_args.snapshot, cod5_args.pg_dir, json.loads(cod5_args.resolutions.read_text()))
    cod5_args.output.write_text(cod5_sql);cod5_args.output.chmod(0o600)
    cod5_args.report.write_text(json.dumps(cod5_relatorio, indent=2))
    print(json.dumps(cod5_relatorio))
