# Japa Sushi Lounge · Atendimento Instagram + ManyChat + Vercel + OpenAI

**Código de implantação — v1.1.0 · 22/09/2026**

Sistema exclusivo do **Japa Sushi Lounge (Barretos/SP)**, preparado com base no fluxo de atendimento, relatório técnico e cardápio-mestre fornecidos pelo responsável. O ManyChat recebe/envia mensagens; **não se ativa AI Step, IA nativa, reconhecimento por IA ou qualquer IA do ManyChat**. A Vercel executa as regras comerciais. A OpenAI, quando sua API Key está configurada, pode humanizar apenas respostas sociais simples, sem criar preço, descrição, oferta, horário ou disponibilidade.

**Estado de entrega:** código e testes locais preparados; **NÃO publicado no GitHub/Vercel/ManyChat**. Validar na operação real os itens remanescentes documentados em [`docs/PENDENCIAS_ANTES_DE_PUBLICAR.md`](docs/PENDENCIAS_ANTES_DE_PUBLICAR.md).

## Arquitetura

```text
Instagram: DM, resposta a Story, menção e comentário
                    │
                    ▼
     ManyChat · gatilho + Dynamic Block
           SEM NENHUMA IA NATIVA
                    │ POST HTTPS + x-webhook-secret
                    ▼
       Vercel /api/manychat.js
                    │
        ┌───────────┴──────────┐
        │ Regras determinísticas│
        │ knowledge.json       │
        │ catalogo_extraido.json│
        └───────────┬──────────┘
                    │ Somente saudações, agradecimentos e menções
                    ▼
           OpenAI Responses API
       JSON; store:false; filtros estritos
                    │
                    ▼
      Dynamic Block v2: mensagem +
    botões URL nativos + tags + memória
                    │
                    ▼
          Resposta ao cliente
```

O webhook também suporta `mode=standard` (ou ausência de `mode`) para automações ManyChat baseadas em **Ação → Solicitação externa**, cujo mapeamento de campos e botões manuais está documentado em [`docs/MANYCHAT_CONFIGURACAO.md`](docs/MANYCHAT_CONFIGURACAO.md). O **Dynamic Block** é o caminho preferido porque já devolve os botões nativos, sem texto com links aparentes e sem criar fluxos condicionais para cada CTA.

## Estrutura do repositório

| Arquivo | Finalidade |
|---|---|
| `api/manychat.js` | Única função serverless na Vercel. Health GET, autenticação, POST, fallback. |
| `lib/engine.js` | Classificador determinístico, cardápio, regras comerciais, avaliação, segurança, botão, estado. |
| `lib/persona.js` | Tom humano e limites da chamada opcional à OpenAI. |
| `data/knowledge.json` | Horários, rodízio, pagamento, reservas, contatos, URLs aprovadas e pendências. |
| `data/catalogo_extraido.json` | **185 registros extraídos** do PDF, com categoria, nome, descrição fiel quando existe, preço, página de origem e status. **178 autorizados para consulta automática; 7 promocionais bloqueados e redirecionados ao cardápio digital** até validação. |
| `data/catalogo_inativo_nao_ofertar.json` | **14 registros pausados/inativos**, só para auditoria; nunca exibidos ao cliente. |
| `data/rodizio_itens_referencia_nao_confirmados.json` | Itens do cadastro interno; não são promessa de inclusão no rodízio. |
| `scripts/extrair_cardapio.py` | Reextração auditável a partir do PDF original (`pdfplumber`; uso manual). |
| `tests/*.test.mjs` | Testes Node para respostas, catálogo, segurança, feedback e protocolo HTTP. |
| `.github/workflows/ci.yml` | Executa `npm run check` em push/PR. |
| `docs/` | Manual operacional completo, decisões pendentes e inventário catalogado. |

## Início rápido (ambiente de testes)

```bash
npm run check
# configurar um segredo de teste APENAS no ambiente local
export WEBHOOK_SECRET='COLE_UM_SEGREDO_NOVO_COM_NO_MINIMO_24_CARACTERES'
export OPENAI_API_KEY='SUA_CHAVE_DE_API_OPENAI'  # somente se for testar humanização real
npx vercel dev
```

Health check no projeto publicado: `GET https://SEU-PROJETO.vercel.app/api/manychat`. Sem `OPENAI_API_KEY`, o serviço responde com texto de base deterministicamente; para cumprir o objetivo de IA via OpenAI em produção, **configure a chave no painel da Vercel**, nunca no GitHub nem no ManyChat.

## Condutas fixas do atendimento

- Links de qualquer natureza **nunca** aparecem no texto final. Os destinos aprovados ficam em botões nativos: SAIPOS, WhatsApp de atendimento, WhatsApp do RH e rota do Maps. O botão de avaliação usa a URL fornecida pelo responsável.
- Todas as vagas, currículos, entrevistas e contratações são exclusivamente direcionadas ao **RH: (17) 99602-2567**. Dúvidas sem dado confirmado, reclamações e reservas vão para **(17) 99606-4189**.
- Rodízio **todos os dias**: individual R$ 114,90; casal R$ 199,90; infantil R$ 54,90 conforme faixa cadastrada. **Bebidas e sobremesas à parte.** **Menores de 9 anos não pagam; crianças de 9 a 11 anos completos pagam R$ 54,90.**
- **Combo Casal à la carte** (R$ 169,99) não deve ser confundido com **rodízio Casal** (R$ 199,90). Sem descrição no documento-mestre, o bot não inventa a composição.
- Pratos quentes estão ativos por confirmação expressa do responsável. Combos identificados como promocionais e itens antigos/inativos não são anunciados automaticamente.
- Reserva exige adiantamento de 50%, **mas o bot não confirma disponibilidade, faz cobrança nem marca a mesa automaticamente**. Apenas orienta e passa para a equipe.
- Pesquisa 1–5 apenas após evento de pedido **realmente confirmado**, enviado pelo fluxo específico do ManyChat. Google Review já está configurado como botão com URL fornecida pelo responsável; não selecionamos convites por nota.

## Documentação e implantação

1. [`docs/PENDENCIAS_ANTES_DE_PUBLICAR.md`](docs/PENDENCIAS_ANTES_DE_PUBLICAR.md) — dados que precisam de confirmação antes de atender clientes reais.
2. [`docs/VERCEL_GITHUB.md`](docs/VERCEL_GITHUB.md) — criar repositório dedicado, importar na Vercel, configurar variáveis e segurança.
3. [`docs/MANYCHAT_CONFIGURACAO.md`](docs/MANYCHAT_CONFIGURACAO.md) — fluxos e gatilhos, corpo JSON, campos, tags, botões e avaliação.
4. [`docs/CARDAPIO_COMPLETO.md`](docs/CARDAPIO_COMPLETO.md) — inventário por nome, descrição da fonte, preço, status e página, gerado diretamente do JSON.
5. [`docs/TESTES_E_SEGURANCA.md`](docs/TESTES_E_SEGURANCA.md) — testes, simulações e aceite pré-publicação.

**Observação de implantação:** contas, credenciais, projetos, número de telefone conectado à Meta e políticas de horário/janela de mensagem **precisam ser testados no ambiente real**. Um ZIP não publica fluxos nem configura automaticamente o ManyChat. Fontes técnicas: [ManyChat Dynamic Block](https://help.manychat.com/hc/pt-br/articles/14281268533788-DevTools-Bloco-din%C3%A2mico) e [protocolo Dynamic Block para Instagram](https://manychat.github.io/dynamic_block_docs/channels/).

## Lançamento externo

Consulte [`docs/LANCAMENTO_EXTERNO_PASSO_A_PASSO.md`](docs/LANCAMENTO_EXTERNO_PASSO_A_PASSO.md) para criar um novo repositório, importar o projeto, configurar a Vercel e integrar ao ManyChat **sem ativar IA nativa**.
