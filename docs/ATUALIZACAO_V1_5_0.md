# Atualização v1.5.0 — o que fazer no ManyChat e na Vercel

Só ligue depois de `GET /api/manychat` mostrar `app_version: 1.5.0`. Nada aqui usa a IA nativa do ManyChat.

## Na Vercel
1. Publicar a v1.5.0. Nenhuma variável nova.
2. Conferir no GET: `review_link_configured` e `site_link_configured` em `true`.

## No ManyChat
1. **External Request:** enviar também `message_type`, `event_type` e, se possível, `atendimento_humano_desde`. Em comentário, o texto do comentário vai em `message`.
2. **Comentários:** usar `resposta_publica` no passo de resposta pública ao comentário. Só mandar Direct quando `enviar_resposta_privada` for verdadeiro.
3. **Tag nova:** `cliente_novo`.
4. **Botões:** "Conhecer o site" e "Avaliar o Japa" vêm no Dynamic Block. No modo standard, criar com `cta_N_label` e `cta_N_url`.
5. **Atendimento humano:** ao atendente assumir, ligar `atendimento_humano` (e gravar `atendimento_humano_desde`); desligar após 24h.
6. **Fluxos antigos:** remover do ManyChat qualquer texto fixo com o número antigo, com "sobremesa mais pedida" ou com "Avaliar no Google".
7. **Perfil do WhatsApp Business e bio do Instagram:** conferir o novo número e os horários.

## Testar com contato da equipe
"oi", "qual o horário?", "como faço pra pedir?", foto, áudio, comentário "me leva", menção em story, "já fui aí, amei", reclamação, e o teste de pausa do atendimento humano.
