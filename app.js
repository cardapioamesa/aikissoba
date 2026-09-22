/* Cardápio digital — Cardápio à Mesa
 *
 * O cardápio lê os dados do Firestore (leitura pública) e o dono edita pelo
 * painel depois de entrar com e-mail e senha do Firebase Auth. Quem decide se
 * uma conta pode salvar são as regras do Firestore (firestore.rules), conferidas
 * no servidor — o que esta página checa é só para mostrar a tela certa.
 *
 * Estrutura no banco:
 *   restaurantes/{slug}                 { site, secoes, atualizadoEm }      público
 *   restaurantes/{slug}/itens/{id}      { secao, nome, desc, preco, tag,
 *                                         foto, esgotado, ordem }           público
 *   restaurantes/{slug}/privado/acesso  { donos: [e-mails] }                só donos
 */
(function(){
  "use strict";

  const CFG = window.CARDAPIO_CONFIG || {};
  const SLUG = CFG.restaurante;

  /* ---------------- utilidades ---------------- */
  const clonar = o => JSON.parse(JSON.stringify(o));
  // JSON com as chaves em ordem: o Firestore devolve os campos em outra ordem,
  // então comparar com JSON.stringify comum acusaria mudança onde não há.
  const estavel = o => JSON.stringify(o, (k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.keys(v).sort().reduce((a, c) => (a[c] = v[c], a), {})
      : v);
  const ACENTOS = new RegExp("[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]", "g");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

  let original = null;   // a última versão lida do banco
  let dados = null;      // o que está na tela, com as edições ainda não publicadas
  let sujo = false;

  const itensDa = secaoId => dados.itens.filter(i => i.secao === secaoId);
  const ehLista = secaoId => {
    const sec = dados && dados.secoes.find(x => x.id === secaoId);
    return !!(sec && sec.estilo === "lista");
  };

  function avisar(texto, ruim){
    const t = document.getElementById("toast");
    t.textContent = texto;
    t.classList.toggle("ruim", !!ruim);
    t.hidden = false;
    clearTimeout(avisar.timer);
    avisar.timer = setTimeout(() => { t.hidden = true; }, ruim ? 6000 : 3500);
  }

  function estadoDaPagina(texto){
    document.getElementById("secoes").innerHTML = `<p class="carregando">${esc(texto)}</p>`;
  }

  /* ---------------- ícones ---------------- */
  const svg = corpo => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${corpo}</svg>`;
  // Ícone oficial do Instagram, colorido. Cada cópia ganha um id próprio para o
  // degradê: com id repetido, uma cópia escondida apagaria o degradê das outras.
  let nInsta = 0;
  const instagram = () => {
    const id = "ig-degrade-" + (++nInsta);
    return `<svg class="ig" viewBox="0 0 24 24" aria-hidden="true">
      <defs><radialGradient id="${id}" cx="0.28" cy="1.05" r="1.35">
        <stop offset="0" stop-color="#FFD600"/><stop offset=".22" stop-color="#FF9A00"/>
        <stop offset=".45" stop-color="#FF3D57"/><stop offset=".68" stop-color="#E4148E"/>
        <stop offset="1" stop-color="#7C2BF0"/></radialGradient></defs>
      <rect width="24" height="24" rx="6.6" fill="url(#${id})"/>
      <rect x="5.1" y="5.1" width="13.8" height="13.8" rx="4.1" fill="none" stroke="#fff" stroke-width="1.75"/>
      <circle cx="12" cy="12" r="3.25" fill="none" stroke="#fff" stroke-width="1.75"/>
      <circle cx="16.25" cy="7.75" r="1.05" fill="#fff"/></svg>`;
  };
  const ICONE = {
    mapa:    svg('<path d="M12 21s-6.5-6.1-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.9 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.4"/>'),
    relogio: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>')
  };

  // Instagram de quem fez o cardápio, embaixo da assinatura no rodapé.
  (function(){
    const a = document.getElementById("assinatura-insta");
    const perfil = String((CFG.assinatura && CFG.assinatura.instagram) || "").replace(/^@/, "").trim();
    if (!a || !perfil) return;
    a.href = "https://instagram.com/" + encodeURIComponent(perfil);
    a.innerHTML = instagram() + "<span>@" + esc(perfil) + "</span>";
    a.hidden = false;
  })();

  /* ---------------- cardápio do cliente ---------------- */
  function foto(it, classe){
    if (it.foto) return `<span class="${classe}"><img src="${esc(it.foto)}" alt="${esc(it.nome)}" loading="lazy"></span>`;
    return `<span class="${classe} empty" aria-hidden="true">特</span>`;
  }

  function selo(it){
    if (it.esgotado) return `<span class="selo-esgotado">Esgotado hoje</span>`;
    return it.tag ? `<span class="tag">${esc(it.tag)}</span>` : "";
  }

  function linhaPrato(it){
    return `<button class="dish${it.esgotado ? " fora" : ""}" type="button" data-item="${esc(it.id)}">
      ${foto(it, "thumb")}
      <span class="dish-body">
        <span class="dish-name">${esc(it.nome)}</span>
        <span class="dish-desc">${esc(it.desc)}</span>
        ${selo(it)}
      </span>
      <span class="price"><small>R$</small>${esc(it.preco)}</span>
    </button>`;
  }

  function cardDestaque(it){
    return `<button class="special${it.esgotado ? " fora" : ""}" type="button" data-item="${esc(it.id)}">
      ${foto(it, "thumb")}
      <span class="dish-name">${esc(it.nome)}</span>
      <span class="dish-desc">${esc(it.desc)}</span>
      ${selo(it)}
      <span class="price"><small>R$</small>${esc(it.preco)}</span>
    </button>`;
  }

  // comFoto: alguma bebida da seção tem foto. Quem não tem ganha o espaço vazio,
  // para os nomes continuarem alinhados.
  function linhaBebida(it, comFoto){
    const garrafa = it.foto
      ? `<span class="garrafa"><img src="${esc(it.foto)}" alt="${esc(it.nome)}" loading="lazy"></span>`
      : (comFoto ? `<span class="garrafa vazia" aria-hidden="true"></span>` : "");
    return `<div class="drink${it.esgotado ? " fora" : ""}">
      ${garrafa}
      <span class="drink-name">${esc(it.nome)}</span>
      ${it.esgotado ? `<span class="selo-esgotado selo-bebida">Esgotado hoje</span>` : ""}
      <span class="dots"></span>
      <span class="drink-price"><small>R$</small>${esc(it.preco)}</span>
    </div>`;
  }

  function renderCliente(){
    if (!dados) return;
    const z = dados.site;
    document.querySelectorAll("[data-logo]").forEach(i => { if (z.logo) i.src = z.logo; });
    document.getElementById("marca-nome").textContent = z.nome || "";
    document.getElementById("hero-nome").textContent = z.nome || "";
    document.getElementById("foot-nome").textContent = z.nome || "";
    document.getElementById("hero-chamada").textContent = z.chamada || "";
    if (z.nome) document.title = z.nome + " · Cardápio";

    document.getElementById("tabs").innerHTML = dados.secoes
      .map(s => `<a href="#${esc(s.id)}">${esc(s.nome)}</a>`).join("");

    document.getElementById("secoes").innerHTML = dados.secoes.map(s => {
      const itens = itensDa(s.id);
      let corpo;
      if (s.estilo === "lista"){
        const comFoto = itens.some(i => i.foto);
        corpo = `<div class="drinks">${itens.map(i => linhaBebida(i, comFoto)).join("")}</div>`;
      }
      else if (s.estilo === "destaque") corpo = `<div class="specials">${itens.map(cardDestaque).join("")}</div>`;
      else                              corpo = `<div class="dishes two">${itens.map(linhaPrato).join("")}</div>`;
      return `<section id="${esc(s.id)}">
        <div class="sec-head">
          <p class="eyebrow">${esc(s.kanji || "")}</p>
          <h2>${esc(s.nome)}</h2>
          ${s.nota ? `<p class="sec-note">${esc(s.nota)}</p>` : ""}
        </div>
        ${corpo}
      </section>`;
    }).join("");

    const insta = String(z.instagram || "").replace(/^@/, "");
    const bts = [];
    if (dados.secoes[0]) bts.push(`<a class="cta cta-a" href="#${esc(dados.secoes[0].id)}">Ver o cardápio</a>`);
    if (z.whatsapp) bts.push(`<a class="cta cta-b" href="https://wa.me/${esc(z.whatsapp)}" target="_blank" rel="noopener">Pedir no WhatsApp</a>`);
    document.getElementById("hero-botoes").innerHTML = bts.join("");

    // WhatsApp e Instagram são ações de tocar e ir: ficam juntos, como botões.
    // Endereço e horário são informação: ficam nos cartões.
    let acoes = "";
    if (z.whatsapp) acoes += `<a class="cta cta-a" href="https://wa.me/${esc(z.whatsapp)}" target="_blank" rel="noopener">Pedir no WhatsApp</a>`;
    if (insta) acoes += `<a class="cta cta-b cta-insta" href="https://instagram.com/${esc(insta)}" target="_blank" rel="noopener">${instagram()}<span>@${esc(insta)}</span></a>`;
    let contato = acoes ? `<div class="acoes">${acoes}</div>` : "";
    const cartoes = [];
    if (z.endereco) cartoes.push(`<a class="info" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(z.endereco)}" target="_blank" rel="noopener">
        <span class="info-icone">${ICONE.mapa}</span>
        <span class="info-rotulo">Endereço</span>
        <span class="info-valor">${esc(z.endereco)}</span>
        <span class="info-acao">Abrir no Google Maps</span></a>`);
    if (z.horario) cartoes.push(`<div class="info">
        <span class="info-icone">${ICONE.relogio}</span>
        <span class="info-rotulo">Horário</span>
        <span class="info-valor">${esc(z.horario)}</span></div>`);
    if (cartoes.length) contato += `<div class="infos infos-${cartoes.length}">${cartoes.join("")}</div>`;
    document.getElementById("contato").innerHTML = contato;

    ligarScrollspy();
  }

  /* ---------------- ampliar foto ---------------- */
  const lb = document.getElementById("lb");
  let voltarPara = null;

  function abrirFoto(id){
    const it = dados && dados.itens.find(x => x.id === id);
    if (!it || !it.foto) return;
    document.getElementById("lb-img").src = it.foto;
    document.getElementById("lb-img").alt = it.nome;
    document.getElementById("lb-name").textContent = it.nome + (it.esgotado ? " — esgotado hoje" : "");
    document.getElementById("lb-desc").textContent = it.desc || "";
    document.getElementById("lb-price").textContent = "R$ " + it.preco;
    lb.hidden = false;
    document.getElementById("lb-close").focus();
  }
  function fecharFoto(){
    lb.hidden = true;
    if (voltarPara){ voltarPara.focus(); voltarPara = null; }
  }
  document.addEventListener("click", e => {
    const card = e.target.closest("[data-item]");
    if (card && !card.closest(".admin")){ voltarPara = card; abrirFoto(card.dataset.item); return; }
    if (e.target === lb || e.target.id === "lb-close") fecharFoto();
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !lb.hidden) fecharFoto(); });

  /* ---------------- scrollspy ---------------- */
  let io = null;
  function ligarScrollspy(){
    if (!("IntersectionObserver" in window)) return;
    if (io) io.disconnect();
    const tabs = [...document.querySelectorAll(".tabs a")];
    io = new IntersectionObserver(entradas => {
      const visivel = entradas.filter(x => x.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (visivel) tabs.forEach(t => t.setAttribute("aria-current", String(t.hash === "#" + visivel.target.id)));
    }, { rootMargin: "-88px 0px -62% 0px" });
    document.querySelectorAll("#secoes section").forEach(s => io.observe(s));
  }

  /* ---------------- Firebase ---------------- */
  const configurado = !!(CFG.firebase && CFG.firebase.apiKey && !/COLE/.test(CFG.firebase.apiKey) && SLUG);
  if (!configurado || typeof window.firebase === "undefined"){
    estadoDaPagina("Cardápio em configuração. Volte em instantes.");
    document.getElementById("abrir-admin").hidden = true;
    return;
  }

  firebase.initializeApp(CFG.firebase);
  const db = firebase.firestore();
  const auth = firebase.auth();
  auth.languageCode = "pt";

  const refRest = db.collection("restaurantes").doc(SLUG);
  const refItens = refRest.collection("itens");
  const refAcesso = refRest.collection("privado").doc("acesso");

  const painel = document.getElementById("admin");
  const tranca = document.getElementById("tranca");
  const conteudoAdmin = document.getElementById("admin-conteudo");
  const corpoAdmin = document.getElementById("admin-corpo");
  const btPublicar = document.getElementById("publicar");
  const btDescartar = document.getElementById("descartar");
  const seloEdicao = document.getElementById("estado-edicao");

  // O Firebase leva um instante para lembrar quem já estava logado neste aparelho.
  const authPronto = new Promise(ok => {
    const parar = auth.onAuthStateChanged(() => { parar(); ok(); });
  });

  /* ---------------- leitura do cardápio ---------------- */
  let docRest, docsItens;   // undefined = ainda não chegou

  function falhaLeitura(err){
    console.error("Falha ao ler o cardápio:", err);
    if (!dados) estadoDaPagina("Não foi possível carregar o cardápio agora. Tente de novo em instantes.");
  }

  function juntar(){
    if (docRest === undefined || docsItens === undefined) return;
    if (docRest === null){ estadoDaPagina("Cardápio em preparação. Volte em instantes."); return; }
    const remoto = {
      site: docRest.site || {},
      secoes: docRest.secoes || [],
      itens: docsItens
    };
    original = remoto;
    // o dono no meio de uma edição não perde o que digitou quando o banco muda
    if (!sujo) dados = clonar(remoto);
    renderCliente();
    if (!painel.hidden && !conteudoAdmin.hidden){
      if (!sujo) renderAdmin(); else marcarSujo();
    }
  }

  refRest.onSnapshot(snap => { docRest = snap.exists ? snap.data() : null; juntar(); }, falhaLeitura);
  refItens.orderBy("ordem").onSnapshot(qs => {
    docsItens = qs.docs.map(d => {
      const x = d.data();
      return { id: d.id, secao: x.secao || "", nome: x.nome || "", desc: x.desc || "",
               preco: x.preco || "", tag: x.tag || "", foto: x.foto || "", esgotado: !!x.esgotado };
    });
    juntar();
  }, falhaLeitura);

  /* ---------------- painel do dono ---------------- */

  let ehDono = false;      // o servidor deixou ler a lista de acesso: é dono
  let publicando = false;
  let editando = null;     // id do item aberto no formulário, ou "novo"
  let fotoPendente = null;

  function marcarSujo(){
    sujo = !!(dados && original) && estavel(dados) !== estavel(original);
    seloEdicao.hidden = !sujo;
    btDescartar.hidden = !sujo;
    btPublicar.disabled = !(sujo && ehDono) || publicando;
  }

  async function conferirDono(){
    // Só consegue ler privado/acesso quem as regras deixam editar.
    try { await refAcesso.get(); return true; }
    catch (e) { return false; }
  }

  async function abrirAdmin(){
    painel.hidden = false;
    document.body.style.overflow = "hidden";
    await authPronto;
    if (auth.currentUser){
      ehDono = await conferirDono();
      if (ehDono){ liberar(); return; }
      mostrarTranca("Esta conta não administra este cardápio. Entre com outra.");
      return;
    }
    mostrarTranca();
  }

  function fecharAdmin(){
    painel.hidden = true;
    document.body.style.overflow = "";
    if (location.hash === "#admin") history.replaceState(null, "", location.pathname + location.search);
  }

  function liberar(){
    document.getElementById("tranca-erro").hidden = true;
    tranca.hidden = true;
    conteudoAdmin.hidden = false;
    renderAdmin();
  }

  function mostrarTranca(msg){
    tranca.hidden = false;
    conteudoAdmin.hidden = true;
    const erro = document.getElementById("tranca-erro");
    erro.hidden = !msg;
    erro.textContent = msg || "";
    document.getElementById("tr-senha").value = "";
    document.getElementById("tr-email").focus();
  }

  function mensagemDeLogin(err){
    const c = err && err.code;
    if (c === "auth/invalid-credential" || c === "auth/wrong-password" || c === "auth/user-not-found" || c === "auth/invalid-email")
      return "E-mail ou senha não conferem.";
    if (c === "auth/too-many-requests") return "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";
    if (c === "auth/network-request-failed") return "Sem conexão com a internet.";
    if (c === "auth/unauthorized-domain") return "Este endereço ainda não foi autorizado no Firebase.";
    if (c === "auth/user-disabled") return "Esta conta foi desativada.";
    return "Não foi possível entrar agora. Tente de novo.";
  }

  async function entrar(){
    const email = document.getElementById("tr-email").value.trim();
    const senha = document.getElementById("tr-senha").value;
    const erro = document.getElementById("tranca-erro");
    const bt = document.getElementById("tr-entrar");
    if (!email || !senha){ erro.hidden = false; erro.textContent = "Preencha e-mail e senha."; return; }
    bt.disabled = true; bt.textContent = "Entrando…";
    try {
      await auth.signInWithEmailAndPassword(email, senha);
      ehDono = await conferirDono();
      if (!ehDono){
        await auth.signOut();
        mostrarTranca("Esta conta não administra este cardápio.");
        return;
      }
      liberar();
    } catch (err) {
      erro.hidden = false;
      erro.textContent = mensagemDeLogin(err);
    } finally {
      bt.disabled = false; bt.textContent = "Entrar";
    }
  }

  async function esqueci(){
    const email = document.getElementById("tr-email").value.trim();
    const erro = document.getElementById("tranca-erro");
    erro.hidden = false;
    if (!email){ erro.textContent = "Digite o seu e-mail acima e clique de novo em \"Esqueci a senha\"."; return; }
    try { await auth.sendPasswordResetEmail(email); }
    catch (err) { if (err && err.code === "auth/network-request-failed"){ erro.textContent = "Sem conexão com a internet."; return; } }
    // não conta se o e-mail existe ou não
    erro.textContent = "Se esse e-mail tiver acesso, chega nele um link para criar uma senha nova.";
  }

  document.getElementById("tr-entrar").addEventListener("click", entrar);
  document.getElementById("tr-senha").addEventListener("keydown", e => { if (e.key === "Enter") entrar(); });
  document.getElementById("tr-esqueci").addEventListener("click", esqueci);
  document.getElementById("tr-voltar").addEventListener("click", fecharAdmin);
  document.getElementById("abrir-admin").addEventListener("click", abrirAdmin);
  document.getElementById("fechar-admin").addEventListener("click", () => { renderCliente(); fecharAdmin(); });
  document.getElementById("sair").addEventListener("click", async () => {
    if (sujo && !window.confirm("Há alterações não publicadas. Sair mesmo assim?")) return;
    await auth.signOut();
    ehDono = false;
    if (original){ dados = clonar(original); marcarSujo(); renderCliente(); }
    fecharAdmin();
    avisar("Você saiu da área do dono.");
  });

  auth.onAuthStateChanged(u => { if (!u) ehDono = false; });

  /* -------- formulário e listas do painel -------- */
  function campo(rotulo, chave, valor, opc){
    opc = opc || {};
    const ajuda = opc.ajuda ? `<span class="ajuda">${esc(opc.ajuda)}</span>` : "";
    const ctrl = opc.area
      ? `<textarea data-campo="${chave}">${esc(valor)}</textarea>`
      : `<input type="text" data-campo="${chave}" value="${esc(valor)}" ${opc.placeholder ? `placeholder="${esc(opc.placeholder)}"` : ""}>`;
    return `<div class="campo${opc.largo ? " largo" : ""}"><label>${esc(rotulo)}</label>${ctrl}${ajuda}</div>`;
  }

  function formularioItem(it){
    const novo = !it.id;
    const opcoes = dados.secoes.map(s =>
      `<option value="${esc(s.id)}" ${s.id === it.secao ? "selected" : ""}>${esc(s.nome)}</option>`).join("");
    return `<div class="bloco" id="form-item">
      <h3>${novo ? "Novo item" : "Editando: " + esc(it.nome)}</h3>
      <p class="dica">O que você salvar aqui só vai para o cliente depois de clicar em <strong>Publicar</strong>.</p>
      <div class="campos">
        ${campo("Nome do prato", "nome", it.nome || "")}
        <div class="campo"><label>Seção</label><select data-campo="secao">${opcoes}</select></div>
        ${campo("Descrição", "desc", it.desc || "", {largo:true, area:true})}
        ${campo("Preço", "preco", it.preco || "", {ajuda:"Só o número. Ex.: 30 — ou 7,00 nas bebidas."})}
        ${campo("Etiqueta (opcional)", "tag", it.tag || "", {ajuda:"Ex.: 5 unidades"})}
        <div class="campo largo">
          <label>Disponibilidade</label>
          <label style="display:flex;gap:9px;align-items:center;text-transform:none;letter-spacing:0;font-size:15px;font-weight:400;color:var(--rice)">
            <input type="checkbox" data-campo="esgotado" ${it.esgotado ? "checked" : ""} style="width:auto">
            Marcar como <strong style="color:var(--beni-lt)">esgotado hoje</strong>
          </label>
          <span class="ajuda">O prato continua no cardápio, com selo de esgotado e preço riscado.</span>
        </div>
        <div class="campo largo">
          <label>Foto</label>
          <div class="foto-edit">
            ${it.foto ? `<img class="mini${ehLista(it.secao) ? " inteira" : ""}" id="previa" src="${esc(it.foto)}" alt="">`
                      : `<span class="mini vazia" id="previa">特</span>`}
            <input type="file" id="arquivo-foto" accept="image/*">
            <button class="bt" type="button" id="escolher-foto">Escolher foto</button>
            ${it.foto ? `<button class="bt perigo" type="button" id="tirar-foto">Remover foto</button>` : ""}
            <span class="ajuda" id="peso-foto">A foto é reduzida automaticamente.</span>
          </div>
        </div>
      </div>
      <div class="linha-acoes" style="margin-top:18px;justify-content:flex-start">
        <button class="bt forte" type="button" id="salvar-item">${novo ? "Adicionar ao cardápio" : "Salvar alterações"}</button>
        <button class="bt" type="button" id="cancelar-item">Cancelar</button>
      </div>
    </div>`;
  }

  function renderAdmin(){
    if (!dados){ corpoAdmin.innerHTML = `<p class="carregando">Carregando o cardápio…</p>`; return; }
    const z = dados.site;
    const usuario = auth.currentUser;
    let html = "";

    if (editando){
      const it = editando === "novo"
        ? { secao: dados.secoes[0] ? dados.secoes[0].id : "", nome:"", desc:"", preco:"", tag:"", foto:"", esgotado:false }
        : dados.itens.find(x => x.id === editando);
      if (it) html += formularioItem(it);
    }

    // ----- itens -----
    html += `<div class="bloco">
      <h3>Itens do cardápio</h3>
      <p class="dica">${dados.itens.length} itens. Use <strong>Esgotou</strong> para tirar do ar sem apagar o prato.</p>
      <div class="linha-acoes" style="justify-content:flex-start;margin-bottom:12px">
        <button class="bt forte" type="button" data-acao="novo">+ Novo item</button>
      </div>`;
    dados.secoes.forEach(s => {
      const itens = itensDa(s.id);
      html += `<div class="grupo-secao"><h4>${esc(s.nome)} · ${itens.length}</h4>`;
      if (!itens.length) html += `<p class="dica">Nenhum item nesta seção ainda.</p>`;
      itens.forEach((it, idx) => {
        html += `<div class="linha-item">
          ${it.foto ? `<img class="mini${ehLista(it.secao) ? " inteira" : ""}" src="${esc(it.foto)}" alt="">` : `<span class="mini vazia">特</span>`}
          <span class="linha-corpo">
            <span class="linha-nome">${esc(it.nome)}${it.esgotado ? ' <span style="color:var(--beni-lt);font-size:12px">· esgotado</span>' : ""}</span>
            <span class="linha-sub">R$ ${esc(it.preco)}${it.tag ? " · " + esc(it.tag) : ""}</span>
          </span>
          <span class="linha-acoes">
            <button class="bt mini-bt" type="button" data-acao="subir" data-id="${esc(it.id)}" ${idx === 0 ? "disabled" : ""}>↑</button>
            <button class="bt mini-bt" type="button" data-acao="descer" data-id="${esc(it.id)}" ${idx === itens.length-1 ? "disabled" : ""}>↓</button>
            <button class="bt mini-bt" type="button" data-acao="esgotar" data-id="${esc(it.id)}">${it.esgotado ? "Voltou" : "Esgotou"}</button>
            <button class="bt mini-bt" type="button" data-acao="editar" data-id="${esc(it.id)}">Editar</button>
            <button class="bt mini-bt perigo" type="button" data-acao="excluir" data-id="${esc(it.id)}">Excluir</button>
          </span>
        </div>`;
      });
      html += `</div>`;
    });
    html += `</div>`;

    // ----- seções -----
    html += `<div class="bloco">
      <h3>Seções</h3>
      <p class="dica">O título e a frase que aparecem acima de cada grupo de pratos.</p>`;
    dados.secoes.forEach((s, idx) => {
      html += `<div class="linha-item">
        <span class="linha-corpo">
          <span class="linha-nome">${esc(s.nome)}</span>
          <span class="linha-sub">${esc(s.nota || "sem frase")}</span>
        </span>
        <span class="linha-acoes">
          <button class="bt mini-bt" type="button" data-acao="secao-subir" data-id="${esc(s.id)}" ${idx === 0 ? "disabled" : ""}>↑</button>
          <button class="bt mini-bt" type="button" data-acao="secao-descer" data-id="${esc(s.id)}" ${idx === dados.secoes.length-1 ? "disabled" : ""}>↓</button>
          <button class="bt mini-bt" type="button" data-acao="secao-editar" data-id="${esc(s.id)}">Editar</button>
        </span>
      </div>`;
    });
    html += `<div class="linha-acoes" style="justify-content:flex-start;margin-top:14px">
        <button class="bt" type="button" data-acao="secao-nova">+ Nova seção</button>
      </div></div>`;

    // ----- dados da casa -----
    html += `<div class="bloco">
      <h3>Dados da casa</h3>
      <p class="dica">O WhatsApp acende o botão de pedido no topo e no rodapé.</p>
      <div class="campos">
        ${campo("Nome", "site.nome", z.nome)}
        ${campo("WhatsApp", "site.whatsapp", z.whatsapp, {ajuda:"Só números, com 55 e DDD. Ex.: 5521999998888", placeholder:"5521999998888"})}
        ${campo("Frase de abertura", "site.chamada", z.chamada, {largo:true, area:true})}
        ${campo("Instagram", "site.instagram", z.instagram, {placeholder:"@aikissoba"})}
        ${campo("Horário", "site.horario", z.horario, {largo:true, area:true, ajuda:"Pode usar várias linhas. Ex.: Qua a dom · jantar a partir das 18h (Enter) Sáb e dom · almoço das 11h às 15h"})}
        ${campo("Endereço", "site.endereco", z.endereco, {largo:true})}
      </div>
    </div>`;

    // ----- conta -----
    html += `<div class="bloco">
      <h3>Sua conta</h3>
      <p class="dica">Você entrou como <strong>${esc(usuario ? usuario.email : "")}</strong>.</p>
      <div class="campos">
        <div class="campo"><label>Nova senha</label><input type="password" id="nova-senha-1" autocomplete="new-password"></div>
        <div class="campo"><label>Repita a nova senha</label><input type="password" id="nova-senha-2" autocomplete="new-password"></div>
      </div>
      <div class="linha-acoes" style="justify-content:flex-start;margin-top:14px">
        <button class="bt" type="button" data-acao="trocar-senha">Trocar senha</button>
      </div>
      <p class="dica" id="aviso-senha" style="margin:12px 0 0"></p>
    </div>`;

    // ----- link e QR -----
    html += `<div class="bloco">
      <h3>Link e QR Code</h3>
      <p class="dica">Este é o endereço que vai na bio e no QR da mesa.</p>
      <div class="qr-area">
        <div class="qr-caixa" id="qr"></div>
        <div class="qr-lado">
          <p class="link-publico" id="link-publico">${esc(z.url || "")}</p>
          <div class="linha-acoes" style="justify-content:flex-start">
            <button class="bt" type="button" data-acao="copiar-link">Copiar link</button>
          </div>
          <p class="dica" style="margin-top:12px">Para imprimir, peça o cartaz em alta resolução.</p>
        </div>
      </div>
    </div>`;

    corpoAdmin.innerHTML = html;
    desenharQR();
    marcarSujo();
  }

  function desenharQR(){
    const alvo = document.getElementById("qr");
    if (!alvo) return;
    alvo.innerHTML = "";
    const url = (dados.site.url || "").trim();
    const nota = t => `<span style="color:#120E0C;font-size:12px;font-family:sans-serif">${t}</span>`;
    if (!url){ alvo.innerHTML = nota("sem endereço"); return; }
    if (typeof window.QRCode === "undefined"){ alvo.innerHTML = nota("QR indisponível<br>sem internet"); return; }
    try { new window.QRCode(alvo, { text: url, width: 176, height: 176, correctLevel: window.QRCode.CorrectLevel.M }); }
    catch (e) { alvo.innerHTML = nota("não deu para gerar o QR"); }
  }

  /* -------- foto -------- */
  // Pratos: recorte quadrado de 420 px em JPEG. Bebidas (seção "lista"): a foto
  // inteira, sem corte (cortaria a garrafa), em PNG para manter um fundo
  // transparente de foto já recortada. Cabe folgado no limite de 1 MB do documento.
  function processarFoto(file, inteira){
    return new Promise((ok, falhou) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement("canvas");
          if (inteira){
            const fator = Math.min(1, 240 / Math.max(img.naturalWidth, img.naturalHeight));
            c.width = Math.max(1, Math.round(img.naturalWidth * fator));
            c.height = Math.max(1, Math.round(img.naturalHeight * fator));
            c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
            ok(c.toDataURL("image/png"));
            return;
          }
          const N = 420, lado = Math.min(img.naturalWidth, img.naturalHeight);
          c.width = N; c.height = N;
          c.getContext("2d").drawImage(img,
            (img.naturalWidth - lado)/2, (img.naturalHeight - lado)/2, lado, lado, 0, 0, N, N);
          ok(c.toDataURL("image/jpeg", 0.78));
        } catch (e) { falhou(e); }
        finally { URL.revokeObjectURL(url); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); falhou(new Error("arquivo não é uma imagem")); };
      img.src = url;
    });
  }

  /* -------- ações do painel -------- */
  corpoAdmin.addEventListener("click", async e => {
    const bt = e.target.closest("button");
    if (!bt) return;
    const acao = bt.dataset.acao;
    const id = bt.dataset.id;

    if (bt.id === "escolher-foto"){ document.getElementById("arquivo-foto").click(); return; }
    if (bt.id === "tirar-foto"){
      fotoPendente = "";
      const p = document.getElementById("previa");
      if (p) p.replaceWith(Object.assign(document.createElement("span"), {className:"mini vazia", id:"previa", textContent:"特"}));
      bt.remove();
      return;
    }
    if (bt.id === "salvar-item"){ salvarItem(); return; }
    if (bt.id === "cancelar-item"){ editando = null; fotoPendente = null; renderAdmin(); return; }

    if (acao === "novo"){ editando = "novo"; fotoPendente = null; renderAdmin(); rolarAoForm(); return; }
    if (acao === "editar"){ editando = id; fotoPendente = null; renderAdmin(); rolarAoForm(); return; }
    if (acao === "esgotar"){
      const it = dados.itens.find(x => x.id === id);
      if (it) it.esgotado = !it.esgotado;
      renderAdmin(); return;
    }
    if (acao === "excluir"){
      const it = dados.itens.find(x => x.id === id);
      if (it && window.confirm(`Excluir "${it.nome}" do cardápio?`)){
        dados.itens = dados.itens.filter(x => x.id !== id);
        if (editando === id) editando = null;
        renderAdmin();
      }
      return;
    }
    if (acao === "subir" || acao === "descer"){ mover(id, acao === "subir" ? -1 : 1); return; }
    if (acao === "secao-subir" || acao === "secao-descer"){
      const i = dados.secoes.findIndex(s => s.id === id);
      const j = i + (acao === "secao-subir" ? -1 : 1);
      if (i >= 0 && j >= 0 && j < dados.secoes.length){
        const t = dados.secoes[i]; dados.secoes[i] = dados.secoes[j]; dados.secoes[j] = t;
        renderAdmin();
      }
      return;
    }
    if (acao === "secao-editar"){ editarSecao(id); return; }
    if (acao === "secao-nova"){ editarSecao(null); return; }

    if (acao === "trocar-senha"){
      const aviso = document.getElementById("aviso-senha");
      const s1 = document.getElementById("nova-senha-1").value;
      const s2 = document.getElementById("nova-senha-2").value;
      if (s1.length < 6){ aviso.textContent = "A senha precisa de pelo menos 6 caracteres."; return; }
      if (s1 !== s2){ aviso.textContent = "As duas senhas não são iguais."; return; }
      try {
        await auth.currentUser.updatePassword(s1);
        document.getElementById("nova-senha-1").value = "";
        document.getElementById("nova-senha-2").value = "";
        aviso.textContent = "Senha trocada. Use a nova na próxima vez que entrar.";
      } catch (err) {
        aviso.textContent = err && err.code === "auth/requires-recent-login"
          ? "Por segurança, saia e entre de novo antes de trocar a senha."
          : (err && err.code === "auth/weak-password" ? "Senha fraca demais. Use pelo menos 6 caracteres." : "Não deu para trocar a senha agora.");
      }
      return;
    }
    if (acao === "copiar-link"){
      const url = (dados.site.url || "").trim();
      try { await navigator.clipboard.writeText(url); bt.textContent = "Copiado!"; }
      catch (err) { bt.textContent = "Copie da caixa acima"; }
      setTimeout(() => bt.textContent = "Copiar link", 2000);
    }
  });

  corpoAdmin.addEventListener("change", async e => {
    if (e.target.id === "arquivo-foto"){
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const peso = document.getElementById("peso-foto");
      if (peso) peso.textContent = "Processando…";
      try {
        const selSecao = document.querySelector('#form-item [data-campo="secao"]');
        const inteira = selSecao ? ehLista(selSecao.value) : false;
        fotoPendente = await processarFoto(file, inteira);
        const p = document.getElementById("previa");
        if (p){
          const img = document.createElement("img");
          img.className = inteira ? "mini inteira" : "mini";
          img.id = "previa"; img.src = fotoPendente; img.alt = "";
          p.replaceWith(img);
        }
        if (peso) peso.textContent = Math.round(fotoPendente.length / 1400) + " KB aprox.";
      } catch (err) {
        if (peso) peso.textContent = "Não consegui ler essa imagem. Tente outra.";
      }
      return;
    }
    const nomeCampo = e.target.dataset ? e.target.dataset.campo : null;
    if (nomeCampo && nomeCampo.indexOf("site.") === 0){
      dados.site[nomeCampo.slice(5)] = e.target.value.trim();
      marcarSujo();
    }
  });

  function rolarAoForm(){
    const f = document.getElementById("form-item");
    if (f) f.scrollIntoView({block:"start", behavior:"smooth"});
  }

  function mover(id, passo){
    const it = dados.itens.find(x => x.id === id);
    if (!it) return;
    const irmaos = itensDa(it.secao);
    const alvo = irmaos[irmaos.indexOf(it) + passo];
    if (!alvo) return;
    const a = dados.itens.indexOf(it), b = dados.itens.indexOf(alvo);
    dados.itens[a] = alvo; dados.itens[b] = it;
    renderAdmin();
  }

  function salvarItem(){
    const form = document.getElementById("form-item");
    if (!form) return;
    const val = k => {
      const el = form.querySelector(`[data-campo="${k}"]`);
      if (!el) return "";
      return el.type === "checkbox" ? el.checked : el.value.trim();
    };
    const nome = val("nome");
    if (!nome){ window.alert("O prato precisa de um nome."); return; }
    if (editando === "novo"){
      dados.itens.push({
        id: "i" + Date.now().toString(36),
        secao: val("secao"), nome, desc: val("desc"), preco: val("preco"),
        tag: val("tag"), foto: fotoPendente || "", esgotado: !!val("esgotado")
      });
    } else {
      const it = dados.itens.find(x => x.id === editando);
      if (it){
        it.secao = val("secao"); it.nome = nome; it.desc = val("desc");
        it.preco = val("preco"); it.tag = val("tag"); it.esgotado = !!val("esgotado");
        if (fotoPendente !== null) it.foto = fotoPendente;
      }
    }
    editando = null; fotoPendente = null;
    renderAdmin();
  }

  function editarSecao(id){
    const s = id ? dados.secoes.find(x => x.id === id) : null;
    const nome = window.prompt("Nome da seção:", s ? s.nome : "");
    if (nome === null || !nome.trim()) return;
    const nota = window.prompt("Frase abaixo do título (pode deixar vazio):", s ? (s.nota || "") : "");
    if (nota === null) return;
    if (s){ s.nome = nome.trim(); s.nota = nota.trim(); }
    else {
      const slug = nome.trim().toLowerCase().normalize("NFD").replace(ACENTOS, "")
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || ("s" + Date.now().toString(36));
      dados.secoes.push({ id: slug, nome: nome.trim(), kanji: "", nota: nota.trim(), estilo: "fotos" });
    }
    renderAdmin();
  }

  /* -------- publicar: grava só o que mudou -------- */
  btPublicar.addEventListener("click", async () => {
    if (!auth.currentUser || !ehDono){ mostrarTranca("Entre de novo para publicar."); return; }
    publicando = true;
    btPublicar.disabled = true;
    btPublicar.textContent = "Publicando…";
    try {
      const lote = db.batch();
      let escritas = 0;

      if (estavel({ site: dados.site, secoes: dados.secoes }) !== estavel({ site: original.site, secoes: original.secoes })){
        lote.update(refRest, { site: dados.site, secoes: dados.secoes,
                               atualizadoEm: firebase.firestore.FieldValue.serverTimestamp() });
        escritas++;
      }
      const antes = new Map(original.itens.map((it, i) => [it.id, { it, i }]));
      dados.itens.forEach((it, i) => {
        const velho = antes.get(it.id);
        if (!velho || estavel(velho.it) !== estavel(it)){
          // prato novo ou alterado: grava inteiro
          const campos = Object.assign({}, it); delete campos.id;
          campos.ordem = i;
          lote.set(refItens.doc(it.id), campos);
          escritas++;
        } else if (velho.i !== i){
          // só mudou de posição: grava só a posição, sem reenviar a foto
          lote.update(refItens.doc(it.id), { ordem: i });
          escritas++;
        }
      });
      const ficam = new Set(dados.itens.map(it => it.id));
      original.itens.forEach(it => { if (!ficam.has(it.id)){ lote.delete(refItens.doc(it.id)); escritas++; } });

      if (escritas > 450) throw Object.assign(new Error("mudanças demais de uma vez"), { code: "muitas" });
      if (escritas) await lote.commit();
      original = clonar(dados);
      avisar("Publicado. Os clientes já estão vendo.");
    } catch (err) {
      console.error("Falha ao publicar:", err);
      const c = err && err.code;
      if (c === "permission-denied")    avisar("Esta conta não tem permissão para alterar este cardápio.", true);
      else if (c === "unavailable")     avisar("Sem conexão. Nada foi perdido: tente publicar de novo.", true);
      else if (c === "muitas")          avisar("Mudanças demais de uma vez. Publique em partes.", true);
      else if (c === "invalid-argument")avisar("Alguma foto ficou grande demais. Troque por uma menor.", true);
      else                              avisar("Não deu para publicar agora. Tente de novo.", true);
    } finally {
      publicando = false;
      btPublicar.textContent = "Publicar";
      marcarSujo();
    }
  });

  btDescartar.addEventListener("click", () => {
    if (!window.confirm("Descartar as alterações que ainda não foram publicadas?")) return;
    dados = clonar(original);
    editando = null; fotoPendente = null;
    renderCliente();
    renderAdmin();
  });

  window.addEventListener("beforeunload", e => {
    if (sujo && !publicando){ e.preventDefault(); e.returnValue = ""; }
  });

  /* ---------------- partida ---------------- */
  estadoDaPagina("Carregando o cardápio…");
  if (location.hash === "#admin") abrirAdmin();
})();
