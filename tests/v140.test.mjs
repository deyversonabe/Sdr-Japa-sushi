import test from 'node:test';
import assert from 'node:assert/strict';
import {resolve,standardPayload,dynamicPayload,BUSINESS,encodeState,nowBR} from '../lib/engine.js';

// Datas fixas em UTC-3 (America/Sao_Paulo, sem horário de verão em 2026).
const AT = {
  terca_12h:   '2026-11-10T12:00:00-03:00', // terça
  quarta_10h:  '2026-11-11T10:00:00-03:00',
  quarta_16h:  '2026-11-11T16:00:00-03:00',
  quinta_12h:  '2026-11-12T12:00:00-03:00',
  quinta_19h:  '2026-11-12T19:30:00-03:00',
  segunda_23h: '2026-11-09T23:30:00-03:00', // segunda, depois de fechar
  sabado_23h:  '2026-11-14T23:30:00-03:00',
};
const ig = (message, now, extra = {}) => resolve({message, channel:'instagram', ...extra}, {now});
const next = (r, message, now, extra = {}) =>
  resolve({message, channel:'instagram', ai_state:encodeState(r.state), ...extra}, {now});

test('nowBR lê dia e hora no fuso de São Paulo', () => {
  assert.deepEqual(nowBR(AT.terca_12h), {dow:2, min:720});
  assert.deepEqual(nowBR('2026-11-12T22:30:00Z'), {dow:4, min:19*60+30});
  assert.deepEqual(nowBR('2026-11-13T02:30:00Z'), {dow:4, min:23*60+30});
});

test('"hoje está fechado?" na terça responde que é folga e quando volta', () => {
  for (const m of ['Hj ta fechado?', 'Oi, hoje é fechado???', 'hoje abre?', 'vcs abrem hj?', 'está aberto?']) {
    const r = ig(m, AT.terca_12h);
    assert.equal(r.intent, 'horario', m);
    assert.match(r.reply, /terça, dia de folga/, m);
    assert.match(r.reply, /Amanhã a gente volta com almoço delivery das 11h às 15h e jantar com rodízio das 17h às 22h30/, m);
    assert.doesNotMatch(r.reply, /não tenho essa informação/i);
  }
});

test('horário responde conforme o momento do dia', () => {
  assert.match(ig('está aberto?', AT.quinta_19h).reply, /Estamos abertos! Hoje o jantar e o rodízio vão até 22h30/);
  assert.match(ig('está aberto?', AT.quinta_12h).reply, /almoço delivery, até 15h\. O salão e o rodízio abrem às 17h/);
  assert.match(ig('abre hoje?', AT.quarta_10h).reply, /almoço delivery às 11h, e o jantar com rodízio abre às 17h/);
  assert.match(ig('abre hoje?', AT.quarta_16h).reply, /abre às 17h para o jantar e o rodízio/);
  assert.match(ig('hoje está aberto?', AT.sabado_23h).reply, /Por hoje já encerramos/);
});

test('depois de fechar na segunda, o bot avisa que amanhã é folga e volta na quarta', () => {
  const r = ig('abre hoje?', AT.segunda_23h);
  assert.match(r.reply, /Por hoje já encerramos/);
  assert.match(r.reply, /Amanhã é terça, nosso dia de folga\. Voltamos na quarta/);
});

test('horário de um dia específico e horário geral', () => {
  assert.match(ig('abrem domingo?', AT.quinta_12h).reply, /No domingo a gente atende com .* das 17h às 23h/);
  assert.match(ig('abre na segunda?', AT.quinta_12h).reply, /Na segunda a gente atende com .* das 17h às 22h30/);
  const terca = ig('funciona na terça?', AT.quinta_12h);
  assert.match(terca.reply, /Na terça é o dia de folga do Japa\. Voltamos na quarta/);
  const geral = ig('qual o horário de funcionamento?', AT.quinta_12h);
  assert.match(geral.reply, /quarta a segunda; terça é o nosso dia de folga/);
  assert.match(geral.reply, /Jantar e rodízio: segunda, quarta e quinta, das 17h às 22h30; sexta, sábado e domingo, das 17h às 23h/);
  assert.doesNotMatch(geral.reply, /18h30/);
});

test('rodízio: preço por dia, terça e criança', () => {
  const geral = ig('qual o valor do rodízio?', AT.quinta_12h, {first_name:'Hendni'});
  assert.equal(geral.intent, 'rodizio');
  for (const v of ['R$ 114,90','R$ 199,90','R$ 124,90','R$ 229,90','R$ 49,90']) assert.ok(geral.reply.includes(v), v);
  assert.match(geral.reply, /quarta a segunda/);
  assert.doesNotMatch(geral.reply, /todos os dias|199,99|54,90/);

  const hoje = ig('qual seria o valor do rodízio hoje?', AT.quinta_12h);
  assert.match(hoje.reply, /Hoje \(quinta\) o rodízio é: Individual R\$ 114,90 · Casal R\$ 199,90/);
  assert.doesNotMatch(hoje.reply, /229,90/);

  const sabado = ig('rodízio sábado quanto é?', AT.quinta_12h);
  assert.match(sabado.reply, /No sábado o rodízio é: Individual R\$ 124,90 · Casal R\$ 229,90/);

  const terca = ig('tem rodízio hoje?', AT.terca_12h);
  assert.match(terca.reply, /Hoje é terça, dia de folga do Japa\. O rodízio volta amanhã: Individual R\$ 114,90/);

  const fim = ig('quanto é o rodízio no fim de semana', AT.quinta_12h);
  assert.match(fim.reply, /No fim de semana o rodízio é: Individual R\$ 124,90/);
});

test('criança: 5 a 11 paga infantil; menor de 5 e 12+ vão para a equipe, sem inventar', () => {
  const um = ig('Gostaria de saber sobre os valores, se criança de 1 ano paga', AT.quinta_12h);
  assert.equal(um.intent, 'rodizio_infantil');
  assert.equal(um.needs_human, true);
  assert.match(um.reply, /menores de 5 anos eu prefiro confirmar direitinho com a equipe/);
  assert.doesNotMatch(um.reply, /não pagam/);
  const sete = ig('meu filho de 7 anos paga rodízio?', AT.quinta_12h);
  assert.match(sete.reply, /Crianças de 5 a 11 anos pagam R\$ 49,90/);
  assert.equal(sete.needs_human, false);
  assert.match(ig('minha filha de 14 anos paga rodízio?', AT.quinta_12h).reply, /A partir de 12 anos eu prefiro confirmar/);
  assert.match(ig('criança paga rodízio?', AT.quinta_12h).reply, /Para menores de 5 anos, a equipe confirma pelo WhatsApp/);
});

test('vaga, entregador, sushiman e freelance vão para o RH', () => {
  for (const m of ['Sou sushiman estou disponivel obrigado', 'Gostaria de saber se estão precisando de entregador? Tanto fixo como freelance?',
    'estão contratando?', 'tem vaga de garçom?', 'procuro trabalho como cozinheiro']) {
    const r = ig(m, AT.quinta_12h);
    assert.equal(r.intent, 'vaga', m);
    assert.ok(r.ctas.some(c => c.url === BUSINESS.links.whatsapp_rh), m);
    assert.ok(!r.ctas.some(c => c.url === BUSINESS.links.whatsapp), m);
  }
  // assuntos de entrega do cliente não viram vaga
  assert.equal(ig('o motoboy demora quanto?', AT.quinta_12h).intent, 'delivery');
  assert.notEqual(ig('o entregador chegou?', AT.quinta_12h).intent, 'vaga');
  const d = dynamicPayload(ig('tem vaga?', AT.quinta_12h));
  assert.ok(d.content.actions.some(a => a.action === 'add_tag' && a.tag_name === 'candidato_rh'));
});

test('quando o bot não sabe, indica o WhatsApp sem dizer "não tenho informação"', () => {
  const r = ig('asdfgh qwerty', AT.quinta_12h, {first_name:'Ana'});
  assert.equal(r.intent, 'outro');
  assert.match(r.reply, /^Quero te ajudar direitinho, Ana\. Toque no botão e fale com a equipe no WhatsApp/);
  assert.doesNotMatch(r.reply, /não tenho essa informação/i);
  assert.ok(r.ctas.some(c => c.url === BUSINESS.links.whatsapp));
});

test('status de pedido já feito vai para a equipe, não para o cardápio', () => {
  const r = ig('Está anotado o pedido? O nome dele é Thiago', AT.quinta_19h);
  assert.equal(r.intent, 'pedido_status');
  assert.equal(r.needs_human, true);
  assert.equal(ig('quero fazer meu pedido', AT.quinta_19h).intent, 'pedido');
});

test('menção em story agradece, pede para repostar e entende a resposta', () => {
  const m = resolve({message:'', event_type:'story_mention', first_name:'Pedro', channel:'instagram'}, {now:AT.quinta_19h});
  assert.equal(m.intent, 'story_mention');
  assert.match(m.reply, /^Que foto linda, Pedro! 🤩 Obrigado por marcar o Japa\. Posso repostar/);
  const sim = next(m, 'Pode sim', AT.quinta_19h, {first_name:'Pedro'});
  assert.equal(sim.intent, 'story_repost_ok');
  assert.match(sim.reply, /^Combinado, Pedro!/);
  assert.ok(dynamicPayload(sim).content.actions.some(a => a.tag_name === 'repost_autorizado'));
  const nao = next(m, 'Prefiro que não', AT.quinta_19h);
  assert.equal(nao.intent, 'story_repost_nao');
  // sem ter pedido para repostar, "sim" não vira repost
  assert.notEqual(ig('sim', AT.quinta_19h).intent, 'story_repost_ok');
});

test('comentário vira conversa: sem falar de problema, com palavra-chave QUERO', () => {
  const c = resolve({message:'Que delícia', event_type:'instagram_comment', channel:'instagram', first_name:'Edmar'}, {now:AT.quinta_12h});
  assert.equal(c.intent, 'comentario');
  assert.match(c.reply, /^Oi, Edmar! Vi seu comentário no nosso post/);
  assert.doesNotMatch(c.reply, /não saiu como esperado/);
  const q = resolve({message:'QUERO', event_type:'instagram_comment', channel:'instagram', first_name:'Edmar'}, {now:AT.quinta_12h});
  assert.equal(q.intent, 'comentario_quero');
  assert.ok(q.ctas.some(x => x.url === BUSINESS.links.cardapio_pedido));
  const elogio = resolve({message:'Só passei pra elogiar', channel:'instagram'}, {now:AT.quinta_12h});
  assert.equal(elogio.intent, 'elogio');
});

test('saudação na terça avisa da folga e oferece ajuda', () => {
  const r = ig('oi', AT.terca_12h, {first_name:'Ana'});
  assert.equal(r.intent, 'saudacao');
  assert.match(r.reply, /^Oiê, Ana! Seja muito bem-vindo/);
  assert.match(r.reply, /Hoje é terça, nosso dia de folga, mas amanhã a gente volta/);
  assert.match(ig('oi', AT.quinta_12h).reply, /Tô aqui pra te ajudar rapidinho/);
});

test('reserva guiada: uma pergunta por vez até o botão com mensagem pronta', () => {
  let r = ig('quero reservar', AT.quinta_12h, {first_name:'Ana'});
  assert.equal(r.intent, 'reserva');
  assert.match(r.reply, /^Oba, Ana! Vamos organizar sua reserva\. Quantas pessoas vão ser\?/);
  r = next(r, '6 pessoas', AT.quinta_12h, {first_name:'Ana'});
  assert.match(r.reply, /Para qual dia/);
  r = next(r, 'sábado', AT.quinta_12h, {first_name:'Ana'});
  assert.match(r.reply, /que horas pretendem chegar/);
  r = next(r, '20h30', AT.quinta_12h, {first_name:'Ana'});
  assert.equal(r.intent, 'reserva_pronta');
  assert.match(r.reply, /Anotei: 6 pessoas, sábado às 20h30/);
  assert.match(r.reply, /50%/);
  assert.equal(r.state.reserva, null);
  const std = standardPayload(r);
  assert.equal(std.cta_count, 1);
  const url = new URL(std.ctas[0].url);
  assert.equal(url.origin + url.pathname, BUSINESS.links.whatsapp);
  assert.equal(url.searchParams.get('text'), 'Olá! Quero reservar para 6 pessoas, sábado às 20h30. Meu nome é Ana.');
  assert.doesNotMatch(std.reply, /https?:\/\/|wa\.me/);
  assert.ok(dynamicPayload(r).content.actions.some(a => a.tag_name === 'interesse_reserva'));
});

test('reserva guiada: aproveita o que o cliente já disse, recusa terça e não prende a conversa', () => {
  const tudo = ig('quero reservar mesa para 4 pessoas sexta às 21h', AT.quinta_12h);
  assert.equal(tudo.intent, 'reserva_pronta');
  assert.match(tudo.reply, /4 pessoas, sexta às 21h/);

  let r = ig('quero reservar para 4 pessoas', AT.quinta_12h);
  assert.match(r.reply, /Para qual dia/);
  r = next(r, 'terça', AT.quinta_12h);
  assert.equal(r.intent, 'reserva');
  assert.match(r.reply, /Às terças a gente descansa/);
  assert.equal(r.state.reserva.fails, 0);
  // pergunta de outro assunto no meio sai do roteiro
  const saiu = next(r, 'qual o valor do rodízio?', AT.quinta_12h);
  assert.equal(saiu.intent, 'rodizio');
  assert.equal(saiu.state.reserva, null);
  // duas respostas ininteligíveis: entrega para a equipe com o que já tem
  let c = ig('quero reservar', AT.quinta_12h);
  c = next(c, 'hmm', AT.quinta_12h);
  c = next(c, 'sei la', AT.quinta_12h);
  assert.equal(c.intent, 'reserva_pronta');
  assert.match(c.reply, /Toque no botão e conte para a equipe/);
});

test('"sim" depois de uma oferta de reserva começa o roteiro; sem oferta, não', () => {
  const h = ig('está aberto?', AT.quinta_19h);
  assert.equal(h.state.offer, 'reserva');
  const sim = next(h, 'sim', AT.quinta_19h);
  assert.equal(sim.intent, 'reserva');
  assert.match(sim.reply, /Quantas pessoas/);
  assert.equal(ig('sim', AT.quinta_19h).intent, 'outro');
  const preco = ig('quanto é o rodízio', AT.quinta_19h);
  assert.equal(preco.state.offer, 'reserva');
  assert.equal(next(preco, 'quero', AT.quinta_19h).intent, 'reserva');
});

test('aniversário: bolo para 10 convidados, sem inventar regra, pergunta o aniversariante', () => {
  let r = ig('vou fazer meu aniversário aí', AT.quinta_12h, {first_name:'Ana'});
  assert.equal(r.intent, 'aniversario');
  assert.match(r.reply, /^Que lindo, Ana! 🎂 No Japa, quem reúne pelo menos 10 convidados e faz o rodízio ganha um bolo do Palácio das Delícias/);
  assert.match(r.reply, /As condições a equipe combina com você/);
  assert.match(r.reply, /Quantas pessoas/);
  r = next(r, '12', AT.quinta_12h, {first_name:'Ana'});
  r = next(r, 'dia 20', AT.quinta_12h, {first_name:'Ana'});
  assert.match(r.reply, /que horas pretendem chegar/);
  r = next(r, '20h', AT.quinta_12h, {first_name:'Ana'});
  assert.equal(r.intent, 'reserva');
  assert.match(r.reply, /Quem é o aniversariante/);
  r = next(r, 'Carla', AT.quinta_12h, {first_name:'Ana'});
  assert.equal(r.intent, 'reserva_pronta');
  assert.match(r.reply, /Sobre o bolo de aniversário, a equipe combina as condições com você/);
  const url = new URL(standardPayload(r).ctas[0].url);
  assert.equal(url.searchParams.get('text'), 'Olá! Quero reservar para 12 pessoas, dia 20 às 20h. Meu nome é Ana. É aniversário de Carla.');
  assert.ok(dynamicPayload(ig('aniversário', AT.quinta_12h)).content.actions.some(a => a.tag_name === 'interesse_aniversario'));
});

test('segurança: texto do cliente nunca vira URL fora do WhatsApp aprovado', () => {
  let r = ig('quero reservar', AT.quinta_12h);
  r = next(r, '4', AT.quinta_12h); r = next(r, 'sexta', AT.quinta_12h); r = next(r, '20h', AT.quinta_12h);
  assert.equal(r.intent, 'reserva_pronta');
  const forjado = {...r, ctas:[{type:'url', label:'x', url:'https://evil.example/?text=' + BUSINESS.links.whatsapp}]};
  assert.equal(standardPayload(forjado).cta_count, 0);
  // nome de aniversariante com símbolos e link é limpo antes de entrar na mensagem
  let a = ig('aniversário para 10 pessoas sexta às 20h', AT.quinta_12h);
  assert.match(a.reply, /Quem é o aniversariante/);
  a = next(a, 'Carla http://x.co/<b>', AT.quinta_12h);
  const texto = new URL(standardPayload(a).ctas[0].url).searchParams.get('text');
  assert.doesNotMatch(texto, /http|<|>|\//);
});
