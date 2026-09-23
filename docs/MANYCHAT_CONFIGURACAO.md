# Manual operacional ManyChat — Instagram do Japa Sushi Lounge

**Regra absoluta: NÃO ativar ManyChat AI, AI Step, IA de reconhecimento, sugestões IA ou qualquer recurso nativo de inteligência artificial da plataforma.** Usar apenas gatilhos, regras, campos, tags e o **DevTools → Dynamic Block**. A inteligência comercial reside no webhook da Vercel e a humanização social na API da OpenAI. O DevTools é um recurso técnico do ManyChat e pode depender do plano contratado.

## 1. Preparação

No ManyChat, conecte o Instagram oficial `@japasushibarretos`, autorize acesso às mensagens e configure como conta comercial, respeitando as exigências da Meta. Não mantenha um Default Reply anterior respondendo paralelamente, nem um gatilho genérico disputando as mesmas DMs.

Em **Settings → Fields → Custom User Fields**, crie estes campos com **exatamente** estas grafias:

| Campo | Tipo | Uso |
|---|---|---|
| `ai_state` | Text | JSON curto de memória: último assunto, continuidade, avaliação pendente e deduplicação. |
| `avaliacao_nota` | Number | Nota de 1 a 5, gravada somente após resposta válida em pesquisa pendente. |
| `avaliacao_feedback` | Text | Comentário livre de cliente que avaliou de 1 a 4. |
| `atendimento_humano` | True/False | Somente se ativar futuramente um fluxo oficial de WhatsApp com transferência; não precisa habilitar canal agora. |

Em **Tags**, crie `interesse_pedido`, `interesse_cardapio`, `interesse_reserva`, `precisa_humano` e `pedido_confirmado_japa`. Todos os nomes precisam existir **antes** da execução do Dynamic Block. O próprio webhook devolve até cinco ações por resposta e define a memória e as tags pertinentes. `pedido_confirmado_japa` **não** é atribuído pelo bot: pertence à integração real do PDV/SAIPOS ou à equipe após a confirmação do pedido.

## 2. Fluxo principal — Instagram Default Reply

Crie automação **JAPA · 01 · Atendimento Direct (Vercel)** com gatilho de **resposta padrão / mensagem direta recebida**. Adicione um bloco de conteúdo **Dynamic Block** (NÃO AI Step). Configure:

| Campo | Valor |
|---|---|
| Método | `POST` |
| URL | `https://SEU-PROJETO.vercel.app/api/manychat?mode=dynamic` |
| `Content-Type` | `application/json` |
| `x-webhook-secret` | Mesmo segredo privado da Vercel. |
| Timeout/fallback | Fallback nativo em caso de falha de rede, 401, resposta inválida ou timeout. |

**Corpo JSON — modelo** (os textos `INSERIR_...` são instruções, **não** valores literais; clique no seletor de campos do ManyChat para inserir o token correspondente):

```json
{
  "channel": "instagram",
  "event_type": "direct",
  "subscriber_id": "INSERIR_CHIP_ID_DO_CONTATO",
  "first_name": "INSERIR_CHIP_PRIMEIRO_NOME",
  "message": "INSERIR_CHIP_ULTIMA_ENTRADA_DE_TEXTO",
  "ai_state": "INSERIR_CHIP_CAMPO_ai_state"
}
```

Se o gatilho disponibilizar ID **único e estável da mensagem recebida**, inclua também `"event_id":"CHIP_ID_DA_MENSAGEM"`; não use ID do contato como `event_id` (bloquearia novas mensagens do mesmo cliente). Se não existir esse chip, omita `event_id` e evite gatilhos sobrepostos.

O ManyChat deve montar JSON válido depois de substituir os chips, inclusive quando `ai_state` estiver vazio. Execute **Test Request** com contato interno e confira se recebe protocolo `"version":"v2"`, `"content.type":"instagram"`, `messages` e `actions`. No fluxo Dynamic Block, **não crie mensagem extra repetindo o texto** nem configure botões duplicados: o servidor devolve tudo pronto. Use o ramo **Fallback** de erro com o texto neutro de atendimento e um botão nativo **Falar no WhatsApp** direcionado ao número confirmado. Nunca cole links no texto.

**Exemplo real de resposta Dynamic Block** para “onde fica?” (URL completa fornecida pelo responsável e extraída do `knowledge.json`):

```json
{
  "version": "v2",
  "content": {
    "type": "instagram",
    "messages": [
      {
        "type": "text",
        "text": "Estamos na Av. Treze, 657 – Centro, Barretos/SP. Você pode abrir a rota pelo botão abaixo.",
        "buttons": [{"type":"url","caption":"Como chegar","url":"https://www.google.com/maps?rlz=1C1GCEA_enBR1206BR1206&um=1&ie=UTF-8&fb=1&gl=br&sa=X&geocode=KdkJD5BLhbuUMRAnQl-1sYJP&daddr=Av.+Treze,+657+-+Centro,+Barretos+-+SP,+14780-270"}]
      }
    ],
    "actions": [{"action":"set_field_value","field_name":"ai_state","value":"{...MEMORIA_GERADA...}"}],
    "quick_replies": []
  }
}
```

No ambiente real, **não** cole este exemplo de resposta: o webhook o gera dinamicamente usando a URL completa confirmada pelo responsável. O botão é nativo; o endereço do destino não fica visível na conversa.

## 2.1. Novo grupo SEPARADO da lista do rodízio — versão 1.2.0

Não é necessário criar outra automação nem outro webhook: o motor atual responde às novas frases na mesma requisição do Default Reply. Os gatilhos de Story Reply também usam essas intenções quando o cliente fizer perguntas sobre o rodízio.

| Mensagem recebida | `intent` esperado | Resposta |
|---|---|---|
| `o que tem no rodízio?` / `o que vem no rodízio?` | `rodizio_composicao` | Lista principal resumida seguida de **um segundo grupo separado** por preferência: fritos/empanados, grelhados e sem arroz. |
| `quais fritos tem no rodízio?` / `fritos` | `rodizio_preferencias` | Somente fritos e empanados cadastrados, com botões Cardápio e WhatsApp. |
| `tem grelhados no rodízio?` | `rodizio_preferencias` | Hossomaki e uramaki grelhados cadastrados. |
| `sem arroz` / `o que tem sem arroz no rodízio?` | `rodizio_preferencias` | Sashimis, carpaccio, ceviche, sunomono e shimeji; Joy Especial sem arroz identificado como à la carte separado. |
| `quanto custa o rodízio?` | `rodizio` | Preços já aprovados, sem despejar a relação completa. |
| `bebidas entram no rodízio?` | `rodizio_inclusoes` | Não; bebidas e sobremesas são cobradas separadamente. |

Os grupos ficam em `data/rodizio_grupos_atendimento.json`; **não** acrescente os grupos como uma nova modalidade, preço ou promessa de inclusão. A lista é a relação histórica do cadastro interno: confirme disponibilidade real com a equipe antes de ativar a resposta detalhada.

O texto completo do rodízio supera 900 caracteres. Portanto, **priorize o Dynamic Block**, que já divide em várias bolhas por parágrafo e cria os botões apenas na última. Se utilizar **Solicitação Externa**, mapeie `reply_part_1`, `reply_part_2`, `reply_part_3` e envie as partes **não vazias** em bolhas separadas, em ordem. **Não** coloque o `reply` completo numa bolha única do Instagram e não envie simultaneamente `reply` e `reply_part_*`, pois isso duplica respostas. Exiba botões nativos somente na última bolha.

Acesse a resposta aprovada, o grupo separado e a validação de implantação em [`RODIZIO_GRUPOS_MANYCHAT.md`](RODIZIO_GRUPOS_MANYCHAT.md).

## 3. Fluxos adicionais — entradas sem conflito

Crie automações separadas somente se a conta tiver os gatilhos disponíveis:

| Automação | Gatilho | Mudança no JSON | Tratamento |
|---|---|---|---|
| `JAPA · 02 · Resposta a Story` | Resposta textual a Story | `event_type: "story_reply"` | Interpreta a **mensagem real**; não presume que qualquer resposta seja pergunta sobre preço. |
| `JAPA · 03 · Menção em Story` | Usuário menciona perfil em Story | `event_type: "story_mention"` | Agradece; não empurra venda. |
| `JAPA · 04 · Comentário Instagram` | Comentário relevante em post/Reel, se suportado | `event_type: "instagram_comment"` | Elogio social: agradecer; pergunta comercial: fatos; reclamação: WhatsApp. Conferir políticas e comportamento da resposta em DM. |
| `JAPA · 05 · Áudio` | Detectar mídia de voz, somente se o gatilho fornecer essa informação | `event_type: "audio"` | Encaminhar WhatsApp; não fingir que transcreveu. |

**Para todos** use a mesma URL HTTPS, cabeçalhos e campos `subscriber_id`, `first_name`, `message`, `ai_state`. Mude somente `event_type` e dados realmente disponíveis no gatilho. Desative disparos paralelos para o mesmo evento. **Story Reply deve enviar a mensagem do cliente**, não uma pergunta padrão sobre rodízio.

## 4. Fluxo de avaliação pós-pedido (não é intenção de compra)

Automação **JAPA · 06 · Pesquisa pós-pedido**, disparada **somente** quando o pedido foi efetivamente confirmado no sistema comercial ou pela equipe e o contato recebeu a tag `pedido_confirmado_japa`. Uma mensagem “quero pedir” não autoriza o disparo.

1. Confirme que o pedido está concluído ou em estágio operacional que justifica feedback; respeite a janela autorizada pela Meta.
2. Se for adequado, aplique **Smart Delay: 2 horas** após o evento real, sem agendar pesquisas repetidas para o mesmo pedido.
3. Chame Dynamic Block no mesmo endpoint com os chips do contato, `event_type: "pedido_confirmado"` e `message: ""`. A resposta pergunta “De 1 a 5, que nota você dá?” e define `ai_state.rating_pending=true`.
4. O próximo Direct do cliente entra no Default Reply, que carrega `ai_state`. Nota de 1 a 5 atualiza `avaliacao_nota`. Notas 1–4 solicitam relato e o salva em `avaliacao_feedback`; encaminhe o relato para revisão humana. Nota 5 agradece.
5. **Convide todas as notas a deixar uma avaliação sincera**, quando a URL verificada do Google estiver configurada. Para notas 1–4, além do convite, ofereça um canal de resolução; não impedir o acesso do cliente ao Google por ter dado nota baixa. Elogios espontâneos também podem apresentar o botão quando fizer sentido.
6. Sem link verificado, o webhook **não inventa o destino** e **não apresenta** o botão de avaliação. O link fornecido para **rota Maps não é link de avaliação**.

O Dynamic Block grava memória e notas por `set_field_value`. Ele **não** dispara a automação de pesquisa sozinho; o gatilho de pedido confirmado precisa ser integrado manualmente ao SAIPOS ou confirmado pela equipe.

## 5. WhatsApp como destino vs. canal automatizado

O **WhatsApp de atendimento (17) 99606-4189** e o **RH (17) 99602-2567** são **botões que abrem conversa**; para isso, não é necessário ativar os números como canais de automação no ManyChat. Nunca conectar o número pessoal do RH como se fosse o canal oficial do restaurante.

Se a empresa quiser mais tarde conectar o WhatsApp do restaurante ao ManyChat, primeiro validar titularidade, verificação e requisitos atuais da Meta. Depois, criar **outro fluxo** com `"channel":"whatsapp"`, mesma memória e condições: quando `atendimento_humano=true`, não mandar resposta automática (`next_action: silencio_humano`). Testar o protocolo específico do canal **antes** de ativar. Este pacote prioriza o atendimento do Direct com encaminhamento humano pelo botão.

## 6. Alternativa: Solicitação externa sem Dynamic Block

Se sua interface ManyChat não mostrar Dynamic Block, você ainda pode usar **Ação → Solicitação externa** na URL **sem** `?mode=dynamic`. A resposta traz os campos do contrato padrão:

| JSONPath | Campo ManyChat recomendado |
|---|---|
| `$.reply` | `ai_reply` (Text) |
| `$.intent` | `ai_intent` (Text) |
| `$.topic` | `ai_topic` (Text) |
| `$.ai_state` | `ai_state` (Text) |
| `$.next_action` | `ai_next_action` (Text) |
| `$.cta_count` | `ai_cta_count` (Number) |
| `$.cta_1_label`, `$.cta_1_url` (idem 2/3) | Campos Text específicos, se o plano permitir URLs dinâmicas em botões. |
| `$.avaliacao_nota` | `ai_avaliacao_nota` (Number) — gravar no campo definitivo só se a intenção for `avaliacao_nota`. |
| `$.avaliacao_feedback` | `ai_avaliacao_feedback` (Text) |

Nesse modo, construa condições por `ai_cta_count` e pelo `ai_intent`, e **botões “Abrir site” com destinos explícitos já validados**, pois alguns construtores não aceitam URL variável em botões. Nunca use `{{ai_reply}}` + URL impressa; a regra é sempre texto sem endereço e CTA nativo. Para uma implantação sem manutenção de vários ramos, prefira Dynamic Block.

## 7. Checklist de publicação

- **Nenhuma IA ManyChat habilitada**, nenhum fluxo duplicado de Default Reply.
- Os quatro campos e tags relevantes criados com nome/tipo exatos, com chip de `ai_state` carregado na requisição.
- Saúde da Vercel com versão correta; POST autenticado devolve `v2` e botões; 401 gera fallback de rede no fluxo.
- Disparo de currículo leva **somente** ao RH; dúvida leva WhatsApp do restaurante; cardápio e rota usam seus próprios botões, nunca texto com URL.
- Pesquisa inicia só com pedido confirmado; notas, relato e eventual review são testados com **contato interno**, não com cliente real.
- Idade exata de 9 anos e URL de avaliação já foram fornecidas. Antes de publicar, valide a abertura do review, os valores atuais do SAIPOS, a disponibilidade dos itens cadastrados no rodízio e mantenha promoções antigas bloqueadas.

## 8. Delivery SAIPOS, iFood e 99Food (v1.3.0)

O responsável confirmou os três canais de pedido. **Apenas SAIPOS tem URL direta fornecida até o momento**. O webhook atualizado trata frases como `tem no ifood?`, `quero pedir pelo 99food`, `quero entrega`, `quanto é a taxa?`, `quero pedir` e monta a resposta sem IA nativa do ManyChat.

**Dynamic Block já existente:** não crie um segundo fluxo ou gatilho de Direct. A mesma chamada `POST /api/manychat?mode=dynamic` devolve os botões contextuais. Após configurar as URLs de loja na Vercel, responda por um contato de teste e confira até três botões nativos: **Ver cardápio / pedir**, **Pedir no iFood** e **Pedir no 99Food**. Caso só uma URL esteja validada, esse botão aparece e a outra plataforma continua citada na resposta sem link fictício.

**Alternativa Solicitação Externa:** se o canal já utiliza `cta_count` e `cta_1..3_url`, confirme que os ramos 1, 2 e 3 têm todas as URLs variáveis ou destinos específicos validados. Sem suporte real à URL variável, crie ramos fixos separados somente para os destinos confirmados. Evite colocar URL em texto e evite retornar um botão vazio.

No SAIPOS, a taxa é consultada após informar o endereço; iFood e 99Food apresentam condições e preços próprios no aplicativo. **Não anuncie a mesma taxa ou o mesmo valor para os três canais sem confirmação expressa.**

Consulte `docs/ENTREGA_SAIPOS_IFOOD_99FOOD.md` para a etapa final da configuração. As chaves e segredos não pertencem ao código nem ao ManyChat, exceto o cabeçalho privado do webhook.
