# Relatório de prints de novembro

Verificação em produção em 18/11/2026, horário de Cuiabá. O link para compartilhar conserva o mês depois do login Google. [Abrir o relatório de novembro](https://sites.codigo5.com.br/reports/adops-evidencias/?mes=2026-11).

## Acesso e arquivos

O Chrome concluiu o login com a conta corporativa de Leandro. A tela reproduziu o timeout de 90 segundos antes da correção. Após a implantação, o mesmo navegador exibiu as 12 campanhas e abriu o print da inserção 3122 de 18/11. O e-mail da Mariana consta na lista ativa de acesso. O teste da sessão pessoal dela depende de uma tentativa no aparelho dela.

O relatório exibiu 17 inserções em seis portais. Para essas inserções, os registros canônicos do PostgreSQL de 1 a 18 de novembro coincidiram por data, ID e endereço com os 147 prints da página. Treze correspondem ao dia 18. Os 147 PNGs foram baixados e decodificados, somando 319.979.338 bytes. O painel conservou a origem de cada prova, com 137 capturas registradas, sete reconstruções históricas e três provas editoriais.

## Desempenho

| Consulta | Tempo medido |
|---|---:|
| Mês completo na API original, medido dentro do serviço | 41,64 s |
| Mesmo mês na versão corrigida, em instância isolada | 2,64 s |
| Mês completo na API pública após a implantação | 4,28 s e 3,64 s |
| Filtro pelo portal OMT | 1,22 s |
| Busca pela PI 92598 | 1,39 s |

A consulta seleciona primeiro as inserções do período e carrega as campanhas correspondentes. Cada requisição reaproveita as leituras das regras, evidências e metadados entre os dias. O relatório avaliava 11 candidatos a comprovação adicional para datas que já tinham um print diário. A seleção descarta esses candidatos antes de baixar e decodificar suas imagens. As respostas completas das versões anterior e corrigida coincidiram, descontada a hora de geração.

A ampliação prefere a prévia JPEG da API e usa o arquivo original se a prévia falhar. Para o print 3122 de 18/11, a imagem passou de 2.312.060 para 211.625 bytes na ampliação testada. O Chrome confirmou 1600 × 1299 pixels carregados.

## Registro operacional

As verificações de reaproveitamento de consultas passaram em seis testes. A integridade das 41 regras publicadas retornou zero erros e 36 avisos sobre regras não publicadas. O código da API foi compilado sobre a versão ativa. Antes da recarga, foram conferidos os hashes e a ausência de jobs em execução. As duas páginas públicas e a imagem ampliada foram testadas depois da publicação.

Os comprovantes locais ficam na raiz operacional do AdOps em `outputs/validacao-relatorio-2026-11-18/`. O arquivo `imagens-conferidas.json` contém ID, data, dimensões, bytes e SHA-256 por print. Os tempos públicos estão em `medicoes-producao.json` e o confronto com o banco em `db-comparison.json`.

As cópias anteriores e seus manifestos estão em `/app/ops-backups/report-performance-20261118` e `/app/ops-backups/report-preview-20261118`. Para reverter, conferir os hashes publicados, restaurar exclusivamente os arquivos dos manifestos, recarregar somente a API em janela sem jobs e repetir a leitura do mês e da imagem pelo navegador.
