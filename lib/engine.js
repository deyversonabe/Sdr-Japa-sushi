import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { persona } from './persona.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(root, 'data', f), 'utf8'));
const knowledge = read('knowledge.json');
const catalogData = read('catalogo_extraido.json');
const rodizioGroups = read('rodizio_grupos_atendimento.json');
const ACTIVE = new Set(['ativo', 'ativo_por_confirmacao_usuario_2026_09_22']);
const catalog = catalogData.catalogo.filter((p) => ACTIVE.has(p.status));
const hidden = catalogData.catalogo.filter((p) => !ACTIVE.has(p.status));
const L = knowledge.links;
export const VERSION = knowledge._meta.versao;
export const BUSINESS = knowledge;
export const CATALOG = catalog;
export const HIDDEN = hidden;
export const RODIZIO_GROUPS = rodizioGroups;

const norm = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const has = (t, re) => re.test(t);
const words = (v) => ` ${norm(v)} `;
const isYes = (v) => v === true || ['true','yes','sim','1'].includes(norm(v));
const WA = { type: 'url', label: 'Falar no WhatsApp', url: L.whatsapp };
const RH = { type: 'url', label: 'Enviar currículo', url: L.whatsapp_rh };
const MENU = { type: 'url', label: 'Ver cardápio / pedir', url: L.cardapio_pedido };
const MAP = { type: 'url', label: 'Como chegar', url: L.google_maps };
// Canais iFood e 99Food foram confirmados. Links de loja só viram botões após validação.
// Também podem ser cadastrados nas variáveis opcionais IFOOD_STORE_URL e FOOD99_STORE_URL da Vercel.
function validatedMarketplaceUrl(raw, platform) {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:' || u.username || u.password) return null;
    const host = u.hostname.toLowerCase();
    const pathname = u.pathname.toLowerCase();
    if (platform === 'ifood') {
      if (!['ifood.com.br', 'www.ifood.com.br'].includes(host) || !pathname.startsWith('/delivery/')) return null;
    } else if (platform === 'food99') {
      if (!['99app.com', 'www.99app.com'].includes(host) || !/^\/99food\/[^/]+\/[^/]+\/[^/]+/.test(pathname)) return null;
    } else return null;
    return u.toString();
  } catch { return null; }
}
export function marketplaceStatus() {
  const ifood = validatedMarketplaceUrl(process.env.IFOOD_STORE_URL || L.ifood, 'ifood');
  const food99 = validatedMarketplaceUrl(process.env.FOOD99_STORE_URL || L.food99, 'food99');
  return { ifood, food99 };
}
const marketplaceButton = (platform) => {
  const url = marketplaceStatus()[platform];
  return url ? {type:'url',label:platform==='ifood'?'Pedir no iFood':'Pedir no 99Food',url} : null;
};
const deliveryButtons = () => [MENU, marketplaceButton('ifood'), marketplaceButton('food99'), WA]
  .filter(Boolean).slice(0,3);
const marketplaceButtons = (platform) => [marketplaceButton(platform),MENU,WA]
  .filter(Boolean).slice(0,3);
const REVIEW = () => L.google_avaliacao ? [{type:'url',label:'Avaliar no Google',url:L.google_avaliacao}] : [];
const stateBase = () => ({last_intent:'',last_topic:'',last_bot_reply:'',rating_pending:false,feedback_pending:false,last_event_id:'',last_survey_order:''});
const decodeState = (raw) => {
  if (typeof raw !== 'string') return raw;
  const t = raw.trim();
  if (!t || t.startsWith('{')) return t;
  try { return Buffer.from(t, 'base64url').toString('utf8'); } catch { return t; }
};
// Memória em base64url: evita JSON quebrado quando o ManyChat reinsere ai_state no corpo da requisição.
export const encodeState = (obj) => Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url');
// Aceita o chip "Dados completos do contato" do ManyChat (JSON serializado pelo próprio ManyChat),
// evitando JSON quebrado quando a mensagem do cliente tem aspas ou quebras de linha.
export function normalizeInput(input={}) {
  const c = input && typeof input.contact === 'object' && input.contact ? input.contact : null;
  if (!c) return input;
  // ManyChat pode entregar custom_fields como objeto {nome: valor} ou como lista [{name, value}] (formato da API).
  const rawCf = c.custom_fields;
  const cf = Array.isArray(rawCf)
    ? Object.fromEntries(rawCf.filter((f)=>f && typeof f.name==='string').map((f)=>[f.name,f.value]))
    : (rawCf && typeof rawCf === 'object' ? rawCf : {});
  return {
    ...input,
    subscriber_id: input.subscriber_id || c.id || '',
    first_name: input.first_name || c.first_name || c.name || c.ig_username || '',
    message: input.message ?? c.last_input_text ?? '',
    ai_state: input.ai_state ?? cf.ai_state ?? '',
    atendimento_humano: input.atendimento_humano ?? cf.atendimento_humano,
  };
}
export function parseState(raw) {
  try {
    const dec = decodeState(raw);
    const obj = typeof dec === 'string' ? JSON.parse(dec) : dec;
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? {...stateBase(),...obj} : stateBase();
  } catch { return stateBase(); }
}
const result = (intent,reply,ctas=[],extra={}) => ({intent,reply,ctas,needs_human:false,next_action:'responder',topic:'',...extra});
const fallback = (intent='outro',intro='Não quero te passar uma informação errada. Nossa equipe consegue confirmar direitinho pelo WhatsApp.') =>
  result(intent,intro,[WA],{needs_human:true,next_action:'whatsapp'});
const itemReply = (p) => `${p.nome} — ${p.valor}${p.descricao ? `\n${p.descricao}` : '\nNão tenho descrição confirmada deste item.'}`;
const compact = (p) => `${p.nome} — ${p.valor}`;
const questions = /(quanto|preco|valor|acompanha|serve|tem esse|e esse|deste|desse)/;
const getState = (input) => {
  const s = parseState(input.ai_state ?? input.state);
  if (!s.last_intent && input.last_intent) s.last_intent = String(input.last_intent);
  if (!s.last_topic && input.last_topic) s.last_topic = String(input.last_topic);
  if (!s.last_bot_reply && input.last_bot_reply) s.last_bot_reply = String(input.last_bot_reply);
  if (!s.rating_pending && isYes(input.avaliacao_pendente)) s.rating_pending = true;
  if (!s.feedback_pending && isYes(input.avaliacao_feedback_pendente)) s.feedback_pending = true;
  return s;
};
// Mesma correção ortográfica aplicada à mensagem do cliente e aos nomes do cadastro.
const canon = (v) => norm(String(v ?? '').replace(/filadelfia|philadelfia/gi,'philadelphia'));
function lookup(text) {
  const n = norm(text), padded = ` ${n} `;
  if (!n || n.length < 5) return [];
  const hits = [];
  for (const p of catalog) {
    const full = canon(p.nome), stem = full.replace(/\s+(?:\d+\s+)?(?:unid|unidades|laminas|g|ml)\b.*/, '').trim();
    if (full.length>=5 && padded.includes(` ${full} `)) {hits.push({p,score:100+full.length});continue;}
    if (stem.length>=9 && padded.includes(` ${stem} `)) hits.push({p,score:stem.length});
  }
  if (!hits.length) return [];
  // Tamanho pedido ("10", "10 unid", "5 pecas") desempata variações do mesmo item.
  const size = n.match(/\b(\d{1,2})(?: (?:unid|unidades|pecas|pcs|un))?\b/);
  if (size) for (const h of hits) if (new RegExp(`\\b${size[1]} unid`).test(canon(h.p.nome))) h.score += 0.5;
  hits.sort((a,b) => b.score-a.score);
  // Quando a busca contém o nome completo, prefere apenas essa apresentação; no empate, explicita variações.
  const best=hits[0].score;
  return hits.filter((h)=>h.score===best).map((h)=>h.p).slice(0,4);
}
const group = (category) => {
  const aliases={
    'combos':['Combos','Combos Individuais'],
    'combo':['Combos','Combos Individuais'],
    'pratos quentes':['Pratos Quentes'],
    'yakissoba':['Pratos Quentes'],
    'yakimeshi':['Pratos Quentes'],
    'tepan':['Pratos Quentes'],
    'temaki':['Temaki individuais'],
    'temakis':['Temaki individuais'],
    'poke':['Monte Seu Poke'],
    'sobremesa':['Sobremesa'],
    'sashimi':['Sashimis'],
    'entradas':['Entradas'],
    'bebidas':['Bebidas'],
    'drink':['Drinks'],
    'joy sem arroz':['Joy Especial (SEM ARROZ)'],
    'oniguiri':['Oniguiri'],
    'hot roll':['Mega Hot Roll','Sushi à La Carte'],
    'mega hot roll':['Mega Hot Roll']
  };
  const cats = aliases[category] ?? [category];
  return catalog.filter((p)=>cats.includes(p.categoria) &&
    (!['yakissoba','yakimeshi','tepan'].includes(category) || norm(p.nome).startsWith(category)) &&
    // "hot roll" usa categorias amplas: filtra pelo nome para não listar Joys ou outros itens do à la carte.
    (!['hot roll','mega hot roll'].includes(category) || norm(p.nome).includes(category)));
};
const ratingValue = (raw) => {
  const m = norm(raw).match(/^(?:(?:nota|dou|avalio com) )?([1-5])(?: (?:estrelas|estrela|de 5))?$/);
  return m ? Number(m[1]) : null;
};
const forbiddenSubject = (n) => /\b(dono|proprietari\w*|assumi|trocou de dono|rafa|influenciador\w*|influencer\w*)\b/.test(n);
const needsCare = (n) => /\b(alergia|alergico|gluten|contaminacao cruzada|intolerancia|vegano|celiaco)\b/.test(n);
const complaint = (n) => /\b(reclamacao|reclamar|estorno|cancelar|reembolso|errado|faltou|atrasad\w*|demorou|frio|estragado|problema)\b/.test(n) && !/sem problema|deu tudo certo/.test(n);
const jobs = (n) => /\b(vaga|vagas|emprego|curriculo|trabalhar|contratacao|rh|selecao|entrevista)\b/.test(n);
const partnership = (n) => /\b(parceria|permuta|divulgacao|agencia|trafego|consultoria|representante|proposta comercial|publi)\b/.test(n);
const praise = (n) => /\b(amei|adorei|maravilhoso|maravilhosa|perfeito|delicioso|sensacional|parabens|top)\b/.test(n);
const gradePrompt = () => 'Que bom ter você com a gente! De 1 a 5, que nota você dá à sua experiência? Pode responder só com o número.';
const rodizioPreferencias = rodizioGroups.guia_por_preferencia;
const preferenceText = (key) => {
  const group=rodizioPreferencias[key];
  return `${group.titulo}:\n${group.itens.map((x)=>`• ${x}`).join('\n')}`;
};
const preferenceKeys = (n) => [
  /\b(frito|frita|fritos|fritas|empanado|empanada|empanados|empanadas)\b/.test(n) && 'fritos_empanados',
  /\b(grelhado|grelhada|grelhados|grelhadas)\b/.test(n) && 'grelhados',
  /\bsem arroz\b/.test(n) && 'sem_arroz'
].filter(Boolean);
// Abreviações comuns de Direct → forma completa (só palavra inteira, depois da normalização).
const ABREV = {vcs:'voces',vc:'voce',vces:'voces',q:'que',oq:'o que',pq:'porque',hj:'hoje',tbm:'tambem',tb:'tambem',
  qto:'quanto',oque:'o que',oqe:'o que',qnto:'quanto',qt:'quanto',ond:'onde',aond:'onde',aonde:'onde',end:'endereco',ender:'endereco',
  msm:'mesmo',td:'tudo',blz:'beleza',obg:'obrigado',vlw:'valeu',hrs:'horas',hr:'horas',cmg:'comigo',tah:'esta',ta:'esta',tao:'estao'};
const expandAbbrev = (n) => n.split(' ').map((w)=>ABREV[w]??w).join(' ');
// Localização: termos fortes ou "onde" + contexto de lugar, sem roubar perguntas de cardápio/pedido/reserva.
const locationQuestion = (n) => {
  if (/\b(endereco|localizacao|localizad[oa]s?|situad[oa]s?|como chegar|como chego|pra chegar|para chegar|chegar ai|chegar ate|mapa|maps|waze|gps|rota|ponto de referencia|qual (a )?rua|em que rua|que rua|fica onde|ficam onde)\b/.test(n)) return true;
  if (!/\bonde\b/.test(n)) return false;
  if (/\b(cardapio|menu|pedir|pedido|comprar|entrega|delivery|ifood|99 ?food|reserv\w*|pag\w*|curriculo|vaga)\b/.test(n)) return false;
  return /^(e )?onde( e| fica| ficam| esta| estao)?( voces| o japa| o restaurante)?$/.test(n) ||
    /\bonde\b.*\b(e|fica|ficam|esta|estao|voces|voce|restaurante|japa|loja|lugar|casa)\b/.test(n);
};
const rodizioDetailQuestion = (n) => /\b(o que tem|o que vem|quais itens|quais opcoes|lista|composicao|variedades|opcoes do rodizio|itens do rodizio|o que inclui)\b/.test(n);
// Primeiro nome seguro para tratamento pessoal: só letras, até 20 caracteres; senão, sem nome.
const NOT_A_NAME = new Set(['user','usuario','usuaria','oficial','official','loja','store','shop','contato','perfil','admin',
  'instagram','insta','ig','the','eu','sr','sra','dr','dra','material','comercial','empresa','restaurante','delivery','studio','estudio']);
export function safeFirstName(raw) {
  // Aceita também @usuario do Instagram (ex.: deyverson_abe → Deyverson) quando o perfil não tem nome.
  const w = String(raw ?? '').trim().replace(/^@/,'').split(/[\s._\-0-9]+/).filter(Boolean)[0] || '';
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ'-]{2,20}$/.test(w)) return '';
  if (NOT_A_NAME.has(norm(w))) return '';
  return w.charAt(0).toLocaleUpperCase('pt-BR') + w.slice(1).toLocaleLowerCase('pt-BR');
}
const withName = (nome, comNome, semNome) => nome ? comNome : semNome;
// Resposta curta (uma bolha): resumo do rodízio sem listar item por item; o detalhe fica sob pedido.
const rodizioResumo = (nome='') =>
  `${nome ? `${nome}, no rodízio` : 'No rodízio'} você tem sushis e sashimis, niguiris, hossomakis, uramakis, joys, hot rolls, entradas e pratos quentes como yakissoba e missoshirô. 🍣\n\n`+
  `Individual ${knowledge.rodizio.individual} · Casal ${knowledge.rodizio.casal} · 9 a 11 anos ${knowledge.rodizio.infantil_9_a_11} · menores de 9 não pagam. Bebidas e sobremesas à parte.\n\n`+
  `Quer ver as opções fritas, grelhadas ou sem arroz? É só me pedir.`;
const rodizioPriceSummary = () =>
  `Rodízio todos os dias! Individual: ${knowledge.rodizio.individual}; casal: ${knowledge.rodizio.casal}; infantil (9 a 11 anos): ${knowledge.rodizio.infantil_9_a_11}; menores de 9 não pagam.`;


export function resolve(input={}) {
  input = normalizeInput(input);
  const s = getState(input);
  const nome = safeFirstName(input.first_name);
  const raw = String(input.message ?? input.text ?? '').slice(0,4000);
  let n = norm(raw.replace(/rodiozio|rodizzio|rodizo|rrodizio/gi,'rodizio').replace(/temaky/gi,'temaki')
    .replace(/sachimi/gi,'sashimi').replace(/filadelfia|philadelfia/gi,'philadelphia'));
  n = expandAbbrev(n);
  // Erros comuns de digitação: rodisio, rodzio, rudizio, rodiziu, rodizios...
  n = n.replace(/\br+[ou]d+i*[sz]+i*[ou]s?\b/g,'rodizio');
  const event = norm(input.event_type || 'direct');
  const channel = norm(input.channel||'instagram')==='whatsapp' ? 'whatsapp' : 'instagram';
  const eventId = String(input.event_id || '').slice(0,128);
  if (channel==='whatsapp' && isYes(input.atendimento_humano)) return {
    ...result('humano_ativo','',[],{next_action:'silencio_humano'}),state:s,channel
  };
  if (eventId && s.last_event_id===eventId) return {
    ...result('duplicado','',[],{next_action:'ignorar'}),state:s,channel
  };
  let r;
  const orderId = String(input.order_id || input.pedido_id || '').slice(0,64);
  if ((event==='pedido confirmado' || event==='feedback request') &&
    (s.rating_pending || s.feedback_pending || orderId && s.last_survey_order===orderId)) {
    // Pesquisa já em andamento ou já enviada para este pedido: não pergunta de novo.
    return {...result('pesquisa_duplicada','',[],{next_action:'ignorar'}),state:s,channel};
  } else if (event==='pedido confirmado' || event==='feedback request') {
    r=result('avaliacao_solicitar_nota',gradePrompt());
    s.rating_pending=true; s.feedback_pending=false;
    if (orderId) s.last_survey_order=orderId;
  } else if (s.feedback_pending) {
    s.feedback_pending=false;
    r=result('avaliacao_feedback','Obrigado por nos contar. Vamos encaminhar seu comentário à equipe. Seu relato faz diferença para melhorarmos.',
      [...REVIEW(),WA].slice(0,3),{needs_human:true,next_action:'registrar_feedback',feedback:raw});
  } else if (s.rating_pending) {
    const note=ratingValue(raw);
    if (!note) r=result('avaliacao_nota_invalida','Me manda só uma nota de 1 a 5, por favor.');
    else {
      s.rating_pending=false;
      if (note<=4) {
        s.feedback_pending=true;
        r=result('avaliacao_nota','Obrigado pela sinceridade. O que poderíamos melhorar? Pode me contar em uma frase.',
          [...REVIEW(),WA],{nota:note,next_action:'aguardar_feedback'});
      } else {
        r=result('avaliacao_nota',L.google_avaliacao
          ? 'Que bom saber que gostou! Obrigado por avaliar sua experiência. Se quiser, uma avaliação sincera no Google ajuda outras pessoas a conhecerem a casa.'
          : 'Que bom saber que gostou! Obrigado por avaliar sua experiência. Agradecemos por compartilhar sua opinião!',
          REVIEW(),{nota:note});
      }
    }
  } else if (event==='story mention' && !n) {
    r=result('story_mention','Obrigado por lembrar do Japa! Adoramos receber sua marcação. 🍣');
  } else if (event==='audio' || event==='voice' || norm(input.message_type).includes('audio')) {
    r=fallback('audio','Recebi seu áudio! Para não deixar sua dúvida sem resposta, nossa equipe pode te ajudar no WhatsApp.');
  } else if (jobs(n)) {
    r=result('vaga',`${withName(nome,`Que bom, ${nome}! Adoramos seu`,'Que bom ter seu')} interesse em trabalhar com a gente!`+' O nosso RH recebe currículos e informações sobre seleção pelo botão abaixo.',[RH]);
  } else if (complaint(n)) {
    r=fallback('reclamacao',`Sinto muito pelo ocorrido${nome?`, ${nome}`:''}.`+' Quero que nossa equipe entenda seu caso e te ajude diretamente pelo WhatsApp.');
  } else if (needsCare(n)) {
    r=fallback('cuidados_alimentares','Para confirmar ingredientes e cuidados no preparo com segurança, converse com nossa equipe pelo WhatsApp.');
  } else if (partnership(n)) {
    r=result('parceria','Agradecemos o contato! Você pode deixar sua proposta resumida por aqui; nossa equipe analisará conforme a necessidade.');
  } else if (forbiddenSubject(n)) {
    r=result('assunto_interno','Posso te ajudar com informações sobre nosso cardápio, pedidos e reservas. Precisa de alguma dessas opções?', [MENU,WA]);
  } else if (/^(quero |queria |posso |gostaria de |vou |como )?(avaliar|avaliacao|dar (uma )?nota|deixar (uma |minha )?avaliacao|feedback|nota pro japa)( voces| o japa| o atendimento| a experiencia)?$/.test(n)) {
    s.rating_pending=true;
    r=result('avaliacao_solicitar_nota',gradePrompt());
  } else if (/\b(atendente|humano|pessoa|falar com voces|falar com alguem|ajuda)\b/.test(n)) {
    r=fallback('humano','Claro! Você consegue falar com nossa equipe diretamente pelo botão do WhatsApp.');
  } else if (/\b(reserva|reservar|agendar|marcar uma mesa|quero uma mesa|mesa para|aniversario|evento)\b/.test(n)) {
    r=result('reserva',
      `${withName(nome,`Oba, ${nome}! Vamos organizar sua reserva.`,'Vamos organizar sua reserva!')} Precisaremos do nome, dia, horário e quantidade de pessoas. ${knowledge.reserva.sinal_texto}`,
      [WA],{needs_human:true,next_action:'whatsapp'});
  } else if (/\b(crianca|criancas|infantil|anos|menor de 9|filho|filha|filhos|filhas)\b/.test(n) && /\b(rodizio|paga|pagam|valor|crianca|infantil|filho|filha|filhos|filhas)\b/.test(n)) {
    r=result('rodizio_infantil',`Menores de 9 anos não pagam rodízio. Crianças de 9 a 11 anos completos pagam ${knowledge.rodizio.infantil_9_a_11}. Bebidas e sobremesas são à parte.`,[MENU],{topic:'rodizio'});
  } else if (/\b(almoco|almocar|meio dia|de dia|na hora do almoco)\b/.test(n)) {
    r=result('horario','Funcionamos somente à noite: domingo a quinta, das 18h30 às 23h; sexta e sábado, das 18h30 à meia-noite. O rodízio é servido todas as noites nesse horário.',[WA]);
  } else if (/\b(bebidas?|sobremesas?)\b/.test(n) && /\b(rodizio|inclus[oa]s?|inclui|entra)\b/.test(n)) {
    r=result('rodizio_inclusoes','Bebidas e sobremesas não estão inclusas no rodízio; são cobradas separadamente.',[MENU],{topic:'rodizio'});
  } else if (preferenceKeys(n).length && !/\b(joy|temaki|combo|poke|adicional)\b/.test(n) &&
    (/\b(rodizio|o que|quais|opcoes|tem|mostra|me fala|frito|fritos|grelhado|grelhados)\b/.test(n) || s.last_topic==='rodizio' || n==='sem arroz')) {
    const keys=preferenceKeys(n);
    const guia=keys.map(preferenceText).join('\n\n');
    const alaCarte=keys.includes('sem_arroz')
      ? `\n\nOs Joys Especiais sem arroz são uma categoria separada do à la carte; não são anunciados como inclusos no rodízio.` : '';
    r=result('rodizio_preferencias',
      `Aqui está nosso guia por preferência, separado da lista principal do rodízio:\n\n${guia}\n\n`+
      `Esses são itens cadastrados no rodízio, não opções extras. Consulte a disponibilidade com nossa equipe.${alaCarte}`,
      [MENU,WA],{topic:'rodizio'});
  } else if (/^(e )?o que (tem|vem|inclui|entra|serve|servem)( ai| nele| no rodizio| de bom)?$/.test(n) ||
    /\brodizio\b/.test(n) && rodizioDetailQuestion(n) ||
    s.last_topic==='rodizio' && rodizioDetailQuestion(n)) {
    r=result('rodizio_composicao',rodizioResumo(nome),
      [MENU,WA],{topic:'rodizio'});
  } else if (/\b(rodizio)\b/.test(n)) {
    r=result('rodizio',
      `${withName(nome,`Aê, ${nome}! Boa escolha 😍`,'Boa escolha! 😍')} Nosso rodízio é servido todos os dias:\n\n`+
      `🍣 Individual — ${knowledge.rodizio.individual}\n🍣 Casal — ${knowledge.rodizio.casal}\n🍣 9 a 11 anos — ${knowledge.rodizio.infantil_9_a_11}\n🍣 Menores de 9 anos não pagam\n\n`+
      `Bebidas e sobremesas são à parte. Quer reservar sua mesa? É só tocar no WhatsApp. Se quiser, também te mostro as opções fritas, grelhadas ou sem arroz.`,
      [WA,MENU],{topic:'rodizio'});
  } else if (/\b(pix|debito|credito|cartao|dinheiro|ticket|pagamento|pago|pagar|vale refeicao|parcelamento|parcela|vr|va|alelo|sodexo|pluxee|caju|ben|flash|vale alimentacao)\b/.test(n)) {
    r=result('pagamento',`Aceitamos ${knowledge.formas_pagamento.confirmados.join(', ')}. Se precisar confirmar alguma bandeira específica ou parcelamento, nossa equipe ajuda pelo WhatsApp.`,[WA]);
  } else if (locationQuestion(n)) {
    r=result('localizacao',`${withName(nome,`Claro, ${nome}! 📍`,'Claro! 📍')} Estamos na ${knowledge.empresa.endereco}. É só tocar no botão abaixo para abrir a rota.`,[MAP]);
  } else if (/\b(horario|horas|abrem|abre|aberto|fecham|fecha|funcionamento|domingo|hoje a noite)\b/.test(n)) {
    r=result('horario','Abrimos todas as noites: domingo a quinta, das 18h30 às 23h; sexta e sábado, das 18h30 à meia-noite. Em feriados, confirme eventuais alterações com a equipe.',[WA]);
  } else if (/\b(?:i ?food|99 ?food|99 ?app)\b/.test(n) || /\b(?:no|pelo|pela|na|tem|app|aplicativo) 99\b/.test(n)) {
    const platform=/\b99/.test(n)?'food99':'ifood';
    const label=platform==='ifood'?'iFood':'99Food';
    const hasStoreLink=!!marketplaceStatus()[platform];
    r=result('delivery',hasStoreLink
      ? `Sim, estamos no ${label}! Você pode abrir nossa loja pelo botão abaixo. Também temos pedidos diretos pelo SAIPOS, com entrega e retirada. Taxas e preços de cada plataforma aparecem no respectivo aplicativo.`
      : `Sim, estamos no ${label}! Procure Japa Sushi Lounge, em Barretos, no aplicativo. Ainda não temos o link direto da loja confirmado para este botão; se preferir, peça pelo nosso cardápio digital.`,
      marketplaceButtons(platform));
  } else if (/\b(entrega|entregas|entregam|entregar|entregando|delivery|retirada|retirar|buscar|taxa|frete|bairro|motoboy)\b/.test(n)) {
    r=result('delivery','Temos entrega e retirada pelo nosso cardápio digital (SAIPOS). Também atendemos pelo iFood e 99Food! No SAIPOS, a taxa aparece ao informar seu endereço. Nos aplicativos, consulte as taxas e os preços exibidos por cada plataforma.',deliveryButtons());
  } else if (/\b(pedir|pedido|comprar|encomendar|quero fazer meu pedido|quero encomendar)\b/.test(n)) {
    r=result('pedido','Você pode pedir pelo nosso cardápio digital (SAIPOS), com entrega ou retirada, ou pelo iFood e 99Food. Consulte os valores e as taxas diretamente no canal escolhido.',deliveryButtons());
  } else if (/\b(promocao|promocoes|promo|cupom|desconto|oferta)\b/.test(n)) {
    r=result('promocao','Para conferir os combos e os valores disponíveis, veja nosso cardápio digital pelo botão abaixo.',[MENU]);
  } else if (/\b(cardapio|menu|a la carte|ala carte|o que tem|quais pratos|ver os pratos)\b/.test(n) || /^(tem )?(sushi|sushis|comida japonesa)$/.test(n)) {
    r=result('cardapio','Temos rodízio, sushi à la carte, entradas, temakis, combos, poke, pratos quentes e muito mais. No botão abaixo você encontra o cardápio digital.',[MENU]);
  } else if (questions.test(n) && s.last_topic) {
    const p=catalog.find((x)=>x.id===s.last_topic);
    r=p ? result('item_cardapio',itemReply(p),[MENU],{topic:p.id}) : null;
  }
  if (!r) {
    const found=lookup(n);
    if (found.length===1) {
      const p=found[0]; r=result('item_cardapio',itemReply(p),[MENU],{topic:p.id});
    } else if (found.length>1) {
      r=result('item_opcoes',`Encontrei estas opções:\n${found.map((p)=>`${p.nome} (${p.categoria}) — ${p.valor}`).join('\n')}\nQual delas você procura?`,[MENU],{topic:'itens'});
    }
  }
  if (!r) {
    const list = [
      ['combos','combos'],['combo','combo'],['temakis','temakis'],['temaki','temaki'],
      ['yakissoba','yakissoba'],['yakimeshi','yakimeshi'],['tepan','tepan'],
      ['pratos quentes','pratos quentes'],['sashimis','sashimi'],['sashimi','sashimi'],
      ['oniguiri','oniguiri'],['poke','poke'],['sobremesas','sobremesa'],
      ['sobremesa','sobremesa'],['entradas','entradas'],['bebidas','bebidas'],
      ['drinks','drink'],['joy sem arroz','joy sem arroz'],['mega hot roll','mega hot roll'],['hot roll','hot roll']
    ];
    const cat=list.find(([alias])=>words(n).includes(` ${alias} `));
    if (cat) {
      const matches=group(cat[1]);
      const summary=matches.slice(0,5).map(compact).join('\n');
      r=matches.length?result('categoria_cardapio',
        `Estas são algumas opções de ${cat[0]}:\n${summary}${matches.length>5?'\nTemos outras opções no cardápio digital.':''}`,
        [MENU],{topic:cat[1]}):fallback('categoria_indisponivel');
    }
  }
  if (!r) {
    if (event==='instagram comment') {
      r=praise(n)?result('elogio','Que alegria ler isso! Obrigado pelo carinho. 🍣', /\b(ja fui|visitei|comi ai)\b/.test(n)?REVIEW():[]):result('comentario','Obrigado por passar aqui! Se quiser saber algo sobre o Japa, pode me mandar uma mensagem.');
    } else if (praise(n)) {
      r=result('elogio',L.google_avaliacao
        ? 'Que alegria saber que você gostou! Agradecemos o carinho. Se já nos visitou, sua avaliação sincera no Google é muito bem-vinda.'
        : 'Que alegria saber que você gostou! Agradecemos o carinho e esperamos receber você novamente.',REVIEW());
    } else if (/^(oi+e?|ola|opa|e ai|eai|bom dia|boa tarde|boa noite|salve|hey|hello)( (oi+|ola|bom dia|boa tarde|boa noite))?( (tudo bem|tudo bom|tudo certo|td bem|como vai|como esta|beleza|blz|pessoal|gente|japa))*$/.test(n)) {
      r=result('saudacao',`${withName(nome,`Oiê, ${nome}!`,'Oiê!')} Seja muito bem-vindo(a) ao Japa Sushi Lounge 🍣✨\nTô aqui pra te ajudar rapidinho. Me conta: quer saber do rodízio, cardápio, delivery, reserva ou como chegar?`,[MENU,WA]);
    } else if (/^(obrigado|obrigada|obg|valeu|vlw|tchau|ate mais|show)[ !.]*$/.test(n)) {
      r=result('agradecimento',`Nós que agradecemos${nome?`, ${nome}`:''}! Quando precisar, é só chamar. 🍣`);
    } else if (event==='story mention') {
      // Menção com texto que não é pergunta objetiva: agradecimento, nunca "não tenho essa informação".
      r=result('story_mention','Obrigado por lembrar da gente! 🍣');
    } else if (!n) {
      r=event==='story mention' ? result('story_mention','Obrigado por lembrar da gente! 🍣') : result('sem_mensagem','Oi! Me conta o que você gostaria de saber sobre o Japa.');
    } else if (/\b(proprietari|influenciador|rafa)\b/.test(n)) {
      r=result('assunto_interno','Posso ajudar com nosso cardápio, pedidos e reservas.',[MENU,WA]);
    } else {
      r=fallback('outro','Quero te ajudar direitinho, mas não tenho essa informação confirmada por aqui. Nossa equipe pode esclarecer no WhatsApp.');
    }
  }
  if (eventId) s.last_event_id=eventId;
  s.last_intent=r.intent;
  if (r.topic) s.last_topic=r.topic;
  s.last_bot_reply=r.reply.slice(0,400);
  return {...r,state:s,channel,event};
}

// Segurança: nunca transformar mensagem do cliente em URL, nunca soltar URL em texto.
const URL_RE=/\b(?:https?:\/\/|www\.|wa\.me\/)[^\s)]+/ig;
export function sanitizeReply(s) {
  return String(s||'').replace(URL_RE,'').replace(/\n{3,}/g,'\n\n').trim().slice(0,2000);
}
export function allowedCtas(ctas) {
  const approved=[...Object.values(L), ...Object.values(marketplaceStatus())]
    .filter((u)=>typeof u==='string' && /^https:\/\//.test(u));
  return (ctas||[]).filter((c)=>approved.includes(c.url) && c.type==='url')
    .slice(0,3).map((c)=>({type:'url',label:String(c.label).slice(0,20),url:c.url}));
}
const aiEligible = new Set(['saudacao','agradecimento','story_mention']);
export async function humanize(r,fetchImpl=globalThis.fetch) {
  if (!aiEligible.has(r.intent) || !process.env.OPENAI_API_KEY || !r.reply) return r;
  const controller=new AbortController();
  // O ManyChat encerra a requisição externa em ~10 s: limita a espera da OpenAI a 6 s mesmo se a variável for maior.
  const ms=Math.min(Math.max(Number(process.env.OPENAI_TIMEOUT_MS)||5000,1000),6000);
  const timeout=setTimeout(()=>controller.abort(),ms);
  try {
    const http=await fetchImpl('https://api.openai.com/v1/responses',{
      method:'POST',signal:controller.signal,
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},
      body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4o-mini',store:false,
        instructions:persona,input:'Responda somente em json no formato {"reply":"texto"}. Dados: '+JSON.stringify({intent:r.intent,resposta_autorizada:r.reply}),
        text:{format:{type:'json_object'}},max_output_tokens:160})
    });
    if (!http.ok) {let m='';try{m=String((await http.json())?.error?.message||'').slice(0,160);}catch{} console.warn('OPENAI_REPLY_ERROR',http.status,m);return r;}
    const data=await http.json();
    const output=(data.output||[]).flatMap((o)=>o.content||[])
      .filter((c)=>c.type==='output_text').map((c)=>c.text).join('');
    const candidate=JSON.parse(output).reply;
    // Somente mensagens SOCIAIS, sem alegações comerciais; nunca usar novas URLs ou números.
    // Diagnóstico sem conteúdo do cliente: só o motivo do descarte (filtros inalterados).
    const reason = typeof candidate!=='string' || !candidate.trim() ? 'vazio' :
      candidate.length>260 ? 'longo' :
      /(?:https?:\/\/|www\.|wa\.me|\b[\w-]+\.(?:com(?:\.br)?|net(?:\.br)?|org(?:\.br)?|br|app|io|site)\b)/i.test(candidate) ? 'link' :
      /(?:\d|pix|preco|valor|horario|reserva confirmada|promocao|cupom|proprietari|dono|rafa|influenciador)/i.test(norm(candidate)) ? 'termo_bloqueado' : '';
    if (reason) {console.info('OPENAI_REPLY_FILTERED',r.intent,reason);return r;}
    console.info('OPENAI_REPLY_OK',r.intent);
    return {...r,reply:candidate.trim()};
  } catch(e) {console.warn('OPENAI_REPLY_ERROR',e.name);return r;}
  finally {clearTimeout(timeout);}
}

// Divide por parágrafos/frases para não cortar nomes de pratos em mensagens do Instagram.
function splitReply(text,maxChars=780) {
  const parts=[];
  let rest=String(text||'').trim();
  while (rest.length>maxChars) {
    const window=rest.slice(0,maxChars+1);
    const para=window.lastIndexOf('\n\n');
    const line=window.lastIndexOf('\n');
    const sentence=window.lastIndexOf('. ');
    const space=window.lastIndexOf(' ');
    const boundary=para>=maxChars*0.35 ? para+2 :
      line>=maxChars*0.35 ? line+1 :
      sentence>=maxChars*0.35 ? sentence+2 :
      space>=maxChars*0.35 ? space+1 : maxChars;
    parts.push(rest.slice(0,boundary).trim());
    rest=rest.slice(boundary).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

// Resposta pública neutra para comentários: detalhes, preços e botões seguem só no Direct.
export function publicReply(intent) {
  if (intent==='elogio') return 'Obrigado pelo carinho! 🍣';
  if (intent==='comentario') return '';
  if (intent==='reclamacao') return 'Sentimos muito. Te chamamos no Direct para entender e resolver.';
  return 'Te respondemos no Direct! 📩';
}
export function standardPayload(r) {
  const reply=sanitizeReply(r.reply),cs=allowedCtas(r.ctas);
  const parts = splitReply(reply,780);
  const payload={ok:true,app_version:VERSION,channel:r.channel,reply,
    reply_part_1:parts[0]||'',reply_part_2:parts[1]||'',reply_part_3:parts[2]||'',
    intent:r.intent,topic:r.topic||'',needs_human:!!r.needs_human,next_action:r.next_action,
    cta_count:cs.length,ctas:cs,ai_state:encodeState(r.state),
    avaliacao_pendente:!!r.state.rating_pending,
    avaliacao_feedback_pendente:!!r.state.feedback_pending,
    avaliacao_nota:r.nota??null,
    avaliacao_feedback:r.feedback??'',
    public_reply:r.event==='instagram comment'?publicReply(r.intent):'',
    ...Object.fromEntries([0,1,2].flatMap((i)=>[[`cta_${i+1}_type`,cs[i]?.type||''],
      [`cta_${i+1}_label`,cs[i]?.label||''],[`cta_${i+1}_url`,cs[i]?.url||'']]))};
  return payload;
}
export function dynamicPayload(r) {
  const p=standardPayload(r); const text=p.reply;
  // Dynamic Block v2: bolha com botões sempre curta. Para textos longos, usa bolhas anteriores separadas.
  const messages=[];
  const chunks=splitReply(text,780);
  if (chunks.length===0) return {version:'v2',content:{type:r.channel,messages:[],actions:[],quick_replies:[]}};
  chunks.forEach((chunk,i)=> {
    if (i===chunks.length-1 && (chunk.length>550 || p.cta_count>0 && chunk.length>480)) {
      messages.push({type:'text',text:chunk});
      messages.push({type:'text',text:'É só tocar no botão abaixo:',buttons:p.ctas.map((c)=>({type:'url',caption:c.label,url:c.url}))});
    } else {
      const m={type:'text',text:chunk};
      if (i===chunks.length-1 && p.cta_count) m.buttons=p.ctas.map((c)=>({type:'url',caption:c.label,url:c.url}));
      messages.push(m);
    }
  });
  const actions=[{action:'set_field_value',field_name:'ai_state',value:p.ai_state}];
  if (r.nota) actions.push({action:'set_field_value',field_name:'avaliacao_nota',value:r.nota});
  if (r.feedback) actions.push({action:'set_field_value',field_name:'avaliacao_feedback',value:r.feedback.slice(0,800)});
  if (r.intent==='pedido') actions.push({action:'add_tag',tag_name:'interesse_pedido'});
  if (r.intent==='cardapio'||r.intent==='categoria_cardapio'||r.intent==='rodizio_composicao'||r.intent==='rodizio_preferencias') actions.push({action:'add_tag',tag_name:'interesse_cardapio'});
  if (r.intent==='reserva') actions.push({action:'add_tag',tag_name:'interesse_reserva'});
  if (r.needs_human) actions.push({action:'add_tag',tag_name:'precisa_humano'});
  return {version:'v2',content:{type:r.channel,messages:messages.slice(0,10),actions:actions.slice(0,5),quick_replies:[]}};
}
