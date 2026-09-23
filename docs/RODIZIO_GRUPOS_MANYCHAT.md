# Japa Sushi — rodízio com guia de preferências SEPARADO (v1.2.0)

Este arquivo é gerado a partir das respostas reais de `lib/engine.js` e `data/rodizio_grupos_atendimento.json`. Fonte: **Cardápio Mestre, páginas 2–3** (cadastro interno consolidado em 16/09/2026). Antes da ativação para clientes, a cozinha precisa conferir a disponibilidade atual de cada item.

**Organização:** a lista principal e o guia por preferência são apresentados em blocos distintos. O guia reagrupa os mesmos itens cadastrados no rodízio, não é uma categoria de pratos extras. Bebidas e sobremesas são cobradas à parte. `Joy Especial (SEM ARROZ)` pertence ao **à la carte**; não apresentar como incluso no rodízio.

## Mensagens prontas geradas pelo webhook

### Composição completa

Mensagem de teste: `o que tem no rodízio?`. Intenção: `rodizio_composicao`.

**Mensagem 1:**

```text
Nosso cadastro de rodízio tem muitas opções! 🍣

Sushis e sashimis: Sashimi de salmão e tilápia; niguiris de salmão, skin e kani; hossomakis de salmão, kani, pepino, shimeji, gengibre e pepino com manga; uramakis Philadelphia e salmão skin.

Joys: Joys de salmão, camarão, shimeji, couve crispy, mexicano, Dane Sushi e combinações com geleias de pimenta, morango, maracujá e amora, além de pimentas especiais.

Entradas e pratos quentes: Carpaccio de salmão, ceviche misto, sunomono, shimeji, missoshirô, yakissoba e iscas de tilápia e frango.
```

**Mensagem 2:**

```text
— GUIA POR PREFERÊNCIA (separado da lista principal) —
Fritos e empanados:
• Hot Roll Philadelphia
• Hot Roll de salmão
• Camarão empanado
• Tiras de salmão empanadas
• Guioza suíno frito
• Guioza de legumes frito
• Harumaki de muçarela
• Harumaki de frango com cream cheese
• Batata frita

Grelhados:
• Hossomaki grelhado
• Uramaki grelhado

Sem arroz (conforme o cadastro):
• Sashimi de salmão
• Sashimi de tilápia
• Carpaccio de salmão
• Ceviche misto de salmão e tilápia
• Sunomono
• Shimeji

Esses grupos organizam itens do próprio rodízio, não são pratos extras. Bebidas e sobremesas são cobradas à parte. Os Joys Especiais sem arroz do cardápio à la carte não estão confirmados no rodízio. Confirme a disponibilidade de cada item com nossa equipe.
```

**Mensagem 3:**

```text
Rodízio todos os dias! Individual: R$ 114,90; casal: R$ 199,90; infantil (9 a 11 anos): R$ 54,90; menores de 9 não pagam.
```

Botões: **Ver cardápio / pedir** · **Falar no WhatsApp**.

### Somente fritos/empanados

Mensagem de teste: `quais fritos do rodízio?`. Intenção: `rodizio_preferencias`.

**Mensagem 1:**

```text
Aqui está nosso guia por preferência, separado da lista principal do rodízio:

Fritos e empanados:
• Hot Roll Philadelphia
• Hot Roll de salmão
• Camarão empanado
• Tiras de salmão empanadas
• Guioza suíno frito
• Guioza de legumes frito
• Harumaki de muçarela
• Harumaki de frango com cream cheese
• Batata frita

Esses são itens cadastrados no rodízio, não opções extras. Consulte a disponibilidade com nossa equipe.
```

Botões: **Ver cardápio / pedir** · **Falar no WhatsApp**.

### Somente grelhados

Mensagem de teste: `tem grelhados no rodízio?`. Intenção: `rodizio_preferencias`.

**Mensagem 1:**

```text
Aqui está nosso guia por preferência, separado da lista principal do rodízio:

Grelhados:
• Hossomaki grelhado
• Uramaki grelhado

Esses são itens cadastrados no rodízio, não opções extras. Consulte a disponibilidade com nossa equipe.
```

Botões: **Ver cardápio / pedir** · **Falar no WhatsApp**.

### Somente sem arroz

Mensagem de teste: `o que tem sem arroz?`. Intenção: `rodizio_preferencias`.

**Mensagem 1:**

```text
Aqui está nosso guia por preferência, separado da lista principal do rodízio:

Sem arroz (conforme o cadastro):
• Sashimi de salmão
• Sashimi de tilápia
• Carpaccio de salmão
• Ceviche misto de salmão e tilápia
• Sunomono
• Shimeji

Esses são itens cadastrados no rodízio, não opções extras. Consulte a disponibilidade com nossa equipe.

Os Joys Especiais sem arroz são uma categoria separada do à la carte; não são anunciados como inclusos no rodízio.
```

Botões: **Ver cardápio / pedir** · **Falar no WhatsApp**.

## Conectar à automação já existente

1. No ManyChat, localize o **Default Reply do Instagram do Japa** e confirme a configuração atual. **Não crie outro Default Reply**, não ative AI Step nem qualquer IA nativa do ManyChat.
2. Se já usa o Dynamic Block, mantenha o POST autenticado em `/api/manychat?mode=dynamic`. O webhook atualizado escolhe automaticamente `rodizio_composicao` e `rodizio_preferencias`. Não coloque mensagens fixas paralelas.
3. Se usa Solicitação Externa padrão, mapeie `reply_part_1..3` para campos Text; envie apenas partes não vazias na ordem, em bolhas separadas. Deixe os botões nativos para a última bolha. Nunca envie também `reply` inteiro para a mesma mensagem.
4. O botão **Ver cardápio / pedir** aponta para o SAIPOS aprovado. O botão **Falar no WhatsApp** aponta para o número comercial. URLs ficam nos atributos dos botões, nunca no texto.
5. Execute as mensagens de teste acima com contato interno e confira `GET /api/manychat`: `app_version: 1.3.0` e `rodizio_grupos_configurados: 3`. Verifique que cada resposta longa esteja legível e todos os botões funcionem.

## Comportamentos que não devem ser alterados

- Preços do rodízio: individual R$ 114,90; casal R$ 199,90; infantil de 9 a 11 anos R$ 54,90; menores de 9 não pagam.
- Não inferir adicionais, ingredientes, preço, horário, oferta promocional ou disponibilidade não confirmada.
- Dúvidas comerciais e reservas: botão WhatsApp comercial; vagas e currículos: somente botão RH.
- Pesquisas de satisfação: somente depois de pedido efetivamente confirmado.
- OpenAI humaniza apenas mensagens sociais autorizadas; o classificador determinístico apresenta esta lista comercial, sem gerar itens novos.

**Destinos internos usados pelos botões:** cardápio https://japasushilounge.saipos.com/home · WhatsApp https://wa.me/5517996064189. Não colar estes endereços no corpo de mensagens ao cliente.
