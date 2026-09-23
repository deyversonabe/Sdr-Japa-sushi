# Entrega Japa Sushi Lounge — SAIPOS, iFood e 99Food (v1.3.0)

## Regra confirmada e lacuna pendente

O responsável confirmou **entrega e retirada pelo SAIPOS** e que o Japa Sushi Lounge também **está no iFood e no 99Food**. A base atual contém link direto apenas do SAIPOS. **Não há links de loja fornecidos para iFood e 99Food**; não deduzir URLs a partir de nome, endereço ou restaurantes de outras cidades.

## Resposta do bot: perguntas de entrega

> Temos entrega e retirada pelo nosso cardápio digital (SAIPOS). Também atendemos pelo iFood e 99Food! No SAIPOS, a taxa aparece ao informar seu endereço. Nos aplicativos, consulte as taxas e os preços exibidos por cada plataforma.

Os botões nunca são impressos como URL no texto. A lista é preenchida automaticamente, nesta ordem:

| Botão | Destino | Estado inicial |
|---|---|---|
| Ver cardápio / pedir | `links.cardapio_pedido` (SAIPOS) | Ativo |
| Pedir no iFood | `links.ifood` ou `IFOOD_STORE_URL` | Pendente: falta URL direta da loja |
| Pedir no 99Food | `links.food99` ou `FOOD99_STORE_URL` | Pendente: falta URL direta da loja |
| Falar no WhatsApp | `links.whatsapp` | Aparece como alternativa enquanto houver espaço (máximo três botões) |

**Importante:** o projeto não envia o cliente a uma loja homônima, loja genérica de outra cidade, nem usa link fictício. Com duas URLs de marketplace válidas, os três botões prioritários são SAIPOS, iFood e 99Food. Nas respostas específicas por app, o botão do canal solicitado aparece primeiro quando existir.

## Como ativar os botões

1. No aplicativo iFood, localize a loja real do Japa Sushi Lounge de Barretos e use **Compartilhar loja**. Repita no 99Food.
2. Confirme nome da empresa, cidade e destino do checkout em cada URL. Se o endereço for um redirecionador encurtado do app, obtenha o destino oficial e confirme sua correspondência antes de aceitar.
3. Salve os URLs na Vercel, em **Settings → Environment Variables**: `IFOOD_STORE_URL` e `FOOD99_STORE_URL`. Alternativamente, atualize `data/knowledge.json` nas chaves `links.ifood` e `links.food99` e rode o CI. O sistema valida domínios oficiais e formatos de loja, rejeitando homepage genérica.
4. Faça redeploy caso mude as variáveis. Confira o GET `/api/manychat`: `ifood_confirmed` e `food99_confirmed` continuam true; os indicadores `ifood_button_configured` e `food99_button_configured` devem mudar para true.
5. No ManyChat, teste pelo **contato interno**: `vocês entregam?`, `quero iFood`, `quero 99Food` e `qual a taxa de entrega?`. Verifique cada botão real no celular.

### Resposta sem URL confirmada

> Sim, estamos no iFood! Procure Japa Sushi Lounge, em Barretos, no aplicativo. Ainda não temos o link direto da loja confirmado para este botão; se preferir, peça pelo nosso cardápio digital.

A regra correspondente também funciona para 99Food. Após obter os links confirmados, os botões passam a aparecer sem alterar o restante do fluxo ou ativar IA do ManyChat.

### Segurança e privacidade

Não colocar `WEBHOOK_SECRET` ou `OPENAI_API_KEY` no repositório. Preços, descontos, taxa de entrega e disponibilidade dos aplicativos devem ser consultados no próprio marketplace; não reproduzir preço do SAIPOS como se fosse garantido em todos os canais.
