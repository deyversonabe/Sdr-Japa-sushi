import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve,standardPayload,dynamicPayload,CATALOG,HIDDEN,BUSINESS,humanize,VERSION,parseState} from '../lib/engine.js';

const route=(message,extra={})=>resolve({message,channel:'instagram',...extra});
const okButton=(r,type)=>r.ctas.some(c=>c.url===BUSINESS.links[type]);

test('metadata, catálogo e inventário provêm da fonte',()=>{
  assert.equal(CATALOG.length,178);
  assert.equal(HIDDEN.length,7);
  assert.equal(CATALOG.find(p=>p.nome==='Combo Casal').valor,'R$ 169,99');
  assert.equal(CATALOG.find(p=>p.nome==='Rodízio Casal').valor,'R$ 199,90');
  assert.equal(CATALOG.find(p=>p.nome==='Yakissoba Camarão').valor,'R$ 64,99');
  assert.equal(CATALOG.find(p=>p.nome==='Temaki Tradicional').valor,'R$ 34,99');
  assert.equal(HIDDEN.find(p=>p.nome==='Combo Salmão 2').descricao,'1 temaki a sua escolha, 10 hot Philadelphia, 2 nigiri, 4 sashimi.');
  assert.equal(CATALOG.find(p=>p.nome==='Meia Porção de Camarão Empanado - 250g').descricao,'Camarões empanados, crocantes por fora e suculentos por dentro. Acompanha molho especial.');
});

test('todos preços são formatados, registros não têm URLs no texto comercial',()=>{
  assert.equal(CATALOG.filter(p=>!/^R\$\s*\d+(?:\.\d{3})*,\d{2}$/.test(p.valor)).length,0);
  assert.equal(CATALOG.filter(p=>!p.fonte_pagina).length,0);
  assert.equal(new Set(CATALOG.map(p=>p.id)).size,CATALOG.length);
});

test('rodízio atual e criança sem bebidas ou sobremesas',()=>{
  let r=route('Qto tá o rodiozio?');
  assert.equal(r.intent,'rodizio');
  assert.match(r.reply,/R\$ 114,90/);
  assert.match(r.reply,/R\$ 199,90/);
  assert.match(r.reply,/R\$ 54,90/);
  assert.match(r.reply,/à parte/);
  r=route('Rodízio de criança com 7 anos paga?');
  assert.equal(r.intent,'rodizio_infantil');
  assert.match(r.reply,/Menores de 9 anos/);
  const exato=route('criança com 9 anos paga rodízio?');
  assert.equal(exato.intent,'rodizio_infantil');
  assert.match(exato.reply,/9 a 11 anos completos pagam R\$ 54,90/);
  r=route('bebida entra no rodízio?');
  assert.equal(r.intent,'rodizio_inclusoes');
  assert.match(r.reply,/não estão inclusas/);
});

test('preço de combo não vira preço de rodízio',()=>{
  const c=route('Quanto custa o Combo Casal?');
  assert.equal(c.intent,'item_cardapio');
  assert.match(c.reply,/R\$ 169,99/);
  assert.doesNotMatch(c.reply,/199,90/);
});

test('pratos quentes validados ativados mas executivos e campanhas não',()=>{
  const c=route('Yakissoba Camarão');
  assert.equal(c.intent,'item_cardapio'); assert.match(c.reply,/R\$ 64,99/);
  assert.equal(route('pratos quentes').intent,'categoria_cardapio');
  assert.equal(route('Yakimeshi').intent,'categoria_cardapio');
  assert.match(route('Yakimeshi').reply,/Yakimeshi Frango/);
  assert.doesNotMatch(route('Yakimeshi').reply,/Yakissoba Frango/);
  assert.equal(CATALOG.some(p=>/Filé Tilápia Grelhada|Edamame|Combo dia dos namorados/.test(p.nome)),false);
  assert.equal(route('Combo dia dos namorados').reply.includes('R$ 199,99'),false);
});

test('descrições ausentes continuam não confirmadas',()=>{
  const r=route('Combo Casal');
  assert.match(r.reply,/Não tenho descrição confirmada/);
});

test('horário, pagamento e endereço são específicos',()=>{
  assert.match(route('Abrem domingo?').reply,/18h30/);
  const p=route('Aceita pix e ticket?');
  assert.equal(p.intent,'pagamento');assert.match(p.reply,/Ticket refeição/);
  assert.doesNotMatch(p.reply,/Alelo|Sodexo|Caju/);
  const l=route('Onde fica?');assert.equal(l.intent,'localizacao');assert.ok(okButton(l,'google_maps'));
});

test('reserva recolhe dados no WhatsApp, cobra sinal sem prometer confirmação',()=>{
  const r=route('quero reservar uma mesa');
  assert.equal(r.intent,'reserva');
  assert.match(r.reply,/50%/);
  assert.match(r.reply,/nome, dia, horário e quantidade/);
  assert.ok(okButton(r,'whatsapp'));
  assert.doesNotMatch(r.reply,/já está reservada|reserva confirmada/i);
});

test('delivery oferece só SAIPOS, calcula taxa pelo endereço',()=>{
  const r=route('Quanto é a taxa do delivery?');
  assert.equal(r.intent,'delivery');assert.match(r.reply,/endereço/);
  assert.ok(okButton(r,'cardapio_pedido'));
  assert.equal(r.ctas.some(c=>/ifood|99food/.test(c.label.toLowerCase())),false);
});

test('vaga, currículo, seleção e contratação exclusivamente RH',()=>{
  for (const message of ['quero trabalhar aí','estou enviando currículo','tem vaga de sushiman?','processo de contratação','entrevista para emprego']) {
    const r=route(message);assert.equal(r.intent,'vaga',message);
    assert.equal(r.ctas[0].url,BUSINESS.links.whatsapp_rh);
    assert.equal(r.ctas.some(c=>c.url===BUSINESS.links.whatsapp),false);
  }
});

test('parcerias recebem neutralidade e questões pessoais não revelam contexto',()=>{
  const p=route('sou influenciadora e tenho proposta de parceria');
  assert.equal(p.intent,'parceria');
  assert.doesNotMatch(p.reply,/busca|procur|precisamos de|propriet[aá]rio|influenciador/i);
  const q=route('Quem é o novo proprietário?');
  assert.equal(q.intent,'assunto_interno');
  assert.doesNotMatch(q.reply,/propriet[aá]rio|dono|rafa/i);
});

test('elogios usam exclusivamente o link de review fornecido pelo responsável',()=>{
  const r=route('amei, que delícia');
  assert.equal(r.intent,'elogio');
  assert.equal(BUSINESS.links.google_avaliacao,'https://search.google.com/local/writereview?placeid=ChIJ2QkPkEuFu5QRECdCX7Wxgk8');
  assert.equal(r.ctas[0].url,BUSINESS.links.google_avaliacao);
});

test('URL Google aprovada gera botão nativo para todas as notas e elogios',()=>{
  const prev=BUSINESS.links.google_avaliacao;
  BUSINESS.links.google_avaliacao='https://g.page/r/EXEMPLO_LINK_REVIEW_TESTE/review';
  try {
    const prompt=route('',{event_type:'pedido_confirmado'});
    const state=JSON.stringify(prompt.state);
    for (const nota of ['5','4']) {
      const r=route(nota,{ai_state:state});
      assert.equal(r.nota,Number(nota));
      assert.ok(r.ctas.some(c=>c.label==='Avaliar no Google'));
      const dynamic=dynamicPayload(r);
      assert.ok(dynamic.content.messages.flatMap(m=>m.buttons||[]).some(b=>b.caption==='Avaliar no Google'));
      assert.doesNotMatch(dynamic.content.messages.map(m=>m.text).join(' '),/https?:\/\//i);
    }
    assert.equal(route('amei').ctas[0].label,'Avaliar no Google');
  } finally {BUSINESS.links.google_avaliacao=prev;}
});

test('avaliação após pedido confirmado: 5 válido, 4 feedback, número solto não nota',()=>{
  let r=route('',{event_type:'pedido_confirmado'});
  assert.equal(r.intent,'avaliacao_solicitar_nota');
  assert.equal(r.state.rating_pending,true);
  const nota5=route('5',{ai_state:JSON.stringify(r.state)});
  assert.equal(nota5.nota,5);
  assert.equal(nota5.state.rating_pending,false);
  assert.equal(nota5.intent,'avaliacao_nota');
  assert.equal(route('5').intent,'outro');
  r=route('3',{ai_state:JSON.stringify(r.state)});
  assert.equal(r.state.feedback_pending,true);
  assert.equal(r.nota,3);
  let f=route('faltou tempero',{ai_state:JSON.stringify(r.state)});
  assert.equal(f.intent,'avaliacao_feedback');
  assert.equal(f.feedback,'faltou tempero');
  assert.equal(f.state.feedback_pending,false);
  const invalid=route('nota dez',{ai_state:JSON.stringify(route('avaliar').state)});
  assert.equal(invalid.intent,'avaliacao_nota_invalida');
  assert.equal(invalid.state.rating_pending,true);
});

test('fallback, reclamação, áudio e alimento com alergia vão para humano',()=>{
  for (const [message,expected] of [['asdfghqwerty','outro'],['meu pedido veio errado','reclamacao'],['sou alérgico a camarão','cuidados_alimentares']]) {
    const r=route(message);assert.equal(r.intent,expected);
    assert.equal(r.needs_human,true);assert.ok(okButton(r,'whatsapp'));
  }
  assert.equal(route('',{event_type:'audio'}).intent,'audio');
});

test('sobremesa não é reserva; resposta a story e comentário não criam promoções',()=>{
  assert.equal(route('sobremesa').intent,'categoria_cardapio');
  assert.equal(route('qual rodízio?',{event_type:'story_reply'}).intent,'rodizio');
  assert.equal(route('',{event_type:'story_mention'}).intent,'story_mention');
  assert.equal(route('top!',{event_type:'instagram_comment'}).intent,'elogio');
  assert.equal(route('tem promo?').intent,'promocao');
});

test('nome ambíguo Joy Salmão não escolhe preço inventado',()=>{
  const r=route('Joy Salmão');
  assert.equal(r.intent,'item_opcoes');
  assert.match(r.reply,/Sushi à La Carte/);
  assert.match(r.reply,/Joy Especial/);
  assert.match(r.reply,/R\$ 34,99/);
  assert.match(r.reply,/R\$ 44,99/);
});

test('continuidade de contexto traz o mesmo preço do último produto',()=>{
  const last=route('Temaki Tradicional');
  assert.equal(last.state.last_topic,last.topic);
  const second=route('e o preço desse?',{ai_state:JSON.stringify(last.state)});
  assert.equal(second.intent,'item_cardapio');
  assert.match(second.reply,/R\$ 34,99/);
});

test('saída padrão e Dynamic Block sem URLs no texto; no máximo 3 CTAs',()=>{
  const routes=['oi','quero reservar','quero delivery','rodizio','onde fica','vagas de emprego','outra coisa','yakimeshi'];
  for (const message of routes) {
    const r=route(message),s=standardPayload(r),d=dynamicPayload(r);
    assert.equal(s.app_version,VERSION);
    assert.equal(s.cta_count,s.ctas.length);
    assert.ok(s.cta_count<=3);
    assert.doesNotMatch(s.reply,/https?:\/\/|www\.|wa\.me/i);
    assert.equal(d.version,'v2');
    assert.equal(d.content.type,'instagram');
    assert.ok(d.content.messages.length<=10);
    assert.ok(d.content.actions.length<=5);
    assert.ok(d.content.messages.every(m=>!/(?:https?:\/\/|wa\.me)/.test(m.text)));
    assert.ok(d.content.messages.flatMap(m=>m.buttons||[]).every(b=>/^https:\/\//.test(b.url)));
  }
});

test('payload Dynamic Block carrega memória e mapeia nota numérica',()=>{
  const pending=route('',{event_type:'pedido_confirmado'});
  const grade=route('5',{ai_state:JSON.stringify(pending.state)});
  const dynamic=dynamicPayload(grade);
  assert.equal(dynamic.content.actions.find(a=>a.field_name==='avaliacao_nota').value,5);
  const st=dynamic.content.actions.find(a=>a.field_name==='ai_state').value;
  assert.equal(parseState(st).rating_pending,false);
});

test('anti-duplicado por event_id e silêncio de humano em WhatsApp',()=>{
  const r=route('oi',{event_id:'abc123'});
  const again=route('oi',{event_id:'abc123',ai_state:JSON.stringify(r.state)});
  assert.equal(again.intent,'duplicado');assert.equal(again.reply,'');
  const whatsapp=resolve({channel:'whatsapp',message:'oi',atendimento_humano:true});
  assert.equal(whatsapp.next_action,'silencio_humano');
  assert.equal(dynamicPayload(whatsapp).content.messages.length,0);
});

test('OpenAI só humaniza intenção social, sem alterar preço',async()=>{
  const original=route('rodízio');
  let called=false;
  const mock=async()=>{called=true;return {ok:true,json:async()=>({output:[{content:[{type:'output_text',text:'{"reply":"Oi, tudo bem? 🍣"}'}]}]})}};
  process.env.OPENAI_API_KEY='TESTE_NAO_REAL';
  assert.equal((await humanize(original,mock)).reply,original.reply);
  assert.equal(called,false);
  const social=route('oi');
  assert.equal((await humanize(social,mock)).reply,'Oi, tudo bem? 🍣');
  assert.equal(called,true);
  const evil=async()=>({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:'{"reply":"A promoção é de R$ 5,00, https://site.falso"}'}]}]})});
  assert.equal((await humanize(social,evil)).reply,social.reply);
  const evilUrl=async()=>({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:'{"reply":"Veja https://fraude.example"}'}]}]})});
  assert.equal((await humanize(social,evilUrl)).reply,social.reply);
  const evilBare=async()=>({ok:true,json:async()=>({output:[{content:[{type:'output_text',text:'{"reply":"Acesse fraude.com agora"}'}]}]})});
  assert.equal((await humanize(social,evilBare)).reply,social.reply);
  delete process.env.OPENAI_API_KEY;
});

test('promoções não inventam campanha e remetem ao SAIPOS por botão',()=>{const r=route('Quais combos estão em promoção?');assert.equal(r.intent,'promocao');assert.ok(r.ctas.some(c=>c.url===BUSINESS.links.cardapio_pedido));assert.doesNotMatch(r.reply,/https?:\/\//);});

test('regressão homologação 22/09: vaga, entrega e erro de digitação',()=>{
  for (const m of ['vcs tao contratando sushiman?','tem vaga de garçom?','quero trabalho']) {
    const r=route(m); assert.equal(r.intent,'vaga',m); assert.ok(okButton(r,'whatsapp_rh'),m);
  }
  assert.equal(route('Vocês entregam?').intent,'delivery');
  const t=route('tem temaky de camarao?');
  assert.match(t.reply,/Temaki Camarão — R\$ 39,99/);
  assert.doesNotMatch(t.reply,/Temaki Tradicional/);
});

test('aceita Dados completos do contato do ManyChat e memória sem aspas',()=>{
  const r=resolve({channel:'instagram',contact:{id:9,first_name:'Ana',last_input_text:'qual "valor" do\nrodizio',custom_fields:{ai_state:''}}});
  assert.equal(r.intent,'rodizio');
  const st=dynamicPayload(r).content.actions[0].value;
  assert.doesNotMatch(st,/"/);
  assert.equal(parseState(st).last_intent,'rodizio');
  const n=resolve({contact:{last_input_text:'5',custom_fields:{ai_state:'{"rating_pending":true}'}}});
  assert.equal(n.intent,'avaliacao_nota');
});
