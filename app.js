// Carrega jogos_novos.js sempre na versão mais recente (evita o cache do navegador/GitHub Pages)
// e só depois monta a página. Se o arquivo não existir, o site funciona só com o data.js.
(function () {
  var started = false;
  function go() { if (started) return; started = true; scorigamiStart(); }
  var s = document.createElement("script");
  s.src = "jogos_novos.js?v=" + Date.now();
  s.onload = go;
  s.onerror = go;
  document.head.appendChild(s);
})();

function scorigamiStart() {
  "use strict";

  // mostra qualquer erro na própria página (em vez de ficar em "Calculando…")
  function showError(msg) {
    var rt = document.getElementById("recentText");
    if (rt) { rt.style.color = "#ff7d8b"; rt.textContent = msg; }
  }
  window.addEventListener("error", function (e) {
    var f = (e.filename || "").split("/").pop();
    showError("Erro em " + (f || "script") + (e.lineno ? ":" + e.lineno : "") + " \u2014 " + e.message);
  });

  var D = window.SCORIGAMI_DATA;
  if (!D) { showError("Não foi possível carregar o data.js. Confira se ele está na mesma pasta do index.html e se foi enviado por completo."); return; }
  var epochMs = Date.UTC(1917, 0, 1);

  // ---------- decode compact columnar data into game objects ----------
  var ALL_GAMES = [];
  var seen = Object.create(null);

  function addGame(ms, away, home, ag, hg, playoff) {
    var key = ms + "|" + away + "|" + home + "|" + (playoff ? 1 : 0);
    if (seen[key]) return false; // evita contar o mesmo jogo duas vezes
    seen[key] = true;
    var d = new Date(ms);
    var seasonYear = d.getUTCMonth() >= 7 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
    ALL_GAMES.push({
      ms: ms,
      seasonYear: seasonYear,
      away: away,
      home: home,
      ag: ag,
      hg: hg,
      winner: Math.max(ag, hg),
      loser: Math.min(ag, hg),
      isTie: ag === hg,
      playoff: playoff
    });
    return true;
  }

  // ---------- base histórica (data.js) ----------
  (function decode() {
    var n = D.day.length;
    for (var i = 0; i < n; i++) {
      addGame(epochMs + D.day[i] * 86400000, D.teams[D.away[i]], D.teams[D.home[i]],
        D.ag[i], D.hg[i], D.playoff[i] === 1);
    }
  })();

  // ---------- jogos adicionados manualmente (jogos_novos.js) ----------
  (function decodeExtra() {
    var extra = window.SCORIGAMI_EXTRA || [];
    extra.forEach(function (r) {
      var p = String(r[0]).split("-");
      var ms = Date.UTC(+p[0], +p[1] - 1, +p[2]);
      if (isNaN(ms)) return;
      addGame(ms, r[1], r[3], +r[2], +r[4], r[5] === "po");
    });
  })();

  var MAX_SCORE = 0;
  ALL_GAMES.forEach(function (g) { if (g.winner > MAX_SCORE) MAX_SCORE = g.winner; });

  var MIN_SEASON = Infinity, MAX_SEASON = -Infinity;
  ALL_GAMES.forEach(function (g) {
    if (g.seasonYear < MIN_SEASON) MIN_SEASON = g.seasonYear;
    if (g.seasonYear > MAX_SEASON) MAX_SEASON = g.seasonYear;
  });

  var LAST_YEAR = 0;
  ALL_GAMES.forEach(function (g) { var y = new Date(g.ms).getUTCFullYear(); if (y > LAST_YEAR) LAST_YEAR = y; });

  var TOTAL_POSSIBLE = (MAX_SCORE + 1) * (MAX_SCORE + 2) / 2;

  // ---------- DOM refs ----------
  var el = {
    typeSeg: document.getElementById("typeSeg"),
    yearFrom: document.getElementById("yearFrom"),
    yearTo: document.getElementById("yearTo"),
    yearFromVal: document.getElementById("yearFromVal"),
    yearToVal: document.getElementById("yearToVal"),
    statGames: document.getElementById("statGames"),
    statScores: document.getElementById("statScores"),
    statMissing: document.getElementById("statMissing"),
    statSpan: document.getElementById("statSpan"),
    recentText: document.getElementById("recentText"),
    gridRows: document.getElementById("gridRows"),
    colTicks: document.getElementById("colTicks"),
    detail: document.getElementById("detail"),
    detailTitle: document.getElementById("detailTitle"),
    detailClose: document.getElementById("detailClose"),
    gamesList: document.getElementById("gamesList")
  };

  // set slider bounds to actual data range
  el.yearFrom.min = MIN_SEASON; el.yearFrom.max = MAX_SEASON; el.yearFrom.value = MIN_SEASON;
  el.yearTo.min = MIN_SEASON; el.yearTo.max = MAX_SEASON; el.yearTo.value = MAX_SEASON;
  el.yearFromVal.textContent = sl(MIN_SEASON);
  el.yearToVal.textContent = sl(MAX_SEASON);

  var state = { type: "all", yearFrom: MIN_SEASON, yearTo: MAX_SEASON, selected: null, teamA: "", teamB: "", tab: "grid", firstDesc: false };
  var lastCellMap = {}, lastTotal = 0;

  // ---------- times (para os seletores) ----------
  var TEAM_INFO = Object.create(null); // nome -> { first, last } (temporadas em que o nome aparece)
  ALL_GAMES.forEach(function (g) {
    [g.away, g.home].forEach(function (t) {
      var i = TEAM_INFO[t] || (TEAM_INFO[t] = { first: g.seasonYear, last: g.seasonYear });
      if (g.seasonYear < i.first) i.first = g.seasonYear;
      if (g.seasonYear > i.last) i.last = g.seasonYear;
    });
  });
  var TEAM_NAMES = Object.keys(TEAM_INFO).sort(function (x, y) { return x.localeCompare(y); });

  function fillTeamSelect(sel, firstLabel, current, exclude) {
    sel.innerHTML = "";
    var o0 = document.createElement("option"); o0.value = ""; o0.textContent = firstLabel; sel.appendChild(o0);
    TEAM_NAMES.forEach(function (t) {
      if (t === exclude) return;
      var o = document.createElement("option");
      o.value = t;
      // nomes que já não existem (ex.: Hartford Whalers) mostram o período em que existiram
      var inf = TEAM_INFO[t];
      o.textContent = inf.last < MAX_SEASON
        ? t + " (" + (inf.first === inf.last ? sl(inf.first) : sl(inf.first) + "–" + sl(inf.last)) + ")"
        : t;
      sel.appendChild(o);
    });
    sel.value = current;
  }
  function populateTeams() {
    fillTeamSelect(document.getElementById("teamA"), T("allTeams"), state.teamA, "");
    fillTeamSelect(document.getElementById("teamB"), T("anyOpp"), state.teamB, state.teamA);
    document.getElementById("teamB").disabled = !state.teamA;
  }

  // ---------- idiomas (PT / EN) ----------
  var I18N = {
    pt: {
      locale: "pt-BR",
      pageTitle: "NHL Scorigami \u2014 Todos os placares da história da NHL",
      eyebrow: "Cada placar. Toda a história.",
      subtitle: "Mais de cem anos de jogos da NHL, reduzidos a uma única grade: cada combinação de placar já registrada \u2014 e todas as que ainda não aconteceram.",
      sbGames: "Jogos analisados", sbScores: "Placares distintos", sbMissing: "Placares que não aconteceram", sbSeasons: "Temporadas",
      ctrlType: "Tipo de jogo", typeAll: "Todos", typeReg: "Temporada regular", typePo: "Playoffs",
      ctrlFrom: "A partir da temporada", ctrlTo: "Até a temporada",
      ctrlTeam: "Ver jogos apenas de:", ctrlOpp: "Contra (opcional):", allTeams: "Todos os times", anyOpp: "Qualquer adversário",
      recentLabel: "Scorigami mais recente",
      gridTitle: "A grade de placares",
      gridHelp: "Eixo vertical = placar do vencedor · Eixo horizontal = placar do perdedor · <span style=\"opacity:.7\">●</span> = empate. Clique numa célula para ver os jogos.",
      axisWinner: "Placar do vencedor", axisLoser: "Placar do perdedor",
      legendNever: "Nunca aconteceu", legendCommon: "Placar mais comum",
      close: "Fechar ✕",
      follow: "Siga o Brasil Tem Hockey",
      footer: "Feito a partir de dados históricos de jogos da NHL (1917–<span id=\"footerYears\"></span>). Inspirado no conceito de <em>Scorigami</em> do futebol americano.<br>Referências: <a href='https://www.hockey-reference.com/' target='_blank' rel='noopener noreferrer'>Hockey-Reference</a> · <a href='https://nflscorigami.com/' target='_blank' rel='noopener noreferrer'>NFL Scorigami (original)</a>",
      tabGrid: "Grade de placares", tabStats: "Estatísticas",
      scrollHint: "Arraste a grade para os lados para ver todos os placares.",
      statsNote: "As estatísticas seguem os filtros acima (tipo de jogo, times e temporadas).",
      stCountTitle: "Quantas vezes cada placar aconteceu", stCountSub: "Do mais comum ao mais raro.",
      stFirstTitle: "Quando cada placar aconteceu pela primeira vez", stFirstSub: "O jogo que inaugurou cada placar no recorte atual.",
      stTeamsTitle: "Times mais envolvidos em jogos de scorigami", stTeamsSub: "Conta os jogos que inauguraram um placar com participação do time (como vencedor, perdedor ou em empate).",
      thScore: "Placar", thTimes: "Vezes", thPct: "% dos jogos", thDate: "Data", thGame: "Jogo", thSeason: "Temporada", thStage: "Fase",
      thTeam: "Time", thTotal: "Scorigamis", thWon: "Venceu", thLost: "Perdeu", thTied: "Empatou",
      tieTag: "empate", orderNewFirst: "Mais recentes primeiro ↓", orderOldFirst: "Mais antigos primeiro ↑", noStats: "Nenhum dado no recorte selecionado.",
      noGames: "Nenhum jogo no recorte selecionado.",
      noGamesScore: "Nenhum jogo com esse placar no recorte atual.",
      gameOne: "jogo", gameMany: "jogos", since: "desde", never: "nunca aconteceu",
      tagPo: "Playoff", tagReg: "Reg.",
      beat: "venceu", tiedAnd: "e", tied: "empataram por", on: "em",
      firstScore: "primeiro placar assim no recorte atual."
    },
    en: {
      locale: "en-US",
      pageTitle: "NHL Scorigami \u2014 Every score in NHL history",
      eyebrow: "Every score. All of history.",
      subtitle: "Over a hundred years of NHL games, boiled down to a single grid: every score combination ever recorded \u2014 and all the ones that have yet to happen.",
      sbGames: "Games analyzed", sbScores: "Distinct scores", sbMissing: "Scores that never happened", sbSeasons: "Seasons",
      ctrlType: "Game type", typeAll: "All", typeReg: "Regular season", typePo: "Playoffs",
      ctrlFrom: "From season", ctrlTo: "To season",
      ctrlTeam: "Show only games of:", ctrlOpp: "Against (optional):", allTeams: "All teams", anyOpp: "Any opponent",
      recentLabel: "Most recent scorigami",
      gridTitle: "The score grid",
      gridHelp: "Vertical axis = winning score · Horizontal axis = losing score · <span style=\"opacity:.7\">●</span> = tie. Click a cell to see the games.",
      axisWinner: "Winning score", axisLoser: "Losing score",
      legendNever: "Never happened", legendCommon: "Most common score",
      close: "Close ✕",
      follow: "Follow Brasil Tem Hockey",
      footer: "Built from historical NHL game data (1917–<span id=\"footerYears\"></span>). Inspired by the <em>Scorigami</em> concept from American football.<br>References: <a href='https://www.hockey-reference.com/' target='_blank' rel='noopener noreferrer'>Hockey-Reference</a> · <a href='https://nflscorigami.com/' target='_blank' rel='noopener noreferrer'>NFL Scorigami (original)</a>",
      tabGrid: "Score grid", tabStats: "Statistics",
      scrollHint: "Swipe the grid sideways to see every score.",
      statsNote: "Statistics follow the filters above (game type, teams and seasons).",
      stCountTitle: "How many times each score happened", stCountSub: "From most common to rarest.",
      stFirstTitle: "When each score first happened", stFirstSub: "The game that first produced each score in the current selection.",
      stTeamsTitle: "Teams most involved in scorigami games", stTeamsSub: "Counts the games that created a new score with the team taking part (as winner, loser or in a tie).",
      thScore: "Score", thTimes: "Times", thPct: "% of games", thDate: "Date", thGame: "Game", thSeason: "Season", thStage: "Stage",
      thTeam: "Team", thTotal: "Scorigamis", thWon: "Won", thLost: "Lost", thTied: "Tied",
      tieTag: "tie", orderNewFirst: "Newest first ↓", orderOldFirst: "Oldest first ↑", noStats: "No data in the selected range.",
      noGames: "No games in the selected range.",
      noGamesScore: "No games with this score in the current range.",
      gameOne: "game", gameMany: "games", since: "since", never: "never happened",
      tagPo: "Playoff", tagReg: "Reg.",
      beat: "beat", tiedAnd: "and", tied: "tied", on: "on",
      firstScore: "first game with this score in the current selection."
    }
  };
  var LANG = "";
  try { LANG = localStorage.getItem("scorigami_lang") || ""; } catch (e) {}
  if (!I18N[LANG]) LANG = ((navigator.language || "pt").toLowerCase().indexOf("pt") === 0) ? "pt" : "en";
  function T(k) { return I18N[LANG][k]; }
  function gamesLabel(n) { return n + " " + (n === 1 ? T("gameOne") : T("gameMany")); }

  function applyStatic() {
    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      var txt = T(nodes[i].getAttribute("data-i18n"));
      if (txt !== undefined) nodes[i].innerHTML = txt; // sem texto traduzido, mantém o que está no HTML
    }
    document.title = T("pageTitle");
    document.documentElement.lang = LANG === "pt" ? "pt-BR" : "en";
    var fy = document.getElementById("footerYears"); if (fy) fy.textContent = LAST_YEAR;
    var bs = document.querySelectorAll("#langSeg button");
    for (var j = 0; j < bs.length; j++) bs[j].classList.toggle("active", bs[j].getAttribute("data-lang") === LANG);
    populateTeams();
  }

  // ---------- color scale ----------
  var STOPS = [
    { t: 0.0, c: [28, 63, 94] },   // dim blue
    { t: 0.35, c: [42, 110, 168] }, // blueline
    { t: 0.7, c: [79, 168, 240] },  // ice glow
    { t: 1.0, c: [234, 242, 246] }  // hot ice white
  ];
  function lerp(a, b, t) { return a + (b - a) * t; }
  function colorForT(t) {
    for (var i = 0; i < STOPS.length - 1; i++) {
      var s0 = STOPS[i], s1 = STOPS[i + 1];
      if (t >= s0.t && t <= s1.t) {
        var lt = (t - s0.t) / (s1.t - s0.t);
        var c = [0, 1, 2].map(function (k) { return Math.round(lerp(s0.c[k], s1.c[k], lt)); });
        return "rgb(" + c.join(",") + ")";
      }
    }
    return "rgb(" + STOPS[STOPS.length - 1].c.join(",") + ")";
  }

  // temporada em formato "25/26" (seasonYear = ano em que a temporada termina)
  function sl(y) {
    function p(n) { return ("0" + (n % 100)).slice(-2); }
    return p(y - 1) + "/" + p(y);
  }

  function fmtDate(ms) {
    return new Date(ms).toLocaleDateString(T("locale"), { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
  }

  // ---------- filtering + grid build ----------
  function filterGames() {
    var t = state.type;
    return ALL_GAMES.filter(function (g) {
      if (g.seasonYear < state.yearFrom || g.seasonYear > state.yearTo) return false;
      if (t === "reg" && g.playoff) return false;
      if (t === "po" && !g.playoff) return false;
      if (state.teamA) {
        var hasA = g.away === state.teamA || g.home === state.teamA;
        if (!hasA) return false;
        if (state.teamB && !(g.away === state.teamB || g.home === state.teamB)) return false;
      }
      return true;
    });
  }

  function buildAndRender() {
    var scrollY = window.pageYOffset;
    var filtered = filterGames();

    // cellMap[w+'_'+l] = { count, firstMs, games: [] }
    var cellMap = Object.create(null);
    for (var i = 0; i < filtered.length; i++) {
      var g = filtered[i];
      var key = g.winner + "_" + g.loser;
      var c = cellMap[key];
      if (!c) { c = cellMap[key] = { count: 0, firstMs: Infinity, games: [] }; cellMap[key] = c; }
      c.count++;
      if (g.ms < c.firstMs) c.firstMs = g.ms;
      c.games.push(g);
    }

    var maxCount = 1;
    Object.keys(cellMap).forEach(function (k) { if (cellMap[k].count > maxCount) maxCount = cellMap[k].count; });

    // stats
    el.statGames.textContent = filtered.length.toLocaleString(T("locale"));
    var achieved = Object.keys(cellMap).length;
    el.statScores.textContent = achieved.toLocaleString(T("locale"));
    el.statMissing.textContent = Math.max(0, TOTAL_POSSIBLE - achieved).toLocaleString(T("locale"));
    el.statSpan.textContent = sl(state.yearFrom) + "–" + sl(state.yearTo);

    // most recent scorigami = achieved cell with the latest "first occurrence"
    var recentKey = null, recentFirst = -1;
    Object.keys(cellMap).forEach(function (k) {
      if (cellMap[k].firstMs > recentFirst) { recentFirst = cellMap[k].firstMs; recentKey = k; }
    });
    if (recentKey) {
      var rc = cellMap[recentKey];
      var rg = rc.games.reduce(function (a, b) { return a.ms < b.ms ? a : b; });
      var wTeam = rg.ag > rg.hg ? rg.away : rg.home;
      var lTeam = rg.ag > rg.hg ? rg.home : rg.away;
      var sc = "<b>" + rg.winner + "\u2013" + rg.loser + "</b>";
      var txt = rg.isTie
        ? ("<b>" + rg.away + "</b> " + T("tiedAnd") + " <b>" + rg.home + "</b> " + T("tied") + " " + sc + " " + T("on") + " " + fmtDate(rg.ms) + " \u2014 " + T("firstScore"))
        : ("<b>" + wTeam + "</b> " + T("beat") + " <b>" + lTeam + "</b> " + (LANG === "pt" ? "por " : "") + sc + " " + T("on") + " " + fmtDate(rg.ms) + " \u2014 " + T("firstScore"));
      el.recentText.innerHTML = txt;
    } else {
      el.recentText.textContent = T("noGames");
    }

    lastCellMap = cellMap; lastTotal = filtered.length;
    if (state.tab === "stats") renderStats(cellMap, filtered.length);
    renderGrid(cellMap, maxCount, recentKey);

    // refresh open detail panel if a cell is selected and still relevant
    if (state.selected) {
      var sel = cellMap[state.selected];
      if (sel) openDetail(state.selected, sel.games); else closeDetail();
    }

    // redesenhar a grade não deve mexer na posição da página
    if (Math.abs(window.pageYOffset - scrollY) > 1) window.scrollTo(0, scrollY);
  }


  // ---------- estatísticas ----------
  function escH(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function renderStats(cellMap, total) {
    var nf = function (n) { return n.toLocaleString(T("locale")); };
    var pf = function (n) { return n.toLocaleString(T("locale"), { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%"; };
    var tc = document.getElementById("tblCount"), tf = document.getElementById("tblFirst"), tt = document.getElementById("tblTeams");
    var btn = document.getElementById("btnFirstOrder");
    btn.textContent = state.firstDesc ? T("orderOldFirst") : T("orderNewFirst");

    var rows = Object.keys(cellMap).map(function (k) {
      var p = k.split("_"), c = cellMap[k], first = c.games[0];
      for (var i = 1; i < c.games.length; i++) if (c.games[i].ms < first.ms) first = c.games[i];
      return { w: +p[0], l: +p[1], count: c.count, first: first };
    });
    if (!rows.length) {
      tc.innerHTML = tf.innerHTML = tt.innerHTML = "<tbody><tr><td class='dim'>" + T("noStats") + "</td></tr></tbody>";
      return;
    }
    function scoreHtml(r) {
      return r.w + "\u2013" + r.l + (r.w === r.l ? "<span class='tie-tag'>" + T("tieTag") + "</span>" : "");
    }

    // 1) quantas vezes cada placar aconteceu
    var byCount = rows.slice().sort(function (x, y) { return y.count - x.count || y.w - x.w || y.l - x.l; });
    var maxC = byCount[0].count;
    tc.innerHTML = "<thead><tr><th class='rank'>#</th><th>" + T("thScore") + "</th><th class='num'>" + T("thTimes") + "</th><th class='num'>" + T("thPct") + "</th><th class='barcell'></th></tr></thead><tbody>" +
      byCount.map(function (r, i) {
        return "<tr><td class='rank'>" + (i + 1) + "</td><td class='score'>" + scoreHtml(r) + "</td><td class='num'>" + nf(r.count) +
          "</td><td class='num'>" + pf(r.count / total * 100) + "</td><td class='barcell'><div class='bar' style='width:" + Math.max(2, r.count / maxC * 100).toFixed(1) + "%'></div></td></tr>";
      }).join("") + "</tbody>";

    // 2) quando cada placar aconteceu pela primeira vez
    var byDate = rows.slice().sort(function (x, y) { return x.first.ms - y.first.ms || x.w - y.w || x.l - y.l; });
    byDate.forEach(function (r, i) { r.n = i + 1; });
    if (state.firstDesc) byDate.reverse();
    tf.innerHTML = "<thead><tr><th class='rank'>#</th><th>" + T("thScore") + "</th><th>" + T("thDate") + "</th><th>" + T("thGame") + "</th><th class='hide-m'>" + T("thSeason") + "</th><th class='hide-m'>" + T("thStage") + "</th></tr></thead><tbody>" +
      byDate.map(function (r) {
        var g = r.first;
        return "<tr><td class='rank'>" + r.n + "</td><td class='score'>" + scoreHtml(r) + "</td><td class='dim'>" + fmtDate(g.ms) + "</td><td>" +
          escH(g.away) + " " + g.ag + " @ " + escH(g.home) + " " + g.hg + "</td><td class='dim hide-m'>" + sl(g.seasonYear) + "</td><td class='dim hide-m'>" +
          (g.playoff ? T("tagPo") : T("tagReg")) + "</td></tr>";
      }).join("") + "</tbody>";

    // 3) times mais envolvidos em jogos de scorigami
    var teams = Object.create(null), anyTie = false;
    function bump(name, field) {
      var t = teams[name] || (teams[name] = { name: name, total: 0, won: 0, lost: 0, tied: 0 });
      t[field]++;
    }
    rows.forEach(function (r) {
      var g = r.first;
      bump(g.away, "total"); bump(g.home, "total");
      if (g.isTie) { bump(g.away, "tied"); bump(g.home, "tied"); anyTie = true; }
      else if (g.ag > g.hg) { bump(g.away, "won"); bump(g.home, "lost"); }
      else { bump(g.home, "won"); bump(g.away, "lost"); }
    });
    var tlist = Object.keys(teams).map(function (k) { return teams[k]; })
      .sort(function (x, y) { return y.total - x.total || x.name.localeCompare(y.name); });
    var maxT = tlist[0].total;
    tt.innerHTML = "<thead><tr><th class='rank'>#</th><th>" + T("thTeam") + "</th><th class='num'>" + T("thTotal") + "</th><th class='num'>" + T("thWon") + "</th><th class='num'>" + T("thLost") + "</th>" +
      (anyTie ? "<th class='num'>" + T("thTied") + "</th>" : "") + "<th class='barcell'></th></tr></thead><tbody>" +
      tlist.map(function (t, i) {
        return "<tr><td class='rank'>" + (i + 1) + "</td><td>" + escH(t.name) + "</td><td class='num'>" + t.total + "</td><td class='num'>" + t.won + "</td><td class='num'>" + t.lost + "</td>" +
          (anyTie ? "<td class='num'>" + t.tied + "</td>" : "") + "<td class='barcell'><div class='bar' style='width:" + Math.max(2, t.total / maxT * 100).toFixed(1) + "%'></div></td></tr>";
      }).join("") + "</tbody>";
  }

  function renderGrid(cellMap, maxCount, recentKey) {
    var keepH = el.gridRows.offsetHeight;
    if (keepH) el.gridRows.style.minHeight = keepH + "px"; // evita a página "encolher" durante o redesenho
    el.gridRows.innerHTML = "";
    for (var w = 0; w <= MAX_SCORE; w++) {
      var row = document.createElement("div");
      row.className = "grid-row";

      var tick = document.createElement("div");
      tick.className = "row-tick";
      tick.textContent = w;
      row.appendChild(tick);

      for (var l = 0; l <= MAX_SCORE; l++) {
        var cellDiv = document.createElement("div");
        if (l > w) {
          cellDiv.className = "cell disabled";
          cellDiv.style.visibility = "hidden";
        } else {
          var key = w + "_" + l;
          var c = cellMap[key];
          cellDiv.className = "cell" + (w === l ? " tie" : "");
          if (c) {
            cellDiv.classList.add("hit");
            var t = Math.log(c.count + 1) / Math.log(maxCount + 1);
            cellDiv.style.background = colorForT(t);
            cellDiv.title = w + "\u2013" + l + "  \u00b7  " + gamesLabel(c.count) + "  \u00b7  " + T("since") + " " + fmtDate(c.firstMs);
            cellDiv.addEventListener("click", (function (k, games) {
              return function () { selectCell(k, games); };
            })(key, c.games));
            if (key === recentKey) cellDiv.classList.add("recent");
            if (key === state.selected) cellDiv.classList.add("selected");
          } else {
            cellDiv.title = w + "\u2013" + l + "  \u00b7  " + T("never");
          }
        }
        row.appendChild(cellDiv);
      }
      el.gridRows.appendChild(row);
    }

    el.colTicks.innerHTML = "";
    for (var lc = 0; lc <= MAX_SCORE; lc++) {
      var ct = document.createElement("div");
      ct.className = "col-tick";
      ct.textContent = lc;
      el.colTicks.appendChild(ct);
    }
    el.gridRows.style.minHeight = "";
  }

  function selectCell(key, games) {
    state.selected = key;
    buildAndRender();
    openDetail(key, games, true); // só rola a tela quando o clique foi numa célula // to refresh 'selected' highlight without recomputation cost issue
  }

  function openDetail(key, games, scroll) {
    var parts = key.split("_");
    var w = parts[0], l = parts[1];
    el.detailTitle.textContent = w + "\u2013" + l + "  \u00b7  " + gamesLabel(games.length);
    var sorted = games.slice().sort(function (a, b) { return b.ms - a.ms; });
    el.gamesList.innerHTML = "";
    if (sorted.length === 0) {
      var hint = document.createElement("div");
      hint.className = "empty-hint";
      hint.textContent = T("noGamesScore");
      el.gamesList.appendChild(hint);
    } else {
      sorted.forEach(function (g) {
        var row = document.createElement("div");
        row.className = "game-row";
        var date = document.createElement("div");
        date.className = "date";
        date.textContent = fmtDate(g.ms);
        var matchup = document.createElement("div");
        matchup.className = "matchup";
        matchup.textContent = g.away + " " + g.ag + " @ " + g.home + " " + g.hg;
        var tag = document.createElement("div");
        tag.className = "tag";
        tag.textContent = g.playoff ? T("tagPo") : T("tagReg");
        row.appendChild(date);
        row.appendChild(matchup);
        row.appendChild(tag);
        el.gamesList.appendChild(row);
      });
    }
    el.detail.classList.add("open");
    if (scroll) el.detail.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function closeDetail() {
    state.selected = null;
    el.detail.classList.remove("open");
  }

  el.detailClose.addEventListener("click", function () { closeDetail(); buildAndRender(); });

  // ---------- controls ----------
  el.typeSeg.addEventListener("click", function (e) {
    var btn = e.target.closest("button");
    if (!btn) return;
    Array.prototype.forEach.call(el.typeSeg.querySelectorAll("button"), function (b) { b.classList.remove("active"); });
    btn.classList.add("active");
    state.type = btn.getAttribute("data-val");
    buildAndRender();
  });

  document.getElementById("teamA").addEventListener("change", function (e) {
    state.teamA = e.target.value;
    if (!state.teamA || state.teamB === state.teamA) state.teamB = "";
    populateTeams();
    buildAndRender();
  });
  document.getElementById("teamB").addEventListener("change", function (e) {
    state.teamB = e.target.value;
    buildAndRender();
  });

  el.yearFrom.addEventListener("input", function () {
    var v = parseInt(el.yearFrom.value, 10);
    if (v > state.yearTo) { v = state.yearTo; el.yearFrom.value = v; }
    state.yearFrom = v;
    el.yearFromVal.textContent = sl(v);
    buildAndRender();
  });
  el.yearTo.addEventListener("input", function () {
    var v = parseInt(el.yearTo.value, 10);
    if (v < state.yearFrom) { v = state.yearFrom; el.yearTo.value = v; }
    state.yearTo = v;
    el.yearToVal.textContent = sl(v);
    buildAndRender();
  });

  document.getElementById("tabSeg").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    state.tab = b.getAttribute("data-tab");
    Array.prototype.forEach.call(document.querySelectorAll("#tabSeg button"), function (x) {
      x.classList.toggle("active", x === b);
    });
    document.getElementById("viewGrid").style.display = state.tab === "grid" ? "" : "none";
    document.getElementById("viewStats").style.display = state.tab === "stats" ? "" : "none";
    if (state.tab === "stats") renderStats(lastCellMap, lastTotal);
  });
  document.getElementById("btnFirstOrder").addEventListener("click", function () {
    state.firstDesc = !state.firstDesc;
    renderStats(lastCellMap, lastTotal);
  });

  document.getElementById("langSeg").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    LANG = b.getAttribute("data-lang");
    try { localStorage.setItem("scorigami_lang", LANG); } catch (err) {}
    applyStatic();
    buildAndRender();
  });

  applyStatic();
  buildAndRender();
}
