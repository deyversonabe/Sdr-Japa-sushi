# Lançamento externo — Japa Sushi Lounge (v1.1.0)

**Situação:** pacote preparado; nenhuma conta externa foi alterada. Requer usuário com acesso administrativo ao GitHub, Vercel, ManyChat, Instagram e projeto de API OpenAI. Não ativar nenhuma IA nativa do ManyChat.

## 1. Preparar repositório exclusivo (GitHub)

1. GitHub → **New repository** → nome sugerido `japa-sushi-manychat-vercel` → **Private** → não inicializar README, licença nem `.gitignore` (já estão no ZIP).
2. Extrair o ZIP. Acesse o terminal **dentro da pasta `japa-sushi-manychat-vercel`**, na qual existe `package.json`.
3. Com Git instalado, execute:

```bash
git init
git branch -M main
git add .
git commit -m "Implantar webhook Japa Sushi v1.1.0"
git remote add origin https://github.com/SEU-USUARIO/japa-sushi-manychat-vercel.git
git push -u origin main
```

4. Confira no GitHub a presença dos diretórios `api`, `lib`, `data` e `docs` e dos arquivos ocultos `.github`, `.vercelignore` e `.env.example`. Não publicar secrets, `.env` real ou PDFs privados.
5. Preferir repositório privado e proteção de branch. Alterar preços pelo JSON mediante revisão; commits em `main` geram novos deploys depois que a Vercel for vinculada.

**Alternativa sem terminal:** GitHub → repositório novo → **uploading an existing file**, enviando o conteúdo interno da pasta extraída. Para preservar arquivos ocultos e a hierarquia, o procedimento via Git é mais confiável. Não carregue o ZIP como um único arquivo.

## 2. Conectar Vercel ao GitHub

1. Vercel → Add New → Project → **Import Git Repository** → escolha o novo repositório. Se não aparecer, autorize seu acesso pelo app GitHub da Vercel.
2. Configure **Framework Preset: Other** e **Root Directory: `./`** (raiz onde fica `package.json`). Não use `api/` como raiz.
3. Em **Environment Variables**, crie em Production: `WEBHOOK_SECRET` (segredo exclusivo, aleatório, com 24+ caracteres), `OPENAI_API_KEY` (chave de API da OpenAI; não é a assinatura ChatGPT), `OPENAI_MODEL` (opcional, padrão do código). **Nunca salve chaves no repositório**. Configure Preview separadamente, com segredo de teste diferente.
4. Deploy; anote a URL Production `https://SEU-PROJETO.vercel.app/api/manychat`. Se alterar variáveis depois do deploy, faça redeploy.
5. Acesse a URL por GET. Confirmar `ok:true`, `app_version:1.1.0`, `catalogo_ativo:178`, `google_review_configured:true`, `openai_configured:true`, `webhook_secret_configured:true`. O GET público não deve revelar segredos.
6. Teste o POST autenticado **com contato técnico de teste**, antes de conectar clientes. Exemplo:

```bash
curl -X POST "https://SEU-PROJETO.vercel.app/api/manychat?mode=dynamic" \
  -H 'Content-Type: application/json' \
  -H 'x-webhook-secret: SEU_SEGREDO_PRIVADO' \
  -d '{"channel":"instagram","event_type":"direct","message":"criança com 9 anos paga rodízio?"}'
```

Resultado esperado: resposta com R$ 54,90 e botão pertinente, sem URL no texto. Repetir com "promoção", "quero enviar currículo", "onde fica?", "elogio", "Combo Casal" e avaliação 5 após evento explícito de pedido confirmado. Falha de segredo deve produzir HTTP 401.

## 3. Criar fluxos no ManyChat — sem IA nativa

1. Conectar a **conta oficial do Instagram do Japa** em Settings → Instagram. Verifique permissões na Meta e um contato interno de testes.
2. **Não habilitar:** AI Step, ManyChat AI, assistente IA, sugestão automática com IA ou qualquer função nativa de geração. A única geração opcional é `OPENAI_API_KEY`, processada **na Vercel**.
3. Criar a automação `JAPA | Instagram | Default Reply`. Entrada: mensagem no Direct. Adicione o **Dynamic Block** com URL `https://SEU-PROJETO.vercel.app/api/manychat?mode=dynamic`, método POST, `Content-Type: application/json`, `x-webhook-secret: ...`; enviar `message`, `first_name`, `subscriber_id`, `channel:instagram`, `event_type:direct` e campo persistente `ai_state` (veja contrato detalhado em `MANYCHAT_CONFIGURACAO.md`).
4. Configure as saídas de texto e **botões nativos** geradas pelo bloco dinâmico (destinos nunca devem aparecer no texto). Garanta persistência dos campos usados pelo contrato, em especial `ai_state`; confirme o mapeamento dos campos `set_field_value` em uma resposta de teste.
5. Criar fluxos distintos para `story_reply`, `story_mention` e `instagram_comment` e alterar apenas `event_type` nos corpos. Evite gatilhos sobrepostos disparando duas respostas para o mesmo evento.
6. Criar fluxo exclusivo `Feedback de pedido confirmado`: **somente após evento real de confirmação da venda**; quando a janela e as permissões do canal permitirem, atraso configurável de 120 minutos; chamar webhook com `event_type:pedido_confirmado`; armazenar estado retornado; próxima resposta numérica é tratada como nota. O botão Avaliar no Google utiliza link autorizado. Não disparar pesquisa ao simples clique em cardápio, intenção ou pedido abandonado.
7. Para reclamação, áudio, dúvida factual sem confirmação ou reserva, configurar fallback/handoff ao WhatsApp oficial; RH somente no botão do número exclusivo. Se webhook não responder ou HTTP 401, o próprio ManyChat deve ter mensagem de contingência com **botão nativo** de WhatsApp.
8. Publicar **primeiro com contato interno**. Testar cada fluxo e canal. Nunca testar envios em massa com clientes reais.

## 4. Critérios de aceite antes de liberar

- Em terminal, `npm run check` sem falhas; GitHub Actions verde; Vercel em Production saudável.
- Rodízio: individual R$ 114,90; casal R$ 199,90; infantil 9–11 R$ 54,90; menores de 9 gratuito. Bebidas/sobremesas à parte.
- Consulta por promoção ou combo promocional deve enviar botão **Cardápio** com URL direta `https://japasushilounge.saipos.com/home`, sem inventar descontos ou campanhas.
- Avaliação: link fornecido pelo responsável `https://search.google.com/local/writereview?placeid=ChIJ2QkPkEuFu5QRECdCX7Wxgk8` deve abrir pelo botão; revisar em celular conectado e desconectado ao Google.
- RH recebe **somente** assunto contratação: +55 17 99602-2567. Atendimento e dúvidas: +55 17 99606-4189.
- Nenhum link bruto no texto; nenhuma IA do ManyChat ativada; sem chaves no GitHub/ManyChat; não anunciar campanhas antigas ou itens inativos.
- Conferir preços e disponibilidade no cardápio SAIPOS antes de abrir o fluxo para todos; validar permissões Meta, janela de envio, cobrança e LGPD.

## 5. Virada e rollback

1. Primeiro, publicar webhook na Vercel, testar GET/POST, depois habilitar cada automação ManyChat separadamente.
2. Evitar Default Replies concorrentes; desligar versão antiga apenas quando o fluxo novo passar no teste interno.
3. Se houver incidente, pausar as automações novas no ManyChat ou restaurar o deployment anterior na Vercel; não apagar dados de contato nem revogar segredos antes de estabilizar a operação.
4. Após o lançamento, monitorar erros e intenções desconhecidas nos logs da Vercel (sem registrar PII), revisar preços no JSON e acompanhar encaminhamentos humanos.
