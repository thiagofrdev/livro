// Site do livro: lê o sumario.json, busca o .md do capítulo e transforma em página.
// Entende o markdown do Obsidian: [[links]], ![[imagens]], callouts, ==destaque==, %%comentários%% e mermaid.
'use strict';

const estado = {
  livro: {},
  partes: [],
  ordem: [],            // todos os capítulos em sequência, pra "anterior / próximo"
  porNome: new Map(),   // caminho ou nome do arquivo (normalizado) -> capítulo
  rotaAtual: '',
  pedido: 0,            // evita que um capítulo lento sobrescreva o mais recente
};

const MERMAID_URL = 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js';
const IMAGEM = /\.(png|jpe?g|gif|webp|svg|bmp)$/i;

const NOMES_DOS_CALLOUTS = {
  note: 'Nota', info: 'Info', tip: 'Dica', hint: 'Dica', important: 'Importante',
  warning: 'Atenção', caution: 'Cuidado', attention: 'Atenção', danger: 'Perigo', error: 'Erro',
  bug: 'Bug', example: 'Exemplo', quote: 'Citação', cite: 'Citação', summary: 'Resumo',
  abstract: 'Resumo', tldr: 'Resumo', question: 'Pergunta', help: 'Ajuda', faq: 'Pergunta',
  success: 'Sucesso', check: 'Sucesso', done: 'Feito', failure: 'Falhou', fail: 'Falhou',
  missing: 'Faltando', todo: 'A fazer',
};

// ---------- utilidades ----------
const $ = (seletor, raiz = document) => raiz.querySelector(seletor);
const normalizar = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const slug = (s) => normalizar(s).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
const decodificar = (s) => { try { return decodeURIComponent(s); } catch { return s; } };
const caminhoParaUrl = (c) => c.split('/').map(encodeURIComponent).join('/');
const rotaDe = (nota) => nota.caminho.replace(/\.md$/i, '');
const hrefDe = (rota, secao) => '#/' + caminhoParaUrl(rota) + (secao ? '#' + slug(secao) : '');
const escaparMd = (s) => s.replace(/[[\]\\]/g, '\\$&');
const acharNota = (alvo) => estado.porNome.get(normalizar(alvo.replace(/\.md$/i, '')));

function temaEscuro() {
  const t = document.documentElement.dataset.theme;
  return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
}

// ---------- início ----------
async function iniciar() {
  const artigo = $('.artigo');
  if (location.protocol === 'file:') {
    artigo.innerHTML = '<p class="aviso">Abrindo direto do arquivo o navegador não deixa carregar os capítulos. Rode <code>node scripts/servidor.mjs</code> e acesse <code>http://localhost:4321</code>.</p>';
    return;
  }
  try {
    const [livro, sumario] = await Promise.all([buscarJson('livro.json'), buscarJson('sumario.json')]);
    estado.livro = livro;
    estado.partes = sumario.partes ?? [];
  } catch {
    artigo.innerHTML = '<p class="aviso">Não consegui carregar o sumário do livro.</p>';
    return;
  }

  for (const parte of estado.partes) {
    for (const nota of parte.notas) {
      nota.parte = parte.nome;
      estado.ordem.push(nota);
      const nome = nota.caminho.split('/').pop();
      for (const chave of [rotaDe(nota), nome.replace(/\.md$/i, '')]) {
        const k = normalizar(chave);
        if (!estado.porNome.has(k)) estado.porNome.set(k, nota);
      }
    }
  }

  if (window.marked) marked.use({ gfm: true, breaks: true });
  if (window.hljs) hljs.configure({ ignoreUnescapedHTML: true });

  montarCabecalho();
  montarSumario();
  ligarEventos();
  rotear();
}

async function buscarJson(caminho) {
  const r = await fetch(caminho, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${caminho}: ${r.status}`);
  return r.json();
}

function montarCabecalho() {
  const { titulo = 'Livro', subtitulo = '', repositorio = '' } = estado.livro;
  $('.marca-titulo').textContent = titulo;
  $('.marca-subtitulo').textContent = subtitulo;
  $('.marca-mobile').textContent = titulo;
  if (repositorio) {
    const link = $('.link-repo');
    link.href = repositorio;
    link.hidden = false;
  }
}

function montarSumario() {
  const nav = $('.sumario');
  nav.replaceChildren();
  if (!estado.ordem.length) {
    nav.innerHTML = '<p class="vazio">Nenhum capítulo ainda.</p>';
    return;
  }
  for (const parte of estado.partes) {
    const bloco = document.createElement('section');
    if (parte.nome) {
      const h = document.createElement('h2');
      h.textContent = parte.nome;
      bloco.append(h);
    }
    const ul = document.createElement('ul');
    for (const nota of parte.notas) {
      const li = document.createElement('li');
      li.dataset.busca = normalizar([nota.titulo, parte.nome, ...(nota.tags ?? [])].join(' '));
      const a = document.createElement('a');
      a.href = hrefDe(rotaDe(nota));
      a.dataset.rota = rotaDe(nota);
      a.textContent = nota.titulo;
      li.append(a);
      ul.append(li);
    }
    bloco.append(ul);
    nav.append(bloco);
  }
  const vazio = document.createElement('p');
  vazio.className = 'vazio';
  vazio.textContent = 'Nada encontrado.';
  vazio.hidden = true;
  nav.append(vazio);
}

function filtrarSumario(busca) {
  const termo = normalizar(busca);
  let algum = false;
  for (const bloco of document.querySelectorAll('.sumario section')) {
    let visiveis = 0;
    for (const li of bloco.querySelectorAll('li')) {
      const mostra = !termo || li.dataset.busca.includes(termo);
      li.hidden = !mostra;
      if (mostra) visiveis++;
    }
    bloco.hidden = visiveis === 0;
    if (visiveis) algum = true;
  }
  const vazio = $('.sumario .vazio');
  if (vazio) vazio.hidden = algum;
}

function ligarEventos() {
  window.addEventListener('hashchange', rotear);
  $('.busca input').addEventListener('input', (e) => filtrarSumario(e.target.value));
  $('.botao-menu').addEventListener('click', () => abrirMenu(!document.body.classList.contains('menu-aberto')));
  $('.cortina').addEventListener('click', () => abrirMenu(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') abrirMenu(false); });
  $('.pular').addEventListener('click', (e) => { e.preventDefault(); $('#conteudo').focus(); });
  $('.botao-tema').addEventListener('click', () => {
    const novo = temaEscuro() ? 'light' : 'dark';
    document.documentElement.dataset.theme = novo;
    try { localStorage.setItem('tema', novo); } catch { /* sem armazenamento, tudo bem */ }
    redesenharMermaid();
  });
}

function abrirMenu(abrir) {
  document.body.classList.toggle('menu-aberto', abrir);
  $('.cortina').hidden = !abrir;
  $('.botao-menu').setAttribute('aria-expanded', String(abrir));
}

// ---------- rotas ----------
// #/                      -> capa (README.md)
// #/Parte/Capítulo        -> capítulo
// #/Parte/Capítulo#secao  -> capítulo, já rolando até a seção
function lerRota() {
  const bruto = location.hash.replace(/^#\/?/, '');
  const i = bruto.indexOf('#');
  return {
    rota: decodificar(i === -1 ? bruto : bruto.slice(0, i)),
    secao: decodificar(i === -1 ? '' : bruto.slice(i + 1)),
  };
}

async function rotear() {
  if (location.hash && !location.hash.startsWith('#/')) return;
  const { rota, secao } = lerRota();
  abrirMenu(false);

  const nota = rota ? acharNota(rota) : null;
  estado.rotaAtual = nota ? rotaDe(nota) : '';

  for (const a of document.querySelectorAll('.sumario a')) {
    if (a.dataset.rota === estado.rotaAtual && nota) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }

  const { titulo = 'Livro' } = estado.livro;
  if (rota && !nota) {
    document.title = `Não encontrado · ${titulo}`;
    $('.artigo').innerHTML = '<h1>Capítulo não encontrado</h1><p>Esse capítulo não existe (ou mudou de lugar). <a href="#/">Voltar pra capa</a>.</p>';
    $('.navegacao-capitulos').replaceChildren();
    return;
  }

  document.title = nota ? `${nota.titulo} · ${titulo}` : titulo;
  await mostrar(nota ? nota.caminho : 'README.md', nota, secao);
}

async function mostrar(arquivo, nota, secao) {
  const pedido = ++estado.pedido;
  const artigo = $('.artigo');

  let md;
  try {
    const r = await fetch(caminhoParaUrl(arquivo), { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    md = await r.text();
  } catch {
    if (pedido === estado.pedido) artigo.innerHTML = '<p class="aviso">Não consegui carregar esse capítulo.</p>';
    return;
  }
  if (pedido !== estado.pedido) return;

  artigo.innerHTML = window.marked ? marked.parse(preprocessar(md)) : `<pre>${md.replace(/</g, '&lt;')}</pre>`;
  posprocessar(artigo, arquivo);
  if (nota) {
    colocarTitulo(artigo, nota);
    colocarMeta(artigo, nota);
  }
  colocarNavegacao(nota);

  const alvo = secao && document.getElementById(slug(secao));
  if (alvo) alvo.scrollIntoView();
  else window.scrollTo(0, 0);
}

// ---------- markdown do Obsidian -> markdown comum ----------
function preprocessar(md) {
  md = md.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---[^\S\r\n]*(\r?\n|$)/, ''); // frontmatter
  // Separa os trechos de código pra não mexer neles. Índices ímpares = código.
  const pedacos = md.split(/(^(?:```|~~~)[^\n]*\n[\s\S]*?^(?:```|~~~)[^\S\n]*$|`[^`\n]+`)/m);
  return pedacos
    .map((texto, i) => (i % 2 ? texto : texto
      .replace(/%%[\s\S]*?%%/g, '')
      .replace(/==([^=\n]+)==/g, '<mark>$1</mark>')
      .replace(/!\[\[([^\]]+)\]\]/g, (_, dentro) => embutir(dentro))
      .replace(/\[\[([^\]]+)\]\]/g, (_, dentro) => linkInterno(dentro))))
    .join('');
}

function linkInterno(dentro) {
  const [alvoESecao, apelido] = dentro.replace(/\\\|/g, '|').split('|');
  const [alvo, ...resto] = alvoESecao.split('#');
  const secao = resto.join('#').replace(/^\^/, '').trim();
  const nomeAlvo = alvo.trim();
  const texto = (apelido ?? (nomeAlvo ? (secao ? `${nomeAlvo} › ${secao}` : nomeAlvo) : secao)).trim();

  if (!nomeAlvo) return `[${escaparMd(texto)}](${hrefDe(estado.rotaAtual, secao)})`;
  const nota = acharNota(nomeAlvo);
  // Nota que não está no livro (privada ou ainda não escrita): vira texto comum.
  if (!nota) return escaparMd(texto);
  return `[${escaparMd(texto)}](${hrefDe(rotaDe(nota), secao)})`;
}

function embutir(dentro) {
  const [alvo, opcao = ''] = dentro.split('|').map((s) => s.trim());
  const arquivo = alvo.split('/').pop();
  if (IMAGEM.test(arquivo)) {
    const largura = /^\d+$/.test(opcao) ? ` width="${opcao}"` : '';
    const alt = opcao && !largura ? opcao.replace(/"/g, '&quot;') : '';
    return `<img src="${caminhoParaUrl('Anexos/' + arquivo)}" alt="${alt}"${largura} data-raiz>`;
  }
  if (/\.\w{2,4}$/.test(arquivo) && !/\.md$/i.test(arquivo)) {
    return `<a href="${caminhoParaUrl('Anexos/' + arquivo)}" data-raiz>${arquivo}</a>`;
  }
  return linkInterno(dentro);
}

// ---------- ajustes no HTML ----------
function posprocessar(artigo, arquivo) {
  montarCallouts(artigo);

  for (const tabela of artigo.querySelectorAll('table')) {
    const caixa = document.createElement('div');
    caixa.className = 'tabela';
    tabela.replaceWith(caixa);
    caixa.append(tabela);
  }

  const usados = new Set();
  for (const h of artigo.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    const base = slug(h.textContent) || 'secao';
    let id = base;
    for (let n = 2; usados.has(id); n++) id = `${base}-${n}`;
    usados.add(id);
    h.id = id;
  }

  const pastaDoSite = new URL('.', document.baseURI);
  const urlDoArquivo = new URL(caminhoParaUrl(arquivo), pastaDoSite);

  for (const a of artigo.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    if (href.startsWith('#/') || a.hasAttribute('data-raiz')) continue;
    if (href.startsWith('#')) {
      a.setAttribute('href', hrefDe(estado.rotaAtual, decodificar(href.slice(1))));
      continue;
    }
    let url;
    try { url = new URL(href, urlDoArquivo); } catch { continue; }
    const doSite = url.origin === location.origin && url.pathname.startsWith(pastaDoSite.pathname);
    if (!doSite) {
      if (/^https?:$/.test(url.protocol)) { a.target = '_blank'; a.rel = 'noopener'; }
      continue;
    }
    const relativo = url.pathname.slice(pastaDoSite.pathname.length).split('/').map(decodificar).join('/');
    if (/^readme\.md$/i.test(relativo)) a.setAttribute('href', '#/');
    else if (/\.md$/i.test(relativo)) {
      const nota = acharNota(relativo);
      if (nota) a.setAttribute('href', hrefDe(rotaDe(nota), decodificar(url.hash.slice(1))));
    }
  }

  for (const img of artigo.querySelectorAll('img[src]')) {
    if (img.hasAttribute('data-raiz')) continue;
    const src = img.getAttribute('src');
    if (!/^(https?:|data:)/.test(src)) img.src = new URL(src, urlDoArquivo).href;
    img.loading = 'lazy';
  }

  const diagramas = [];
  for (const code of artigo.querySelectorAll('pre > code')) {
    if (code.classList.contains('language-mermaid')) {
      const div = document.createElement('div');
      div.className = 'mermaid';
      div.dataset.fonte = code.textContent;
      div.textContent = code.textContent;
      code.parentElement.replaceWith(div);
      diagramas.push(div);
    } else if (window.hljs) {
      const linguagem = [...code.classList].find((c) => c.startsWith('language-'));
      if (linguagem && !hljs.getLanguage(linguagem.slice(9))) code.classList.remove(linguagem);
      hljs.highlightElement(code);
    }
  }
  if (diagramas.length) desenharMermaid(diagramas);
}

// > [!tipo]+ Título   ->   caixa colorida (com + ou - vira caixa que abre e fecha)
function montarCallouts(raiz) {
  for (const citacao of [...raiz.querySelectorAll('blockquote')]) {
    const p = citacao.firstElementChild;
    if (!p || p.tagName !== 'P') continue;
    const m = p.innerHTML.match(/^\s*\[!([\w-]+)\]([+-]?)[ \t]*/);
    if (!m) continue;

    const tipo = m[1].toLowerCase();
    const resto = p.innerHTML.slice(m[0].length);
    const quebra = resto.search(/<br\s*\/?>|\n/);
    const tituloHtml = (quebra === -1 ? resto : resto.slice(0, quebra)).trim();
    const corpoHtml = quebra === -1 ? '' : resto.slice(quebra).replace(/^(<br\s*\/?>|\n)\s*/, '');

    const dobravel = m[2] !== '';
    const caixa = document.createElement(dobravel ? 'details' : 'div');
    caixa.className = 'callout';
    caixa.dataset.tipo = tipo;
    if (m[2] === '+') caixa.open = true;

    const titulo = document.createElement(dobravel ? 'summary' : 'div');
    titulo.className = 'callout-titulo';
    titulo.innerHTML = tituloHtml || NOMES_DOS_CALLOUTS[tipo] || tipo[0].toUpperCase() + tipo.slice(1);

    const corpo = document.createElement('div');
    corpo.className = 'callout-corpo';
    if (corpoHtml.trim()) {
      const primeiro = document.createElement('p');
      primeiro.innerHTML = corpoHtml;
      corpo.append(primeiro);
    }
    p.remove();
    corpo.append(...citacao.childNodes);
    caixa.append(titulo, corpo);
    citacao.replaceWith(caixa);
  }
}

function colocarTitulo(artigo, nota) {
  const primeiro = artigo.firstElementChild;
  const ehCabecalho = primeiro && /^H[1-6]$/.test(primeiro.tagName);
  if (!(ehCabecalho && primeiro.tagName === 'H1')) {
    const h1 = document.createElement('h1');
    if (ehCabecalho && normalizar(primeiro.textContent).startsWith(normalizar(nota.titulo))) {
      // A nota já começa com um título parecido: só promove ele a H1.
      h1.innerHTML = primeiro.innerHTML;
      h1.id = primeiro.id;
      primeiro.replaceWith(h1);
    } else {
      h1.textContent = nota.titulo;
      h1.id = slug(nota.titulo);
      artigo.prepend(h1);
    }
  }
  if (nota.parte) {
    const parte = document.createElement('p');
    parte.className = 'parte-do-capitulo';
    parte.textContent = nota.parte;
    artigo.prepend(parte);
  }
}

function colocarMeta(artigo, nota) {
  const meta = document.createElement('footer');
  meta.className = 'meta';

  if (nota.atualizado) {
    const data = new Date(`${nota.atualizado}T12:00:00`);
    const span = document.createElement('span');
    span.textContent = `Atualizado em ${data.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
    meta.append(span);
  }
  if (nota.tags?.length) {
    const tags = document.createElement('span');
    tags.className = 'tags';
    for (const t of nota.tags) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = `#${t}`;
      tags.append(tag);
    }
    meta.append(tags);
  }
  if (estado.livro.repositorio) {
    const a = document.createElement('a');
    a.href = `${estado.livro.repositorio.replace(/\/$/, '')}/blob/main/${caminhoParaUrl(nota.caminho)}`;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Ver no GitHub';
    meta.append(a);
  }
  artigo.append(meta);
}

function colocarNavegacao(nota) {
  const nav = $('.navegacao-capitulos');
  nav.replaceChildren();
  const link = (alvo, rotulo, classe) => {
    const a = document.createElement('a');
    a.href = hrefDe(rotaDe(alvo));
    a.className = classe;
    const small = document.createElement('small');
    small.textContent = rotulo;
    a.append(small, alvo.titulo);
    return a;
  };
  if (!nota) {
    if (estado.ordem[0]) nav.append(link(estado.ordem[0], 'Começar a ler →', 'proximo'));
    return;
  }
  const i = estado.ordem.indexOf(nota);
  if (estado.ordem[i - 1]) nav.append(link(estado.ordem[i - 1], '← Anterior', 'anterior'));
  if (estado.ordem[i + 1]) nav.append(link(estado.ordem[i + 1], 'Próximo →', 'proximo'));
}

// ---------- diagramas ----------
let mermaidCarregando;
function carregarMermaid() {
  mermaidCarregando ??= new Promise((ok, erro) => {
    const s = document.createElement('script');
    s.src = MERMAID_URL;
    s.onload = () => ok(window.mermaid);
    s.onerror = erro;
    document.head.append(s);
  });
  return mermaidCarregando;
}

async function desenharMermaid(nos) {
  try {
    const mermaid = await carregarMermaid();
    mermaid.initialize({ startOnLoad: false, theme: temaEscuro() ? 'dark' : 'default', fontFamily: 'Inter, sans-serif' });
    await mermaid.run({ nodes: nos });
  } catch {
    for (const n of nos) n.classList.add('aviso');
  }
}

function redesenharMermaid() {
  const nos = [...document.querySelectorAll('.artigo .mermaid')];
  if (!nos.length) return;
  for (const n of nos) {
    n.removeAttribute('data-processed');
    n.textContent = n.dataset.fonte;
  }
  desenharMermaid(nos);
}

iniciar();
