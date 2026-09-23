import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,standardPayload,dynamicPayload,CATALOG,HIDDEN,BUSINESS,humanize,VERSION,parseState,RODIZIO_GROUPS,marketplaceStatus} from '../lib/engine.js';

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

test('entrega apresenta SAIPOS, iFood e 99Food e explica condições por plataforma',()=>{
  const r=route('Quanto é a taxa do delivery?');
  assert.equal(r.intent,'delivery');
  assert.match(r.reply,/endereço/);
  assert.match(r.reply,/iFood.*99Food/);
  assert.match(r.reply,/taxas e os preços/i);
  assert.ok(okButton(r,'cardapio_pedido'));
  assert.equal(r.ctas.some(c=>/ifood|99food/i.test(c.label)),false,'sem URLs de lojas não deve haver botão inventado');
  assert.equal(BUSINESS.pedidos.marketplaces.ifood.disponivel_confirmado,true);
  assert.equal(BUSINESS.pedidos.marketplaces.food99.disponivel_confirmado,true);
});

test('solicitação específica no iFood ou 99Food sem URL validada orienta buscar no app e fornece SAIPOS',()=>{
  for (const [q,brand] of [['Quero pedir no iFood','iFood'],['Vocês estão no 99Food?','99Food']]) {
    const r=route(q);
    assert.equal(r.intent,'delivery',q);
    assert.match(r.reply,new RegExp(brand,'i'));
    assert.match(r.reply,/Barretos/);
    assert.ok(okButton(r,'cardapio_pedido'));
    assert.doesNotMatch(r.reply,/https?:\/\//);
  }
});

test('URLs verificadas via env liberam botões nativos SAIPOS, iFood e 99Food com limite de 3',()=>{
  const i='https://www.ifood.com.br/delivery/barretos-sp/japa-sushi-lounge-centro/12345678-1234-1234-1234-123456789abc';
  const f='https://99app.com/99food/barretos/japa-sushi-lounge/123456789/';
  try {
    process.env.IFOOD_STORE_URL=i;
    process.env.FOOD99_STORE_URL=f;
    assert.deepEqual(marketplaceStatus(),{ifood:i,food99:f});
    const generic=standardPayload(route('Vocês fazem entrega?'));
    assert.equal(generic.cta_count,3);
    assert.deepEqual(generic.ctas.map(c=>c.label),['Ver cardápio / pedir','Pedir no iFood','Pedir no 99Food']);
    assert.deepEqual(generic.ctas.map(c=>c.url),[BUSINESS.links.cardapio_pedido,i,f]);
    assert.doesNotMatch(generic.reply,/https?:\/\//);
    const dynamic=dynamicPayload(route('Quero delivery'));
    const urls=dynamic.content.messages.flatMap(m=>(m.buttons||[]).map(b=>b.url));
    assert.deepEqual(urls,[BUSINESS.links.cardapio_pedido,i,f]);
    const targeted=standardPayload(route('Quero pedir no 99Food'));
    assert.equal(targeted.cta_1_url,f);
  } finally {delete process.env.IFOOD_STORE_URL;delete process.env.FOOD99_STORE_URL;}
});

test('URLs de marketplace não oficiais ou genéricas são rejeitadas e nunca entram no CTA',()=>{
  try {
    process.env.IFOOD_STORE_URL='https://www.ifood.com.br/';
    process.env.FOOD99_STORE_URL='https://99app.com/99food/';
    assert.equal(marketplaceStatus().ifood,null);
    assert.equal(marketplaceStatus().food99,null);
    process.env.IFOOD_STORE_URL='https://ifood.com.br.evil.example/delivery/barretos-sp/falso';
    process.env.FOOD99_STORE_URL='https://99app.com.evil.example/99food/barretos/falso/123';
    assert.equal(marketplaceStatus().ifood,null);
    assert.equal(marketplaceStatus().food99,null);
    assert.equal(standardPayload(route('quero delivery')).cta_count,2);
  } finally {delete process.env.IFOOD_STORE_URL;delete process.env.FOOD99_STORE_URL;}
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

test('guia do rodízio tem grupos separados e usa apenas nomes da fonte',()=>{
  const base=JSON.parse(readFileSync(new URL('../data/rodizio_itens_referencia_nao_confirmados.json',import.meta.url),'utf8'));
  const nomes=new Set(base.itens);
  assert.deepEqual(Object.keys(RODIZIO_GROUPS.guia_por_preferencia),['fritos_empanados','grelhados','sem_arroz']);
  for (const categoria of [RODIZIO_GROUPS.principal,RODIZIO_GROUPS.guia_por_preferencia]) {
    for (const grupo of Object.values(categoria)) {
      assert.ok(grupo.nomes_do_cadastro.every(nome=>nomes.has(nome)));
    }
  }
  assert.equal(RODIZIO_GROUPS.ala_carte_separado.titulo.includes('à la carte'),true);
});

test('composição do rodízio exibe lista principal e um guia independente',()=>{
  for (const m of ['o que tem no rodízio?','o que vem no rodízio?','quais itens do rodízio?','o que inclui o rodízio?']) {
    const r=route(m);
    assert.equal(r.intent,'rodizio_composicao',m);
    assert.match(r.reply,/GUIA POR PREFERÊNCIA \(separado da lista principal\)/);
    assert.match(r.reply,/FRITOS E EMPANADOS|Fritos e empanados/);
    assert.match(r.reply,/Grelhados/);
    assert.match(r.reply,/Sem arroz/);
    assert.match(r.reply,/R\$ 114,90/);
    assert.doesNotMatch(r.reply,/Harumaki de Chocolate|SI - MORANGO|R\$ 0,00/);
    assert.ok(r.ctas.some(c=>c.url===BUSINESS.links.cardapio_pedido));
  }
});

test('fritos e empanados informam itens cadastrados sem prometer extras',()=>{
  const r=route('quais fritos tem no rodízio?');
  assert.equal(r.intent,'rodizio_preferencias');
  for (const item of ['Hot Roll Philadelphia','Camarão empanado','Tiras de salmão empanadas','Guioza de legumes frito','Harumaki de muçarela','Batata frita']) {
    assert.ok(r.reply.includes(item),item);
  }
  assert.doesNotMatch(r.reply,/Joy Especial sem arroz/);
  assert.match(r.reply,/não opções extras/);
});

test('grelhados trazem apenas opções cadastradas no rodízio',()=>{
  for (const msg of ['grelhados do rodízio','grelhados']) {
    const r=route(msg);
    assert.equal(r.intent,'rodizio_preferencias');
    assert.match(r.reply,/Hossomaki grelhado/);
    assert.match(r.reply,/Uramaki grelhado/);
    assert.doesNotMatch(r.reply,/Tepan Salmão|Temaki Salmão Grelhado/);
  }
});

test('sem arroz separa opções do rodízio dos Joys especiais à la carte',()=>{
  for (const msg of ['sem arroz','o que tem sem arroz no rodízio?']) {
    const r=route(msg);
    assert.equal(r.intent,'rodizio_preferencias');
    for (const item of ['Sashimi de salmão','Sashimi de tilápia','Carpaccio de salmão','Ceviche misto','Sunomono','Shimeji']) {
      assert.ok(r.reply.includes(item),item);
    }
    assert.match(r.reply,/à la carte/);
    assert.match(r.reply,/não são anunciados como inclusos/);
  }
  const alaCarte=route('joy sem arroz');
  assert.equal(alaCarte.intent,'categoria_cardapio');
});

test('múltiplas preferências na mesma mensagem não repetem a lista principal',()=>{
  const r=route('fritos grelhados sem arroz no rodízio');
  assert.equal(r.intent,'rodizio_preferencias');
  for (const label of ['Fritos e empanados','Grelhados','Sem arroz']) assert.ok(r.reply.includes(label));
  assert.equal((r.reply.match(/GUIA POR PREFERÊNCIA/g)||[]).length,0);
  assert.doesNotMatch(r.reply,/https?:\/\//);
});

test('preço e exceções do rodízio permanecem prioritários; prato específico não vira guia',()=>{
  assert.equal(route('valor do rodízio').intent,'rodizio');
  assert.equal(route('bebidas inclusas no rodízio?').intent,'rodizio_inclusoes');
  assert.equal(route('Temaki Salmão Grelhado').intent,'item_cardapio');
  assert.equal(route('Combo s/ arroz 25 peças').intent,'item_cardapio');
});

test('Dynamic Block divide composição longa sem partir nomes nem soltar links',()=>{
  const r=route('o que tem no rodízio?');
  const payload=dynamicPayload(r);
  assert.ok(payload.content.messages.length>=3);
  for (const m of payload.content.messages) {
    assert.ok(m.text.length<=780,m.text.length);
    assert.doesNotMatch(m.text,/https?:\/\//);
  }
  const reconstructed=payload.content.messages.map(m=>m.text).filter(t=>t!=='É só tocar no botão abaixo:').join('\n');
  assert.match(reconstructed,/GUIA POR PREFERÊNCIA/);
  assert.ok(payload.content.messages.flatMap(m=>m.buttons||[]).some(b=>b.caption==='Ver cardápio \/ pedir'));
  assert.equal(payload.content.actions.some(a=>a.tag_name==='interesse_cardapio'),true);
});
