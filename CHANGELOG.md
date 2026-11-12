# Registro de atualizações — Japa Sushi Lounge

## v1.4.0 · 12/11/2026 · Atendimento mais humano, horário e rodízio atuais

Origem: varredura do Instagram, do WhatsApp Business e do site em 12/11/2026 (documento "Japa Sushi Lounge — Diagnóstico do atendimento e novo fluxo humanizado").

- **Horário por dia da semana.** "Hoje está aberto?", "hoje é fechado?", "abre hoje?" passam a responder com o dia e a hora de Barretos: terça é folga e o bot diz quando volta; aberto, almoço delivery, antes de abrir e já encerrado têm texto próprio. Horário de um dia ("abrem domingo?") e horário geral também. Antes, "fechado" não era entendido e o cliente recebia "não tenho essa informação".
- **Horários atuais** em `data/knowledge.json`: almoço delivery 11h às 15h (quarta a segunda); jantar e rodízio a partir das 17h, até 22h30 (seg, qua, qui) e 23h (sex a dom). Terça fechado. O horário antigo (18h30, meia-noite) saiu.
- **Rodízio atual.** Preços por faixa de dia (seg a qui; sex a dom e feriados) e "de quarta a segunda"; a pergunta com "hoje", dia da semana ou "fim de semana" recebe só o preço do dia. Infantil de 5 a 11 anos R$ 49,90; menor de 5 e 12 ou mais vão para a equipe (não informado pelo responsável). Saiu "todos os dias" e "menores de 9 não pagam".
- **RH.** Entregador, sushiman, cozinheiro, garçom, freelance e "estão contratando?" passam a ir para o botão do RH (antes caíam em "não tenho essa informação").
- **Reserva guiada.** Pergunta quantas pessoas, dia e horário, uma por vez, aproveitando o que o cliente já disse; recusa terça; sai do roteiro se o cliente perguntar outra coisa; após duas respostas ininteligíveis entrega à equipe. No fim, o botão "Reservar no WhatsApp" abre a conversa com a mensagem pronta. O bot continua sem confirmar mesa nem cobrar sinal. "Sim" depois de "Quer que eu te ajude a reservar?" começa o roteiro.
- **Aniversário.** Explica o bolo do Palácio das Delícias (10 convidados, 3 sabores, receita para até 15 pessoas) sem detalhar regras, pergunta o aniversariante e leva o nome na mensagem da reserva.
- **Story.** Menção agradece e pergunta se pode repostar; "pode" e "não" são entendidos (tag `repost_autorizado`).
- **Comentário.** DM de comentário sem a frase "se algo não saiu como esperado"; palavra-chave QUERO leva ao cardápio.
- **Pedido já feito** ("está anotado o pedido?") vai para a equipe, não para o cardápio.
- **Quando o bot não sabe:** "Toque no botão e fale com a equipe no WhatsApp", sem "não tenho essa informação confirmada".
- **Saudação na terça** avisa da folga.
- Novas tags usadas pelo webhook (criar no ManyChat): `interesse_aniversario`, `repost_autorizado`, `candidato_rh`.
- 18 testes novos (`tests/v140.test.mjs`) com os casos reais e testes antigos atualizados. `resolve(input, {now})` aceita data fixa só para testes; o webhook nunca a recebe.

## v1.3.5 · 23/09/2026 · Correções do teste no Instagram

- Nome: quando o perfil não tem nome preenchido, o bot usa o @ do Instagram ("deyverson_abe" → "Deyverson"). Palavras que não são nome (user, loja, oficial, material etc.) são ignoradas.
- "Oque tem no rodízio" (junto) agora recebe o resumo do rodízio, e não mais o preço.
- "Oque vem" / "o que tem de bom" sem outro assunto também recebem o resumo do rodízio. Antes caíam na mensagem genérica do WhatsApp.

## v1.3.4 · 23/09/2026 · Mais jeitos de perguntar

- Localização entende "Ond vcs estão localizados", "Aonde e", "onde?", "onde vcs ficam", "end de vcs", "qual rua", "como faço pra chegar", "manda a localização" e parecidos. Resposta com o nome do cliente ("Claro, Nome! 📍") e o botão Como chegar.
- "Onde" junto com cardápio, pedido, reserva, pagamento ou vaga continua indo para o assunto certo.
- Abreviações comuns do Direct são entendidas em todas as perguntas: vc/vcs, q, oq, qto, hj, tbm, ond/aonde, end, ta/tao, hrs, vlw, obg.
- "Pago"/"pagar" passam a cair em formas de pagamento.

## v1.3.3 · 23/09/2026 · Linguagem mais próxima, com o nome do cliente

- O bot chama o cliente pelo primeiro nome do Instagram na saudação, no rodízio (preço e composição), na reserva, na reclamação, no RH e no agradecimento. Nome com emoji, número ou símbolo é ignorado e a frase sai sem nome, sem vírgula solta.
- Saudação no tom da referência ("Oiê, Nome! Seja muito bem-vindo(a) ao Japa Sushi Lounge 🍣✨"), agora com botões de Cardápio e WhatsApp.
- Preço do rodízio em lista (Individual, Casal, 9 a 11 anos, menores de 9), convite para reservar pelo WhatsApp e oferta dos grupos frito, grelhado e sem arroz. Preços e regras sem mudança; nenhuma promessa sem confirmação.

## v1.3.2 · 23/09/2026 · Resumo do rodízio

- "O que tem no rodízio?" agora responde em **uma única mensagem curta**: tipos de peça, preços e convite para ver fritos, grelhados ou sem arroz. Não manda mais a lista completa com o guia em várias bolhas. Os guias por preferência continuam respondendo quando o cliente pede.

## v1.3.1 · 23/09/2026 · Correção de regressão

- Restaurada a correção de 22/09 (commit 259123d) que o upload da v1.3 (22b030c) sobrescreveu: leitura do chip "Dados completos do contato" do ManyChat, memória `ai_state` em base64url (sem aspas, não quebra o JSON da Solicitação Externa), normalização de erros comuns (rodizo/rodizzio com maiúsculas, temaky, sachimi, filadelfia) e a palavra "json" no input da OpenAI exigida pelo `json_object`.
- Memória antiga em JSON puro continua aceita (compatível com contatos já existentes).
- Log de erro da OpenAI passa a registrar só status e mensagem curta da API, sem dados do cliente.
- Removida a cópia idêntica `.github/workflows/workflows/ci.yml` (o GitHub Actions só lê `.github/workflows/*.yml`).
- Pergunta de idade citando "filho/filha" sem a palavra rodízio agora responde a regra infantil (antes caía no WhatsApp).
- Homologação 23/09 (pós-deploy): "entregam?"/"fazem entregas?" agora respondem delivery (SAIPOS, iFood e 99Food); logs `OPENAI_REPLY_OK` / `OPENAI_REPLY_FILTERED <intenção> <motivo>` sem conteúdo do cliente, para comprovar uso da OpenAI; `.env.example` com `IFOOD_STORE_URL`/`FOOD99_STORE_URL` opcionais; CI duplicado finalmente removido (o upload pelo navegador não apaga arquivos).
- Novos testes: roteiro de homologação completo, Story, áudio, ortografia, memória legada e fallback/timeout da OpenAI com `store:false`.

## v1.3.0 · 23/09/2026 · Delivery multiplataforma

- Atendimento de pedidos e entregas passou a apresentar SAIPOS, iFood e 99Food, de acordo com confirmação do responsável.
- Criadas rotas de resposta específicas para perguntas sobre iFood e 99Food, sem precisar criar nova automação de IA no ManyChat.
- Novos CTAs dinâmicos, até três botões, exibidos somente com links oficiais diretos e validados da loja em Barretos. O canal SAIPOS continua disponível com o link já aprovado.
- Variáveis opcionais da Vercel `IFOOD_STORE_URL` e `FOOD99_STORE_URL`, caso o responsável prefira ativar os botões sem editar JSON.
- Taxas e preços de cada aplicativo são apresentados pelo próprio aplicativo: o bot não reaproveita valores do SAIPOS em marketplaces.
- Health check da Vercel passou a informar confirmação dos dois canais e ativação ou pendência dos botões.
- Adicionados testes de regressão para ambos os canais, URLs oficiais, limite de botões e rejeição de URLs falsas/genéricas.
- Documentação de configuração e teste atualizada.

**Pendente:** o responsável precisa enviar os links exatos da loja do Japa Sushi Lounge de Barretos no iFood e 99Food. Até lá o bot já informa a presença nesses aplicativos, mas não cria botões de marketplace com links inexistentes.

## v1.2.0 · 22–23/09/2026 · Guia do rodízio

- Guia separado para fritos/empanados, grelhados e sem arroz, sem confundir o à la carte com o rodízio.

## v1.1.0 · 22/09/2026 · Implantação inicial

- Regras comerciais, cardápio validado, webhook, OpenAI, ManyChat sem IA nativa, WhatsApp de atendimento/RH, avaliações e testes automatizados.
