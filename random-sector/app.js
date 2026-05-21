(function ($) {
  'use strict';

  var STORAGE_GAME = 'dartsGameState';
  var STORAGE_NAMES = 'dartsLastPlayerNames';

  var state = {
    phase: 'setup',
    players: [],
    fixedPlayerIds: [],
    round: 1,
    roundTarget: null,
    /** Sector numbers 1–20 already used in completed wedge rounds (rounds 1–6). */
    usedWedgeNumbers: [],
    /** Target per round index 0..6 (wedge number or bull). */
    roundTargets: [],
    roundPlayerIds: [],
    turnIndex: 0,
    pending: null,
  };

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

  function ensureUsedWedgeNumbers() {
    if (!Array.isArray(state.usedWedgeNumbers)) state.usedWedgeNumbers = [];
  }

  /** Uniform random wedge among 1–20 not in `used` (completed earlier wedge rounds). */
  function pickRandomUnusedWedge(used) {
    var pool = [];
    for (var i = 1; i <= 20; i++) {
      if (used.indexOf(i) === -1) pool.push(i);
    }
    if (!pool.length) return { k: 'wedge', n: randomInt(1, 20) };
    return { k: 'wedge', n: pool[randomInt(0, pool.length - 1)] };
  }

  /** Rounds 1–6: uniform random unused wedge 1–20. Round 7: always bull. */
  function randomRoundTarget() {
    var r = Math.max(1, Math.min(7, Number(state.round) || 1));
    if (r === 7) return { k: 'bull' };
    ensureUsedWedgeNumbers();
    return pickRandomUnusedWedge(state.usedWedgeNumbers);
  }

  /** Fix saved games from older rules (e.g. bull before round 7). */
  function normalizeRoundTargetForCurrentRound() {
    ensureUsedWedgeNumbers();
    var r = Math.max(1, Math.min(7, Number(state.round) || 1));
    if (r === 7) {
      if (!state.roundTarget || state.roundTarget.k !== 'bull') {
        state.roundTarget = { k: 'bull' };
      }
    } else {
      var used = state.usedWedgeNumbers;
      var bad =
        !state.roundTarget ||
        state.roundTarget.k === 'bull' ||
        typeof state.roundTarget.n !== 'number' ||
        state.roundTarget.n < 1 ||
        state.roundTarget.n > 20 ||
        used.indexOf(state.roundTarget.n) !== -1;
      if (bad) {
        state.roundTarget = pickRandomUnusedWedge(used);
      }
    }
  }

  /** Clockwise from top — standard dartboard sector numbers */
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

  function updateSectorBoardHighlight(sector) {
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

  function updateBullRoundBoard() {
    resetAllSectorWedgesNeutral();
    $('#dartboard-svg').addClass('dartboard-svg--final-round');
    $('#sector-board-card').addClass('board-final-round');
    $('#dartboard-aria-title').text('Dartboard — bull is the target');
    $('#dartboard-svg').attr(
      'aria-label',
      'Dartboard; outer bull 5 points, bullseye 10 points'
    );
    updateBoardTargetDisplay({ k: 'bull' });
  }

  function setSectorBoardVisible(show) {
    $('#sector-board-card').toggleClass('d-none', !show);
  }

  function updateRoundProgress() {
    var $fill = $('#round-progress-fill');
    var $host = $('#round-progress');
    var $ticks = $('#round-progress-wrap .round-progress-labels span');
    if (!$fill.length || !$host.length) return;

    $ticks.removeClass('fw-bold text-primary');

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

  function playerById(id) {
    for (var i = 0; i < state.players.length; i++) {
      if (state.players[i].id === id) return state.players[i];
    }
    return null;
  }

  function freshSectorPending() {
    return { type: 'sector', turnScore: null };
  }

  /** Wedge rounds: one turn total 0–9 (all three darts combined). */
  function wedgeTurnPoints(turnScore) {
    return typeof turnScore === 'number' ? turnScore : 0;
  }

  /** Bull round: outer bull = 5 pts, bullseye = 10 pts. */
  function bullValsPoints(vals) {
    return vals.reduce(function (sum, v) {
      return sum + (typeof v === 'number' ? v : 0);
    }, 0);
  }

  function applySectorTurnStats(p, turnScore) {
    if (!p || typeof turnScore !== 'number') return;
    if (turnScore === 3) p.triples += 1;
    else if (turnScore === 2) p.doubles += 1;
    else if (turnScore === 1) p.singles += 1;
  }

  var ROUND_COUNT = 7;

  function freshRoundScores() {
    var scores = [];
    for (var i = 0; i < ROUND_COUNT; i++) scores.push(0);
    return scores;
  }

  function cloneRoundTarget(t) {
    if (!t) return null;
    if (t.k === 'bull') return { k: 'bull' };
    return { k: 'wedge', n: t.n };
  }

  function recordCurrentRoundTarget() {
    if (!Array.isArray(state.roundTargets)) state.roundTargets = [];
    var idx = Math.max(0, Math.min(ROUND_COUNT - 1, (Number(state.round) || 1) - 1));
    state.roundTargets[idx] = cloneRoundTarget(state.roundTarget);
  }

  function ensureRoundTargets() {
    if (Array.isArray(state.roundTargets) && state.roundTargets.length === ROUND_COUNT) {
      var complete = true;
      for (var i = 0; i < ROUND_COUNT; i++) {
        var t = state.roundTargets[i];
        if (i === ROUND_COUNT - 1) {
          if (!t || t.k !== 'bull') complete = false;
        } else if (!t || t.k !== 'wedge' || typeof t.n !== 'number') {
          complete = false;
        }
      }
      if (complete) return;
    }
    var targets = [];
    ensureUsedWedgeNumbers();
    var used = state.usedWedgeNumbers;
    for (var w = 0; w < 6; w++) {
      targets.push(w < used.length ? { k: 'wedge', n: used[w] } : { k: 'wedge', n: null });
    }
    targets.push({ k: 'bull' });
    state.roundTargets = targets;
  }

  function roundTargetRowLabel(target) {
    if (!target) return '—';
    if (target.k === 'bull') return 'Bull';
    if (typeof target.n === 'number') return String(target.n);
    return '—';
  }

  function ensureRoundScores(p) {
    if (!p) return;
    if (!Array.isArray(p.roundScores) || p.roundScores.length !== ROUND_COUNT) {
      p.roundScores = freshRoundScores();
    }
  }

  function addRoundPoints(p, roundNum, pts) {
    ensureRoundScores(p);
    var idx = Math.max(0, Math.min(ROUND_COUNT - 1, roundNum - 1));
    p.roundScores[idx] += pts;
  }

  /** When totals tie: higher round score wins, comparing rounds 7 → 1. */
  function compareRoundScoresDesc(a, b) {
    ensureRoundScores(a);
    ensureRoundScores(b);
    for (var r = ROUND_COUNT; r >= 1; r--) {
      var ai = a.roundScores[r - 1] || 0;
      var bi = b.roundScores[r - 1] || 0;
      if (bi !== ai) return bi - ai;
    }
    return 0;
  }

  function standingRankKey(row) {
    ensureRoundScores(row);
    return row.score + '|' + row.roundScores.join(',');
  }

  function compareStanding(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    var roundCmp = compareRoundScoresDesc(a, b);
    if (roundCmp !== 0) return roundCmp;
    return state.fixedPlayerIds.indexOf(a.id) - state.fixedPlayerIds.indexOf(b.id);
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
      players.push({
        id: id,
        name: name,
        score: 0,
        roundScores: freshRoundScores(),
        triples: 0,
        doubles: 0,
        singles: 0,
      });
    });

    state.phase = 'playing';
    state.players = players;
    state.fixedPlayerIds = fixed;
    state.round = 1;
    state.usedWedgeNumbers = [];
    state.roundTargets = [];
    state.roundTarget = randomRoundTarget();
    recordCurrentRoundTarget();
    state.roundPlayerIds = fixed.slice();
    state.turnIndex = 0;
    state.pending =
      state.roundTarget.k === 'bull'
        ? { type: 'bull', vals: [null, null, null] }
        : freshSectorPending();

    saveGame();
    renderGame();
    showScreen('screen-game');
  }

  function beginRound(nextRound) {
    state.round = nextRound;
    state.roundTarget = randomRoundTarget();
    recordCurrentRoundTarget();
    state.roundPlayerIds = state.fixedPlayerIds.slice();
    state.turnIndex = 0;
    state.pending =
      state.roundTarget.k === 'bull'
        ? { type: 'bull', vals: [null, null, null] }
        : freshSectorPending();
  }

  function afterRoundComplete() {
    var r = state.round;
    if (r < 7) {
      ensureUsedWedgeNumbers();
      if (state.roundTarget && state.roundTarget.k === 'wedge') {
        state.usedWedgeNumbers.push(state.roundTarget.n);
      }
      beginRound(r + 1);
      return;
    }
    state.phase = 'finished';
    state.pending = null;
    saveGame();
    renderFinished();
    showScreen('screen-finished');
  }

  function renderScoreTable($tbody) {
    $tbody.empty();
    var curId =
      state.phase === 'playing' ? state.roundPlayerIds[state.turnIndex] : null;

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
    updateRoundProgress();
    $('#game-phase-hint').text('');
    setSectorBoardVisible(true);
    if (state.roundTarget.k === 'bull') {
      updateBullRoundBoard();
    } else {
      updateSectorBoardHighlight(state.roundTarget.n);
    }

    renderScoreTable($('#score-tbody'));

    var pid = state.roundPlayerIds[state.turnIndex];
    var p = playerById(pid);
    var actionTail = '';
    if (p) {
      actionTail =
        state.roundTarget.k === 'bull' ? ' — set throws' : ' — enter turn score (0–9)';
    }
    setCurrentTurnHeader(p ? p.name : null, actionTail);

    renderThrowsPanel();
    updateConfirmEnabled();
  }

  function renderThrowsPanel() {
    var $panel = $('#throws-panel');
    $panel.empty();
    var pending = state.pending;
    if (!pending) return;

    if (pending.type === 'sector') {
      var sel = pending.turnScore;
      var $wrap = $('<div class="visit-calculator"></div>');
      var $pad = $('<div class="calc-keypad card bg-light border p-3"></div>');
      var $grid = $('<div class="calc-keypad-grid"></div>');

      function addDigitRow(nums) {
        var $row = $('<div class="calc-keypad-row"></div>');
        nums.forEach(function (num) {
          var active = sel === num;
          $row.append(
            $('<button type="button" class="btn btn-lg sector-turn-digit"></button>')
              .addClass(active ? 'btn-primary' : 'btn-outline-primary')
              .text(String(num))
              .attr('data-turn-score', num)
          );
        });
        $grid.append($row);
      }

      addDigitRow([1, 2, 3]);
      addDigitRow([4, 5, 6]);
      addDigitRow([7, 8, 9]);

      var $bottom = $('<div class="calc-keypad-row calc-keypad-row--zero-row"></div>');
      $bottom.append($('<span class="calc-keypad-placeholder" aria-hidden="true"></span>'));
      $bottom.append(
        $('<button type="button" class="btn btn-lg sector-turn-digit"></button>')
          .addClass(sel === 0 ? 'btn-primary' : 'btn-outline-primary')
          .text('0')
          .attr('data-turn-score', 0)
      );
      $bottom.append($('<span class="calc-keypad-placeholder" aria-hidden="true"></span>'));
      $grid.append($bottom);

      $pad.append($grid);
      $wrap.append($pad);
      $panel.append($wrap);
    } else if (pending.type === 'bull') {
      for (var j = 0; j < 3; j++) {
        (function (idx) {
          var row = $('<div class="mb-3"></div>');
          var sel = pending.vals[idx];
          var btnRow = $('<div class="row g-2"></div>');
          [
            { v: 0, label: 'Miss', cls: 'btn-outline-secondary' },
            { v: 5, label: '5', cls: 'btn-outline-success' },
            { v: 10, label: '10', cls: 'btn-outline-success' },
          ].forEach(function (L) {
            var active = sel === L.v;
            var b = $('<button type="button" class="btn btn-lg throw-btn"></button>')
              .addClass(active ? 'btn-success' : L.cls)
              .text(L.label)
              .attr('data-bull-idx', idx)
              .attr('data-bull-val', L.v);
            btnRow.append($('<div class="col-4 col-sm-auto d-grid"></div>').append(b));
          });
          row.append(btnRow);
          $panel.append(row);
        })(j);
      }
    }
  }

  /** All three darts must have an explicit choice (miss counts as a choice once tapped). */
  function allTurnThrowsSelected() {
    var pen = state.pending;
    if (!pen || state.phase !== 'playing') return false;
    if (pen.type === 'sector') {
      return pen.turnScore !== null && pen.turnScore !== undefined;
    }
    if (pen.type === 'bull') {
      return (
        Array.isArray(pen.vals) &&
        pen.vals.length === 3 &&
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
    if (pen.type === 'sector') return wedgeTurnPoints(pen.turnScore);
    if (pen.type === 'bull') return bullValsPoints(pen.vals);
    return null;
  }

  /** Running sum of throws chosen so far; "-" when none chosen yet. */
  function turnScoreDisplay() {
    var pen = state.pending;
    if (!pen || state.phase !== 'playing') return '-';
    if (pen.type === 'sector') {
      return pen.turnScore !== null && pen.turnScore !== undefined
        ? String(pen.turnScore)
        : '-';
    }
    if (pen.type === 'bull') {
      var bSum = 0;
      var bAny = false;
      for (var j = 0; j < 3; j++) {
        var v = pen.vals[j];
        if (v !== null && v !== undefined) {
          bSum += v;
          bAny = true;
        }
      }
      return bAny ? String(bSum) : '-';
    }
    return '-';
  }

  function updateConfirmEnabled() {
    var ok = allTurnThrowsSelected();
    var label = turnScoreDisplay();
    var $btn = $('#btn-confirm-turn');
    $btn.prop('disabled', !ok);
    if (label === '-') {
      $btn.text('Confirm turn — -');
    } else if (ok) {
      $btn.text('Confirm turn — ' + label + ' pts');
    } else {
      $btn.text('Confirm turn — ' + label);
    }
  }

  function confirmTurn() {
    if (state.phase !== 'playing') return;
    if (!allTurnThrowsSelected()) return;
    var pen = state.pending;
    var pid = state.roundPlayerIds[state.turnIndex];
    var p = playerById(pid);
    if (!p || !pen) return;

    var turnPts = 0;
    if (pen.type === 'sector') {
      turnPts = wedgeTurnPoints(pen.turnScore);
      p.score += turnPts;
      applySectorTurnStats(p, pen.turnScore);
    } else if (pen.type === 'bull') {
      turnPts = bullValsPoints(pen.vals);
      p.score += turnPts;
    } else {
      return;
    }
    addRoundPoints(p, state.round, turnPts);

    state.turnIndex += 1;
    if (state.turnIndex >= state.roundPlayerIds.length) {
      afterRoundComplete();
      if (state.phase === 'playing') {
        saveGame();
        renderGame();
      }
      return;
    }

    if (state.roundTarget.k === 'bull') {
      state.pending = { type: 'bull', vals: [null, null, null] };
    } else {
      state.pending = freshSectorPending();
    }
    saveGame();
    renderGame();
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
    var playersSorted = state.players.slice().sort(compareStanding);
    var sorted = playersSorted
      .map(function (p) {
        var row = {
          id: p.id,
          name: p.name,
          score: p.score,
          triples: typeof p.triples === 'number' ? p.triples : 0,
          doubles: typeof p.doubles === 'number' ? p.doubles : 0,
          singles: typeof p.singles === 'number' ? p.singles : 0,
        };
        ensureRoundScores(p);
        row.roundScores = p.roundScores.slice();
        return row;
      })
      .sort(compareStanding);

    var rowsWithRank = [];
    var displayRank = 0;
    var prevKey = null;
    sorted.forEach(function (row, idx) {
      var key = standingRankKey(row);
      if (prevKey === null || key !== prevKey) {
        displayRank = idx + 1;
      }
      prevKey = key;
      rowsWithRank.push({
        rank: displayRank,
        name: row.name,
        score: row.score,
        triples: row.triples,
        doubles: row.doubles,
        singles: row.singles,
      });
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
      if (
        saved.phase === 'tiebreak' ||
        saved.round > 7 ||
        (saved.phase === 'playing' && saved.round > 7)
      ) {
        clearGameStorage();
      } else {
        state = saved;
        if (state.tiebreak !== undefined) delete state.tiebreak;
        if (!state.roundTarget && typeof state.targetSector === 'number') {
          state.roundTarget = { k: 'wedge', n: state.targetSector };
        }
        if (state.targetSector !== undefined) delete state.targetSector;
        ensureUsedWedgeNumbers();
        normalizeRoundTargetForCurrentRound();
        ensureRoundTargets();
        if (state.phase === 'playing') {
          recordCurrentRoundTarget();
        }
        state.players.forEach(function (p) {
          if (typeof p.triples !== 'number') p.triples = 0;
          if (typeof p.doubles !== 'number') p.doubles = 0;
          if (typeof p.singles !== 'number') p.singles = 0;
          ensureRoundScores(p);
        });
        if (state.phase === 'playing') {
          var wantBull = state.roundTarget && state.roundTarget.k === 'bull';
          var pendingBull = state.pending && state.pending.type === 'bull';
          if (!state.pending || wantBull !== pendingBull) {
            state.pending = wantBull
              ? { type: 'bull', vals: [null, null, null] }
              : freshSectorPending();
          } else if (
            state.pending.type === 'sector' &&
            (state.pending.mults !== undefined || state.pending.turnScore === undefined)
          ) {
            state.pending = freshSectorPending();
          }
        }
        if (state.phase === 'playing') {
          renderGame();
          showScreen('screen-game');
          return;
        }
        if (state.phase === 'finished') {
          renderFinished();
          showScreen('screen-finished');
          return;
        }
      }
    }
    renderSetupPlayers(loadLastNames().length ? loadLastNames() : ['Player 1', 'Player 2']);
    showScreen('screen-setup');
  }

  function abandonGame() {
    if (!confirm('Abandon current game? Progress in this session will be lost.')) return;
    clearGameStorage();
    state = {
      phase: 'setup',
      players: [],
      fixedPlayerIds: [],
      round: 1,
      roundTarget: null,
      usedWedgeNumbers: [],
      roundTargets: [],
      roundPlayerIds: [],
      turnIndex: 0,
      pending: null,
    };
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

    $(document).on('click', '.sector-turn-digit', function () {
      if (state.phase !== 'playing') return;
      if (!state.pending || state.pending.type !== 'sector') return;
      state.pending.turnScore = Number($(this).attr('data-turn-score'));
      saveGame();
      renderThrowsPanel();
      updateConfirmEnabled();
    });

    $(document).on('click', '[data-bull-idx]', function () {
      if (state.phase !== 'playing') return;
      if (!state.pending || state.pending.type !== 'bull') return;
      var idx = Number($(this).attr('data-bull-idx'));
      var v = Number($(this).attr('data-bull-val'));
      state.pending.vals[idx] = v;
      saveGame();
      renderThrowsPanel();
      updateConfirmEnabled();
    });

    $('#btn-confirm-turn').on('click', confirmTurn);

    $('#btn-abandon').on('click', abandonGame);

    $('#btn-new-from-finished').on('click', function () {
      clearGameStorage();
      state = {
        phase: 'setup',
        players: [],
        fixedPlayerIds: [],
        round: 1,
        roundTarget: null,
        usedWedgeNumbers: [],
        roundTargets: [],
        roundPlayerIds: [],
        turnIndex: 0,
        pending: null,
      };
      renderSetupPlayers(loadLastNames().length ? loadLastNames() : ['Player 1', 'Player 2']);
      showScreen('screen-setup');
    });

    restoreOrSetup();
  });
})(jQuery);
