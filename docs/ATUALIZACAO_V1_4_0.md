# Atualização v1.4.0 — o que fazer no ManyChat e no WhatsApp

O código desta versão cuida das respostas. Os itens abaixo ficam no ManyChat e no WhatsApp Business e só devem ser ligados **depois** que a v1.4.0 estiver publicada na Vercel (`GET /api/manychat` deve mostrar `app_version: 1.4.0`). Nada aqui usa a IA nativa do ManyChat.

## 0. Antes de publicar

1. Confirmar o horário do jantar. O Instagram (bio e post de 11/11) diz **17h**; a arte "Novo horário" enviada em 12/11 diz **18h30** e meia-noite na sexta e no sábado. O bot usa o do Instagram. Para trocar, edite só `horarios.jantar_rodizio` em `data/knowledge.json` (`abre`, `fecha`, `abre_min`, `fecha_min`; minutos desde a meia-noite) e rode `npm run check`.
2. Criar as tags no ManyChat: `interesse_aniversario`, `repost_autorizado`, `candidato_rh` (as outras já existem).
3. Confirmar com a equipe as regras do bolo de aniversário (precisa de antecedência? vale em qualquer dia? até quando?). O bot só diz que "a equipe combina as condições".
4. Definir se criança menor de 5 anos paga. Hoje o bot encaminha para a equipe.

## 1. Menção em story (hoje fica sem resposta)

ManyChat, Configurações, Instagram, **Story Mention Reply**: criar a automação e ligar a chave. Passo da automação: Ação, Solicitação externa, mesma chamada do Default Reply (`POST /api/manychat?mode=dynamic`), enviando `event_type = story_mention`, `first_name` e `ai_state`. A resposta do webhook já traz o texto: "Que foto linda, {nome}! Obrigado por marcar o Japa. Posso repostar nos nossos stories?". Só dispara em conta pública e quando a marcação começa por @. A resposta "pode"/"não" cai no Default Reply e o webhook entende.

## 2. Comentário vira conversa

Para cada post, em **Automações, Comentários de post e Reel**:

- Resposta pública, alternando quatro versões: "Te chamei no direct 🍣", "Mandei um oi no seu direct 😊", "Olha o direct, tem novidade pra você", "Já te respondi no privado 🍣" (com o nome quando houver).
- DM: chamada ao webhook com `event_type = instagram_comment` e a palavra do comentário em `message`. O primeiro envio por comentário aceita um bloco só: o webhook já devolve uma mensagem curta com o botão.
- Legendas novas: pedir uma palavra em vez de pergunta solta. "Comenta QUERO e a gente te manda o cardápio" (Mega Hot Roll) e "Comenta ANIVERSÁRIO" (reel do bolo). QUERO leva ao cardápio; ANIVERSÁRIO inicia a reserva de aniversário.

Observação: os botões de resposta rápida do Dynamic Block só apontam para nós ou fluxos do ManyChat; por isso as mensagens trazem as opções escritas ("rodízio no salão ou pedir em casa") e o bot entende o que o cliente digitar.

## 3. WhatsApp: uma saudação em vez de cinco

Hoje o cliente recebe boas-vindas com link no texto, uma segunda saudação, a tabela de preços e a foto, em sequência. Trocar por uma mensagem só, com lista de opções (Rodízio, Cardápio e pedido, Reservar mesa, Horários, Vagas), sem link no corpo:

> Oi! Aqui é o Japa Sushi Lounge 🍣 Como posso te ajudar: rodízio no salão, pedido em casa ou reserva de mesa?

Na terça, usar a variante: "Às terças a gente descansa, mas amanhã estamos de volta às 11h (almoço delivery) e às 17h (jantar e rodízio)."

Corrigir também a resposta salva do WhatsApp Business com **Casal R$ 199,99** (o preço é **R$ 199,90**) e o "Infantil (5 a 11 anos)" já está certo. Incluir os preços de sexta a domingo e feriados, R$ 124,90 e R$ 229,90, e a frase "terça fechado".

## 4. Um lembrete, só um

No fluxo de rodízio e reserva: se o cliente perguntou preço e não respondeu em 3 horas, dentro da janela de 24 horas, enviar "Oi! Ficou alguma dúvida sobre o rodízio? Se quiser, te ajudo a escolher o melhor dia 🍣". Não enviar se o cliente agradeceu ou recusou; sem segundo lembrete.

## 5. Conferências depois de publicar

| Teste (mandar do Instagram de teste) | Esperado |
| --- | --- |
| "hoje está fechado?" numa terça | Folga e volta amanhã às 11h e 17h |
| "qual o valor do rodízio?" | Duas faixas de preço e infantil 5 a 11 anos R$ 49,90 |
| "criança de 1 ano paga?" | Equipe confirma, botão do WhatsApp |
| "sou sushiman" / "precisam de entregador?" | Botão "Enviar currículo" (RH) |
| "quero reservar" e responder as perguntas | Botão "Reservar no WhatsApp" com a mensagem pronta |
| Marcar o Japa em um story | Agradecimento e pedido para repostar |
