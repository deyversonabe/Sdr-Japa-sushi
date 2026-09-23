# Registro de atualizações — Japa Sushi Lounge

## v1.3.1 · 23/09/2026 · Correção de regressão

- Restaurada a correção de 22/09 (commit 259123d) que o upload da v1.3 (22b030c) sobrescreveu: leitura do chip "Dados completos do contato" do ManyChat, memória `ai_state` em base64url (sem aspas, não quebra o JSON da Solicitação Externa), normalização de erros comuns (rodizo/rodizzio com maiúsculas, temaky, sachimi, filadelfia) e a palavra "json" no input da OpenAI exigida pelo `json_object`.
- Memória antiga em JSON puro continua aceita (compatível com contatos já existentes).
- Log de erro da OpenAI passa a registrar só status e mensagem curta da API, sem dados do cliente.
- Removida a cópia idêntica `.github/workflows/workflows/ci.yml` (o GitHub Actions só lê `.github/workflows/*.yml`).
- Pergunta de idade citando "filho/filha" sem a palavra rodízio agora responde a regra infantil (antes caía no WhatsApp).
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
