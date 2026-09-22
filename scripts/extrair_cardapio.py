"""Reconstrói o catálogo a partir do PDF-mestre anexado. Requer pip install pdfplumber.
Uso: python scripts/extrair_cardapio.py caminho_para_pdf
Não altera preços, não inventa descrições, preserva as categorias da fonte.
"""
import json, re, sys, pathlib, unicodedata
import pdfplumber

DATA_DIR = pathlib.Path(__file__).resolve().parents[1] / 'data'
OUT = DATA_DIR / 'catalogo_extraido.json'
PDF = pathlib.Path(sys.argv[1]) if len(sys.argv)>1 else pathlib.Path('Cardapio_Mestre_Japa_Sushi_Lounge_ATUALIZADO.pdf')
assert PDF.is_file(), f'Arquivo não encontrado: {PDF}'
all_items=[]; categoria=None
known_categories={
  'Rodízios','Entradas','Novidades','Sushi à La Carte','Joy Especial (SEM ARROZ)',
  'Sashimis','Temaki individuais','Oniguiri','Combos','Combos Individuais',
  'Combos Promocionais','Monte Seu Poke','Mega Hot Roll','Sobremesa','Drinks',
  'Cervejas Long Neck','Bebidas','Doses','Chopp','Adicionais','Pratos Quentes'
}

def slug(s):
  s=''.join(c for c in unicodedata.normalize('NFKD',s.lower()) if not unicodedata.combining(c))
  return re.sub(r'[^a-z0-9]+','-',s).strip('-')

with pdfplumber.open(PDF) as pdf:
  for page_number, page in enumerate(pdf.pages[:16],start=1):
    tables = page.extract_tables()
    # O começo da página 2 contém quadros informativos e listas internas do rodízio.
    if page_number==2: tables=tables[2:3]
    # A primeira tabela da página 3 descreve peças internas do rodízio, não produtos à la carte.
    if page_number==3: tables=tables[1:]
    for table in tables:
      for row in table:
        if len(row)!=2: continue
        left,right = [(x.strip() if isinstance(x,str) else '') for x in row]
        if left in known_categories and not right:
          categoria=left; continue
        if left=='ITEM / DESCRIÇÃO' or not left:
          continue
        if not right: # continuação de descrição entre páginas
          if all_items and categoria==all_items[-1]['categoria']:
            all_items[-1]['descricao']=(' '.join(x for x in [all_items[-1]['descricao'], ' '.join(left.split())] if x)) or None
          continue
        if not re.fullmatch(r'R\$\s*\d+[.,]\d{2}',right):
          continue
        lines=left.splitlines()
        nome=lines[0].strip()
        descricao=' '.join(' '.join(lines[1:]).split()) or None
        if not categoria: raise ValueError((page_number, nome))
        status='ativo'
        if nome.lower()=='combo dia dos namorados' or categoria=='Combos Promocionais':
          status='revisar_campanha' # não oferecer sem confirmação da oferta atual
        if categoria=='Pratos Quentes':
          status='ativo_por_confirmacao_usuario_2026_09_22'
        all_items.append(dict(id=slug(categoria+' '+nome),categoria=categoria,
                              nome=nome,descricao=descricao,valor=right,status=status,
                              fonte_pagina=page_number))
# Preserva IDs únicos mesmo para variações de grafia semelhantes.
seen=set()
for row in all_items:
  original=row['id']; n=1
  while row['id'] in seen: n+=1; row['id']=f'{original}-{n}'
  seen.add(row['id'])
OUT.write_text(json.dumps({'_meta':{'fonte_pdf':PDF.name,'edicao':'2026-09-16',
 'observacoes':['Rodízio: sobremesa e bebida NÃO inclusas, conforme confirmação de 22/09/2026.',
 'Pratos Quentes foram confirmados ativos pelo usuário em 22/09/2026.',
 'Combos promocionais e Dia dos Namorados aguardam confirmação de vigência.']},
 'catalogo':all_items},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
from collections import Counter
print('CATALOGO_GERADO:',OUT,'TOTAL:',len(all_items))
print('CATEGORIAS:',dict(Counter(x['categoria'] for x in all_items)))
print('STATUS:',dict(Counter(x['status'] for x in all_items)))
print('SEM DESCRICAO:',sum(x['descricao'] is None for x in all_items))
# Arquivo histórico/controle, NUNCA carregado pelo bot para oferta.
with pdfplumber.open(PDF) as pdf:
    page17 = pdf.pages[16].extract_tables()
    inativos=[]
    for r in page17[0][2:]:
        if len(r)==2 and re.fullmatch(r'R\$\s*\d+[.,]\d{2}',r[1] or ''):
            lines=r[0].splitlines()
            inativos.append(dict(nome=lines[0],descricao=' '.join(lines[1:]) or None,
                                 categoria='Pratos Executivos',valor=r[1],status='pausado',fonte_pagina=17))
    for r in page17[1][2:]:
        if len(r)==3 and r[0] and r[1]:
            inativos.append(dict(nome=' '.join(r[1].split()),descricao=None,categoria=r[0],
                                 valor=r[2],status='inativo',fonte_pagina=17))
    (DATA_DIR/'catalogo_inativo_nao_ofertar.json').write_text(json.dumps({'_meta':{'uso':'auditoria interna apenas; nunca oferecer ao cliente','fonte_pagina':17},'catalogo':inativos},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    rodizio=[]
    for pg,idx in [(1,3),(2,0)]:
        for row in pdf.pages[pg].extract_tables()[idx]:
            for cell in row:
                if isinstance(cell,str) and cell.strip().startswith('•'):
                    rodizio.append(cell.strip().lstrip('•').strip().removesuffix(' - Rodízio'))
    (DATA_DIR/'rodizio_itens_referencia_nao_confirmados.json').write_text(json.dumps({
        '_meta':{'atencao':'Itens do cadastro interno, não representam promessa de inclusão; há conflitos entre bebidas/sobremesas da lista e as regras confirmadas. NÃO carregado pelo chatbot.',
                 'fonte_paginas':[2,3]},'itens':rodizio},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('INATIVOS ARQUIVADOS:',len(inativos),'ITENS RODIZIO REFERENCIA:',len(rodizio))
