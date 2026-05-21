(function ($) {
  'use strict';

  var STORAGE_GAME = 'maxGameState';
  var STORAGE_NAMES = 'dartsLastPlayerNames';

  /** Max score for one visit (three darts). */
  var MAX_VISIT_SCORE = 180;
  var MAX_BUFFER_LEN = 3;

  var ROUND_COUNT = 7;

  var state = {
    phase: 'setup',
    players: [],
    fixedPlayerIds: [],
    round: 1,
    roundPlayerIds: [],
    turnIndex: 0,
    pending: null,
  };

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

  function addRoundPoints(p, pts) {
    if (state.phase !== 'playing' || !p) return;
    ensureRoundScores(p);
    var idx = Math.max(0, Math.min(ROUND_COUNT - 1, (Number(state.round) || 1) - 1));
    p.roundScores[idx] += pts;
  }

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

  function compareStanding(a, b) {
    if (b.score !== a.score) return b.score - a.score;
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

  function freshPendingTurn() {
    return { buffer: '' };
  }

  function parsedVisitScore(buffer) {
    if (!buffer || buffer.length === 0) return null;
    var n = parseInt(buffer, 10);
    if (isNaN(n)) return 0;
    if (n < 0) return 0;
    if (n > MAX_VISIT_SCORE) return MAX_VISIT_SCORE;
    return n;
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

    state.phase = 'playing';
    state.players = players;
    state.fixedPlayerIds = fixed;
    state.round = 1;
    state.roundPlayerIds = fixed.slice();
    state.turnIndex = 0;
    state.pending = freshPendingTurn();

    saveGame();
    renderGame();
    showScreen('screen-game');
  }

  function beginNextRound(nextRound) {
    state.round = nextRound;
    state.roundPlayerIds = state.fixedPlayerIds.slice();
    state.turnIndex = 0;
    state.pending = freshPendingTurn();
  }

  function afterRoundComplete() {
    var r = state.round;
    if (r < 7) {
      beginNextRound(r + 1);
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
    var curId = state.phase === 'playing' ? state.roundPlayerIds[state.turnIndex] : null;

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

  function renderThrowsPanel() {
    var $panel = $('#throws-panel');
    $panel.empty();
    var pending = state.pending;
    if (!pending || typeof pending.buffer !== 'string') return;

    var $wrap = $('<div class="visit-calculator"></div>');
    var $pad = $('<div class="calc-keypad card bg-light border p-3"></div>');
    var $grid = $('<div class="calc-keypad-grid"></div>');

    function addDigitRow(nums) {
      var $row = $('<div class="calc-keypad-row"></div>');
      nums.forEach(function (num) {
        $row.append(
          $('<button type="button" class="btn btn-lg btn-outline-primary calc-digit"></button>')
            .text(String(num))
            .attr('data-calc-digit', num)
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
      $('<button type="button" class="btn btn-lg btn-outline-primary calc-digit"></button>')
        .text('0')
        .attr('data-calc-digit', 0)
    );
    $bottom.append(
      $('<button type="button" class="btn btn-lg btn-outline-danger calc-clr"></button>')
        .text('CLR')
        .attr('data-calc-clr', '1')
    );
    $grid.append($bottom);

    $pad.append($grid);
    $wrap.append($pad);
    $panel.append($wrap);
  }

  function updateConfirmEnabled() {
    var pending = state.pending;
    var buf = pending && typeof pending.buffer === 'string' ? pending.buffer : '';
    var ok = buf.length > 0;
    var pts = ok ? parsedVisitScore(buf) : null;

    var $btn = $('#btn-confirm-turn');
    $btn.prop('disabled', !ok);
    if (!ok) {
      $btn.text('Confirm turn — -');
    } else {
      $btn.text('Confirm turn — ' + pts + ' pts');
    }
  }

  function renderGame() {
    updateRoundProgress();
    $('#game-phase-hint').text(
      'Round ' + state.round + ' of 7 — enter your visit total (three darts).'
    );

    renderScoreTable($('#score-tbody'));

    var pid = state.roundPlayerIds[state.turnIndex];
    var p = playerById(pid);
    setCurrentTurnHeader(p ? p.name : null, p ? ' — enter visit total' : '');

    renderThrowsPanel();
    updateConfirmEnabled();
  }

  function confirmTurn() {
    if (state.phase !== 'playing') return;
    if (!state.pending || typeof state.pending.buffer !== 'string') return;
    var buf = state.pending.buffer;
    if (buf.length === 0) return;

    var pts = parsedVisitScore(buf);

    var pid = state.roundPlayerIds[state.turnIndex];
    var p = playerById(pid);
    if (!p) return;

    p.score += pts;
    addRoundPoints(p, pts);

    state.turnIndex += 1;
    if (state.turnIndex >= state.roundPlayerIds.length) {
      afterRoundComplete();
      if (state.phase === 'playing') {
        saveGame();
        renderGame();
      }
      return;
    }

    state.pending = freshPendingTurn();
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
      var $row = $('<tr></tr>');
      $row.append($('<th scope="row" class="text-nowrap"></th>').text(String(r)));
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
    var sorted = playersSorted.map(function (p) {
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
      rowsWithRank.push({
        rank: displayRank,
        name: row.name,
        score: row.score,
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
      var $col = $(
        '<div class="podium-column podium-column--' +
          place +
          (empty ? ' podium-column--empty' : '') +
          '"></div>'
      );
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

  function normalizePending(raw) {
    if (!raw || typeof raw !== 'object') return freshPendingTurn();
    if (raw.darts && Array.isArray(raw.darts)) return freshPendingTurn();
    if (typeof raw.buffer !== 'string') return freshPendingTurn();
    var buf = raw.buffer.replace(/\D/g, '').slice(0, MAX_BUFFER_LEN);
    return { buffer: buf };
  }

  function restoreOrSetup() {
    var saved = loadGame();
    if (saved && saved.phase && saved.players && saved.players.length) {
      if (saved.phase === 'playing' && (saved.round > 7 || saved.round < 1)) {
        clearGameStorage();
      } else {
        state = saved;
        state.players.forEach(function (p) {
          if (typeof p.score !== 'number') p.score = 0;
          ensureRoundScores(p);
        });
        if (!state.fixedPlayerIds || !state.fixedPlayerIds.length) {
          state.fixedPlayerIds = state.players.map(function (p) { return p.id; });
        }
        if (!state.roundPlayerIds || !state.roundPlayerIds.length) {
          state.roundPlayerIds = state.fixedPlayerIds.slice();
        }
        if (state.phase === 'playing') {
          state.pending = normalizePending(state.pending);
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

    $(document).on('click', '.calc-digit', function () {
      if (state.phase !== 'playing' || !state.pending) return;
      var digit = String($(this).attr('data-calc-digit'));
      if (!/^\d$/.test(digit)) return;
      var buf = state.pending.buffer;
      if (buf.length >= MAX_BUFFER_LEN) return;
      state.pending.buffer = buf + digit;
      saveGame();
      updateConfirmEnabled();
    });

    $(document).on('click', '.calc-clr', function () {
      if (state.phase !== 'playing' || !state.pending) return;
      state.pending.buffer = '';
      saveGame();
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
