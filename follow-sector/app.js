(function ($) {
  'use strict';

  var STORAGE_GAME = 'followSectorGameState';
  var STORAGE_NAMES = 'dartsLastPlayerNames';

  /** @typedef {{ k:'wedge', n:number } | { k:'bull' }} Target */

  var state = {
    phase: 'setup',
    players: [],
    fixedPlayerIds: [],
    initialRoundOrder: [],
    round: 1,
    roundOrder: [],
    roundPhase: 'pickTarget',
    target: null,
    turnIndex: 0,
    pending: null,
    tiebreak: null,
    /** Target per round index 0..6 (wedge, bull, or null if none set). */
    roundTargets: [],
  };

  var ROUND_COUNT = 7;

  function saveGame() {
    try {
      sessionStorage.setItem(STORAGE_GAME, JSON.stringify(state));
    } catch (e) {
      console.warn('sessionStorage save failed', e);
    }
  }

  function loadGame() {
    try {
      var raw = sessionStorage.getItem(STORAGE_GAME);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function clearGameStorage() {
    try {
      sessionStorage.removeItem(STORAGE_GAME);
    } catch (e) {}
  }

  function saveLastNames(names) {
    try {
      localStorage.setItem(STORAGE_NAMES, JSON.stringify(names));
    } catch (e) {}
  }

  function loadLastNames() {
    try {
      var raw = localStorage.getItem(STORAGE_NAMES);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter(function (n) { return typeof n === 'string' && n.trim(); }) : [];
    } catch (e) {
      return [];
    }
  }

  function randomInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function shuffleArray(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  var DART_SECTOR_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

  function wedgePath(cx, cy, r0, r1, degStart, degEnd) {
    function P(r, deg) {
      var rad = (deg * Math.PI) / 180;
      return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
    }
    var pInnerStart = P(r0, degStart);
    var pOuterStart = P(r1, degStart);
    var pOuterEnd = P(r1, degEnd);
    var pInnerEnd = P(r0, degEnd);
    var large = Math.abs(degEnd - degStart) > 180 ? 1 : 0;
    return [
      'M',
      pInnerStart[0],
      pInnerStart[1],
      'L',
      pOuterStart[0],
      pOuterStart[1],
      'A',
      r1,
      r1,
      0,
      large,
      1,
      pOuterEnd[0],
      pOuterEnd[1],
      'L',
      pInnerEnd[0],
      pInnerEnd[1],
      'A',
      r0,
      r0,
      0,
      large,
      0,
      pInnerStart[0],
      pInnerStart[1],
      'Z',
    ].join(' ');
  }

  var dartboardSectorsBuilt = false;

  /** Neutral classes per annular band (classic: dark wedge → black singles + red D/T; light → cream + green D/T). */
  function wedgeNeutralClasses(wedgeIndex, band) {
    var blackFamilyWedge = wedgeIndex % 2 === 0;
    if (band === 'triple' || band === 'double') {
      return (
        'dart-sector dart-band dart-band--ring-' + (blackFamilyWedge ? 'red' : 'green')
      );
    }
    return (
      'dart-sector dart-band dart-band--single-' + (blackFamilyWedge ? 'dark' : 'light')
    );
  }

  function ensureDartboardSectors() {
    if (dartboardSectorsBuilt) return;
    var $g = $('#dartboard-sectors');
    if (!$g.length) return;
    var cx = 100;
    var cy = 100;
    /* Inner scoring ring → triple → outer single → double (radii in SVG units; bull uses r < 26). */
    var bands = [
      { band: 'inner-single', r0: 26, r1: 50 },
      { band: 'triple', r0: 50, r1: 58 },
      { band: 'outer-single', r0: 58, r1: 82 },
      { band: 'double', r0: 82, r1: 94 },
    ];
    /* Wedges: bisector of index 0 (sector 20) at -90° = 12 o'clock (edges -99°…-81°). */
    for (var i = 0; i < 20; i++) {
      var a0 = -99 + i * 18;
      var a1 = -81 + i * 18;
      var sectorNum = DART_SECTOR_ORDER[i];
      for (var bi = 0; bi < bands.length; bi++) {
        var B = bands[bi];
        var d = wedgePath(cx, cy, B.r0, B.r1, a0, a1);
        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', d);
        path.setAttribute('data-sector', String(sectorNum));
        path.setAttribute('data-wedge-index', String(i));
        path.setAttribute('data-band', B.band);
        path.setAttribute('class', wedgeNeutralClasses(i, B.band));
        $g[0].appendChild(path);
      }
    }
    dartboardSectorsBuilt = true;
  }

  function sectorIndexForNumber(n) {
    for (var i = 0; i < DART_SECTOR_ORDER.length; i++) {
      if (DART_SECTOR_ORDER[i] === n) return i;
    }
    return -1;
  }

  function resetAllSectorWedgesNeutral() {
    ensureDartboardSectors();
    $('#dartboard-sectors path').each(function () {
      var $p = $(this);
      var idx = Number($p.attr('data-wedge-index'));
      var band = $p.attr('data-band');
      $p.attr('class', wedgeNeutralClasses(idx, band));
    });
  }

  function updateBoardTargetDisplay(target) {
    var $f = $('#board-target-figure');
    if (!$f.length) return;
    if (!target) {
      $f
        .addClass('d-none')
        .text('')
        .removeClass('board-target-figure--bull')
        .attr('title', '')
        .attr('aria-hidden', 'true');
      return;
    }
    $f.removeClass('d-none').attr('aria-hidden', 'false');
    if (target.k === 'bull') {
      $f.text('Bull').addClass('board-target-figure--bull').attr('title', 'Bull target');
    } else {
      $f
        .text(String(target.n))
        .removeClass('board-target-figure--bull')
        .attr('title', 'Sector ' + target.n);
    }
  }

  function updateDartboardBullTarget() {
    resetAllSectorWedgesNeutral();
    $('#dartboard-svg').addClass('dartboard-svg--final-round');
    $('#dartboard-aria-title').text('Dartboard — bull is the target');
    $('#dartboard-svg').attr('aria-label', 'Dartboard; aim at bull — outer 25, inner 50');
    $('#sector-board-card').addClass('board-final-round');
    updateBoardTargetDisplay({ k: 'bull' });
  }

  function updateDartboardWedgeHighlight(sector) {
    $('#dartboard-svg').removeClass('dartboard-svg--final-round');
    $('#sector-board-card').removeClass('board-final-round');
    ensureDartboardSectors();
    $('#dartboard-sectors path').each(function () {
      var $p = $(this);
      var s = Number($p.attr('data-sector'));
      var idx = Number($p.attr('data-wedge-index'));
      var band = $p.attr('data-band');
      if (s === sector) {
        $p.attr('class', 'dart-sector dart-band dart-sector--target');
      } else {
        $p.attr('class', wedgeNeutralClasses(idx, band));
      }
    });

    updateBoardTargetDisplay({ k: 'wedge', n: sector });

    $('#dartboard-svg').attr('aria-label', 'Dartboard; target sector ' + sector);
    $('#dartboard-aria-title').text('Dartboard — target sector ' + sector);
  }

  function updateDartboardNeutralPickPhase() {
    $('#dartboard-svg').removeClass('dartboard-svg--final-round');
    $('#sector-board-card').removeClass('board-final-round');
    resetAllSectorWedgesNeutral();
    updateBoardTargetDisplay(null);
    $('#dartboard-aria-title').text('Dartboard — establish round target');
    $('#dartboard-svg').attr('aria-label', 'Dartboard — record wedge or bull hits');
  }

  function setSectorBoardVisible(show) {
    $('#sector-board-card').toggleClass('d-none', !show);
  }

  function freshRoundScores() {
    var scores = [];
    for (var i = 0; i < ROUND_COUNT; i++) scores.push(0);
    return scores;
  }

  function ensureRoundScores(p) {
    if (!p) return;
    if (!Array.isArray(p.roundScores) || p.roundScores.length !== ROUND_COUNT) {
      p.roundScores = freshRoundScores();
    }
  }

  function addPlayingRoundPoints(p, pts) {
    if (state.phase !== 'playing' || !p) return;
    ensureRoundScores(p);
    var idx = Math.max(0, Math.min(ROUND_COUNT - 1, (Number(state.round) || 1) - 1));
    p.roundScores[idx] += pts;
  }

  function cloneRoundTarget(t) {
    if (!t) return null;
    if (t.k === 'bull') return { k: 'bull' };
    if (t.k === 'wedge') return { k: 'wedge', n: t.n };
    return null;
  }

  function recordRoundTargetForCurrentRound() {
    if (!Array.isArray(state.roundTargets)) state.roundTargets = [];
    var idx = Math.max(0, Math.min(ROUND_COUNT - 1, (Number(state.round) || 1) - 1));
    state.roundTargets[idx] = cloneRoundTarget(state.target);
  }

  function ensureRoundTargets() {
    if (!Array.isArray(state.roundTargets)) state.roundTargets = [];
    while (state.roundTargets.length < ROUND_COUNT) {
      state.roundTargets.push(null);
    }
    if (state.roundTargets.length > ROUND_COUNT) {
      state.roundTargets = state.roundTargets.slice(0, ROUND_COUNT);
    }
  }

  function roundTargetRowLabel(target) {
    if (!target) return '—';
    if (target.k === 'bull') return 'Bull';
    if (target.k === 'wedge' && typeof target.n === 'number') return String(target.n);
    return '—';
  }

  function playerById(id) {
    for (var i = 0; i < state.players.length; i++) {
      if (state.players[i].id === id) return state.players[i];
    }
    return null;
  }

  function sortCoLeaderIdsByFixedOrder(leaderIds) {
    var fixed = state.fixedPlayerIds;
    return leaderIds.slice().sort(function (a, b) {
      return fixed.indexOf(a) - fixed.indexOf(b);
    });
  }

  function orderPlayersForRound(roundNum) {
    if (roundNum === 1) return state.initialRoundOrder.slice();

    var scoreBuckets = {};
    state.players.forEach(function (p) {
      var s = p.score;
      if (!scoreBuckets[s]) scoreBuckets[s] = [];
      scoreBuckets[s].push(p.id);
    });
    var scores = Object.keys(scoreBuckets)
      .map(Number)
      .sort(function (a, b) {
        return a - b;
      });
    var out = [];
    scores.forEach(function (s) {
      out = out.concat(shuffleArray(scoreBuckets[s]));
    });
    return out;
  }

  function getMaxScore() {
    var m = -Infinity;
    state.players.forEach(function (p) {
      if (p.score > m) m = p.score;
    });
    return m;
  }

  function getCoLeaderIds() {
    var max = getMaxScore();
    return state.players
      .filter(function (p) {
        return p.score === max;
      })
      .map(function (p) {
        return p.id;
      });
  }

  function uniqueWinnerExists() {
    var max = getMaxScore();
    var n = state.players.filter(function (p) {
      return p.score === max;
    }).length;
    return n === 1;
  }

  /** @param {Target} target */
  function scoreDartVsTarget(dart, target) {
    if (!dart || dart.t === 'miss') return 0;
    if (target.k === 'bull') {
      return dart.t === 'bull' ? dart.v : 0;
    }
    if (dart.t === 'bull') return 0;
    if (dart.t === 'wedge' && dart.s === target.n) return dart.s * dart.m;
    return 0;
  }

  function findQualification(throws) {
    for (var i = 0; i < 3; i++) {
      var d = throws[i];
      if (d === null || d === undefined) break;
      if (d.t === 'miss') continue;
      if (d.t === 'bull') return { index: i, target: { k: 'bull' } };
      if (d.t === 'wedge' && d.m >= 1 && d.m <= 3 && d.s >= 1 && d.s <= 20) {
        return { index: i, target: { k: 'wedge', n: d.s } };
      }
    }
    return null;
  }

  function pointsPickVisit(throws) {
    var q = findQualification(throws);
    if (!q) return { qualify: false, points: 0, target: null };
    var sum = 0;
    for (var j = q.index; j < 3; j++) {
      if (!throws[j]) break;
      sum += scoreDartVsTarget(throws[j], q.target);
    }
    return { qualify: true, points: sum, target: q.target };
  }

  function sectorTurnPoints(targetN, mults) {
    var t = targetN;
    return mults.reduce(function (sum, m) {
      return sum + t * m;
    }, 0);
  }

  /** Sum points for darts already chosen (null slot = not chosen yet). */
  function partialSectorTurnPoints(targetN, mults) {
    if (!mults || !mults.length) return 0;
    var sum = 0;
    for (var i = 0; i < mults.length; i++) {
      var m = mults[i];
      if (m !== null && m !== undefined) sum += targetN * m;
    }
    return sum;
  }

  function bullTurnPoints(vals) {
    return vals.reduce(function (a, b) {
      return a + b;
    }, 0);
  }

  function partialBullTurnPoints(vals) {
    if (!vals || !vals.length) return 0;
    var sum = 0;
    for (var i = 0; i < vals.length; i++) {
      var v = vals[i];
      if (v !== null && v !== undefined) sum += v;
    }
    return sum;
  }

  /** Scoring visit: always 3 active dart rows (same as random-sector). */
  function makeVisitPending(target) {
    if (target.k === 'bull') {
      return { mode: 'visitBull', vals: [null, null, null] };
    }
    return { mode: 'visitWedge', n: target.n, mults: [null, null, null] };
  }

  /** Older sessions may have shorter mults/vals — pad to 3 with null */
  function normalizeLegacyVisitPending(pen) {
    if (!pen) return;
    if (pen.mode === 'visitWedge' && pen.mults && pen.mults.length > 0 && pen.mults.length < 3) {
      while (pen.mults.length < 3) pen.mults.push(null);
    }
    if (pen.mode === 'visitBull' && pen.vals && pen.vals.length > 0 && pen.vals.length < 3) {
      while (pen.vals.length < 3) pen.vals.push(null);
    }
    delete pen.editableDartCount;
  }

  function dartFromEstablishChoice(ch) {
    if (!ch) return null;
    if (ch.type === 'miss') return { t: 'miss' };
    if (ch.type === 'bull') return { t: 'bull', v: ch.v };
    if (ch.type === 'wedge') return { t: 'wedge', s: ch.s, m: 1 };
    return null;
  }

  function randomTiebreakTarget() {
    var r = randomInt(1, 21);
    if (r === 21) return { k: 'bull' };
    return { k: 'wedge', n: r };
  }

  function showScreen(id) {
    $('.screen').addClass('d-none');
    $('#' + id).removeClass('d-none');
    $('#btn-abandon').toggleClass('d-none', id === 'screen-setup' || id === 'screen-finished');
  }

  function renderSetupPlayers(names) {
    var $wrap = $('#setup-players');
    $wrap.empty();
    var list = names.length ? names : ['Player 1', 'Player 2'];
    list.forEach(function (name, idx) {
      $wrap.append(
        $('<div class="input-group input-group-lg flex-nowrap"></div>').append(
          $('<span class="input-group-text">' + (idx + 1) + '</span>'),
          $('<input type="text" class="form-control setup-name" maxlength="40" />').val(name),
          $('<button type="button" class="btn btn-outline-danger btn-remove-player" aria-label="Remove player">&times;</button>')
        )
      );
    });
  }

  function collectSetupNames() {
    var names = [];
    $('.setup-name').each(function () {
      var v = $(this).val().trim();
      if (v) names.push(v);
    });
    return names;
  }

  function emptyState() {
    return {
      phase: 'setup',
      players: [],
      fixedPlayerIds: [],
      initialRoundOrder: [],
      round: 1,
      roundOrder: [],
      roundPhase: 'pickTarget',
      target: null,
      turnIndex: 0,
      pending: null,
      tiebreak: null,
      roundTargets: [],
    };
  }

  function startGameFromSetup() {
    var names = collectSetupNames();
    if (names.length < 1) {
      alert('Add at least one player.');
      return;
    }
    saveLastNames(names);

    var players = [];
    var fixed = [];
    names.forEach(function (name, i) {
      var id = 'p_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 7);
      fixed.push(id);
      players.push({ id: id, name: name, score: 0, roundScores: freshRoundScores() });
    });

    var shuffled = shuffleArray(fixed);

    state.phase = 'playing';
    state.players = players;
    state.fixedPlayerIds = fixed;
    state.initialRoundOrder = shuffled;
    state.round = 1;
    state.roundOrder = state.initialRoundOrder.slice();
    state.roundPhase = 'pickTarget';
    state.target = null;
    state.turnIndex = 0;
    state.pending = {
      mode: 'pick',
      throws: [null, null, null],
      pickSlot: 0,
      establishChoice: null,
    };
    state.tiebreak = null;
    state.roundTargets = [];

    saveGame();
    renderGame();
    showScreen('screen-game');
  }

  function beginPlayingRound(nextRound) {
    state.round = nextRound;
    state.roundOrder = orderPlayersForRound(nextRound);
    state.roundPhase = 'pickTarget';
    state.target = null;
    state.turnIndex = 0;
    state.pending = {
      mode: 'pick',
      throws: [null, null, null],
      pickSlot: 0,
      establishChoice: null,
    };
  }

  function completeRoundAfterPlay() {
    recordRoundTargetForCurrentRound();
    if (state.round < 7) {
      beginPlayingRound(state.round + 1);
      saveGame();
      renderGame();
      return;
    }
    finishRegularPlay();
  }

  function finishRegularPlay() {
    if (uniqueWinnerExists()) {
      state.phase = 'finished';
      state.pending = null;
      saveGame();
      renderFinished();
      showScreen('screen-finished');
      return;
    }
    var leaders = getCoLeaderIds();
    if (leaders.length < 2) {
      state.phase = 'finished';
      state.pending = null;
      saveGame();
      renderFinished();
      showScreen('screen-finished');
      return;
    }
    var tt = randomTiebreakTarget();
    var tieOrder = sortCoLeaderIdsByFixedOrder(leaders);
    var tp = makeVisitPending(tt);
    state.phase = 'tiebreak';
    state.tiebreak = {
      target: tt,
      orderIds: tieOrder,
      turnIndex: 0,
      pending: tp,
    };
    state.pending = tp;
    state.turnIndex = 0;
    saveGame();
    renderGame();
    showScreen('screen-game');
  }

  function updateRoundProgress() {
    var $fill = $('#round-progress-fill');
    var $host = $('#round-progress');
    var $ticks = $('#round-progress-wrap .round-progress-labels span');
    if (!$fill.length || !$host.length) return;

    $ticks.removeClass('fw-bold text-primary');

    if (state.phase === 'tiebreak' && state.tiebreak) {
      $fill.removeClass('bg-primary').addClass('bg-warning').css('width', '100%');
      $host.attr({
        'aria-valuenow': '7',
        'aria-valuetext': 'Tie-break',
      });
      if ($ticks.length >= 7) $ticks.eq(6).addClass('fw-bold text-primary');
      return;
    }

    $fill.removeClass('bg-warning').addClass('bg-primary');
    var r = Math.max(1, Math.min(7, Number(state.round) || 1));
    var pct = (r / 7) * 100;
    $fill.css('width', pct + '%');
    $host.attr({
      'aria-valuenow': String(r),
      'aria-valuetext': 'Round ' + r + ' of 7',
    });
    if ($ticks.length >= r) $ticks.eq(r - 1).addClass('fw-bold text-primary');
  }

  function setCurrentTurnHeader(displayName, actionTail) {
    var $name = $('#current-player-name');
    var $act = $('#current-player-action');
    if (!$name.length) return;
    if (!displayName || displayName === '—') {
      $name.text('—');
      $act.text('');
      return;
    }
    $name.text(displayName);
    $act.text(actionTail || '');
  }

  function renderScoreTable($tbody) {
    $tbody.empty();
    var curId = null;
    if (state.phase === 'playing') {
      curId = state.roundOrder[state.turnIndex];
    } else if (state.phase === 'tiebreak' && state.tiebreak) {
      curId = state.tiebreak.orderIds[state.tiebreak.turnIndex];
    }

    state.players.forEach(function (p) {
      var row = $('<tr></tr>');
      if (p.id === curId) row.addClass('table-primary');
      row.append(
        $('<th scope="row"></th>').text(p.name),
        $('<td class="text-end fw-semibold"></td>').text(p.score)
      );
      $tbody.append(row);
    });
  }

  function renderGame() {
    if (state.phase === 'tiebreak' && state.tiebreak) {
      var tb = state.tiebreak;
      $('#tiebreak-banner').removeClass('d-none');
      updateRoundProgress();
      $('#game-phase-hint').text(
        'Random target each wave (sector or bull). Only tied leaders throw — order follows setup shuffle among ties.'
      );
      setSectorBoardVisible(true);
      if (tb.target.k === 'bull') {
        updateDartboardBullTarget();
      } else {
        updateDartboardWedgeHighlight(tb.target.n);
      }

      renderScoreTable($('#score-tbody'));
      var pidTb = tb.orderIds[tb.turnIndex];
      var pTb = playerById(pidTb);
      setCurrentTurnHeader(pTb ? pTb.name : null, pTb ? ' — set throws' : '');
      renderThrowsPanel();
      updateConfirmEnabled();
      return;
    }

    $('#tiebreak-banner').addClass('d-none');

    updateRoundProgress();

    if (state.roundPhase === 'pickTarget' && !state.target) {
      $('#game-phase-hint').text('');
      setSectorBoardVisible(true);
      updateDartboardNeutralPickPhase();
    } else if (state.target) {
      $('#game-phase-hint').text('');
      setSectorBoardVisible(true);
      if (state.target.k === 'bull') {
        updateDartboardBullTarget();
      } else {
        updateDartboardWedgeHighlight(state.target.n);
      }
    }

    renderScoreTable($('#score-tbody'));

    var pid = state.roundOrder[state.turnIndex];
    var p = playerById(pid);
    var isPickVis =
      state.pending && state.pending.mode === 'pick' && state.roundPhase === 'pickTarget' && !state.target;
    setCurrentTurnHeader(
      p ? p.name : null,
      p ? (isPickVis ? ' — establish round target' : ' — set throws') : ''
    );

    renderThrowsPanel();
    updateConfirmEnabled();
  }

  function renderThrowsPanel() {
    var $panel = $('#throws-panel');
    $panel.empty();
    var pending = state.pending;
    if (!pending) return;

    if (pending.mode === 'pick') {
      var choice = pending.establishChoice;

      var head = $('<div class="establish-target-panel border rounded p-3 bg-white mb-2"></div>');

      var grid = $('<div class="establish-target-grid"></div>');

      function appendSectorBtn(strip, s) {
        var wActive = choice && choice.type === 'wedge' && choice.s === s;
        strip.append(
          $('<button type="button" class="btn dart-pick-sector-btn btn-outline-secondary"></button>')
            .text(s)
            .toggleClass('establish-strip-btn--active', !!wActive)
            .attr('data-establish', 'sector-' + s)
        );
      }

      var row1 = $('<div class="establish-target-row"></div>');
      for (var s1 = 1; s1 <= 10; s1++) appendSectorBtn(row1, s1);

      var row2 = $('<div class="establish-target-row"></div>');
      for (var s2 = 11; s2 <= 20; s2++) appendSectorBtn(row2, s2);

      var bullOn = choice && choice.type === 'bull';
      var rowMissBull = $('<div class="establish-target-row establish-target-row--miss-bull"></div>');
      rowMissBull.append(
        $('<button type="button" class="btn dart-pick-sector-btn btn-establish-bull btn-outline-secondary"></button>')
          .text('Bull')
          .toggleClass('establish-strip-btn--active', !!bullOn)
          .attr('data-establish', 'bull')
          .attr('title', 'Inner bull — 50 points'),
        $('<button type="button" class="btn btn-establish-miss btn-outline-secondary"></button>')
          .text('Miss')
          .toggleClass('establish-strip-btn--active', !!(choice && choice.type === 'miss'))
          .attr('data-establish', 'miss')
      );

      grid.append(row1, row2, rowMissBull);
      head.append(grid);
      $panel.append(head);
      return;
    }

    if (pending.mode === 'visitWedge') {
      for (var j = 0; j < 3; j++) {
        (function (idx) {
          var row = $('<div class="mb-3"></div>');
          var sel = pending.mults[idx];
          var btnRow = $('<div class="row g-2"></div>');
          [
            { m: 0, label: 'Miss', cls: 'btn-outline-secondary' },
            { m: 1, label: 'Single', cls: 'btn-outline-primary' },
            { m: 2, label: 'Double', cls: 'btn-outline-primary' },
            { m: 3, label: 'Triple', cls: 'btn-outline-primary' },
          ].forEach(function (L) {
            var active = sel === L.m;
            var b = $('<button type="button" class="btn btn-lg throw-btn"></button>')
              .addClass(active ? 'btn-primary' : L.cls)
              .text(L.label)
              .attr('data-throw-idx', idx)
              .attr('data-mult', L.m);
            btnRow.append(
              $('<div class="col-6 col-sm-auto d-grid"></div>').append(b)
            );
          });
          row.append(btnRow);
          $panel.append(row);
        })(j);
      }
      return;
    }

    if (pending.mode === 'visitBull') {
      for (var k = 0; k < 3; k++) {
        (function (idx) {
          var row = $('<div class="mb-3"></div>');
          var sel = pending.vals[idx];
          var btnRow = $('<div class="row g-2"></div>');
          [
            { v: 0, label: 'Miss', cls: 'btn-outline-secondary' },
            { v: 25, label: '25', cls: 'btn-outline-success' },
            { v: 50, label: '50', cls: 'btn-outline-success' },
          ].forEach(function (L) {
            var active = sel === L.v;
            var b = $('<button type="button" class="btn btn-lg throw-btn"></button>')
              .addClass(active ? 'btn-success' : L.cls)
              .text(L.label)
              .attr('data-bull-idx', idx)
              .attr('data-bull-val', L.v);
            btnRow.append(
              $('<div class="col-4 col-sm-auto d-grid"></div>').append(b)
            );
          });
          row.append(btnRow);
          $panel.append(row);
        })(k);
      }
    }
  }

  function allTurnThrowsSelected() {
    var pen = state.pending;
    if (!pen || (state.phase !== 'playing' && state.phase !== 'tiebreak')) return false;

    if (pen.mode === 'pick') return !!pen.establishChoice;

    if (pen.mode === 'visitWedge') {
      return (
        pen.mults &&
        pen.mults.length > 0 &&
        pen.mults.every(function (m) {
          return m !== null && m !== undefined;
        })
      );
    }
    if (pen.mode === 'visitBull') {
      return (
        pen.vals &&
        pen.vals.length > 0 &&
        pen.vals.every(function (v) {
          return v !== null && v !== undefined;
        })
      );
    }
    return false;
  }

  function pendingTurnTotalPts() {
    if (!allTurnThrowsSelected()) return null;
    var pen = state.pending;
    if (state.phase === 'tiebreak' && state.tiebreak) {
      var tgt = state.tiebreak.target;
      if (pen.mode === 'visitWedge' && tgt.k === 'wedge') {
        return sectorTurnPoints(tgt.n, pen.mults);
      }
      if (pen.mode === 'visitBull' && tgt.k === 'bull') {
        return bullTurnPoints(pen.vals);
      }
    }
    if (state.phase === 'playing') {
      if (pen.mode === 'visitWedge' && state.target && state.target.k === 'wedge') {
        return sectorTurnPoints(state.target.n, pen.mults);
      }
      if (pen.mode === 'visitBull' && state.target && state.target.k === 'bull') {
        return bullTurnPoints(pen.vals);
      }
    }
    return null;
  }

  function visitHasPartialSelection() {
    var pen = state.pending;
    if (!pen) return false;
    if (pen.mode === 'visitWedge' && pen.mults) {
      return pen.mults.some(function (m) {
        return m !== null && m !== undefined;
      });
    }
    if (pen.mode === 'visitBull' && pen.vals) {
      return pen.vals.some(function (v) {
        return v !== null && v !== undefined;
      });
    }
    return false;
  }

  function pendingTurnTotalPtsPreview() {
    var pen = state.pending;
    if (!pen) return null;
    if (state.phase === 'tiebreak' && state.tiebreak) {
      var tgt = state.tiebreak.target;
      if (pen.mode === 'visitWedge' && tgt.k === 'wedge') {
        return partialSectorTurnPoints(tgt.n, pen.mults);
      }
      if (pen.mode === 'visitBull' && tgt.k === 'bull') {
        return partialBullTurnPoints(pen.vals);
      }
      return null;
    }
    if (state.phase === 'playing') {
      if (pen.mode === 'visitWedge' && state.target && state.target.k === 'wedge') {
        return partialSectorTurnPoints(state.target.n, pen.mults);
      }
      if (pen.mode === 'visitBull' && state.target && state.target.k === 'bull') {
        return partialBullTurnPoints(pen.vals);
      }
    }
    return null;
  }

  function turnScoreDisplay() {
    var pen = state.pending;
    if (!pen || (state.phase !== 'playing' && state.phase !== 'tiebreak')) return '-';
    if (visitHasPartialSelection()) {
      var pv = pendingTurnTotalPtsPreview();
      if (pv !== null && pv !== undefined) return String(pv);
    }
    if (!allTurnThrowsSelected()) {
      return '-';
    }
    var t = pendingTurnTotalPts();
    return t !== null && t !== undefined ? String(t) : '-';
  }

  function updateConfirmEnabled() {
    var ok = allTurnThrowsSelected();
    var label = turnScoreDisplay();
    var $btn = $('#btn-confirm-turn');
    var pen = state.pending;
    var isPick = state.phase === 'playing' && pen && pen.mode === 'pick';

    $btn.prop('disabled', !ok);
    if (isPick) {
      $btn.text('Set target');
      return;
    }

    if (label === '-') {
      $btn.text('Confirm turn — -');
    } else {
      $btn.text('Confirm turn — ' + label + ' pts');
    }
  }

  function applyEstablishDart() {
    if (state.phase !== 'playing' || !state.pending || state.pending.mode !== 'pick') return;
    if (!state.pending.establishChoice) return;

    var pen = state.pending;
    var dart = dartFromEstablishChoice(pen.establishChoice);
    var slot = pen.pickSlot !== undefined ? pen.pickSlot : 0;
    if (slot >= 3) return;

    pen.throws[slot] = dart;
    pen.pickSlot = slot + 1;
    pen.establishChoice = null;

    var pid = state.roundOrder[state.turnIndex];
    var p = playerById(pid);
    if (!p) return;

    var padded = [pen.throws[0], pen.throws[1], pen.throws[2]];
    var res = pointsPickVisit(padded);

    if (res.qualify) {
      var tgt = res.target;
      var fq = findQualification(padded);
      var qIdx = fq.index;
      var ptsNow = 0;
      for (var j = qIdx; j < pen.pickSlot; j++) {
        ptsNow += scoreDartVsTarget(pen.throws[j], tgt);
      }
      p.score += ptsNow;
      addPlayingRoundPoints(p, ptsNow);

      state.target = tgt;
      state.roundPhase = 'scoring';

      var remainingSelf = 3 - pen.pickSlot;

      if (remainingSelf > 0) {
        state.pending = makeVisitPending(tgt);
      } else {
        state.turnIndex += 1;
        if (state.turnIndex >= state.roundOrder.length) {
          completeRoundAfterPlay();
          return;
        }
        state.pending = makeVisitPending(tgt);
      }
      saveGame();
      renderGame();
      return;
    }

    if (pen.pickSlot >= 3) {
      state.turnIndex += 1;
      if (state.turnIndex >= state.roundOrder.length) {
        completeRoundAfterPlay();
        return;
      }
      state.pending = {
        mode: 'pick',
        throws: [null, null, null],
        pickSlot: 0,
        establishChoice: null,
      };
      saveGame();
      renderGame();
      return;
    }

    saveGame();
    renderGame();
  }

  function confirmPlayingTurn() {
    if (state.phase !== 'playing') return;
    if (!allTurnThrowsSelected()) return;

    var pen = state.pending;
    var pid = state.roundOrder[state.turnIndex];
    var p = playerById(pid);
    if (!p || !pen) return;

    var add = 0;
    if (pen.mode === 'visitWedge' && state.target.k === 'wedge') {
      add = sectorTurnPoints(state.target.n, pen.mults);
    } else if (pen.mode === 'visitBull' && state.target.k === 'bull') {
      add = bullTurnPoints(pen.vals);
    }
    p.score += add;
    addPlayingRoundPoints(p, add);

    state.turnIndex += 1;
    if (state.turnIndex >= state.roundOrder.length) {
      completeRoundAfterPlay();
      return;
    }

    state.pending = makeVisitPending(state.target);
    saveGame();
    renderGame();
  }

  function confirmTiebreakTurn() {
    if (state.phase !== 'tiebreak' || !state.tiebreak) return;
    if (!allTurnThrowsSelected()) return;

    var tb = state.tiebreak;
    var pen = state.pending;
    var pid = tb.orderIds[tb.turnIndex];
    var p = playerById(pid);
    if (!p || !pen) return;

    var add = 0;
    if (tb.target.k === 'wedge' && pen.mode === 'visitWedge') {
      add = sectorTurnPoints(tb.target.n, pen.mults);
    } else if (tb.target.k === 'bull' && pen.mode === 'visitBull') {
      add = bullTurnPoints(pen.vals);
    }
    p.score += add;

    tb.turnIndex += 1;

    if (tb.turnIndex >= tb.orderIds.length) {
      if (uniqueWinnerExists()) {
        state.phase = 'finished';
        state.tiebreak = null;
        state.pending = null;
        saveGame();
        renderFinished();
        showScreen('screen-finished');
        return;
      }
      var leaders = getCoLeaderIds();
      if (leaders.length < 2) {
        state.phase = 'finished';
        state.tiebreak = null;
        state.pending = null;
        saveGame();
        renderFinished();
        showScreen('screen-finished');
        return;
      }
      var nextT = randomTiebreakTarget();
      var nextP = makeVisitPending(nextT);
      tb.target = nextT;
      tb.orderIds = sortCoLeaderIdsByFixedOrder(leaders);
      tb.turnIndex = 0;
      tb.pending = nextP;
      state.pending = nextP;
      saveGame();
      renderGame();
      return;
    }

    var nextVisit = makeVisitPending(tb.target);
    tb.pending = nextVisit;
    state.pending = nextVisit;
    saveGame();
    renderGame();
  }

  function confirmTurn() {
    if (state.phase === 'tiebreak') {
      confirmTiebreakTurn();
      return;
    }
    if (state.phase === 'playing' && state.pending && state.pending.mode === 'pick') {
      applyEstablishDart();
      return;
    }
    confirmPlayingTurn();
  }

  function ordinalSuffix(n) {
    var j = n % 10;
    var k100 = n % 100;
    if (k100 >= 11 && k100 <= 13) return 'th';
    if (j === 1) return 'st';
    if (j === 2) return 'nd';
    if (j === 3) return 'rd';
    return 'th';
  }

  function renderRoundScoresTable(playersSorted) {
    ensureRoundTargets();
    var $table = $('#standings-round-scores-table');
    if (!$table.length) return;

    var $thead = $table.find('thead').empty();
    var $tbody = $table.find('tbody').empty();
    var $headRow = $('<tr></tr>');
    $headRow.append($('<th scope="col"></th>').text('Round'));
    playersSorted.forEach(function (p) {
      $headRow.append($('<th scope="col" class="text-end"></th>').text(p.name));
    });
    $thead.append($headRow);

    for (var r = 1; r <= ROUND_COUNT; r++) {
      var target = state.roundTargets[r - 1];
      var $row = $('<tr></tr>');
      $row.append(
        $('<th scope="row" class="text-nowrap"></th>').text(roundTargetRowLabel(target))
      );
      playersSorted.forEach(function (p) {
        ensureRoundScores(p);
        var pts = p.roundScores[r - 1];
        $row.append($('<td class="text-end"></td>').text(typeof pts === 'number' ? String(pts) : '—'));
      });
      $tbody.append($row);
    }

    var $totalRow = $('<tr class="table-light fw-semibold"></tr>');
    $totalRow.append($('<th scope="row"></th>').text('Total'));
    playersSorted.forEach(function (p) {
      $totalRow.append($('<td class="text-end"></td>').text(String(p.score)));
    });
    $tbody.append($totalRow);
  }

  function renderFinished() {
    var playersSorted = state.players.slice().sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return state.fixedPlayerIds.indexOf(a.id) - state.fixedPlayerIds.indexOf(b.id);
    });
    var sorted = playersSorted
      .map(function (p) {
        return { id: p.id, name: p.name, score: p.score };
      });

    var rowsWithRank = [];
    var displayRank = 0;
    var prevScore = null;
    sorted.forEach(function (row, idx) {
      if (prevScore === null || row.score !== prevScore) {
        displayRank = idx + 1;
      }
      prevScore = row.score;
      rowsWithRank.push({ rank: displayRank, name: row.name, score: row.score });
    });

    var byRank = {};
    rowsWithRank.forEach(function (r) {
      if (!byRank[r.rank]) byRank[r.rank] = [];
      byRank[r.rank].push({ name: r.name, score: r.score });
    });

    var first = byRank[1] || [];
    var second = byRank[2] || [];
    var third = byRank[3] || [];

    var $wrap = $('#standings-podium-wrap').empty();

    function podiumColumn(place, rows, emoji) {
      var empty = !rows.length;
      var $col = $('<div class="podium-column podium-column--' + place + (empty ? ' podium-column--empty' : '') + '"></div>');
      var $top = $('<div class="podium-top"></div>');
      $top.append($('<div class="podium-emoji" aria-hidden="true"></div>').text(emoji));
      var namesText = empty ? '—' : rows.map(function (x) { return x.name; }).join(', ');
      var $names = $('<div class="podium-names"></div>').text(namesText);
      if (empty) $names.addClass('podium-names--empty');
      $top.append($names);
      if (!empty) {
        $top.append($('<div class="podium-score-pill"></div>').text(rows[0].score + ' pts'));
      }
      $col.append($top);
      $col.append($('<div class="podium-plinth"></div>').text(String(place)));
      return $col;
    }

    var $pv = $('<div class="podium-visual"></div>');
    $pv.append(podiumColumn(2, second, '🥈'));
    $pv.append(podiumColumn(1, first, '🥇'));
    $pv.append(podiumColumn(3, third, '🥉'));
    $wrap.append($pv);

    renderRoundScoresTable(playersSorted);

    var $rest = $('#standings-rest-list');
    $rest.empty();
    var anyRest = false;
    rowsWithRank.forEach(function (r) {
      if (r.rank >= 4) {
        anyRest = true;
        var label = r.rank + ordinalSuffix(r.rank) + ' — ' + r.name;
        var li = $('<li class="list-group-item d-flex justify-content-between align-items-center"></li>');
        li.append(
          $('<span></span>').text(label),
          $('<span class="badge bg-secondary rounded-pill"></span>').text(r.score)
        );
        $rest.append(li);
      }
    });
    $('#standings-others-heading').toggleClass('d-none', !anyRest);
    $rest.toggleClass('d-none', !anyRest);
  }

  function restoreOrSetup() {
    var saved = loadGame();
    if (saved && saved.phase && saved.players && saved.players.length) {
      state = saved;
      normalizeLegacyVisitPending(state.pending);
      if (state.tiebreak && state.tiebreak.pending) normalizeLegacyVisitPending(state.tiebreak.pending);
      if (!state.initialRoundOrder) state.initialRoundOrder = state.fixedPlayerIds.slice();
      state.players.forEach(function (p) {
        ensureRoundScores(p);
      });
      ensureRoundTargets();
      if (!state.pending && state.phase === 'playing') {
        state.pending =
          state.roundPhase === 'pickTarget' && !state.target
            ? {
                mode: 'pick',
                throws: [null, null, null],
                pickSlot: 0,
                establishChoice: null,
              }
            : makeVisitPending(state.target);
      }
      if (state.pending && state.pending.mode === 'pick') {
        if (state.pending.pickSlot === undefined) state.pending.pickSlot = 0;
        if (state.pending.establishChoice === undefined) state.pending.establishChoice = null;
      }
      if (state.phase === 'playing') {
        renderGame();
        showScreen('screen-game');
        return;
      }
      if (state.phase === 'tiebreak') {
        if (!state.tiebreak || !state.tiebreak.pending) {
          clearGameStorage();
        } else {
          state.pending = state.tiebreak.pending;
          renderGame();
          showScreen('screen-game');
          return;
        }
      }
      if (state.phase === 'finished') {
        renderFinished();
        showScreen('screen-finished');
        return;
      }
    }
    renderSetupPlayers(loadLastNames().length ? loadLastNames() : ['Player 1', 'Player 2']);
    showScreen('screen-setup');
  }

  function abandonGame() {
    if (!confirm('Abandon current game? Progress in this session will be lost.')) return;
    clearGameStorage();
    state = emptyState();
    renderSetupPlayers(loadLastNames().length ? loadLastNames() : ['Player 1', 'Player 2']);
    showScreen('screen-setup');
  }

  $(function () {
    $('#btn-add-player').on('click', function () {
      $('#setup-players').append(
        $('<div class="input-group input-group-lg flex-nowrap"></div>').append(
          $('<span class="input-group-text"></span>').text($('.setup-name').length + 1),
          $('<input type="text" class="form-control setup-name" maxlength="40" placeholder="Name" />'),
          $('<button type="button" class="btn btn-outline-danger btn-remove-player" aria-label="Remove player">&times;</button>')
        )
      );
      renumberSetupRows();
    });

    $(document).on('click', '.btn-remove-player', function () {
      if ($('.setup-name').length <= 1) return;
      $(this).closest('.input-group').remove();
      renumberSetupRows();
    });

    function renumberSetupRows() {
      $('#setup-players .input-group-text').each(function (i) {
        $(this).text(i + 1);
      });
    }

    $('#btn-fill-last').on('click', function () {
      var n = loadLastNames();
      if (!n.length) {
        alert('No saved names yet. Start a game once to save names.');
        return;
      }
      renderSetupPlayers(n);
    });

    $('#btn-start-game').on('click', startGameFromSetup);

    $(document).on('click', '[data-establish]', function () {
      if (state.phase !== 'playing' || !state.pending || state.pending.mode !== 'pick') return;
      var raw = $(this).attr('data-establish');
      var pen = state.pending;
      if (raw === 'miss') pen.establishChoice = { type: 'miss' };
      else if (raw === 'bull') pen.establishChoice = { type: 'bull', v: 50 };
      else if (raw && raw.indexOf('sector-') === 0) {
        pen.establishChoice = { type: 'wedge', s: Number(raw.replace('sector-', '')) };
      }
      saveGame();
      renderThrowsPanel();
      updateConfirmEnabled();
    });

    $(document).on('click', '.throw-btn', function () {
      if (state.phase !== 'playing' && state.phase !== 'tiebreak') return;
      var idx = Number($(this).attr('data-throw-idx'));
      var m = Number($(this).attr('data-mult'));
      if (state.pending && state.pending.mode === 'visitWedge') {
        state.pending.mults[idx] = m;
        if (state.phase === 'tiebreak' && state.tiebreak) state.tiebreak.pending = state.pending;
        saveGame();
        renderThrowsPanel();
        updateConfirmEnabled();
      }
    });

    $(document).on('click', '[data-bull-idx]', function () {
      if (state.phase !== 'playing' && state.phase !== 'tiebreak') return;
      var idx = Number($(this).attr('data-bull-idx'));
      var v = Number($(this).attr('data-bull-val'));
      if (state.pending && state.pending.mode === 'visitBull') {
        state.pending.vals[idx] = v;
        if (state.phase === 'tiebreak' && state.tiebreak) state.tiebreak.pending = state.pending;
        saveGame();
        renderThrowsPanel();
        updateConfirmEnabled();
      }
    });

    $('#btn-confirm-turn').on('click', confirmTurn);

    $('#btn-abandon').on('click', abandonGame);

    $('#btn-new-from-finished').on('click', function () {
      clearGameStorage();
      state = emptyState();
      renderSetupPlayers(loadLastNames().length ? loadLastNames() : ['Player 1', 'Player 2']);
      showScreen('screen-setup');
    });

    restoreOrSetup();
  });
})(jQuery);
