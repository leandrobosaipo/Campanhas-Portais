# Workflows AdOps ativos em 18/11/2026

Exportação somente de leitura da instância operacional, incluindo fluxos auxiliares e manuais. `manifest.json` registra ID, versão, ativação e SHA256 de cada export. O campo `active` não substitui a verificação do gatilho: um subworkflow ativo não é uma agenda automática.

Os JSONs preservam referências às credenciais da instância, sem valores secretos. Não importar para outra instância presumindo que os IDs de credenciais existam. Não publicar/reativar todos os arquivos em lote.

Para uma alteração ou rollback, consultar a versão atual do workflow, comparar os nós/conexões/configuração, preservar mudanças posteriores e atuar somente no workflow autorizado. Conferir a execução natural e o consumidor final depois da alteração. Aceite de WhatsApp não prova entrega.

As fontes de API/runner e as evidências de validação estão no registro `docs/incidente-adops-2026-11-18-fechamento.md` e no manifesto `docs/recovery-20261118-source-manifest.json`. Este snapshot consolida o que já estava implantado; não dispara workflows nem reprocessa histórico.
