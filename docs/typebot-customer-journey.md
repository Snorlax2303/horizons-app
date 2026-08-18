# Jornada Typebot — teste, aquisição, renovação e atendimento

## Princípios

- Identificar primeiro pelo WhatsApp; perguntar a intenção antes da triagem.
- Criar/atualizar o possível cliente no Horizons assim que houver telefone.
- Perguntar somente o necessário para a rota escolhida.
- Nunca criar dois testes, duas cobranças ou duas renovações para a mesma ação.
- Nunca guardar senha do painel em eventos, logs ou histórico compartilhado.
- Fotos de controle ajudam na triagem, mas baixa confiança vai para humano.

## Entrada e menu

1. Capturar `remoteJid`, normalizar telefone e pedir o nome quando ausente.
2. Chamar `POST /api/typebot/intake` com uma chave estável da sessão.
3. Mostrar: **Fazer teste**, **Renovar plano**, **Adquirir agora**, **Suporte**,
   **Financeiro** e **Falar com atendente**.

## Fazer teste

1. Perguntar onde será usado: TV, TV Box, celular/tablet ou computador.
2. Para Samsung: enviar as três fotos de referência já cadastradas, na ordem,
   e perguntar por menu se é o primeiro, o segundo ou o terceiro controle.
   Para outras marcas, manter a triagem orientada pelo aparelho/controle.
3. Resolver categoria/plataforma e consultar o manual ativo do Horizons.
4. Identificar o aplicativo e criar o acesso sem uma etapa intermediária de
   “preparar”. Após a criação efetiva, enviar instalação objetiva, nomes dos
   aplicativos, código do provedor quando aplicável, login e senha juntos.
5. Perguntar quantas telas serão usadas **ao mesmo tempo**.
   - 1–3: um acesso/pedido.
   - acima de 3: explicar que cada acesso suporta até 3 simultâneas, calcular
     `ceil(telas / 3)` apenas como estimativa e encaminhar para Vendas antes de
     cobrar ou criar acessos extras.
6. Perguntar período/plano pretendido para qualificar a proposta. Isso não
   altera a duração do teste.
7. Criar o teste uma única vez, passando telefone/nome ao adaptador quando o
   contrato do endpoint CineHub/Union estiver homologado.
8. Enviar credenciais somente na resposta transitória. Para Samsung, informar
   **Home/Smart Hub → Apps → Vizzion Play**, provedor `00776`, login e senha.
   Não enviar placeholders como `[USUÁRIO]`/`[SENHA]` nem despejar o texto
   integral do manual. Marcar o lead como `test_sent`.

## Adquirir agora

Executa a mesma triagem de aparelho/telas. O caminho seguro é criar primeiro o
teste vinculado ao lead, gerar um `sales_order` e então cobrar. Pagamento
PaggPay confirmado cria/converte o cliente e enfileira provisionamento ou
renovação. O checkout CineHub só deve ser usado se seu link realmente carregar
cliente, plano, valor e referência verificável; o `payUrl` já observado não
cumpre esse contrato.

## Renovar

1. Localizar cliente por telefone; zero ou múltiplos resultados vão para humano.
2. Mostrar cadastro, plano/telas, vencimento e valor que vieram do Horizons.
3. Com PaggPay, criar Pix com `renewal_requests.id` em `reference_id`. O webhook
   reconfirma a transação na API PaggPay e o Horizons enfileira a renovação no
   painel. O painel não precisa receber callback PaggPay.
4. Não aceitar valor digitado pelo cliente nem confiar em status vindo do bot.
5. Se for utilizado checkout único do painel, persistir e validar sua referência
   antes de tratar como renovação automática.

## Suporte

Coletar aparelho, marca, aplicativo e categoria do problema: não abre, trava,
sem canais, credenciais, instalação ou outro. Tentar o manual correspondente;
se não resolver, criar handoff de Suporte com resumo completo e fotos.

## Financeiro e humano

Financeiro recebe pagamento não reconhecido, divergência, comprovante,
cancelamento ou reembolso. Atendimento geral recebe dúvidas e casos sem rota.
Os telefones de destino devem vir de configuração protegida, nunca ficar
gravados no fluxo Typebot exportável.

## Blocos HTTP planejados

- `POST /api/typebot/intake`: cria/atualiza lead, sessão e triagem.
- `POST /api/typebot/handoffs`: abre fila para Vendas, Suporte ou Financeiro.
- `POST /api/typebot/guides/recommend`: retorna instrução por aparelho.
- `POST /api/typebot/union/tests`: cria teste idempotente.
- `POST /api/typebot/renewals/paggpay`: cria Pix de renovação idempotente.

As migrations e novas rotas devem ser aplicadas/publicadas juntas. Até isso
acontecer, o fluxo não deve chamar os endpoints planejados.

## Blueprint do editor Typebot

### Variáveis

`session_key`, `remoteJid`, `phone`, `pushName`, `prospect_id`, `customer_id`,
`intent`, `device_location`, `device_category`, `device_brand`, `control_photo_1`,
`control_photo_2`, `app_name`, `guide_id`, `simultaneous_screens`, `plan_id`,
`plan_name`, `plan_amount`, `test_id`, `test_username`, `test_password`,
`sales_order_id`, `renewal_id`, `pix_code`, `handoff_id` e `error_code`.

Não criar variável para a `apiKey` injetada pela Evolution. Senhas de teste só
vivem na execução atual e não entram em Results, webhooks genéricos ou logs.

### Grupos e botões

1. `00 — Entrada`: normaliza `remoteJid`, gera `session_key` e chama Intake.
2. `10 — Menu`: três botões de categoria — **Teste ou assinatura**,
   **Já sou cliente** e **Atendimento** — seguidos por submenus de até três.
3. `20 — Local do teste`: **Smart TV**, **TV Box/Android TV**,
   **Celular/Tablet**, **Computador** e **Não sei**.
4. `21 — Marca da TV`: **Samsung**, **LG**, **Roku**, **Philips**,
   **TCL**, **AOC**, **Outra** e **Não sei**.
5. `22 — Identificar controle`: para Samsung, envia três referências e pergunta
   **Primeiro controle**, **Segundo controle** ou **Terceiro controle**. Cada
   escolha mostra uma dica curta da localização do botão e segue ao aplicativo.
6. `23 — Aplicativo`: consulta Guide sem despejar instruções ou mídia genérica;
   oferece **Preparar meu acesso**, **Preciso de ajuda** e **Falar com atendente**.
7. `24 — Telas simultâneas`: **1**, **2**, **3** e **Mais de 3**. O último
   abre Vendas; não gera cobrança.
8. `25 — Interesse comercial`: os 18 planos do endpoint Offers são divididos
   em duas listas de nove, com ida e volta entre páginas, sem texto numerado.
   Salva a qualificação e, para teste, só depois cria o acesso.
9. `26 — Criar teste`: chama Union Tests uma vez, envia acesso e manual, depois
    oferece **Fechar plano**, **Falar com atendente** e **Voltar ao menu**. O
    primeiro botão cria o pedido vinculado ao teste e exibe seu checkout.
10. `30 — Assinar agora`: reaproveita 20–25, cria Sales Order e apresenta
    proposta. Cobrança só entra após homologar a conversão lead→cliente.
11. `40 — Renovar`: se `customer_match=found`, mostra plano/telas/valor;
    botões **Gerar Pix**, **Tenho dúvida** e **Falar com atendente**. Ausente ou
    ambíguo vai para humano.
12. `41 — Pix`: chama PaggPay, mostra copia-e-cola e informa que a confirmação
    é automática; nunca aceita “já paguei” como confirmação.
13. `50 — Suporte`: categorias **Não abre**, **Travando**, **Sem canais**,
    **Instalação**, **Usuário/senha** e **Outro**; consulta Guide e abre handoff
    se o procedimento não resolver.
14. `60 — Financeiro`: **Pagamento não reconhecido**, **Valor divergente**,
    **Enviar comprovante**, **Cancelamento/reembolso** e **Outro**; sempre cria
    handoff financeiro.
15. `70 — Humano`: cria Handoff e mostra prazo/mensagem configurada, sem revelar
    dados internos.
16. `90 — Falha segura`: oferece tentar novamente uma vez e depois atendimento;
    nunca repete criação de teste ou cobrança com nova chave automaticamente.

## Pendências de conteúdo

- Telefones de Vendas, Suporte, Financeiro e atendimento geral.
- O catálogo inicial de 15 manuais e 18 imagens foi importado em 2026-08-05.
  Antes da publicação, revisar DNS/IPs, sideload, códigos, links externos e a
  disponibilidade atual dos aplicativos em cada loja/modelo.
- As fotos de referência já estão vinculadas aos manuais. A classificação
  visual automática continua pendente; marca/aparelho não identificado segue
  para atendimento humano.
- Definição comercial dos planos/períodos já cadastrados no Horizons.
- Token de API do workspace Typebot armazenado em ambiente protegido, caso a
  construção do fluxo seja automatizada em vez de feita pelo editor.

O fluxo `Atendimento IPTV — Horizons`, versão 6.1, foi publicado em 2026-08-10.
Ele contém 36 grupos, 116 blocos e 100 arestas. Todas as 25 escolhas estão
pareadas com botão ou lista; o modelo publicado tem 18 blocos `[buttons]`, 7
blocos `[list]`, zero opção interativa numerada, três imagens Samsung e zero
placeholder `[USUÁRIO]`/`[SENHA]`.

## Classificador visual de controles

O classificador será assistivo, não uma decisão irreversível:

1. O Typebot solicita foto frontal nítida, com todos os botões visíveis.
2. O Horizons recebe a referência da mídia pelo transporte autenticado e baixa
   a imagem somente durante a análise. Antes de implementar, capturar o payload
   real Evolution→Typebot para não aceitar URL arbitrária e evitar SSRF.
3. A saída estruturada contém `device_category`, `manufacturer`,
   `platform_candidates`, `visual_clues`, `confidence` e `needs_second_photo`.
4. Confiança alta: perguntar **“Parece ser X, está correto?”**; nunca avançar
   silenciosamente.
5. Confiança média: mostrar até três alternativas em botões.
6. Confiança baixa: pedir outra foto ou abrir handoff de Suporte/Vendas.
7. Só depois da confirmação humana consultar o manual e recomendar aplicativo.

As imagens e opções que o usuário cadastrar formarão o catálogo de referência.
O resultado pode ser persistido na triagem, mas a foto original não deve ficar
em logs; retenção de mídia precisa ser curta e explicitamente documentada.
