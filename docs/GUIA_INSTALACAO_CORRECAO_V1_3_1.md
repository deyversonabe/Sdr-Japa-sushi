# Correção completa v1.3.1 — instruções de implantação

**Pacote:** Japa Sushi Lounge, GitHub → Vercel → OpenAI → ManyChat → Instagram. Este ZIP já é um **snapshot completo da v1.3.0 com o patch v1.3.1 integralmente aplicado**, não somente os sete arquivos incrementais. Inclui os dados do catálogo, documentação, testes, fluxo HTTP e os três grupos de rodízio. A pasta duplicada `.github/workflows/workflows/` foi removida do snapshot.

**Validação local realizada:** `npm run check` executado em Node 22, **47 testes aprovados e 0 falhas**. Os sete arquivos incrementais gerados com o patch são idênticos, byte a byte, ao ZIP parcial `sdr-japa-v1.3.1-arquivos.zip` fornecido; o patch original aplica integralmente à base v1.3.0. Este resultado não substitui testes reais em Vercel ou ManyChat.

## Se já usa o repositório no GitHub

Verifique primeiro se a `main` mudou desde `27305bcdb5c977fefbe76edb18f5bf45ffba6b9d` (a referência de 23/09/2026). Se a versão 1.3.1 já estiver na `main`, **não reaplique**. Se houve novos commits, faça merge seletivo e preserve-os.

```bash
git clone https://github.com/deyversonabe/Sdr-Japa-sushi.git
cd Sdr-Japa-sushi
git switch -c fix/japa-v1.3.1-integracao
# Extraia o ZIP completo SOBRE A RAIZ DO CLONE,
# mantendo api/, data/, docs/, lib/, tests/, scripts/ e .github/.
git rm -f .github/workflows/workflows/ci.yml 2>/dev/null || true
npm run check
git status --short
# Revise o diff antes de publicar:
git diff --check
git diff --stat
git add -A
git commit -m "fix: restaurar integração ManyChat e OpenAI v1.3.1"
git push -u origin fix/japa-v1.3.1-integracao
# Abra PR; aguarde CI verde e aprovação antes do merge.
```

**Alternativa:** aplicar o patch fornecido diretamente sobre a base original (`git am sdr-japa-v1.3.1.patch`), em vez de extrair este ZIP. Não use ambos os métodos.

## Depois do merge

1. Confira o redeploy automático do projeto correto `sdr-japa-sushi` e o GET `https://sdr-japa-sushi.vercel.app/api/manychat`, que deve informar `app_version: 1.3.1`. Um deploy `Ready` isoladamente não prova integração end-to-end.
2. **Urgente:** o relatório identificou o `WEBHOOK_SECRET` como texto literal do comando gerador, não como senha aleatória. Gere um segredo criptográfico **real** em ambiente seguro e troque-o simultaneamente na Vercel Production e no `x-webhook-secret` do ManyChat, com janela de manutenção, e faça redeploy. Não inclua o valor no repositório ou no relatório.
3. Teste autenticação: sem segredo → HTTP 401; errado → 401; autenticado → resposta; `?mode=dynamic` → ManyChat v2. Teste saudação e verifique que a OpenAI não retorna 400.
4. No ManyChat, preserve o Default Reply que envia `contact` por chip **sem aspas**, teste no Instagram com contato interno e mantenha fallback independente. Revise reclamações no fluxo de comentários, menção de Story e mensagens de áudio.
5. A integração de pedido confirmado do SAIPOS **ainda não foi comprovada**. Se for manual, oriente a equipe a aplicar `pedido_confirmado_japa` exclusivamente depois de pedido real. Só então agende avaliação; nunca associe diretamente à intenção de compra.
6. Links diretos de iFood e 99Food permanecem pendentes. Não invente botões; peça os links oficiais verificados das lojas de Barretos.

**Não ativar ManyChat AI.** Não publicar ou reativar atendimento automático para clientes reais antes da homologação de ponta a ponta. O prompt completo de execução acompanha este arquivo em `docs/PROMPT_EXECUCAO_CORRECAO_V1_3_1.md` e também foi entregue separadamente.
