# GitHub + Vercel — implantação segura

**ATUALIZAÇÃO v1.3.1:** este projeto **já existe** no GitHub e na Vercel. Não crie outro projeto ou reimporte o repositório. Confira primeiro a `main`, aplique a correção via PR, faça redeploy do projeto `sdr-japa-sushi` existente e rotacione o `WEBHOOK_SECRET` nos dois sistemas. Consulte [`GUIA_INSTALACAO_CORRECAO_V1_3_1.md`](GUIA_INSTALACAO_CORRECAO_V1_3_1.md). As instruções iniciais de importação abaixo permanecem apenas como referência para uma instalação *do zero* expressamente autorizada.


## 1. Repositório GitHub

O repositório **já foi criado** como `deyversonabe/Sdr-Japa-sushi`. Faça commit e push da atualização v1.3.1 neste repositório; prefira torná-lo **privado**. Não inicialize outro repositório para essa revisão. **Não substituir outro bot ou projeto já em produção**. Importe todo o conteúdo desta pasta preservando `api/`, `lib/`, `data/`, `docs/` e arquivos ocultos. Não suba os PDFs originais de auditoria nem segredos. Na pasta `.github/workflows`, o CI valida alterações com Node 22.

Configure proteção da branch principal e aprove alterações de preços/status via Pull Request. Sempre rode `npm run check` antes de aceitar o commit. Este pacote **não tem histórico de commits**; ao importá-lo no repositório novo, o primeiro commit é criado por quem fizer o upload.

## 2. Projeto Vercel

1. **Na atualização existente:** abra `sdr-japa-sushi` e confira a integração GitHub antes de fazer redeploy. **Somente em instalação nova autorizada:** Vercel → Add New → Project → Import Git Repository; autorize o repositório dedicado.
2. Framework Preset: **Other**; Root Directory: diretório raiz do repo. Não coloque `api/` como diretório raiz.
3. Use o `vercel.json` incluído. Há **uma única função** (`api/manychat.js`); a pasta `lib/` fica fora de `api/`. O conteúdo `data/**` é incluído na função. `.vercelignore` exclui scripts/docs/testes do pacote de runtime.
4. Em Project → Settings → Environment Variables, configure variáveis **Production** e de teste separadamente:

| Nome | Obrigatória em produção | Valor / regra |
|---|---|---|
| `WEBHOOK_SECRET` | Sim | Segredo **novo**, aleatório, com mínimo de 24 caracteres; o valor idêntico deve ser configurado somente no cabeçalho do ManyChat. Nunca no repositório. |
| `OPENAI_API_KEY` | Sim para usar OpenAI | A chave da conta de API da OpenAI, configurada somente na Vercel; **não** é chave da assinatura ChatGPT. Sem chave, o bot responde com os textos-base. |
| `OPENAI_MODEL` | Opcional | Padrão do código: `gpt-4o-mini`; altere só depois de testar JSON. |
| `OPENAI_TIMEOUT_MS` | Opcional | Padrão: `8000` (8 segundos). |
| `IFOOD_STORE_URL` | Opcional, aguardando URL de loja | Link direto do Japa Sushi Lounge de Barretos no iFood, validado com o responsável. Não usar link genérico. |
| `FOOD99_STORE_URL` | Opcional, aguardando URL de loja | Link direto do Japa Sushi Lounge de Barretos no 99Food, validado com o responsável. Não usar loja homônima em outra cidade. |

5. Faça Deploy. Use a URL HTTPS do ambiente Production e anote **exatamente** o host informado pelo projeto.
6. Teste em navegador o health GET: `https://SEU-PROJETO.vercel.app/api/manychat`. A resposta deve trazer `ok: true`, `catalogo_ativo: 178`, `openai_configured: true`, `webhook_secret_configured: true`. A propriedade `google_review_configured` deve ser true com o link fornecido. A versão v1.3.1 também retorna `rodizio_grupos_configurados: 3`, `ifood_confirmed:true` e `food99_confirmed:true`. Os campos `ifood_button_configured` e `food99_button_configured` só se tornam `true` depois de URLs diretas de loja válidas.
7. Configure o mesmo segredo na requisição do ManyChat: cabeçalho `x-webhook-secret`. Não inclua a chave da OpenAI em nenhum campo do ManyChat.

**Exemplo de teste técnico**, substituindo URL e segredo localmente (não poste resultados com cabeçalhos reais em prints):

```bash
curl -sS -X POST 'https://SEU-PROJETO.vercel.app/api/manychat?mode=dynamic' \
  -H 'Content-Type: application/json' \
  -H 'x-webhook-secret: SEU_SEGREDO_PRIVADO' \
  -d '{"channel":"instagram","event_type":"direct","message":"Quanto custa o Combo Casal?","first_name":"Contato Teste"}'
```

O corpo de resposta deve ter `"version":"v2"` e `"content":{"type":"instagram",...}`. O preço esperado para **Combo Casal do cardápio** é R$ 169,99. O JSON poderá conter URLs **nos dados internos do botão**, mas nenhuma URL aparecerá no texto do cliente.

## 3. Atualizar preços e itens sem mexer em prompts

O código não contém preços hardcoded de itens à la carte. Os dados confirmados ficam em `data/catalogo_extraido.json`, e as regras gerais em `data/knowledge.json`.

- Ao alterar preço ou status, valide a alteração no sistema de vendas (SAIPOS), registre fonte/data e atualize o JSON; não edite textos gerados pela OpenAI.
- Os status de cardápio oferecidos pelo motor são **somente** `ativo` e `ativo_por_confirmacao_usuario_2026_09_22`. Qualquer outro status fica oculto até análise e liberação deliberada.
- Pratos quentes foram marcados ativos porque houve confirmação em 22/09/2026. `catalogo_inativo_nao_ofertar.json` é histórico e nunca carregado pelo motor. Rodízio interno de referência também não serve de promessa de inclusões.
- Antes de ativar um dos sete combos promocionais, confirmar a campanha específica e retirar o item de `revisar_campanha` no JSON, com data. A menção a promoções antigas e a informações internas de gestão permanece proibida.
- O link de avaliação do Google já foi informado e configurado; conferir o clique pelo contato de teste antes de publicar.

`npm run check` → Pull Request → revisão → merge → deployment automático, se a integração entre GitHub e Vercel estiver configurada.

## 4. Falha segura e proteção

- Sem `WEBHOOK_SECRET` válido, `POST` retorna **401**. O GET é público, mas nunca retorna valor de segredo.
- Erro interno no POST autenticado devolve HTTP **200** com mensagem neutra e CTA de WhatsApp; configurar **fallback adicional** no ManyChat se não houver resposta da Vercel ou se ocorrer 401.
- O servidor não registra nomes, mensagens, telefones nem corpo completo da chamada OpenAI. A Responses API recebe somente a intenção social e a frase autorizada, com `store: false`.
- O sistema não confirma compras nem reservas e não calcula taxa de entrega sem endereço. Não habilitar o feedback com base apenas em “quero pedir”.
- Em produção, respeite a janela de mensagens e as políticas vigentes da Meta/ManyChat. O atraso de 2 h para avaliação depende de permissão do canal e de um evento de pedido real, não de mera intenção.
