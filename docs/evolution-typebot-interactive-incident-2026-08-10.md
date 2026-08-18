# Incidente Evolution + Typebot: menus duplicados e `Invalid message`

## Resumo executivo

Em 10 de agosto de 2026, a jornada WhatsApp do **Horizons Typebot** apresentou
dois defeitos relacionados:

1. menus e listas interativas eram seguidos por uma segunda mensagem contendo
   somente `▶️ 1`, `▶️ 2`, etc.;
2. ao tocar em uma linha de lista, o Typebot respondia
   `Invalid message. Please, try again.`.

O diagnóstico final mostrou que a lógica necessária estava correta, mas a
primeira imagem derivada da Evolution aplicou o patch ao arquivo
`/evolution/dist/main.mjs`. O comando de produção, porém, é
`node ... dist/main`, que neste container resolve `/evolution/dist/main.js`.
Assim, as verificações feitas no arquivo `.mjs` davam um falso positivo,
enquanto o processo continuava executando o código antigo em `.js`.

A correção definitiva passou a alterar e validar **os dois bundles**. O
container da Evolution foi recriado, as duas instâncias voltaram ao estado
`open`, e o bundle efetivamente executado foi conferido dentro do container.

## Impacto observado

- O cliente recebia a lista interativa e, logo depois, uma lista numérica
  redundante.
- O clique enviava ao Typebot o título visível, por exemplo
  `2 - Android TV / Fire TV`, embora o bloco `choice input` esperasse `2`.
- O Typebot rejeitava o título e enviava `Invalid message. Please, try again.`.
- O problema atingia menus curtos e listas de quatro a dez opções.
- O catálogo de 18 planos inicialmente continuou no fallback numérico. Na
  revisão 6.1 ele foi dividido em duas páginas de nove itens, eliminando também
  a numeração dessa etapa.

## Evidência coletada

Os logs reais da instância **Horizons Typebot** mostraram, na mesma jornada:

- envio de uma `listMessage` com oito dispositivos;
- envio posterior de `▶️ 1` até `▶️ 8`;
- recebimento de uma `listResponseMessage` cujo título era
  `2 - Android TV / Fire TV`;
- resposta seguinte `Invalid message. Please, try again.`.

O payload da lista também continha
`singleSelectReply.selectedRowId`, que guardava o valor correto `2`. Portanto,
o erro não estava no ID criado pelo fluxo, mas na prioridade usada para extrair
o conteúdo da resposta.

## Linha do tempo técnica

### 1. Fallback numérico inicial

O gerador `tools/fill-horizons-typebot.mjs` cria uma mensagem interativa e um
`choice input`. A mensagem interativa produz os botões ou a lista; o choice
mantém a sessão aguardando uma escolha. O adaptador original da Evolution
também transformava esse choice em texto, gerando `▶️ 1`, `▶️ 2`, etc.

### 2. Compatibilidade dos interativos

- Reply buttons foram limitados a três opções.
- Menus de quatro a dez opções passaram a usar `[list]`.
- O fluxo foi reorganizado em submenus curtos.
- O catálogo de 18 planos permaneceu numerado.
- A Evolution foi atualizada de 2.3.7 para 2.4.0-rc2 e licenciada.

Essas etapas resolveram limitações anteriores de renderização, mas não
eliminaram o fallback em todos os lotes retornados pelo Typebot.

### 3. Primeira correção incompleta

Foi criada a imagem derivada
`horizons/evolution-api:2.4.0-rc2-buttons` para:

- suprimir o fallback do `choice input` quando já existisse uma mensagem
  `[buttons]` ou `[list]`;
- priorizar `selectedRowId` antes do título da linha.

Essa versão alterou apenas `dist/main.mjs`. A imagem foi reconstruída e o
arquivo inspecionado continha a alteração, mas o runtime não o utilizava. Isso
explica por que a correção foi registrada como presente e o usuário ainda viu
os dois defeitos.

### 4. Diagnóstico definitivo

Dentro do container foi consultado o script de inicialização:

```text
node --network-family-autoselection-attempt-timeout=1000 dist/main
```

Também foram encontrados os dois artefatos:

```text
/evolution/dist/main.js
/evolution/dist/main.mjs
```

O horário e o conteúdo mostraram que somente o `.mjs` havia sido modificado.
O Node executava o `.js`.

### 5. Correção definitiva aplicada

Foram adicionados ao repositório:

- `ops/evolution/typebot-interactive.patch.mjs`;
- `ops/evolution/Dockerfile.typebot-interactive`.

O patch agora é idempotente e exige que cada substituição esteja no estado
original ou já corrigido. Ele falha na construção se não encontrar exatamente
o padrão esperado, evitando gerar silenciosamente uma imagem incompatível.

A lógica ativa passou a:

1. extrair primeiro
   `listResponseMessage.singleSelectReply.selectedRowId`;
2. usar o título da linha apenas como alternativa;
3. suprimir o fallback somente quando o choice contém de um a dez itens
   estritamente numéricos, ou quando o mesmo lote contém `[buttons]`/`[list]`;
4. preservar choices textuais que não possuem interativo;
5. preservar choices sem marcador interativo; o catálogo de 18 planos foi
   posteriormente paginado em duas listas e deixou de depender do fallback.

## Publicação realizada

- A imagem anterior foi preservada como
  `horizons/evolution-api:2.4.0-rc2-buttons-pre-mainjs-fix`.
- A tag ativa `horizons/evolution-api:2.4.0-rc2-buttons` foi reconstruída com o
  patch aplicado aos arquivos `.js` e `.mjs`.
- Antes do deploy, uma execução isolada da nova imagem confirmou as duas
  alterações em ambos os bundles.
- Somente o serviço `evolution_api` foi recriado; PostgreSQL, Redis, API
  Horizons e frontend não foram reiniciados.
- Nenhuma sessão foi removida e nenhuma mensagem externa foi enviada pelo
  agente durante o diagnóstico ou a publicação.

## Validações concluídas

- O container ativo contém a regra de supressão no `dist/main.js`.
- O container ativo prioriza `selectedRowId` no `dist/main.js`.
- A API Horizons respondeu `{"status":"ok"}`.
- As instâncias `Meu numero` e `Horizons Typebot` retornaram a `open`.
- O patch passou em `node --check`.
- Os novos arquivos passaram em `git diff --check`.

## Homologação ainda necessária

A correção está implantada e tecnicamente validada no runtime, mas a
homologação visual precisa ser concluída pelo usuário no WhatsApp:

1. enviar `#sair` para encerrar a sessão antiga;
2. iniciar uma conversa nova;
3. confirmar que um menu de até três opções mostra apenas o interativo;
4. abrir a lista de dispositivos e confirmar que não aparece `▶️ 1 … ▶️ 8`;
5. tocar em uma linha e confirmar que o fluxo avança sem `Invalid message`;
6. chegar ao catálogo de planos, navegar entre as duas páginas e confirmar que
   nenhuma lista numérica adicional é enviada.

Não declarar homologação completa antes desse teste visual. Se ainda houver
falha, coletar o intervalo exato dos logs da nova tentativa e comparar o
`selectedRowId`, o conteúdo enviado ao `continueChat` e a resposta do Typebot.

## Checklist obrigatório para próximas mudanças na Evolution

Antes de declarar uma correção concluída:

1. confirmar o comando real de inicialização do container;
2. identificar o arquivo que o runtime resolve e executa;
3. aplicar o patch a todos os bundles equivalentes necessários;
4. construir a imagem com assertions que falhem quando o padrão mudar;
5. testar a imagem isoladamente antes do deploy;
6. recriar somente o serviço necessário;
7. verificar o código dentro do container ativo após o deploy;
8. confirmar saúde, licença e estado das instâncias;
9. diferenciar validação técnica de homologação visual real;
10. registrar explicitamente o que ainda depende do usuário.

## Regra para menus do Horizons Typebot

| Quantidade/tipo | Transporte esperado | Fallback numérico |
|---|---|---|
| 1–3 opções numeradas | reply buttons | suprimido |
| 4–10 opções numeradas | lista interativa | suprimido |
| Mais de 10 opções | dividir em páginas de até 10 | suprimido em cada página |
| Choice textual sem `[buttons]`/`[list]` | texto do Typebot | mantido |

Essa regra deve ser validada tanto no gerador do Typebot quanto no adaptador da
Evolution sempre que o fluxo, a versão da Evolution ou o formato da resposta
do WhatsApp mudar.

O gerador agora rejeita menus com mais de dez itens em vez de produzir fallback
numérico. Também valida limite de três botões, dez linhas, tamanho dos títulos,
pareamento de cada choice e ausência de numeração visível antes de publicar.

### Reincidência na seleção de telas

Um reteste posterior avançou normalmente até **quantidade de telas**, onde o
clique voltou a produzir `Invalid message`. Nesse caso, o transporte já estava
correto: o erro estava no gerador. O menu emitia `rowId` com o rótulo (`1 tela`),
mas o choice aceitava o valor normalizado (`1`). Tipo de conteúdo, Suporte e
Financeiro possuíam o mesmo risco latente.

Todos esses menus foram alinhados e republicados. Além das verificações de
quantidade e formato, o gerador passou a comparar a sequência completa de IDs
emitidos por cada `[buttons]`/`[list]` com os conteúdos aceitos pelo `choice
input` imediatamente seguinte. A versão publicada foi conferida com 25 choices
e zero divergências de ID.

## Observação sobre Codex Remote

Na mesma conversa houve uma tentativa separada de habilitar o Codex Remote no
host Linux do Horizon. O comando experimental chegou a registrar a máquina,
mas o daemon não permaneceu em execução. A documentação atual informa que a
configuração suportada do Remote começa no aplicativo desktop do ChatGPT em
macOS ou Windows; essa tentativa não alterou o Horizons, o Typebot ou a
Evolution e não deve ser confundida com o erro de menu do WhatsApp.
