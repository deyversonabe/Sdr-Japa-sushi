# Auditoria técnica, homologação e operação

## Testes automatizados

Com Node 20 ou superior, execute `npm run check`. O script confere sintaxe dos três módulos JS e executa os testes em `tests/engine.test.mjs` e `tests/http.test.mjs`. O projeto foi preparado com **28 testes automatizados** cobrindo contrato JSON, catálogo, roteamento, links, pagamentos, idade, reservas, RH, privacidade, fallback, estado, avaliação, deduplicação e chamada à OpenAI **simulada**.

A chamada simulada **não prova** que a chave ou o modelo da OpenAI estejam ativos na Vercel. Igualmente, o teste unitário de Dynamic Block **não substitui** a “Solicitação de Teste” no ManyChat real nem um teste em conta interna de Instagram. O deploy e a publicação nos serviços externos precisam ser confirmados separadamente.

## Teste ponta a ponta com um contato interno

| Mensagem / evento de teste | Resultado que você deve conferir |
|---|---|
| `oi` | Saudação natural, sem preço inventado nem link em texto. Com chave OpenAI válida, pode ser humanizada; sem chave, resposta-base. |
| `Qto tá o rodiozio?` | Rodízio diário: R$ 114,90 individual, R$ 199,90 casal; bebidas e sobremesas à parte. |
| `Criança de 9 anos paga?` | **Não adivinhar**: solicita confirmação da equipe via botão do WhatsApp. |
| `Quanto custa Combo Casal?` | R$ 169,99; dizer honestamente que falta descrição confirmada. Não confundir com rodízio para casal. |
| `Joy Salmão` | Se o termo não indicar categoria, apresentar alternativas reais R$ 34,99 e R$ 44,99 com respectivas categorias. |
| `Yakimeshi` / `Yakissoba camarão` | Somente pratos quentes ativos confirmados; valor exacto R$ 64,99 para Yakissoba Camarão. |
| `quero reservar uma mesa` | Nome/dia/hora/quantidade + regra de sinal de 50%; CTA WhatsApp; nunca “mesa garantida”. |
| `quanto é a taxa de entrega?` | Informa consulta pelo endereço no SAIPOS; botão SAIPOS e, opcionalmente, WhatsApp. |
| `onde fica?` | Endereço correto + botão Maps real; **nenhuma URL aparente**. |
| `quero trabalhar aí` / `envio currículo` | **Somente** botão RH para (17) 99602-2567. |
| `sou influenciadora, proposta de parceria` | Resposta institucional neutra, sem confirmar buscas pessoais, mudanças de gestão ou promessa comercial. |
| `meu pedido veio errado` | Pedido de desculpa + botão humano no WhatsApp de atendimento. |
| `sou alérgico a camarão` | Sem garantir ausência de alérgenos ou contaminação cruzada; encaminha humano. |
| `Combo Dia dos Namorados` | Nunca ofertar promoção antiga nem reproduzir seu preço de cadastro. |
| Resposta a Story com `qual rodízio?` | Trata a pergunta real; não devolve agradecimento genérico nem resposta para story diferente. |
| Menção em Story sem mensagem | Agradece sem empurrar venda. |
| Evento `pedido_confirmado` (simulado com contato interno) | Pergunta nota 1–5; `ai_state` fica pendente. |
| Nota `5` na pesquisa pendente | Grava número 5; quando URL Google validada, CTA de avaliação. |
| Nota `3` + relato | Grava nota, solicita relato, guarda feedback; CTA Google se URL confirmada e acesso humano. |
| Mensagem apenas `5` fora de pesquisa | NÃO grava nota no contato. |
| Mensagem repetida com mesmo `event_id` | Não processa novamente; evitar eventos duplicados da própria automação. |
| Webhook sem segredo válido | HTTP 401; **fallback ManyChat** assume quando a requisição falhar. |

## Checklist de publicação — aceite formal

1. **Dados comerciais:** idade exata de 9 anos, URL exata do review, status dos 7 combos promocionais, preços atuais no PDV e regra detalhada da reserva definidos; reexecutar os testes após alterar.
2. **Ambiente:** segredo configurado e protegido; OpenAI API Key ativa; Deploy Vercel bem-sucedido; `GET /api/manychat` indica versões e flags esperadas; controle de acesso da conta correto.
3. **ManyChat:** IA interna **totalmente desativada**; tags/campos com nomes idênticos; Dynamic Block testado e fallback configurado; não há gatilhos concorrentes; URL de review nunca substituída pela rota Maps.
4. **Pesquisa:** evento vem de venda realmente confirmada, não de `interesse_pedido`; bloqueio operacional contra pesquisas duplicadas; acesso ao Google não restrito a notas 5.
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
