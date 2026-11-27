import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { persona } from './persona.js';
import * as V from './variations.js';

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
const SITE = { type: 'url', label: 'Conhecer o site', url: L.site };
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
// Avaliação: link oficial do Japa (japasushi.netlify.app). O link do Google fica só como reserva em knowledge.json.
const REVIEW = () => L.avaliacao ? [{type:'url',label:'Avaliar o Japa',url:L.avaliacao}] : [];
const DAY_MS = 86400000;
const REVIEW_INTERVAL_MS = (knowledge.avaliacao?.intervalo_minimo_convite_dias ?? 30) * DAY_MS;
const stateBase = () => ({last_intent:'',last_topic:'',last_bot_reply:'',last_public_reply:'',rating_pending:false,feedback_pending:false,last_event_id:'',offer:'',reserva:null,
  turns:0,used_name:false,since_emoji:2,site_sent:false,review_invite_at:0,story_at:0,repost_asked:false,offer_turn:-9});
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
  const cf = c.custom_fields && typeof c.custom_fields === 'object' ? c.custom_fields : {};
  return {
    ...input,
    subscriber_id: input.subscriber_id || c.id || '',
    first_name: input.first_name || c.first_name || c.name || c.ig_username || '',
    message: input.message ?? c.last_input_text ?? '',
    ai_state: input.ai_state ?? cf.ai_state ?? '',
    atendimento_humano: input.atendimento_humano ?? cf.atendimento_humano,
    atendimento_humano_desde: input.atendimento_humano_desde ?? cf.atendimento_humano_desde,
    message_type: input.message_type ?? cf.message_type,
    event_type: input.event_type ?? cf.event_type,
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
function lookup(text) {
  const n = norm(text), padded = ` ${n} `;
  if (!n || n.length < 5) return [];
  const hits = [];
  for (const p of catalog) {
    const full = norm(p.nome), stem = full.replace(/\s+(?:\d+\s+)?(?:unid|unidades|laminas|g|ml)\b.*/, '').trim();
    if (full.length>=5 && padded.includes(` ${full} `)) {hits.push({p,score:100+full.length});continue;}
    if (stem.length>=9 && padded.includes(` ${stem} `)) hits.push({p,score:stem.length});
  }
  if (!hits.length) return [];
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
    'hot roll':['Mega Hot Roll','Sushi à La Carte']
  };
  const cats = aliases[category] ?? [category];
  return catalog.filter((p)=>cats.includes(p.categoria) && (!['yakissoba','yakimeshi','tepan'].includes(category) || norm(p.nome).startsWith(category)));
};
const ratingValue = (raw) => {
  const m = norm(raw).match(/^(?:(?:nota|dou|avalio com) )?([1-5])(?: (?:estrelas|estrela|de 5))?$/);
  return m ? Number(m[1]) : null;
};
const forbiddenSubject = (n) => /\b(dono|proprietari\w*|assumi|trocou de dono|rafa|influenciador\w*|influencer\w*)\b/.test(n);
const needsCare = (n) => /\b(alergia|alergico|gluten|contaminacao cruzada|intolerancia|vegano|celiaco)\b/.test(n);
const complaint = (n) => /\b(reclamacao|reclamar|estorno|cancelar|reembolso|errado|faltou|atrasad\w*|demorou|frio|estragado|problema)\b/.test(n) && !/sem problema|deu tudo certo/.test(n);
const jobs = (n) => /\b(vaga|vagas|emprego|curriculo|trabalhar|contratacao|rh|selecao|entrevista|contratando|freelance|freelancer|procuro trabalho)\b/.test(n) ||
  (/\b(entregador|entregadores|sushiman|sushiwoman|cozinheiro|cozinheira|garcom|garcon|auxiliar de cozinha)\b/.test(n) &&
    /\b(precisa|precisando|preciso|procuro|vaga|disponivel|contrata|contratar|trabalho|trabalhar|fixo|oportunidade|sou)\b/.test(n));
const partnership = (n) => /\b(parceria|permuta|divulgacao|agencia|trafego|consultoria|representante|proposta comercial|publi)\b/.test(n);
const praise = (n) => /\b(amei|adorei|maravilhoso|maravilhosa|perfeito|delicioso|sensacional|parabens|top|elogiar|elogio)\b/.test(n);
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
// ---------------------------------------------------------------------------
// Horário e rodízio por dia da semana (fuso de Barretos). Os dados vêm de data/knowledge.json.
// ---------------------------------------------------------------------------
const H = knowledge.horarios;
const R = knowledge.rodizio;
const DAY_NAMES = ['domingo','segunda','terça','quarta','quinta','sexta','sábado'];
const dayWith = (dow) => `${[0,6].includes(dow) ? 'no' : 'na'} ${DAY_NAMES[dow]}`;
const isWeekend = (dow) => [5,6,0].includes(dow);           // sexta a domingo
const dinnerOf = (dow) => isWeekend(dow) ? H.jantar_rodizio.sex_a_dom : H.jantar_rodizio.seg_a_qui;
const priceTier = (dow) => isWeekend(dow) ? R.sex_a_dom_feriados : R.seg_a_qui;
const isClosedDay = (dow) => dow === H.dia_fechado_numero;
// ctx.now (ISO) existe só para testes e simulações; o webhook nunca o repassa.
export function nowBR(iso) {
  let d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) d = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {timeZone:'America/Sao_Paulo',weekday:'short',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const dow = {Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[get('weekday')];
  const hh = Number(get('hour')) % 24;
  return {dow, min: hh*60 + Number(get('minute'))};
}
// Próximo dia aberto depois de `dow` (pula a terça) e como falar dele.
function nextOpenDay(dow) {
  let next = (dow + 1) % 7, label = 'amanhã';
  if (isClosedDay(next)) { next = (next + 1) % 7; label = DAY_NAMES[next]; }
  return {dow: next, label};
}
const hoursLine = (dow) => {
  const j = dinnerOf(dow), a = H.almoco_delivery;
  return `almoço (somente delivery) das ${a.abre} às ${a.fecha} e jantar completo das ${j.abre} às ${j.fecha}`;
};
function dayFromText(n, now) {
  if (/\b(fim de semana|final de semana|fds|feriado|feriados)\b/.test(n)) return {tier:'fim', label: /feriado/.test(n) ? 'em feriados' : 'no fim de semana'};
  if (/\bsegunda a quinta\b/.test(n)) return {tier:'semana', label:'de segunda a quinta'};
  if (/\bsexta a domingo\b/.test(n)) return {tier:'fim', label:'de sexta a domingo'};
  if (/\bhoje\b|\bagora\b|\besta noite\b/.test(n)) return {dow: now.dow, label:'hoje', today:true};
  if (/\bamanha\b/.test(n)) return {dow: (now.dow + 1) % 7, label:'amanhã'};
  for (const [w, d] of [['domingo',0],['segunda',1],['terca',2],['quarta',3],['quinta',4],['sexta',5],['sabado',6]])
    if (new RegExp(`\\b${w}\\b`).test(n)) return {dow: d, label: dayWith(d)};
  return null;
}
function statusNow(now) {
  const {dow, min} = now;
  if (isClosedDay(dow)) return {state:'terca'};
  const j = dinnerOf(dow), a = H.almoco_delivery;
  if (min >= j.abre_min && min < j.fecha_min) return {state:'jantar', j};
  if (min >= a.abre_min && min < a.fecha_min) return {state:'almoco', j};
  if (min < a.abre_min) return {state:'antes_almoco', j};
  if (min < j.abre_min) return {state:'entre', j};
  return {state:'encerrado', j};
}
function horarioReply(n, now, nome, canOffer = false) {
  const day = dayFromText(n, now);
  const askNow = /\b(hoje|agora|aberto|aberta|abertos|abertas|fechado|fechada|fechados|funcionando|funciona|funcionam|abre|abrem|fecha|fecham|que horas|folga)\b/.test(n);
  const askHours = /\b(que horas|qual o horario|a que horas|horario de hoje|horario hoje)\b/.test(n) && !/\b(aberto|aberta|abertos|abertas|fechado|fechada|fechados|agora)\b/.test(n);
  const who = nome ? `, ${nome}` : '';
  const ask = canOffer ? ' Quer que eu te ajude a reservar sua mesa?' : '';
  const off = canOffer ? 'reserva' : '';
  const a0 = H.almoco_delivery, sq0 = H.jantar_rodizio.seg_a_qui, sd0 = H.jantar_rodizio.sex_a_dom;
  const full = {text:`A gente funciona de segunda a domingo, menos na terça, que é o nosso dia de folga.\n\nAlmoço (somente delivery): das ${a0.abre} às ${a0.fecha}.\nJantar completo (salão, rodízio e delivery): ${sq0.dias_texto}, das ${sq0.abre} às ${sq0.fecha}; ${sd0.dias_texto}, das ${sd0.abre} às ${sd0.fecha}.\n\nEm feriados, confirme com a equipe.`, offer:''};
  if (day?.tier) return full;
  if (day && day.dow !== undefined && !day.today) {
    if (isClosedDay(day.dow)) {
      const nx = nextOpenDay(day.dow);
      return {text:`${day.label === 'amanhã' ? 'Amanhã' : `Na ${DAY_NAMES[day.dow]}`} é o dia de folga do Japa. Voltamos ${dayWith(nx.dow)}, com ${hoursLine(nx.dow)}.`, offer:''};
    }
    return {text:`${day.label === 'amanhã' ? 'Amanhã' : day.label.replace(/^./, (c) => c.toUpperCase())} a gente atende com ${hoursLine(day.dow)}.${ask}`, offer:off};
  }
  if (askNow || day?.today) {
    const st = statusNow(now);
    const nx = nextOpenDay(now.dow);
    if (st.state === 'terca') return {text:`${nome ? `${nome}, hoje` : 'Hoje'} é terça, dia de folga do Japa. Amanhã a gente volta com ${hoursLine(nx.dow)}.`, offer:''};
    if (askHours) return {text:`Hoje a gente tem almoço, só delivery, das ${a0.abre} às ${a0.fecha}, e jantar completo das ${st.j.abre} às ${st.j.fecha}.${ask}`, offer:off};
    if (st.state === 'jantar') return {text:`Estamos abertos${who}! Hoje o jantar completo vai até ${st.j.fecha}.${ask}`, offer:off};
    if (st.state === 'almoco') return {text:`Agora estamos no almoço, somente delivery, até ${a0.fecha}. O jantar completo, com salão e rodízio, abre às ${st.j.abre}.${ask}`, offer:off};
    if (st.state === 'antes_almoco') return {text:`Hoje a gente começa com o almoço (somente delivery) às ${a0.abre}, e o jantar completo abre às ${st.j.abre}.${ask}`, offer:off};
    if (st.state === 'entre') return {text:`Hoje o jantar completo abre às ${st.j.abre}, com salão, rodízio e delivery${who}.${ask}`, offer:off};
    const tomorrow = nx.label === 'amanhã' ? 'Amanhã' : `Amanhã é terça, nosso dia de folga. Voltamos na ${nx.label}`;
    return {text:`Por hoje já encerramos${who}. ${tomorrow}${nx.label === 'amanhã' ? ' a gente volta' : ''} com ${hoursLine(nx.dow)}.`, offer:''};
  }
  return full;
}
const kids = () => `Crianças de ${R.infantil_de} a ${R.infantil_ate} anos pagam ${R.infantil_5_a_11}.`;
// Resposta curta: preço do dia certo (hoje, se o cliente não disser o dia), bebidas e sobremesas à parte.
// Sem repetir horários e sem despejar todas as faixas de preço.
function rodizioPrecosReply(n, now, canOffer = false) {
  const line = (t) => `Individual ${t.individual} · Casal ${t.casal}`;
  const tail = ' Bebidas e sobremesas ficam à parte.';
  const ask = canOffer ? ' Quer reservar sua mesa?' : '';
  const day = dayFromText(n, now) || {dow: now.dow, today: true};
  if (day.dow !== undefined && isClosedDay(day.dow)) {
    const nx = nextOpenDay(day.dow), t = priceTier(nx.dow);
    return `${day.today ? 'Hoje é terça, dia de folga do Japa' : 'Na terça o Japa descansa'}. O rodízio volta ${day.today ? 'amanhã' : dayWith(nx.dow)}: ${line(t)}.${tail}`;
  }
  const t = day.tier ? (day.tier === 'fim' ? R.sex_a_dom_feriados : R.seg_a_qui) : priceTier(day.dow);
  const when = day.today ? `Hoje (${DAY_NAMES[day.dow]})` : day.label.replace(/^./, (c) => c.toUpperCase());
  return `${when} o rodízio é: ${line(t)}.${tail}${ask}`;
}
// Resposta curta (uma bolha): resumo do rodízio sem listar item por item; o detalhe fica sob pedido.
const rodizioResumo = (nome='') =>
  `${nome ? `${nome}, no rodízio` : 'No rodízio'} você tem sushis e sashimis, niguiris, hossomakis, uramakis, joys, hot rolls, entradas e pratos quentes como yakissoba e missoshirô. 🍣\n\n`+
  `Individual ${R.seg_a_qui.individual} (seg a qui) ou ${R.sex_a_dom_feriados.individual} (sex a dom e feriados) · Casal ${R.seg_a_qui.casal} ou ${R.sex_a_dom_feriados.casal} · crianças de ${R.infantil_de} a ${R.infantil_ate} anos ${R.infantil_5_a_11}. Bebidas e sobremesas à parte.\n\n`+
  `Quer ver as opções fritas, grelhadas ou sem arroz? É só me pedir.`;
const ageFrom = (n) => {
  if (/\b(bebe|meses|mes)\b/.test(n)) return 0;
  const m = n.match(/\b(\d{1,2}) anos?\b/);
  return m ? Number(m[1]) : null;
};
function infantilReply(n) {
  const age = ageFrom(n);
  const extra = ' Bebidas e sobremesas ficam à parte.';
  if (age !== null && age >= R.infantil_de && age <= R.infantil_ate) return {text:`${kids()}${extra}`, human:false};
  if (age !== null) return {text:`${age < R.infantil_de ? `Para crianças menores de ${R.infantil_de} anos` : `A partir de ${R.infantil_ate + 1} anos`} eu prefiro confirmar direitinho com a equipe, para não te passar nada errado. Toque no botão e fale com a gente.`, human:true};
  return {text:`${kids()} Para menores de ${R.infantil_de} anos, a equipe confirma pelo WhatsApp.${extra}`, human:false};
}

// ---------------------------------------------------------------------------
// Reserva guiada: uma pergunta por vez; no fim, botão do WhatsApp com a mensagem pronta.
// O bot não confirma mesa nem cobra sinal.
// ---------------------------------------------------------------------------
const NUM_WORDS = {um:1,uma:1,dois:2,duas:2,tres:3,quatro:4,cinco:5,seis:6,sete:7,oito:8,nove:9,dez:10,onze:11,doze:12,quinze:15,vinte:20};
function parsePessoas(n, strict) {
  if (/\bcasal\b/.test(n)) return 2;
  let m = n.match(/\b(\d{1,2}) (?:pessoas?|lugares|convidados?|pax)\b/) ||
    n.match(/\b(?:para|pra|somos|seremos|mesa de|mesa para|mesa pra) (\d{1,2})\b(?! ?(?:h|horas?)\b)/);
  if (!m && strict) m = n.match(/^(?:somos |seremos |vamos ser )?(\d{1,2})$/);
  if (m) { const v = Number(m[1]); return v >= 1 && v <= 80 ? v : null; }
  const w = n.match(new RegExp(`\\b(?:para |pra |somos |seremos )?(${Object.keys(NUM_WORDS).join('|')})(?: pessoas?)?$`)) ||
    (strict ? null : n.match(new RegExp(`\\b(${Object.keys(NUM_WORDS).join('|')}) pessoas?\\b`)));
  return w ? NUM_WORDS[w[1]] : null;
}
function parseDia(n, raw, now) {
  const d = dayFromText(n, now);
  if (d && d.dow !== undefined) return {texto: d.today ? 'hoje' : d.label === 'amanhã' ? 'amanhã' : DAY_NAMES[d.dow], dow: d.dow};
  const sl = String(raw).match(/\b(\d{1,2})\s*\/\s*(\d{1,2})\b/);
  if (sl && Number(sl[1]) <= 31 && Number(sl[2]) <= 12) return {texto:`${sl[1]}/${sl[2]}`};
  const dm = n.match(/\bdia (\d{1,2})\b/);
  if (dm && Number(dm[1]) <= 31) return {texto:`dia ${dm[1]}`};
  return null;
}
function parseHora(raw, strict) {
  const t = String(raw).toLowerCase();
  const m = t.match(/\b(\d{1,2})\s*h(?:oras?)?\s*(\d{2})?\b/) || t.match(/\b(\d{1,2}):(\d{2})\b/) || (strict ? t.trim().match(/^(\d{1,2})$/) : null);
  if (!m) return null;
  const hh = Number(m[1]), mm = m[2] ? Number(m[2]) : 0;
  if (hh < 0 || hh > 23 || mm > 59) return null;
  return `${hh}h${mm ? String(mm).padStart(2, '0') : ''}`;
}
const cleanName = (v) => String(v ?? '').replace(/\b(?:https?:\/\/|www\.)\S*/gi, ' ').replace(/\S+\.(?:com|br|net|org|co|io|app|site)\S*/gi, ' ')
  .replace(/[^A-Za-zÀ-ÖØ-öø-ÿ' -]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30);
const waPrefill = (text) => `${L.whatsapp}?text=${encodeURIComponent(text)}`;
const reservaMissing = (res) => (res.pessoas ? (res.dia ? (res.hora ? (res.aniv && !res.aniversariante ? 'aniversariante' : null) : 'hora') : 'dia') : 'pessoas');
const RES_QUESTION = {
  pessoas: 'Quantas pessoas vão ser? (Se for casal, é só dizer "casal".)',
  dia: 'Para qual dia vocês estão pensando?',
  hora: 'E que horas pretendem chegar?',
  aniversariante: 'Quem é o aniversariante? Vou deixar a equipe avisada para receber com carinho 🎂'
};
const reservaEscape = (n, raw) => /\?/.test(raw) || raw.length > 60 ||
  /\b(cancel\w*|deixa|esquece|nao quero|outra coisa|cardapio|valor|quanto|preco|horario|endereco|onde|pagamento|vaga|curriculo|delivery|entrega)\b/.test(n);
function reservaNext(res, nome, now, intro = '') {
  const missing = reservaMissing(res);
  if (missing) return result('reserva', `${intro}${RES_QUESTION[missing]}`.trim(), [], {topic:'reserva', reserva:res});
  const nm = nome ? ` Meu nome é ${nome}.` : '';
  const aniv = res.aniv ? ` É aniversário de ${res.aniversariante}.` : '';
  const msg = `Olá! Quero reservar para ${res.pessoas} ${res.pessoas === 1 ? 'pessoa' : 'pessoas'}, ${res.dia} às ${res.hora}.${nm}${aniv}`;
  const cake = res.aniv ? ' Sobre o bolo de aniversário, a equipe combina as condições com você por lá.' : '';
  return result('reserva_pronta',
    `Perfeito${nome ? `, ${nome}` : ''}! Anotei: ${res.pessoas} ${res.pessoas === 1 ? 'pessoa' : 'pessoas'}, ${res.dia} às ${res.hora}.${cake} ${knowledge.reserva.sinal_texto} É só tocar no botão para falar com a equipe, que a mensagem já vai pronta 👇`,
    [{type:'url', label:'Reservar no WhatsApp', url: waPrefill(msg)}], {needs_human:true, next_action:'whatsapp', topic:'reserva', reserva:null});
}
function reservaStart(n, raw, nome, now, aniv) {
  const res = {aniv: !!aniv};
  const p = parsePessoas(n, false); if (p) res.pessoas = p;
  const d = parseDia(n, raw, now); if (d) res.dia = d.texto;
  const h = parseHora(raw, false); if (h) res.hora = h;
  const intro = aniv
    ? `${withName(nome, `Que lindo, ${nome}! 🎂`, 'Que lindo! 🎂')} No Japa, quem reúne pelo menos ${knowledge.aniversario.minimo_convidados} convidados e faz o rodízio ganha um bolo do Palácio das Delícias, com 3 sabores à escolha e receita para até 15 pessoas. As condições a equipe combina com você. `
    : `${withName(nome, `Oba, ${nome}! Vamos organizar sua reserva.`, 'Vamos organizar sua reserva!')} `;
  return reservaNext(res, nome, now, intro);
}
function reservaStep(s, n, raw, nome, now) {
  const res = {...s.reserva};
  const field = reservaMissing(res);
  let ok = false, note = '';
  if (field === 'pessoas') { const v = parsePessoas(n, true); if (v) { res.pessoas = v; ok = true; } }
  else if (field === 'dia') {
    const d = parseDia(n, raw, now);
    if (d && d.dow !== undefined && isClosedDay(d.dow)) note = 'Às terças a gente descansa 😊 Funcionamos de quarta a segunda; que dia fica bom para vocês? ';
    else if (d) { res.dia = d.texto; ok = true; }
  } else if (field === 'hora') { const v = parseHora(raw, true); if (v) { res.hora = v; ok = true; } }
  else if (field === 'aniversariante') { const v = cleanName(raw); if (v.length >= 2) { res.aniversariante = v; ok = true; } }
  if (ok) { res.fails = 0; return reservaNext(res, nome, now); }
  res.fails = (res.fails || 0) + (note ? 0 : 1);
  if (res.fails >= 2) {
    const msg = `Olá! Quero fazer uma reserva${res.pessoas ? ` para ${res.pessoas} pessoas` : ''}${res.dia ? `, ${res.dia}` : ''}${res.hora ? ` às ${res.hora}` : ''}.${nome ? ` Meu nome é ${nome}.` : ''}`;
    return result('reserva_pronta', 'Sem problema! Toque no botão e conte para a equipe, que eles finalizam sua reserva por lá.',
      [{type:'url', label:'Reservar no WhatsApp', url: waPrefill(msg)}], {needs_human:true, next_action:'whatsapp', topic:'reserva', reserva:null});
  }
  return result('reserva', `${note || 'Não consegui entender direitinho. '}${RES_QUESTION[field]}`, [], {topic:'reserva', reserva:res});
}
const affirm = (n) => /^(sim|quero|quero sim|pode|pode sim|pode ser|claro|bora|vamos|isso|com certeza|por favor|ok|quero reservar|me ajuda|aham)[ !.]*$/.test(n);


// ---------------------------------------------------------------------------
// v1.5.0 — mídia, comentários públicos, experiência real, site e avaliação
// ---------------------------------------------------------------------------
const typeKind = (t) => {
  t = norm(t);
  if (!t) return null;
  if (/\b(audio|voice|voz|ptt)\b/.test(t)) return 'audio';
  if (/\b(image|photo|foto|imagem|picture)\b/.test(t)) return 'image';
  if (/\b(video|clip)\b/.test(t)) return 'video';
  if (/\b(file|document|documento|arquivo|pdf)\b/.test(t)) return 'file';
  if (/\b(sticker|figurinha)\b/.test(t)) return 'sticker';
  if (/\b(gif|animated)\b/.test(t)) return 'gif';
  if (/\b(like|thumbs|curtida|heart)\b/.test(t)) return 'like';
  if (/\b(reaction|reacao|react)\b/.test(t)) return 'reaction';
  if (/\b(story share|post share|share|shared|compartilh\w*|reel|media share)\b/.test(t)) return 'share';
  if (/\b(unavailable|indisponivel|expired|expirou)\b/.test(t)) return 'story_unavailable';
  if (/\b(attachment|anexo|media|midia)\b/.test(t)) return 'attachment';
  return null;
};
const TYPE_EVENT_SKIP = /story mention|story reply|instagram comment|^direct$|pedido confirmado|feedback request/;
// Descobre o que o ManyChat entregou quando não há texto (anexo, áudio, reação, compartilhamento...).
// Se a pessoa escreveu texto de verdade, o texto manda (exceto áudio).
function detectMedia(input, raw, n, event) {
  const text = String(raw).trim();
  const fromType = typeKind(input.message_type) || typeKind(input.attachment_type) || typeKind(input.media_type);
  const fromEvent = TYPE_EVENT_SKIP.test(event) ? null : typeKind(event);
  const bracket = text.match(/^[\[\(<]\s*([^\]\)>]{2,40})\s*[\]\)>]$/);
  const fromBracket = bracket ? typeKind(bracket[1]) : null; // só placeholders de mídia; "(ok)" ou "[sim]" continuam sendo texto
  const longForm = /\b(sent an attachment|enviou um anexo|sent a photo|enviou uma foto|sent a video|enviou um video|sent a voice message|enviou uma mensagem de voz|sent a sticker|enviou uma figurinha|sent a gif|mensagem nao suportada|unsupported message)\b/.test(n);
  const fromLong = longForm ? (typeKind(n) || 'attachment') : null;
  let kind = null;
  const byType = fromType || fromEvent;
  if (byType === 'audio') kind = 'audio';
  else if (byType && !n) kind = byType;
  if (!kind && fromBracket) kind = fromBracket;
  if (!kind && fromLong) kind = fromLong;
  if (!kind && /\b(story|historia) (indisponivel|unavailable|expirou|expired)\b|\bnao esta mais disponivel\b|\bthis story is (no longer )?unavailable\b/.test(n)) kind = 'story_unavailable';
  if (!kind && /\b(reagiu|reacted)\b/.test(n) && n.length <= 80 && !/\?/.test(raw)) kind = 'reaction';
  if (!kind && /\b(compartilhou|shared|encaminhou|forwarded)\b.*\b(story|post|reel|publicacao|historia|sua)\b|\b(enviou|sent) (um|uma|a|an) (story|reel|post|publicacao|historia)\b/.test(n) && n.length <= 120 && !/\?/.test(raw)) kind = 'share';
  if (!kind && text && V.onlyEmoji(text)) kind = 'emoji';
  return kind;
}
const experience = (n) => /\b(ja fui|fui (ai|la|ontem|hoje|semana passada|no japa|com a|com o)|comi (ai|no japa|ontem|hoje)|pedi (ai|ontem|hoje|no japa)|jantei|almocei|amei o rodizio|adorei o rodizio|chegou (otimo|perfeito|quentinho|rapido|bem)|sempre peco|sempre venho|sempre vou|ja pedi|ja comi|ja visitei|visitei|amo (ai|o japa|voces|demais))\b/.test(n);
const dmQuestion = (n, raw) => /\?/.test(raw) || /\b(quanto|preco|valor|horario|horarios|abre|abrem|reserv\w*|cardapio|entrega|entregam|endereco|onde|qual|quais|como)\b/.test(n);
const commentQuestion = (n, raw) => /\?/.test(raw) || /\b(quanto|preco|valor|horario|horarios|abre|abrem|aberto|aberta|abertos|fecha|fecham|entrega|entregam|endereco|onde|como (faz|faco|pedir|funciona|chego)|qual|quais|tem hoje|reserva|reservar|cardapio|aceita|taxa|delivery|ifood|pix|retirada)\b/.test(n);
const spam = (n, raw) => /(https?:\/\/|www\.|bit\.ly|\b[\w-]+\.(?:com|net|org|xyz|top)\b)/i.test(raw) ||
  /\b(ganhe seguidores|seguidores|follow back|f4f|l4l|sdv|renda extra|ganhe dinheiro|trabalhe em casa|bitcoin|cripto|link na bio|me chama no zap|clique aqui|sorteio gratis|lucro garantido)\b/.test(n);
const wantsFood = (n) => /\b(quero|queroo*|me leva|me levem|me leve|que vontade|to com fome|estou com fome|partiu|bora|vamos la|preciso (disso|desse)|me manda|manda ai)\b/.test(n) && n.split(' ').length <= 8;
const praiseWide = (n) => /\b(delicia|delicioso|deliciosa|maravilhos\w*|lindo|linda|lindos|top|show|perfeito|perfeita|sensacional|amei|adorei|gostoso|gostosa|incrivel|uau|wow|parabens|capricho|espetacular|demais|arrasou)\b/.test(n);
const promoQ = (n) => /\b(promocao|promocoes|promo|cupom|desconto|oferta|sorteio|brinde|cashback|fidelidade|indique e ganhe)\b/.test(n);
const fideQ = (n) => /\b(fidelidade|cashback|indique e ganhe|programa de (pontos|fidelidade)|cartao fidelidade|ganhar pontos)\b/.test(n);
const newCustomer = (n) => /\b(conheci (voces|o japa|agora|ontem|hoje|pelo|pela)|acabei de conhecer|primeira vez|sou novo|sou nova|novo por aqui|nova por aqui|nao conhecia|estou conhecendo|to conhecendo|descobri voces)\b/.test(n);
const PROMO_TEXT = 'Para conferir os combos e os valores disponíveis, veja nosso cardápio digital pelo botão abaixo.';
const vagaReply = (nome) => `${withName(nome,`Que bom, ${nome}! Adoramos seu`,'Que bom ter seu')} interesse em fazer parte do time! 🙌`+' As vagas e os currículos são com o nosso RH: é só tocar no botão e falar por lá.';
const SITE_INTENTS = new Set(['cardapio','como_pedir','pedido','localizacao','horario','promocao','fidelidade','cliente_novo','conhecer','comentario_quero']);
const CONHECER = [
  'Para conhecer a casa e ver como é por dentro, o nosso site é o melhor caminho. O endereço também está no botão abaixo.',
  'No site você conhece o Japa com calma, e o botão de rota mostra como chegar até a gente.',
  'Quer conhecer o Japa? O site mostra a casa, e o botão abaixo abre a rota até o endereço.',
  'O nosso site é a melhor vitrine para conhecer a casa. Para chegar, é só abrir a rota pelo botão.',
  'Dá uma olhada no site para conhecer o Japa, e use o botão de rota quando quiser vir até a gente.',
  'Para conhecer o ambiente, o caminho é o site do Japa. A rota até o endereço está no botão abaixo.',
  'Pelo site você conhece a casa por inteiro; o botão de rota leva você direto ao endereço.',
  'Vale conhecer o Japa pelo nosso site. E se quiser visitar, a rota está no botão abaixo.'
];
const humanPauseActive = (input, nowMs) => {
  const since = input.atendimento_humano_desde;
  if (since === undefined || since === null || since === '') return true;
  const t = /^\d+$/.test(String(since)) ? Number(since) * (String(since).length <= 10 ? 1000 : 1) : Date.parse(since);
  return Number.isNaN(t) ? true : nowMs - t < DAY_MS; // pausa de 24h ou até o campo ser limpo
};

export function resolve(input={}, ctx={}) {
  input = normalizeInput(input);
  const now = nowBR(ctx.now);
  const parsedNow = ctx.now ? Date.parse(ctx.now) : NaN;
  const nowMs = Number.isNaN(parsedNow) ? Date.now() : parsedNow;
  const s = getState(input);
  const nomeCliente = safeFirstName(input.first_name);
  // O nome entra no máximo em 1 de cada 2 respostas.
  const nome = nomeCliente && !s.used_name ? nomeCliente : '';
  const raw = String(input.message ?? input.text ?? '').slice(0,4000);
  const rawNorm = norm(raw);
  let n = norm(raw.replace(/rodiozio|rodizzio|rodizo|rrodizio/gi,'rodizio').replace(/temaky/gi,'temaki')
    .replace(/sachimi/gi,'sashimi').replace(/filadelfia|philadelfia/gi,'philadelphia'));
  n = expandAbbrev(n);
  const event = norm(input.event_type || 'direct');
  const isComment = event === 'instagram comment' || event === 'comment';
  const channel = norm(input.channel||'instagram')==='whatsapp' ? 'whatsapp' : 'instagram';
  const eventId = String(input.event_id || '').slice(0,128);
  const lang = isComment ? 'pt' : V.detectLang(n);
  if (isYes(input.atendimento_humano) && humanPauseActive(input, nowMs)) return {
    ...result('humano_ativo','',[],{next_action:'silencio_humano'}),state:s,channel
  };
  if (eventId && s.last_event_id===eventId) return {
    ...result('duplicado','',[],{next_action:'ignorar'}),state:s,channel
  };
  const prevReply = s.last_bot_reply;
  const first = !s.turns && !s.last_intent;
  const c = {n: nome?`, ${nome}`:'', nm: nome, sg: V.saudacaoHorario(now.min)};
  const informal = /\b(vcs?|vces|mano|mn|tmj|blz|kkk+|rsrs|pq|vlw|tbm|tb|cmg|hj)\b/.test(rawNorm);
  const seed = `${input.subscriber_id||''}|${eventId}|${rawNorm}|${s.turns}`;
  const say = (bank, o={}) => V.pick(bank, c, seed, prevReply, {informal, ...o});
  const sayPublic = (bank) => V.pick(bank, c, seed, s.last_public_reply, {});
  const canInvite = () => !!L.avaliacao && (!s.review_invite_at || nowMs - s.review_invite_at >= REVIEW_INTERVAL_MS);
  const canOffer = () => s.turns - s.offer_turn >= 3; // não repete a oferta de reserva a cada resposta
  const silent = (intent) => result(intent,'',[],{next_action:'ignorar'});
  const mediaKind = detectMedia(input, raw, n, event);

  const mediaReply = (k, ev) => {
    if (k==='audio') return result('audio', say(V.AUDIO), [WA]);
    if (k==='image') return result('midia', say(V.MIDIA), [WA]);
    if (k==='attachment') return result('midia', say(V.MIDIA,{filter:(v)=>!v.foto}), [WA]);
    if (k==='video' || k==='file') return result('midia_arquivo', say(V.VIDEO_ARQUIVO), [WA]);
    if (k==='share') return result('compartilhamento', say(V.COMPARTILHAMENTO), [MENU]);
    if (k==='emoji') return (s.last_intent || /story|historia/.test(ev)) ? silent('reacao') : result('sem_mensagem', say(V.SEM_MENSAGEM));
    return silent('reacao'); // figurinha, GIF, "like", reação e story indisponível: sem resposta
  };

  const chain = (ev) => {
    let r;
    if (s.feedback_pending) {
      s.feedback_pending=false;
      r=result('avaliacao_feedback','Obrigado por nos contar. Vamos encaminhar seu comentário à equipe. Seu relato faz diferença para melhorarmos.',
        [WA],{needs_human:true,next_action:'registrar_feedback',feedback:raw});
    } else if (s.rating_pending) {
      const note=ratingValue(raw);
      if (!note) r=result('avaliacao_nota_invalida','Me manda só uma nota de 1 a 5, por favor.');
      else {
        s.rating_pending=false;
        if (note<=3) {
          // Nota 1 a 3: feedback + equipe, sem convite de avaliação pública.
          s.feedback_pending=true;
          r=result('avaliacao_nota','Obrigado pela sinceridade. O que poderíamos melhorar? Pode me contar em uma frase.',
            [WA],{nota:note,next_action:'aguardar_feedback'});
        } else if (canInvite()) {
          r=result('avaliacao_nota',say(V.NOTA_ALTA),REVIEW(),{nota:note});
        } else {
          r=result('avaliacao_nota','Que bom saber que gostou! Obrigado por avaliar sua experiência.',[],{nota:note});
        }
      }
    } else if (mediaKind) {
      r=mediaReply(mediaKind, ev);
    } else if (ev==='story mention' && !n) {
      const recent = s.story_at && nowMs - s.story_at < DAY_MS;
      if (recent) r=silent('story_mention_ignorado'); // 1 resposta automática por pessoa a cada 24h
      else if (!s.repost_asked) { r=result('story_mention',say(V.STORY_PEDIR_REPOST)); s.repost_asked=true; }
      else r=result('story_mention_obrigado',say(V.STORY_SO_AGRADECE));
      if (!recent) s.story_at = nowMs; // a janela de 24h conta a partir da última resposta, não da última menção
    } else if (s.reserva && !reservaEscape(n,raw)) {
      r=reservaStep(s,n,raw,nomeCliente,now);
    } else if (s.last_intent==='story_mention' && /^(pode|pode sim|sim|claro|com certeza|autorizo|pode repostar|pode postar|fica a vontade|a vontade)[ !.]*$/.test(n)) {
      r=result('story_repost_ok',`Combinado${nome?`, ${nome}`:''}! 🍣 Obrigado de novo. Quando quiser voltar com a turma, é só me chamar que eu ajudo com a mesa.`);
    } else if (s.last_intent==='story_mention' && /^(nao|nao pode|prefiro que nao|melhor nao|nao precisa)[ !.]*$/.test(n)) {
      r=result('story_repost_nao',`Sem problema${nome?`, ${nome}`:''}, fica só entre nós 😊 Obrigado de novo pela marcação!`);
    } else if (lang !== 'pt' && n) {
      const kind = V.foreignKind(n), text = V.pick(V.FOREIGN[lang][kind], c, seed, prevReply);
      r = kind==='cardapio' ? result('cardapio',text,[MENU],{topic:'cardapio'}) :
        kind==='outro' ? result('outro_idioma',text,[WA],{needs_human:true,next_action:'whatsapp'}) : result(kind,text);
    } else if (jobs(n)) {
      r=result('vaga',vagaReply(nome),[RH]);
    } else if (complaint(n)) {
      r=result('reclamacao',say(V.RECLAMACAO),[WA],{needs_human:true,next_action:'whatsapp'});
    } else if (needsCare(n)) {
      r=fallback('cuidados_alimentares','Para confirmar ingredientes e cuidados no preparo com segurança, converse com nossa equipe pelo WhatsApp.');
    } else if (experience(n) && !dmQuestion(n,raw)) {
      // Experiência real: convite imparcial para avaliar (no máximo 1 a cada 30 dias); senão, só agradece.
      r=canInvite() ? result('elogio',say(V.ELOGIO_VISITA),REVIEW()) : result('elogio',say(V.ELOGIO_GERAL));
    } else if (newCustomer(n) && !dmQuestion(n,raw)) {
      r=s.site_sent ? result('cardapio',say(V.CARDAPIO),[MENU],{topic:'cardapio'}) : result('cliente_novo',say(V.CLIENTE_NOVO),[MENU],{topic:'cardapio'});
    } else if (partnership(n)) {
      r=result('parceria','Agradecemos o contato! Você pode deixar sua proposta resumida por aqui; nossa equipe analisará conforme a necessidade.');
    } else if (forbiddenSubject(n)) {
      r=result('assunto_interno','Posso te ajudar com informações sobre nosso cardápio, pedidos e reservas. Precisa de alguma dessas opções?', [MENU,WA]);
    } else if (/\b(avaliar|avaliacao|dar nota|feedback|nota pro japa)\b/.test(n)) {
      s.rating_pending=true;
      r=result('avaliacao_solicitar_nota',gradePrompt());
    } else if (/\b(atendente|humano|pessoa|falar com voces|falar com alguem|ajuda)\b/.test(n)) {
      r=fallback('humano','Você consegue falar com nossa equipe diretamente pelo botão do WhatsApp.');
    } else if (/\b(aniversario|aniversariante|niver)\b/.test(n)) {
      r=reservaStart(n,raw,nomeCliente,now,true); r.intent = r.intent==='reserva' ? 'aniversario' : r.intent;
    } else if (/\b(reserva|reservar|agendar|marcar uma mesa|quero uma mesa|mesa para|evento)\b/.test(n) || (s.offer==='reserva' && affirm(n))) {
      r=reservaStart(n,raw,nomeCliente,now,false);
    } else if (/\b(crianca|criancas|infantil|anos|ano|bebe|menor de 9|menor de 5|filho|filha|filhos|filhas)\b/.test(n) && /\b(rodizio|paga|pagam|valor|crianca|infantil|filho|filha|filhos|filhas)\b/.test(n)) {
      const k=infantilReply(n);
      r=result('rodizio_infantil',k.text,[WA],{topic:'rodizio',needs_human:k.human,next_action:k.human?'whatsapp':'responder'});
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
      const offer = canOffer();
      r=result('rodizio',rodizioPrecosReply(n,now,offer),[MENU,WA],{topic:'rodizio',offer:offer?'reserva':''});
    } else if (/\b(preco medio|valor medio|ticket medio|media de preco|gasto medio)\b/.test(n) || /\bquanto (fica|sai|gasta|gastam|gasto)\b.*\b(jantar|pessoa|casal)\b/.test(n)) {
      const closed=isClosedDay(now.dow), dow=closed?nextOpenDay(now.dow).dow:now.dow, t=priceTier(dow);
      r=result('preco_medio',`Depende do que você escolher. No rodízio, ${closed?dayWith(dow):'hoje'} o valor por pessoa é ${t.individual}; à la carte os valores variam e estão todos no cardápio. Bebidas e sobremesas ficam à parte.`,[MENU],{topic:'rodizio'});
    } else if (/\b(pix|debito|credito|cartao|dinheiro|ticket|pagamento|pago|pagar|vale refeicao|parcelamento|parcela)\b/.test(n)) {
      r=result('pagamento',`Aceitamos ${knowledge.formas_pagamento.confirmados.join(', ')}. Se precisar confirmar alguma bandeira específica ou parcelamento, nossa equipe ajuda pelo WhatsApp.`,[WA]);
    } else if (/\b(conhecer (a casa|o japa|o restaurante|o lugar|o ambiente|voces)|fotos? (do|da|de) (lugar|casa|restaurante|ambiente|salao)|ver fotos|tem fotos|como e (o )?(lugar|ambiente|restaurante|salao)|ambiente)\b/.test(n)) {
      r=result('conhecer',say(CONHECER),[MAP]);
    } else if (locationQuestion(n)) {
      r=result('localizacao',`${withName(nome,`Claro, ${nome}! 📍`,'Claro! 📍')} Estamos na ${knowledge.empresa.endereco}. É só tocar no botão abaixo para abrir a rota.`,[MAP]);
    } else if (/\b(horario|horarios|horas|abrem|abre|aberto|aberta|abertos|abertas|fecham|fecha|fechado|fechada|fechados|funcionamento|funciona|funcionam|funcionando|folga|domingo|hoje a noite)\b/.test(n)) {
      const h=horarioReply(n,now,nome,canOffer());
      r=result('horario',h.text,[WA],{offer:h.offer});
    } else if (/\b(cade (o |a )?(meu |minha )?(pedido|entrega|comida)|pedido esta (anotado|a caminho)|esta anotado|foi anotado|ja saiu|saiu o pedido|status do pedido|acompanhar (o )?pedido|onde esta (o |meu )?pedido)\b/.test(n)) {
      r=result('pedido_status',`Entendi${nome?`, ${nome}`:''}. Para conferir seu pedido com agilidade, toque no botão e mande seu nome e endereço por lá, que a equipe acompanha pelo WhatsApp.`,[WA],{needs_human:true,next_action:'whatsapp'});
    } else if (/\b(recomenda\w*|sugere|sugestao|sugestoes|mais pedid\w*|favorito|favorita|o melhor|melhor prato|indica\w*)\b/.test(n)) {
      // Nunca afirmar "mais pedido", "favorito" ou "o melhor": só o que o Michel validou em knowledge.sugestoes_validadas.
      const list=(knowledge.sugestoes_validadas||[]).map((x)=>typeof x==='string'?x:x?.nome).filter(Boolean).slice(0,3);
      r=list.length
        ? result('sugestao',`Uma sugestão da casa: ${list.join(', ')}. Os detalhes estão no cardápio, pelo botão abaixo.`,[MENU])
        : result('sugestao','Cada pessoa tem seu gosto, então o caminho mais fácil é dar uma olhada no cardápio completo. Se preferir, a equipe te ajuda a escolher pelo WhatsApp.',[MENU,WA]);
    } else if (/\b(?:i ?food|99 ?food)\b/.test(n)) {
      const platform=/\b99 ?food\b/.test(n)?'food99':'ifood';
      const label=platform==='ifood'?'iFood':'99Food';
      const hasStoreLink=!!marketplaceStatus()[platform];
      r=result('delivery',hasStoreLink
        ? `Sim, estamos no ${label}! Você pode abrir nossa loja pelo botão abaixo. Também temos pedidos diretos pelo SAIPOS, com entrega e retirada. Taxas e preços de cada plataforma aparecem no respectivo aplicativo.`
        : `Sim, estamos no ${label}! Procure Japa Sushi Lounge, em Barretos, no aplicativo. Ainda não temos o link direto da loja confirmado para este botão; se preferir, peça pelo nosso cardápio digital.`,
        marketplaceButtons(platform));
    } else if (/\b(como (faco|faz|posso|pode|que faco|se faz|funciona|eu faco)( pra| para| o| um| meu)? (pedir|pedido|encomendar|comprar|fazer (o |um |meu )?pedido)|como pedir|como e pra pedir|como funciona (o )?(pedido|delivery|a entrega|pra pedir))\b/.test(n)) {
      r=result('como_pedir',say(V.COMO_PEDIR),[MENU,WA],{topic:'cardapio'});
    } else if (/\b(entrega|entregas|entregam|entregar|entregando|delivery|retirada|retirar|buscar|taxa|frete|bairro|motoboy)\b/.test(n)) {
      r=result('delivery','Temos entrega e retirada pelo nosso cardápio digital (SAIPOS). Também atendemos pelo iFood e 99Food! No SAIPOS, a taxa aparece ao informar seu endereço. Nos aplicativos, consulte as taxas e os preços exibidos por cada plataforma.',deliveryButtons());
    } else if (/\b(pedir|pedido|comprar|encomendar|quero fazer meu pedido|quero encomendar)\b/.test(n)) {
      r=result('pedido','Você pode pedir pelo nosso cardápio digital (SAIPOS), com entrega ou retirada, ou pelo iFood e 99Food. Consulte os valores e as taxas diretamente no canal escolhido.',deliveryButtons());
    } else if (fideQ(n)) {
      r=result('fidelidade',say(V.FIDELIDADE),[]);
    } else if (/\b(promocao|promocoes|promo|cupom|desconto|oferta)\b/.test(n)) {
      r=result('promocao',PROMO_TEXT,[MENU]);
    } else if (/\b(cardapio|menu|a la carte|ala carte|o que tem|quais pratos|ver os pratos)\b/.test(n)) {
      r=result('cardapio',say(V.CARDAPIO),[MENU],{topic:'cardapio'});
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
        ['drinks','drink'],['joy sem arroz','joy sem arroz'],['hot roll','hot roll']
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
      if (praise(n)) {
        r=result('elogio',say(V.ELOGIO_GERAL)); // elogio sem experiência real: agradece, sem pedir avaliação
      } else if (/^(oi+e?|ola|opa|e ai|bom dia|boa tarde|boa noite|oie)( (tudo bem|tudo bom|td bem|tudo certo|como vai|pessoal|gente|galera))?[ !.]*$/.test(n)) {
        if (first && isClosedDay(now.dow)) r=result('saudacao',`${c.sg}${c.n}! Seja bem-vindo(a) ao Japa Sushi Lounge. Hoje é terça, nosso dia de folga, mas amanhã a gente volta com ${hoursLine(nextOpenDay(now.dow).dow)}. Posso te ajudar com rodízio, cardápio ou reserva?`,[MENU,WA]);
        else if (first) r=result('saudacao',say(V.SAUDACAO_PRIMEIRA),[MENU,WA]);
        else r=result('saudacao',say(V.SAUDACAO_DEPOIS));
      } else if (/^(obrigado|obrigada|muito obrigado|muito obrigada|brigado|obg|valeu|vlw|tchau|ate mais|show)[ !.]*$/.test(n)) {
        r=result('agradecimento',say(V.AGRADECIMENTO));
      } else if (!n) {
        r=result('sem_mensagem',say(V.SEM_MENSAGEM));
      } else if (/\b(proprietari|influenciador|rafa)\b/.test(n)) {
        r=result('assunto_interno','Posso ajudar com nosso cardápio, pedidos e reservas.',[MENU,WA]);
      } else {
        r=fallback('outro',`Quero te ajudar direitinho${nome?`, ${nome}`:''}. Toque no botão e fale com a equipe no WhatsApp, que eles te respondem por lá.`);
      }
    }
    return r;
  };

  // Matriz de comentários públicos: resposta pública curta (sem link, número, preço ou pergunta);
  // o detalhe vai por resposta privada (Direct) com botão.
  const commentFlow = () => {
    const tag = /@[\w.]{2,}/.test(raw);
    const rawNoTag = raw.replace(/@[\w.]+/g,' ').trim();
    const nNoTag = expandAbbrev(norm(rawNoTag));
    const withPublic = (r, bank, next='responder_publico_e_privado') => ({...r, public_reply: sayPublic(bank), next_action: r.next_action==='ignorar' ? 'ignorar' : next});
    const dmFromComment = () => {
      // O comentário não pode consumir nota, feedback ou reserva pendentes da conversa privada.
      const keep = {rating_pending:s.rating_pending, feedback_pending:s.feedback_pending, reserva:s.reserva};
      s.rating_pending=false; s.feedback_pending=false; s.reserva=null;
      const dm = chain('direct');
      if (dm.reserva === undefined) { s.rating_pending = keep.rating_pending || s.rating_pending; s.feedback_pending = keep.feedback_pending; s.reserva = keep.reserva; }
      return dm;
    };
    if (!raw.trim() || V.onlyEmoji(raw)) return withPublic(result('comentario_emoji','',[],{like_comment:true}), V.COM_EMOJI, 'responder_publico');
    if (spam(nNoTag, raw)) return silent('comentario_spam');
    if (partnership(n)) return result('parceria','Agradecemos o contato! Você pode deixar sua proposta resumida por aqui; nossa equipe analisará conforme a necessidade.',[],{next_action:'responder_privado'});
    if (forbiddenSubject(n)) { const dm = dmFromComment(); return {...dm, next_action: dm.reply ? 'responder_privado' : 'ignorar'}; }
    if (jobs(n)) return withPublic(result('vaga',vagaReply(nome),[RH]), V.COM_VAGA);
    if (complaint(n)) return withPublic(result('reclamacao',say(V.RECLAMACAO),[WA],{needs_human:true}), V.COM_RECLAMACAO);
    if (experience(n) && !commentQuestion(n,raw)) {
      const inv = canInvite();
      return withPublic(result('comentario_visita', inv ? say(V.ELOGIO_VISITA) : '', inv ? REVIEW() : []), V.COM_VISITA, inv ? 'responder_publico_e_privado' : 'responder_publico');
    }
    if (tag && !commentQuestion(nNoTag, rawNoTag)) return withPublic(result('comentario_marcacao','',[]), V.COM_MARCACAO, 'responder_publico');
    if (promoQ(n)) {
      // Só fala de campanha se estiver em knowledge.campanhas_ativas (hoje vazio): senão, remete a cardápio e site.
      const dm = fideQ(n) ? dmFromComment() : result('promocao',PROMO_TEXT,[MENU]);
      return withPublic(dm, V.COM_PROMO);
    }
    if (commentQuestion(n,raw)) return withPublic(dmFromComment(), V.COM_PERGUNTA);
    if (wantsFood(n)) return withPublic(result('comentario_quero',say(V.CARDAPIO),[MENU],{topic:'cardapio'}), V.COM_QUERO);
    return withPublic(result(praiseWide(n) ? 'elogio' : 'comentario','',[]), V.COM_ELOGIO, 'responder_publico');
  };

  let r;
  if (event==='pedido confirmado' || event==='feedback request') {
    r=result('avaliacao_solicitar_nota',gradePrompt());
    s.rating_pending=true; s.feedback_pending=false;
  } else if (isComment) {
    r=commentFlow();
  } else {
    r=chain(event);
  }

  // Site (links.site): no máximo 1 vez por conversa, só nos casos previstos, nunca em reclamação, vaga ou spam.
  if (r.next_action!=='ignorar' && r.reply && !r.needs_human && L.site && !s.site_sent && SITE_INTENTS.has(r.intent)) {
    const ctas=[...(r.ctas||[])]; ctas.splice(Math.min(1,ctas.length),0,SITE);
    r.ctas=ctas.slice(0,3); s.site_sent=true;
  }
  const isSilent = r.next_action==='ignorar';
  if (eventId) s.last_event_id=eventId;
  if (!isSilent) {
    if (!(isComment && r.reserva === undefined)) s.reserva = r.reserva ?? null;
    if (r.offer) s.offer_turn = s.turns;
    s.offer = r.offer || '';
    s.last_intent=r.intent;
    if (r.topic) s.last_topic=r.topic;
    if (r.reply) {
      const e = V.applyEmojiPolicy(r.reply, s.since_emoji);
      r.reply = e.text; s.since_emoji = e.hasEmoji ? 0 : s.since_emoji + 1;
      s.last_bot_reply = r.reply.slice(0,400);
      s.used_name = !!(nome && r.reply.includes(nome));
      if ((r.ctas||[]).some((x)=>x.url===L.avaliacao)) s.review_invite_at = nowMs;
    }
    if (r.public_reply) s.last_public_reply = r.public_reply.slice(0,200);
    s.turns += 1;
  }
  delete r.reserva; delete r.offer;
  // Contexto seguro para a IA (sem dado pessoal além do primeiro nome).
  r.ai_ctx = {idioma:lang, publico:isComment, saudacao_horario:c.sg, nome, ultima_resposta:isComment ? (s.last_public_reply||'') : prevReply};
  return {...r,state:s,channel};
}

// Segurança: nunca transformar mensagem do cliente em URL, nunca soltar URL em texto.
const URL_RE=/\b(?:https?:\/\/|www\.|wa\.me\/)[^\s)]+/ig;
// Telefones escritos de qualquer jeito (com ou sem DDD, +55, espaços, traços, parênteses) também saem do texto:
// contato só vai como botão.
const PHONE_RES=[
  /(?:\+?\s?55[\s.-]?)?(?:\(\s?\d{2}\s?\)|\b\d{2})[\s.-]?9?[\s.-]?\d{4}[\s.-]?\d{4}\b/g,
  /\b9[\s.-]?\d{4}[\s.-]?\d{4}\b/g,
  /\b\d{4}[\s.-]\d{4}\b/g
];
export function sanitizeReply(s) {
  let t=String(s||'').replace(URL_RE,'');
  for (const re of PHONE_RES) t=t.replace(re,'');
  return t.replace(/[ \t]{2,}/g,' ').replace(/\n{3,}/g,'\n\n').trim().slice(0,2000);
}
export function allowedCtas(ctas) {
  const approved=[...Object.values(L), ...Object.values(marketplaceStatus())]
    .filter((u)=>typeof u==='string' && /^https:\/\//.test(u));
  const prefill=`${L.whatsapp}?text=`;
  return (ctas||[]).filter((c)=>c.type==='url' && (approved.includes(c.url) || (typeof c.url==='string' && c.url.startsWith(prefill) && c.url.length<=900)))
    .slice(0,3).map((c)=>({type:'url',label:String(c.label).slice(0,20),url:c.url}));
}
// IA só redige texto SOCIAL. Preço, horário, rodízio, reserva, pagamento e promoção ficam 100% determinísticos.
const AI_PRIVATE = new Set(['saudacao','agradecimento','story_mention','story_mention_obrigado','elogio','compartilhamento','midia','sem_mensagem','como_pedir']);
const AI_PUBLIC = new Set(['comentario_marcacao','comentario_visita','comentario_quero','comentario','elogio']);
// Trechos que a versão da IA precisa manter (tom pode mudar; o conteúdo, não).
const MUST_KEEP = {
  como_pedir:[/botao/,/ifood/,/99 ?food/,/whatsapp/,/endereco/],
  story_mention:[/(repost|stories|story|compartilh)/],
  comentario_quero:[/direct/]
};
const SUPERLATIVE_RE=/(mais pedid|favorit|campea|queridinh|numero 1|o melhor|imperdivel|cinco estrelas|5 estrelas|nota maxima)/;
export async function humanize(r,fetchImpl=globalThis.fetch) {
  const ictx=r.ai_ctx||{};
  const pub=!!ictx.publico && !!r.public_reply && AI_PUBLIC.has(r.intent);
  const priv=!ictx.publico && !!r.reply && AI_PRIVATE.has(r.intent);
  if ((!pub && !priv) || !process.env.OPENAI_API_KEY) return r;
  const base=pub?r.public_reply:r.reply;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),Number(process.env.OPENAI_TIMEOUT_MS||8000));
  try {
    const http=await fetchImpl('https://api.openai.com/v1/responses',{
      method:'POST',signal:controller.signal,
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.OPENAI_API_KEY}`},
      body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4o-mini',store:false,
        instructions:persona,
        // Só contexto seguro: tipo de evento, canal, idioma, saudação do horário, última resposta e primeiro nome.
        input:'Responda somente em json no formato {"reply":"texto"}. Dados: '+JSON.stringify({intent:r.intent,
          canal:pub?'comentario_publico':'direct_privado',idioma:ictx.idioma||'pt',saudacao_horario:ictx.saudacao_horario||'',
          nome_seguro:ictx.nome||'',ultima_resposta_do_bot:String(ictx.ultima_resposta||'').slice(0,200),resposta_autorizada:base}),
        text:{format:{type:'json_object'}},max_output_tokens:r.intent==='como_pedir'?260:160})
    });
    if (!http.ok) {let m='';try{m=String((await http.json())?.error?.message||'').slice(0,160);}catch{} console.warn('OPENAI_REPLY_ERROR',http.status,m);return r;}
    const data=await http.json();
    const output=(data.output||[]).flatMap((o)=>o.content||[])
      .filter((c)=>c.type==='output_text').map((c)=>c.text).join('');
    const candidate=JSON.parse(output).reply;
    // Somente mensagens SOCIAIS, sem alegações comerciais; nunca usar novas URLs ou números.
    // Diagnóstico sem conteúdo do cliente: só o motivo do descarte (filtros inalterados).
    const nc=typeof candidate==='string'?norm(candidate):'';
    const maxLen=pub?90:(r.intent==='como_pedir'?420:260);
    const reason = typeof candidate!=='string' || !candidate.trim() ? 'vazio' :
      candidate.length>maxLen ? 'longo' :
      /(?:https?:\/\/|www\.|wa\.me|\b[\w-]+\.(?:com(?:\.br)?|net(?:\.br)?|org(?:\.br)?|br|app|io|site)\b)/i.test(candidate) ? 'link' :
      /(?:\d|pix|preco|valor|horario|reserva confirmada|promocao|cupom|proprietari|dono|rafa|influenciador|gratis|gratuit|brinde|desconto|sorteio|barat)/i.test(nc.replace(/99 ?food/g,'')) ? 'termo_bloqueado' :
      SUPERLATIVE_RE.test(nc) ? 'superlativo' :
      (pub && /(whatsapp|telefone|numero|link|site|cardapio|rodizio|\bcontato\b)/.test(nc)) ? 'termo_bloqueado_publico' :
      (pub && (/\?/.test(candidate) || /[.!]\s+\S/.test(candidate.trim()) || V.countEmoji(candidate)>1)) ? 'comentario_publico_longo' :
      (V.countEmoji(candidate)>1) ? 'emoji' :
      (ictx.ultima_resposta && nc.slice(0,40)===norm(ictx.ultima_resposta).slice(0,40)) ? 'repetido' :
      (MUST_KEEP[r.intent]||[]).some((re)=>!re.test(nc)) ? 'perdeu_conteudo' : '';
    if (reason) {console.info('OPENAI_REPLY_FILTERED',r.intent,reason);return r;}
    console.info('OPENAI_REPLY_OK',r.intent);
    const text=candidate.trim(), st=r.state;
    if (pub) { if (st) st.last_public_reply=text.slice(0,200); return {...r,public_reply:text}; }
    if (st) {
      const before=st.since_emoji===0?2:Math.max(0,(st.since_emoji||1)-1);
      const e=V.applyEmojiPolicy(text,before);
      st.since_emoji=e.hasEmoji?0:before+1;
      st.last_bot_reply=e.text.slice(0,400);
      st.used_name=!!(ictx.nome && e.text.includes(ictx.nome));
      return {...r,reply:e.text};
    }
    return {...r,reply:text};
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
    // Comentário público: texto curto para o passo "responder comentário" do ManyChat (sem link, número nem preço).
    public_reply:sanitizeReply(r.public_reply||'').slice(0,200),
    tem_resposta_publica:!!sanitizeReply(r.public_reply||''),
    curtir_comentario:!!r.like_comment,
    enviar_resposta_privada:!!reply,
    ...Object.fromEntries([0,1,2].flatMap((i)=>[[`cta_${i+1}_type`,cs[i]?.type||''],
      [`cta_${i+1}_label`,cs[i]?.label||''],[`cta_${i+1}_url`,cs[i]?.url||'']]))};
  return payload;
}
export function dynamicPayload(r) {
  const p=standardPayload(r); const text=p.reply;
  // Dynamic Block v2: bolha com botões sempre curta. Para textos longos, usa bolhas anteriores separadas.
  const messages=[];
  const chunks=splitReply(text,780);
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
  // Sem resposta (humano ativo ou evento duplicado): nada a gravar. Resposta ignorada (reação, menção repetida) ainda grava a memória.
  if (r.next_action==='silencio_humano' || r.intent==='duplicado') return {version:'v2',content:{type:r.channel,messages:[],actions:[],quick_replies:[]}};
  const actions=[{action:'set_field_value',field_name:'ai_state',value:p.ai_state}];
  if (p.public_reply) actions.push({action:'set_field_value',field_name:'resposta_publica',value:p.public_reply});
  if (r.nota) actions.push({action:'set_field_value',field_name:'avaliacao_nota',value:r.nota});
  if (r.feedback) actions.push({action:'set_field_value',field_name:'avaliacao_feedback',value:r.feedback.slice(0,800)});
  if (r.intent==='pedido') actions.push({action:'add_tag',tag_name:'interesse_pedido'});
  if (r.intent==='cardapio'||r.intent==='categoria_cardapio'||r.intent==='rodizio_composicao'||r.intent==='rodizio_preferencias') actions.push({action:'add_tag',tag_name:'interesse_cardapio'});
  if (r.intent==='reserva'||r.intent==='reserva_pronta'||r.intent==='aniversario') actions.push({action:'add_tag',tag_name:'interesse_reserva'});
  if (r.intent==='aniversario') actions.push({action:'add_tag',tag_name:'interesse_aniversario'});
  if (r.intent==='story_repost_ok') actions.push({action:'add_tag',tag_name:'repost_autorizado'});
  if (r.intent==='vaga') actions.push({action:'add_tag',tag_name:'candidato_rh'});
  if (r.intent==='cliente_novo') actions.push({action:'add_tag',tag_name:'cliente_novo'});
  if (r.needs_human) actions.push({action:'add_tag',tag_name:'precisa_humano'});
  return {version:'v2',content:{type:r.channel,messages:messages.slice(0,10),actions:actions.slice(0,5),quick_replies:[]}};
}
