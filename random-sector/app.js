(function ($) {
  'use strict';

  var STORAGE_GAME = 'dartsGameState';
  var STORAGE_NAMES = 'dartsLastPlayerNames';

  var state = {
    phase: 'setup',
    players: [],
    fixedPlayerIds: [],
    round: 1,
    targetSector: null,
    roundPlayerIds: [],
    turnIndex: 0,
    pending: null,
    tiebreak: null,
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

  function ensureDartboardSectors() {
    if (dartboardSectorsBuilt) return;
    var $g = $('#dartboard-sectors');
    if (!$g.length) return;
    var cx = 100;
    var cy = 100;
    var rIn = 26;
    var rOut = 94;
    for (var i = 0; i < 20; i++) {
      var a0 = -90 + i * 18;
      var a1 = a0 + 18;
      var d = wedgePath(cx, cy, rIn, rOut, a0, a1);
      var sectorNum = DART_SECTOR_ORDER[i];
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('data-sector', String(sectorNum));
      path.setAttribute('data-wedge-index', String(i));
      path.setAttribute(
        'class',
        'dart-sector ' + (i % 2 === 0 ? 'dart-sector--inactive-even' : 'dart-sector--inactive-odd')
      );
      $g[0].appendChild(path);
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
      $p.attr(
        'class',
        'dart-sector ' + (idx % 2 === 0 ? 'dart-sector--inactive-even' : 'dart-sector--inactive-odd')
      );
    });
  }

  function updateDartboardFinalRound() {
    resetAllSectorWedgesNeutral();
    $('#dartboard-wedge-label').css('visibility', 'hidden');
    $('#dartboard-svg').addClass('dartboard-svg--final-round');
    $('#dartboard-aria-title').text('Dartboard — final round, bull only');
    $('#dartboard-svg').attr('aria-label', 'Dartboard; aim at the bull — outer ring 25, inner bull 50');
  }

  function updateSectorBoardHighlight(sector) {
    $('#dartboard-svg').removeClass('dartboard-svg--final-round');
    ensureDartboardSectors();
    $('#dartboard-sectors path').each(function () {
      var $p = $(this);
      var s = Number($p.attr('data-sector'));
      var idx = Number($p.attr('data-wedge-index'));
      var isTarget = s === sector;
      if (isTarget) {
        $p.attr('class', 'dart-sector dart-sector--target');
      } else {
        $p.attr(
          'class',
          'dart-sector ' + (idx % 2 === 0 ? 'dart-sector--inactive-even' : 'dart-sector--inactive-odd')
        );
      }
    });

    var wi = sectorIndexForNumber(sector);
    var $label = $('#dartboard-wedge-label');
    if (wi < 0) {
      $label.css('visibility', 'hidden');
      return;
    }
    var midDeg = -90 + wi * 18 + 9;
    var midRad = (midDeg * Math.PI) / 180;
    var rLabel = 78;
    var lx = 100 + rLabel * Math.cos(midRad);
    var ly = 100 + rLabel * Math.sin(midRad);
    $label.text(String(sector));
    $label.attr('x', lx);
    $label.attr('y', ly);
    $label.css('visibility', 'visible');

    $('#dartboard-svg').attr('aria-label', 'Dartboard; target sector ' + sector);
    $('#dartboard-aria-title').text('Dartboard — target sector ' + sector);
  }

  function setSectorBoardVisible(show) {
    $('#sector-board-card').toggleClass('d-none', !show);
  }

  function playerById(id) {
    for (var i = 0; i < state.players.length; i++) {
      if (state.players[i].id === id) return state.players[i];
    }
    return null;
  }

  function sortIdsForFinalRound() {
    var fixed = state.fixedPlayerIds;
    var list = state.players.map(function (p) {
      return { id: p.id, score: p.score };
    });
    list.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return fixed.indexOf(a.id) - fixed.indexOf(b.id);
    });
    return list.map(function (x) { return x.id; });
  }

  function sortCoLeaderIdsByFixedOrder(leaderIds) {
    var fixed = state.fixedPlayerIds;
    return leaderIds.slice().sort(function (a, b) {
      return fixed.indexOf(a) - fixed.indexOf(b);
    });
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
    return state.players.filter(function (p) {
      return p.score === max;
    }).map(function (p) {
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

  function sectorTurnPoints(targetSector, mults) {
    var t = targetSector;
    return mults.reduce(function (sum, m) {
      return sum + t * m;
    }, 0);
  }

  function bullTurnPoints(vals) {
    return vals.reduce(function (a, b) {
      return a + b;
    }, 0);
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
      players.push({ id: id, name: name, score: 0 });
    });

    state.phase = 'playing';
    state.players = players;
    state.fixedPlayerIds = fixed;
    state.round = 1;
    state.targetSector = randomInt(1, 20);
    state.roundPlayerIds = fixed.slice();
    state.turnIndex = 0;
    state.pending = { type: 'sector', mults: [null, null, null] };
    state.tiebreak = null;

    saveGame();
    renderGame();
    showScreen('screen-game');
  }

  function beginRound(nextRound) {
    state.round = nextRound;
    if (nextRound <= 7) {
      state.targetSector = randomInt(1, 20);
      state.roundPlayerIds = state.fixedPlayerIds.slice();
    } else if (nextRound === 8) {
      state.targetSector = null;
      state.roundPlayerIds = sortIdsForFinalRound();
    }
    state.turnIndex = 0;
    if (nextRound <= 7) {
      state.pending = { type: 'sector', mults: [null, null, null] };
    } else {
      state.pending = { type: 'bull', vals: [null, null, null] };
    }
  }

  function afterRoundComplete() {
    var r = state.round;
    if (r < 7) {
      beginRound(r + 1);
      return;
    }
    if (r === 7) {
      beginRound(8);
      return;
    }
    if (r === 8) {
      finishRegularPlay();
    }
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
    var tiePending = { type: 'sector', mults: [null, null, null] };
    var tieOrder = sortCoLeaderIdsByFixedOrder(leaders);
    state.phase = 'tiebreak';
    state.tiebreak = {
      targetSector: randomInt(1, 20),
      orderIds: tieOrder,
      turnIndex: 0,
      pending: tiePending,
    };
    state.pending = tiePending;
    state.targetSector = state.tiebreak.targetSector;
    state.roundPlayerIds = tieOrder;
    state.turnIndex = 0;
    saveGame();
    renderGame();
    showScreen('screen-game');
  }

  function renderScoreTable($tbody) {
    $tbody.empty();
    var curId =
      state.phase === 'playing' || state.phase === 'tiebreak'
        ? state.roundPlayerIds[state.turnIndex]
        : null;

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
      state.targetSector = tb.targetSector;
      state.roundPlayerIds = tb.orderIds;
      state.turnIndex = tb.turnIndex;
      state.pending = tb.pending;
    }

    if (state.phase === 'tiebreak') {
      $('#tiebreak-banner').removeClass('d-none');
      $('#game-round-label').text('Tie-break');
      $('#game-target-wrap').removeClass('d-none');
      $('#game-target-label').text('Sector ' + state.targetSector);
      $('#game-phase-hint').text(
        'Same rules as rounds 1–7: one random sector per wave; only tied leaders take turns (order below).'
      );
      $('#dartboard-round-heading').text('Tie-break — hit this sector');
      $('#sector-board-card').removeClass('board-final-round');
      setSectorBoardVisible(true);
      updateSectorBoardHighlight(state.targetSector);
      renderScoreTable($('#score-tbody'));
      var pidTb = state.roundPlayerIds[state.turnIndex];
      var pTb = playerById(pidTb);
      $('#current-player-label').text(pTb ? pTb.name + ' — set throws' : '—');
      renderThrowsPanel();
      updateConfirmEnabled();
      return;
    }

    $('#tiebreak-banner').addClass('d-none');

    var r = state.round;
    $('#game-round-label').text(r + ' / 8');
    if (r <= 7) {
      $('#game-target-wrap').removeClass('d-none');
      $('#game-target-label').text('Sector ' + state.targetSector);
      $('#game-phase-hint').text(
        'Same target for everyone this round. Record single / double / triple on that sector (real scores).'
      );
      $('#dartboard-round-heading').text('Round target — hit this sector');
      $('#sector-board-card').removeClass('board-final-round');
      setSectorBoardVisible(true);
      updateSectorBoardHighlight(state.targetSector);
    } else {
      $('#game-target-wrap').removeClass('d-none');
      $('#game-target-label').text('Bull only');
      $('#game-phase-hint').text(
        'Final round — throws are miss (0), outer bull (25), or inner bull (50). Turn order: highest score first.'
      );
      $('#dartboard-round-heading').text('Final round — aim at the bull');
      $('#sector-board-card').addClass('board-final-round');
      setSectorBoardVisible(true);
      updateDartboardFinalRound();
    }

    renderScoreTable($('#score-tbody'));

    var pid = state.roundPlayerIds[state.turnIndex];
    var p = playerById(pid);
    $('#current-player-label').text(p ? p.name + ' — set throws' : '—');

    renderThrowsPanel();
    updateConfirmEnabled();
  }

  function renderThrowsPanel() {
    var $panel = $('#throws-panel');
    $panel.empty();
    var pending = state.pending;
    if (!pending) return;

    if (pending.type === 'sector') {
      for (var i = 0; i < 3; i++) {
        (function (idx) {
          var row = $('<div class="mb-3"></div>');
          var sel = pending.mults[idx];
          var btnRow = $('<div class="d-flex flex-wrap gap-2"></div>');
          var labels = [
            { m: 0, label: 'Miss', cls: 'btn-outline-secondary' },
            { m: 1, label: 'Single', cls: 'btn-outline-primary' },
            { m: 2, label: 'Double', cls: 'btn-outline-primary' },
            { m: 3, label: 'Triple', cls: 'btn-outline-primary' },
          ];
          labels.forEach(function (L) {
            var active = sel === L.m;
            var b = $('<button type="button" class="btn btn-lg throw-btn"></button>')
              .addClass(active ? 'btn-primary' : L.cls)
              .text(L.label)
              .attr('data-throw-idx', idx)
              .attr('data-mult', L.m);
            btnRow.append(b);
          });
          row.append(btnRow);
          $panel.append(row);
        })(i);
      }
    } else if (pending.type === 'bull') {
      for (var j = 0; j < 3; j++) {
        (function (idx) {
          var row = $('<div class="mb-3"></div>');
          var sel = pending.vals[idx];
          var btnRow = $('<div class="d-flex flex-wrap gap-2"></div>');
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
            btnRow.append(b);
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
    if (!pen || (state.phase !== 'playing' && state.phase !== 'tiebreak')) return false;
    if (pen.type === 'sector') {
      return (
        Array.isArray(pen.mults) &&
        pen.mults.length === 3 &&
        pen.mults.every(function (m) {
          return m !== null && m !== undefined;
        })
      );
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
    if (pen.type === 'sector') {
      return sectorTurnPoints(state.targetSector, pen.mults);
    }
    if (pen.type === 'bull') {
      return bullTurnPoints(pen.vals);
    }
    return null;
  }

  /** Running sum of throws chosen so far; "-" when none chosen yet. */
  function turnScoreDisplay() {
    var pen = state.pending;
    if (!pen || (state.phase !== 'playing' && state.phase !== 'tiebreak')) return '-';
    if (pen.type === 'sector') {
      var t = state.targetSector;
      var sum = 0;
      var any = false;
      for (var i = 0; i < 3; i++) {
        var m = pen.mults[i];
        if (m !== null && m !== undefined) {
          sum += t * m;
          any = true;
        }
      }
      return any ? String(sum) : '-';
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

  function confirmTiebreakTurn() {
    if (state.phase !== 'tiebreak' || !state.tiebreak) return;
    if (!allTurnThrowsSelected()) return;
    var tb = state.tiebreak;
    var pen = state.pending;
    var pid = state.roundPlayerIds[state.turnIndex];
    var p = playerById(pid);
    if (!p || !pen || pen.type !== 'sector') return;

    p.score += sectorTurnPoints(state.targetSector, pen.mults);

    state.turnIndex += 1;
    tb.turnIndex = state.turnIndex;

    if (state.turnIndex >= state.roundPlayerIds.length) {
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
      var nextPending = { type: 'sector', mults: [null, null, null] };
      tb.orderIds = sortCoLeaderIdsByFixedOrder(leaders);
      tb.targetSector = randomInt(1, 20);
      tb.turnIndex = 0;
      tb.pending = nextPending;
      state.pending = nextPending;
      state.targetSector = tb.targetSector;
      state.roundPlayerIds = tb.orderIds;
      state.turnIndex = 0;
      saveGame();
      renderGame();
      return;
    }

    var nextP = { type: 'sector', mults: [null, null, null] };
    state.pending = nextP;
    tb.pending = nextP;
    saveGame();
    renderGame();
  }

  function confirmTurn() {
    if (state.phase === 'tiebreak') {
      confirmTiebreakTurn();
      return;
    }
    if (state.phase !== 'playing') return;
    if (!allTurnThrowsSelected()) return;
    var pen = state.pending;
    var pid = state.roundPlayerIds[state.turnIndex];
    var p = playerById(pid);
    if (!p || !pen) return;

    var add = 0;
    if (pen.type === 'sector') {
      add = sectorTurnPoints(state.targetSector, pen.mults);
    } else if (pen.type === 'bull') {
      add = bullTurnPoints(pen.vals);
    }
    p.score += add;

    state.turnIndex += 1;
    if (state.turnIndex >= state.roundPlayerIds.length) {
      afterRoundComplete();
      if (state.phase === 'playing') {
        saveGame();
        renderGame();
      }
      return;
    }

    if (state.round <= 7) {
      state.pending = { type: 'sector', mults: [null, null, null] };
    } else {
      state.pending = { type: 'bull', vals: [null, null, null] };
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

  function renderFinished() {
    var sorted = state.players
      .map(function (p) {
        return { id: p.id, name: p.name, score: p.score };
      })
      .sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return state.fixedPlayerIds.indexOf(a.id) - state.fixedPlayerIds.indexOf(b.id);
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
      if (!state.pending && state.phase === 'playing') {
        if (state.round <= 7) {
          state.pending = { type: 'sector', mults: [null, null, null] };
        } else {
          state.pending = { type: 'bull', vals: [null, null, null] };
        }
      }
      if (state.phase === 'playing') {
        renderGame();
        showScreen('screen-game');
        return;
      }
      if (state.phase === 'tiebreak') {
        if (!state.tiebreak || !state.tiebreak.pending || state.tiebreak.pending.type !== 'sector') {
          clearGameStorage();
        } else {
          state.pending = state.tiebreak.pending;
          state.targetSector = state.tiebreak.targetSector;
          state.roundPlayerIds = state.tiebreak.orderIds;
          state.turnIndex = state.tiebreak.turnIndex;
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
    state = {
      phase: 'setup',
      players: [],
      fixedPlayerIds: [],
      round: 1,
      targetSector: null,
      roundPlayerIds: [],
      turnIndex: 0,
      pending: null,
      tiebreak: null,
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

    $(document).on('click', '.throw-btn', function () {
      if (state.phase !== 'playing' && state.phase !== 'tiebreak') return;
      var idx = Number($(this).attr('data-throw-idx'));
      var m = Number($(this).attr('data-mult'));
      if (state.pending && state.pending.type === 'sector') {
        state.pending.mults[idx] = m;
        saveGame();
        renderThrowsPanel();
        updateConfirmEnabled();
      }
    });

    $(document).on('click', '[data-bull-idx]', function () {
      if (state.phase !== 'playing') return;
      var idx = Number($(this).attr('data-bull-idx'));
      var v = Number($(this).attr('data-bull-val'));
      if (state.pending && state.pending.type === 'bull') {
        state.pending.vals[idx] = v;
        saveGame();
        renderThrowsPanel();
        updateConfirmEnabled();
      }
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
        targetSector: null,
        roundPlayerIds: [],
        turnIndex: 0,
        pending: null,
        tiebreak: null,
      };
      renderSetupPlayers(loadLastNames().length ? loadLastNames() : ['Player 1', 'Player 2']);
      showScreen('screen-setup');
    });

    restoreOrSetup();
  });
})(jQuery);
