# Prints retroativos de campanha

## Regra

Entregue a página do portal com o anúncio, a posição contratada, o domínio e os relógios exigidos. Preserve os elementos nativos do portal e da peça. Registre a data representada, a data real da reconstrução e a origem na API, na auditoria e nos detalhes do relatório. Identifique como reconstrução também o arquivo avulso, pelo nome ou pela descrição que o acompanha. A reconstrução sozinha não comprova a exibição na data passada.

## Contra-regra

É proibido acrescentar carimbo, marca d’água, legenda, faixa, selo ou aviso do AdOps nos pixels do print comum. A proibição vale desde a montagem da página até o PNG, a miniatura, o JPEG e a página de imagem no PDF. Espaço livre no rodapé não autoriza texto. Pedidos de retroativo, correção do período, ajuste de relógio, auditoria ou transparência não autorizam essa mudança. Uma legenda da mensagem fica fora da imagem.

A referência administrativa por agenda exige pedido expresso e identificação própria. Nunca usá-la como substituta de um print auditado de campanha. Se faltar peça, fonte histórica ou comprovação exigida, registre a pendência. Preserve o original e sua identificação.

## Conferência antes da entrega

1. Confirme PI, portal, posição, período, data e peça. Em correção de período, concilie a fonte da PI e delimite as datas afetadas.
2. Crie o candidato para revisão com `candidate=true` e `promote=false`. Confira a prova editorial e o PNG inteiro, inclusive o rodapé. Se houver texto sobreposto pelo AdOps ou a origem estiver ausente, retenha a entrega.
3. Promova os mesmos bytes aprovados na auditoria persistida. Preserve o original e confira a identidade da inserção, da data e do arquivo.
4. Confira o que o destinatário abre no relatório e baixa. No ZIP oficial por PI e portal, verifique os JPEGs, as páginas do PDF, a auditoria e os checksums. Um teste de relógio, espaço livre ou HTTP 200 isolado não aprova a imagem.

**Exemplo fictício.** Para o pedido “corrija o início da campanha e gere os retroativos auditados”, gere candidatos para as datas confirmadas. A data real de geração acompanha a entrega. Escrever “Reconstrução histórica” no rodapé reprova o print mesmo com o anúncio e os horários corretos.

Esta é a fonte de instrução para a apresentação dos retroativos. Exemplos antigos, planos de incidentes e testes de outras funções não criam exceções.
