# Auditoria técnica, homologação e operação

## Testes automatizados

Com Node 20 ou superior, execute `npm run check`. O script confere sintaxe dos três módulos JS e executa os testes em `tests/engine.test.mjs` e `tests/http.test.mjs`. O projeto passou a ter **mais de 100 testes automatizados** (v1.5.0, incluindo `tests/v150.test.mjs`) cobrindo contrato JSON, catálogo, roteamento, links, pagamentos, idade, reservas, RH, privacidade, fallback, estado, avaliação, deduplicação e chamada à OpenAI **simulada**.

A chamada simulada **não prova** que a chave ou o modelo da OpenAI estejam ativos na Vercel. Igualmente, o teste unitário de Dynamic Block **não substitui** a “Solicitação de Teste” no ManyChat real nem um teste em conta interna de Instagram. O deploy e a publicação nos serviços externos precisam ser confirmados separadamente.

## Teste ponta a ponta com um contato interno

| Mensagem / evento de teste | Resultado que você deve conferir |
|---|---|
| `oi` | Saudação natural, sem preço inventado nem link em texto. Com chave OpenAI válida, pode ser humanizada; sem chave, resposta-base. |
| `Qto tá o rodiozio?` | Rodízio diário: R$ 114,90 individual, R$ 199,90 casal; bebidas e sobremesas à parte. |
| `o que tem no rodízio?` | Lista principal + **guia separado** de fritos/empanados, grelhados e sem arroz. Sem declarar Joy Especial à la carte como incluso. |
| `quais fritos tem no rodízio?` | Somente fritos/empanados cadastrados; botões Cardápio e WhatsApp, sem URLs no texto. |
| `tem grelhados no rodízio?` | Hossomaki e uramaki grelhados, sem adicionar pratos do à la carte. |
| `o que tem sem arroz?` | Lista de sashimis, carpaccio, ceviche, sunomono e shimeji; esclarece que Joy Especial sem arroz é à la carte. |
| `Criança de 9 anos paga?` | Informa R$ 54,90 para 9 a 11 anos e gratuidade somente para menores de 9 anos. |
| `Quanto custa Combo Casal?` | R$ 169,99; dizer honestamente que falta descrição confirmada. Não confundir com rodízio para casal. |
| `Joy Salmão` | Se o termo não indicar categoria, apresentar alternativas reais R$ 34,99 e R$ 44,99 com respectivas categorias. |
| `Yakimeshi` / `Yakissoba camarão` | Somente pratos quentes ativos confirmados; valor exacto R$ 64,99 para Yakissoba Camarão. |
| `quero reservar uma mesa` | Nome/dia/hora/quantidade + regra de sinal de 50%; CTA WhatsApp; nunca “mesa garantida”. |
| `quanto é a taxa de entrega?` | Informa SAIPOS, iFood e 99Food; consulta de taxa no SAIPOS pelo endereço, taxas/preços dos marketplaces em cada app. Sem URL direta validada, não cria botão de marketplace. |
| `quero pedir no iFood` / `tem no 99Food?` | Confirma canais e direciona pelo botão nativo da loja **somente se URL específica foi validada**. Caso contrário, orienta buscar Japa Sushi Lounge em Barretos no app e apresenta botão SAIPOS. |
| `onde fica?` | Endereço correto + botão Maps real; **nenhuma URL aparente**. |
| `quero trabalhar aí` / `envio currículo` | **Somente** botão RH para (17) 99602-2567. |
| `sou influenciadora, proposta de parceria` | Resposta institucional neutra, sem confirmar buscas pessoais, mudanças de gestão ou promessa comercial. |
| `meu pedido veio errado` | Pedido de desculpa + botão humano no WhatsApp de atendimento. |
| `sou alérgico a camarão` | Sem garantir ausência de alérgenos ou contaminação cruzada; encaminha humano. |
| Resposta a Story com `qual rodízio?` | Trata a pergunta real; não devolve agradecimento genérico nem resposta para story diferente. |
| Menção em Story sem mensagem | Agradece sem empurrar venda. |
| Evento `pedido_confirmado` (simulado com contato interno) | Pergunta nota 1–5; `ai_state` fica pendente. |
| Nota `5` na pesquisa pendente | Grava número 5; botão "Avaliar o Japa". |
| Nota `3` + relato | Grava nota, solicita relato, guarda feedback; sem botão de avaliação; equipe pelo WhatsApp. |
| Mensagem apenas `5` fora de pesquisa | NÃO grava nota no contato. |
| Mensagem repetida com mesmo `event_id` | Não processa novamente; evitar eventos duplicados da própria automação. |
| Webhook sem segredo válido | HTTP 401; **fallback ManyChat** assume quando a requisição falhar. |

## Checklist de publicação — aceite formal

1. **Dados comerciais:** horários (terça fechado; almoço só delivery; jantar completo), site e link de avaliação definidos; manter combos promocionais bloqueados, confirmar preços no SAIPOS, itens reais do rodízio e regra detalhada da reserva; reexecutar os testes após alterar.
2. **Ambiente:** segredo configurado e protegido; OpenAI API Key ativa; Deploy Vercel bem-sucedido; `GET /api/manychat` indica versões e flags esperadas; controle de acesso da conta correto.
3. **ManyChat:** IA interna **totalmente desativada**; tags/campos com nomes idênticos; Dynamic Block testado e fallback configurado; não há gatilhos concorrentes; link de avaliação sempre `https://japasushi.netlify.app/`.
4. **Pesquisa:** evento vem de venda realmente confirmada, não de `interesse_pedido`; bloqueio operacional contra pesquisas duplicadas; convite de avaliação só com experiência real ou nota 4–5, no máximo 1 a cada 30 dias.
5. **Teste real:** rodar todos os cenários acima **somente com contato da equipe**, conferir botões no aparelho, visual do Instagram, regras de horário/políticas Meta e tags no ManyChat.

## Política de fatos e decisões

- OpenAI **não seleciona itens, calcula preços, confirma reserva, entrega ou taxa**. Recebe apenas resposta social de base e devolve JSON curto que será rejeitado se contiver URL, número ou termos controlados.
- `data/catalogo_extraido.json` contém descrição somente se apareceu no PDF; nomes iguais de categorias distintas continuam cadastros distintos; preço só sai do registro confirmado.
- Resposta sem fato confirmado é resposta neutra + botão de WhatsApp, não tentativa de completar pelo conhecimento geral do modelo.
- Logs não incluem conteúdo do cliente. A Vercel usa endpoint protegido por segredo compartilhado; a chave OpenAI fica apenas no ambiente de servidor.
- Respeitar solicitações de atendimento humano, a janela de 24h e requisitos da Meta no canal utilizado. O WhatsApp é **destino de botão**, não integração automática obrigatória na versão Instagram.

## Observabilidade

Revisar erros `BOT_FATAL_ERROR`, `OPENAI_REPLY_ERROR`, aumento de intenção `outro` e divergências de preço reportadas pela equipe. Para qualquer nova frase problemática, criar primeiro um teste de regressão. Confronte o `app_version` do webhook com a versão do repositório em produção; não publique alteração de menu sem conferir o sistema de vendas.

Referências: [ManyChat Dynamic Block](https://help.manychat.com/hc/pt-br/articles/14281268533788-DevTools-Bloco-din%C3%A2mico), [protocolo Instagram](https://manychat.github.io/dynamic_block_docs/channels/), [OpenAI Responses API](https://platform.openai.com/docs/api-reference/responses).

## Novos testes v1.3.0: canais de entrega

- Atendimento do delivery indica os três canais, sem fixar taxa ou preço dos aplicativos.
- Sem `IFOOD_STORE_URL` ou `FOOD99_STORE_URL`, não existe botão de loja inventado.
- Com URLs diretas de loja e domínios aceitos, a resposta padrão e o Dynamic Block mostram **até três botões**: SAIPOS, iFood e 99Food.
- URLs de página inicial genérica ou domínios falsos são rejeitados.
- As rotas e os botões devem ser testados em conta interna antes de ativação pública. Os URLs usados nos testes automatizados são **fictícios de teste**, não endereços da loja real.


## Teste de pausa por atendimento humano (v1.5.0)

Coberto em `tests/v150.test.mjs`: com `atendimento_humano=true` o bot responde `next_action: silencio_humano` e não envia mensagem, em qualquer canal. Com `atendimento_humano_desde` mais antigo que 24h, o bot volta a responder. No ManyChat real, teste assim: (1) ligue o campo no seu contato de teste, (2) mande "oi" e confirme o silêncio, (3) desligue o campo e confirme que o bot volta.
