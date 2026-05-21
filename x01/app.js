(function ($) {
  'use strict';

  var STORAGE_GAME = 'x01GameState';
  var STORAGE_NAMES = 'dartsLastPlayerNames';

  var MAX_VISIT_SCORE = 180;
  var MAX_BUFFER_LEN = 3;

  var state = freshState();

  function freshState() {
    return {
      phase: 'setup',
      players: [],
      fixedPlayerIds: [],
      turnIndex: 0,
      gameNumber: 1,
      config: {
        startScore: 301,
        inMode: 'direct',
        outMode: 'direct',
        bestOf: 1,
        neededWins: 1,
      },
      pending: null,
      /** Archived visit grids per completed game in the match. */
      gameBoards: [],
    };
  }

  function freshVisitResults() {
    return [];
  }

  function ensureVisitResults(p) {
    if (!p) return;
    if (!Array.isArray(p.visitResults)) p.visitResults = freshVisitResults();
  }

  function recordVisitResult(p, value) {
    if (!p) return;
    ensureVisitResults(p);
    p.visitResults.push(value);
  }

  function formatVisitCell(value) {
    if (value === 'busted') return 'Busted';
    if (typeof value === 'number') return String(value);
    return '—';
  }

  function snapshotCurrentGameBoard() {
    var maxVisits = 0;
    var i;
    for (i = 0; i < state.players.length; i++) {
      ensureVisitResults(state.players[i]);
      if (state.players[i].visitResults.length > maxVisits) {
        maxVisits = state.players[i].visitResults.length;
      }
    }
    if (maxVisits === 0) return null;
    return {
      gameNumber: state.gameNumber,
      players: state.players.map(function (p) {
        return {
          id: p.id,
          name: p.name,
          visitResults: p.visitResults.slice(),
        };
      }),
      maxVisits: maxVisits,
    };
  }

  function archiveCurrentGameBoard() {
    var snap = snapshotCurrentGameBoard();
    if (!snap) return;
    if (!Array.isArray(state.gameBoards)) state.gameBoards = [];
    var gi;
    for (gi = 0; gi < state.gameBoards.length; gi++) {
      if (state.gameBoards[gi].gameNumber === snap.gameNumber) return;
    }
    state.gameBoards.push(snap);
  }

  function allGameBoardsForDisplay() {
    var boards = Array.isArray(state.gameBoards) ? state.gameBoards.slice() : [];
    var current = snapshotCurrentGameBoard();
    if (current) {
      var found = false;
      var bi;
      for (bi = 0; bi < boards.length; bi++) {
        if (boards[bi].gameNumber === current.gameNumber) {
          boards[bi] = current;
          found = true;
          break;
        }
      }
      if (!found) boards.push(current);
    }
    boards.sort(function (a, b) {
      return a.gameNumber - b.gameNumber;
    });
    return boards;
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

  function freshPendingTurn() {
    return { buffer: '' };
  }

  function playerById(id) {
    for (var i = 0; i < state.players.length; i++) {
      if (state.players[i].id === id) return state.players[i];
    }
    return null;
  }

  function currentPlayer() {
    return playerById(state.fixedPlayerIds[state.turnIndex]);
  }

  function isDoubleIn() {
    return state.config && state.config.inMode === 'double';
  }

  function isDoubleOut() {
    return state.config && state.config.outMode === 'double';
  }

  function isSingleGameMatch() {
    return state.config && state.config.bestOf === 1;
  }

  function neededWins(bestOf) {
    return Math.floor(bestOf / 2) + 1;
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
          $('<span class="input-group-text"></span>').text(idx + 1),
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

  function parsedVisitScore(buffer) {
    if (!buffer || buffer.length === 0) return null;
    var n = parseInt(buffer, 10);
    if (isNaN(n) || n < 0) return 0;
    return n;
  }

  function turnValidation(player, buffer) {
    var score = parsedVisitScore(buffer);
    if (score === null) {
      return { ok: false, score: null, reason: 'Enter a round total or press Busted.' };
    }
    if (score > MAX_VISIT_SCORE) {
      return { ok: false, score: score, reason: 'Maximum round total is 180.' };
    }
    if (!player) {
      return { ok: false, score: score, reason: 'No current player.' };
    }
    if (score > player.score) {
      return { ok: false, score: score, reason: 'Busted: score exceeds remaining points.' };
    }
    if (isDoubleOut() && player.score - score === 1) {
      return { ok: false, score: score, reason: 'Busted: double-out cannot leave 1.' };
    }
    return { ok: true, score: score, reason: '' };
  }

  function startGameFromSetup() {
    var names = collectSetupNames();
    if (names.length < 1) {
      alert('Add at least one player.');
      return;
    }
    saveLastNames(names);

    var startScore = parseInt($('#setup-start-score').val(), 10);
    var bestOf = parseInt($('#setup-match-length').val(), 10);
    if (startScore !== 301 && startScore !== 501) startScore = 501;
    if ([1, 3, 5, 7].indexOf(bestOf) === -1) bestOf = 1;

    var players = [];
    var fixed = [];
    names.forEach(function (name, i) {
      var id = 'p_' + Date.now() + '_' + i + '_' + Math.random().toString(36).slice(2, 7);
      fixed.push(id);
      players.push({
        id: id,
        name: name,
        score: startScore,
        gamesWon: 0,
        isIn: $('#setup-in-mode').val() !== 'double',
        visitResults: freshVisitResults(),
      });
    });

    state = {
      phase: 'playing',
      players: players,
      fixedPlayerIds: fixed,
      turnIndex: 0,
      gameNumber: 1,
      gameBoards: [],
      config: {
        startScore: startScore,
        inMode: $('#setup-in-mode').val() === 'double' ? 'double' : 'direct',
        outMode: $('#setup-out-mode').val() === 'double' ? 'double' : 'direct',
        bestOf: bestOf,
        neededWins: neededWins(bestOf),
      },
      pending: freshPendingTurn(),
    };

    saveGame();
    renderGame();
    showScreen('screen-game');
  }

  function beginNextGame() {
    archiveCurrentGameBoard();
    state.gameNumber += 1;
    state.players.forEach(function (p) {
      p.score = state.config.startScore;
      p.isIn = state.config.inMode !== 'double';
      p.visitResults = freshVisitResults();
    });
    state.turnIndex = 0;
    state.pending = freshPendingTurn();
  }

  function advanceTurn() {
    state.turnIndex += 1;
    if (state.turnIndex >= state.fixedPlayerIds.length) {
      state.turnIndex = 0;
    }
    state.pending = freshPendingTurn();
  }

  function renderMatchSummary() {
    var cfg = state.config;
    var matchText = cfg.bestOf === 1 ? 'Single game' : 'Best of ' + cfg.bestOf + ' games - first to ' + cfg.neededWins;
    var inText = cfg.inMode === 'double' ? 'double in' : 'direct in';
    var outText = cfg.outMode === 'double' ? 'double out' : 'direct out';
    $('#match-summary').text(cfg.startScore + ' - ' + matchText);
    $('#game-phase-hint').text('Game ' + state.gameNumber + ' - ' + inText + ', ' + outText + '. Enter one three-dart round total.');
  }

  function renderScoreTable($tbody) {
    $tbody.empty();
    var curId = state.phase === 'playing' ? state.fixedPlayerIds[state.turnIndex] : null;
    var showGamesCol = !isSingleGameMatch();
    $('.in-status-col').toggleClass('d-none', !isDoubleIn());
    $('#score-table .games-won-col').toggleClass('d-none', !showGamesCol);

    state.players.forEach(function (p) {
      var row = $('<tr></tr>');
      if (p.id === curId) row.addClass('table-primary');
      row.append(
        $('<th scope="row"></th>').text(p.name),
        $('<td class="text-end fw-semibold"></td>').text(p.score)
      );
      if (showGamesCol) {
        row.append($('<td class="text-end games-won-col"></td>').text(p.gamesWon));
      }
      var status = p.isIn ? 'Open' : 'Need double';
      row.append($('<td class="text-end small in-status-col"></td>').toggleClass('d-none', !isDoubleIn()).text(status));
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
    var p = currentPlayer();
    var pending = state.pending;
    var buf = pending && typeof pending.buffer === 'string' ? pending.buffer : '';
    var result = turnValidation(p, buf);
    var $btn = $('#btn-confirm-turn');
    var $busted = $('#btn-busted-turn');
    var $hint = $('#turn-hint');
    var bustedAllowed = !!(p && p.score <= MAX_VISIT_SCORE);

    $btn.prop('disabled', !result.ok);
    $busted.prop('disabled', !bustedAllowed);
    if (!buf.length) {
      $btn.text('Confirm turn - -');
    } else {
      $btn.text('Confirm turn - ' + result.score + ' pts');
    }

    if (!p) {
      $hint.removeClass('text-danger text-muted').addClass('text-danger').text('No current player.');
      return;
    }

    if (!result.ok && buf.length) {
      $hint.removeClass('text-muted').addClass('text-danger').text(result.reason);
      return;
    }

    var status = '';
    if (!bustedAllowed) {
      status =
        'Remaining score is above ' +
        MAX_VISIT_SCORE +
        ' — enter a round total (bust from overscoring is not possible this visit).';
    } else if (isDoubleIn() && !p.isIn) {
      status = 'Double-in game: only confirm once the player has opened on a double. Press Busted for a failed opening visit.';
    } else if (isDoubleOut()) {
      status = 'Double-out game: players must finish on a double. Press Busted if the finishing dart was not a double.';
    } else {
      status = 'Enter the player counted round total, or press Busted.';
    }
    $hint.removeClass('text-danger').addClass('text-muted').text(status);
  }

  function renderGame() {
    renderMatchSummary();
    renderScoreTable($('#score-tbody'));

    var p = currentPlayer();
    var action = ' - enter visit total';
    if (p && isDoubleIn() && !p.isIn) action = ' - needs double in';
    setCurrentTurnHeader(p ? p.name : null, p ? action : '');

    renderThrowsPanel();
    updateConfirmEnabled();
  }

  function setCurrentTurnHeader(displayName, actionTail) {
    var $name = $('#current-player-name');
    var $act = $('#current-player-action');
    if (!displayName) {
      $name.text('-');
      $act.text('');
      return;
    }
    $name.text(displayName);
    $act.text(actionTail || '');
  }

  function confirmTurn() {
    if (state.phase !== 'playing') return;
    if (!state.pending || typeof state.pending.buffer !== 'string') return;

    var p = currentPlayer();
    var result = turnValidation(p, state.pending.buffer);
    if (!result.ok || !p) return;

    if (isDoubleIn() && !p.isIn && result.score > 0) {
      p.isIn = true;
    }
    if (!isDoubleIn() || p.isIn) {
      p.score -= result.score;
    }
    recordVisitResult(p, p.score);

    if (p.score === 0) {
      p.gamesWon += 1;
      if (p.gamesWon >= state.config.neededWins) {
        archiveCurrentGameBoard();
        state.phase = 'finished';
        state.pending = null;
        saveGame();
        renderFinished();
        showScreen('screen-finished');
        return;
      }
      beginNextGame();
    } else {
      advanceTurn();
    }

    saveGame();
    renderGame();
  }

  function bustedTurn() {
    if (state.phase !== 'playing') return;
    var p = currentPlayer();
    if (!p || p.score > MAX_VISIT_SCORE) return;
    recordVisitResult(p, 'busted');
    advanceTurn();
    saveGame();
    renderGame();
  }

  function compareStanding(a, b) {
    if (b.gamesWon !== a.gamesWon) return b.gamesWon - a.gamesWon;
    if (a.score !== b.score) return a.score - b.score;
    return state.fixedPlayerIds.indexOf(a.id) - state.fixedPlayerIds.indexOf(b.id);
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

  function renderVisitScoreboards() {
    var $host = $('#visit-scoreboards-wrap');
    if (!$host.length) return;
    $host.empty();

    var boards = allGameBoardsForDisplay();
    if (!boards.length) {
      $host.addClass('d-none');
      return;
    }
    $host.removeClass('d-none');

    var showGameTitle = boards.length > 1 || (state.config && state.config.bestOf > 1);
    boards.forEach(function (board) {
      if (showGameTitle) {
        $host.append(
          $('<h3 class="h6 text-muted text-uppercase mb-2 mt-3 letter-spacing-tight"></h3>').text(
            'Game ' + board.gameNumber
          )
        );
      } else {
        $host.append(
          $('<h3 class="h6 text-muted text-uppercase mb-2 letter-spacing-tight"></h3>').text(
            'Visit scores'
          )
        );
      }

      var $table = $(
        '<table class="table table-sm table-bordered table-striped mb-0 align-middle visit-scoreboard-table"></table>'
      );
      var $thead = $('<thead></thead>');
      var $tbody = $('<tbody></tbody>');
      var $headRow = $('<tr></tr>');
      $headRow.append($('<th scope="col"></th>').text('Round'));
      board.players.forEach(function (bp) {
        $headRow.append($('<th scope="col" class="text-end"></th>').text(bp.name));
      });
      $thead.append($headRow);

      var vr;
      for (vr = 0; vr < board.maxVisits; vr++) {
        var $row = $('<tr></tr>');
        $row.append($('<th scope="row"></th>').text(String(vr + 1)));
        board.players.forEach(function (bp) {
          var val =
            bp.visitResults && vr < bp.visitResults.length ? bp.visitResults[vr] : null;
          var $cell = $('<td class="text-end"></td>').text(formatVisitCell(val));
          if (val === 'busted') $cell.addClass('text-danger');
          $row.append($cell);
        });
        $tbody.append($row);
      }

      $table.append($thead, $tbody);
      $host.append($('<div class="table-responsive shadow-sm mb-3"></div>').append($table));
    });
  }

  function renderFinished() {
    renderVisitScoreboards();
    var singleGame = isSingleGameMatch();
    var sorted = state.players
      .map(function (p) {
        return { id: p.id, name: p.name, score: p.score, gamesWon: p.gamesWon };
      })
      .sort(compareStanding);

    var rowsWithRank = [];
    var displayRank = 0;
    var prevKey = null;
    sorted.forEach(function (row, idx) {
      var rankKey = singleGame ? row.score : row.gamesWon;
      if (prevKey === null || rankKey !== prevKey) {
        displayRank = idx + 1;
      }
      prevKey = rankKey;
      rowsWithRank.push({
        rank: displayRank,
        name: row.name,
        score: row.score,
        gamesWon: row.gamesWon,
      });
    });

    var byRank = {};
    rowsWithRank.forEach(function (r) {
      if (!byRank[r.rank]) byRank[r.rank] = [];
      byRank[r.rank].push({ name: r.name, score: r.score, gamesWon: r.gamesWon });
    });

    var first = byRank[1] || [];
    var second = byRank[2] || [];
    var third = byRank[3] || [];

    var $wrap = $('#standings-podium-wrap').empty();

    function podiumColumn(place, rows, marker) {
      var empty = !rows.length;
      var $col = $('<div class="podium-column podium-column--' + place + (empty ? ' podium-column--empty' : '') + '"></div>');
      var $top = $('<div class="podium-top"></div>');
      $top.append($('<div class="podium-emoji" aria-hidden="true"></div>').text(marker));
      var namesText = empty ? '-' : rows.map(function (x) { return x.name; }).join(', ');
      var $names = $('<div class="podium-names"></div>').text(namesText);
      if (empty) $names.addClass('podium-names--empty');
      $top.append($names);
      if (!empty && !singleGame) {
        $top.append($('<div class="podium-score-pill"></div>').text(rows[0].gamesWon + ' games'));
      }
      $col.append($top);
      $col.append($('<div class="podium-plinth"></div>').text(String(place)));
      return $col;
    }

    var $pv = $('<div class="podium-visual"></div>');
    $pv.append(podiumColumn(2, second, '2'));
    $pv.append(podiumColumn(1, first, '1'));
    $pv.append(podiumColumn(3, third, '3'));
    $wrap.append($pv);

    var $rest = $('#standings-rest-list');
    $rest.empty();
    var anyRest = false;
    rowsWithRank.forEach(function (r) {
      if (r.rank >= 4) {
        anyRest = true;
        var label = r.rank + ordinalSuffix(r.rank) + ' - ' + r.name;
        var li = $('<li class="list-group-item d-flex justify-content-between align-items-center"></li>');
        li.append($('<span></span>').text(label));
        if (!singleGame) {
          li.append(
            $('<span class="badge bg-secondary rounded-pill"></span>').text(r.gamesWon + ' games')
          );
        } else {
          li.append(
            $('<span class="badge bg-secondary rounded-pill"></span>').text(r.score + ' remaining')
          );
        }
        $rest.append(li);
      }
    });
    $('#standings-others-heading').toggleClass('d-none', !anyRest);
    $rest.toggleClass('d-none', !anyRest);
  }

  function normalizeConfig(raw) {
    var cfg = raw && typeof raw === 'object' ? raw : {};
    var startScore = cfg.startScore === 501 ? 501 : 301;
    var bestOf = [1, 3, 5, 7].indexOf(cfg.bestOf) === -1 ? 1 : cfg.bestOf;
    return {
      startScore: startScore,
      inMode: cfg.inMode === 'double' ? 'double' : 'direct',
      outMode: cfg.outMode === 'double' ? 'double' : 'direct',
      bestOf: bestOf,
      neededWins: neededWins(bestOf),
    };
  }

  function normalizePending(raw) {
    if (!raw || typeof raw !== 'object') return freshPendingTurn();
    if (typeof raw.buffer !== 'string') return freshPendingTurn();
    return { buffer: raw.buffer.replace(/\D/g, '').slice(0, MAX_BUFFER_LEN) };
  }

  function restoreOrSetup() {
    var saved = loadGame();
    if (saved && saved.phase && saved.players && saved.players.length) {
      state = saved;
      state.config = normalizeConfig(state.config);
      state.players.forEach(function (p) {
        if (typeof p.score !== 'number') p.score = state.config.startScore;
        if (typeof p.gamesWon !== 'number') p.gamesWon = 0;
        if (typeof p.isIn !== 'boolean') p.isIn = state.config.inMode !== 'double';
        ensureVisitResults(p);
      });
      if (!Array.isArray(state.gameBoards)) state.gameBoards = [];
      if (!state.fixedPlayerIds || !state.fixedPlayerIds.length) {
        state.fixedPlayerIds = state.players.map(function (p) { return p.id; });
      }
      if (typeof state.turnIndex !== 'number' || state.turnIndex < 0 || state.turnIndex >= state.fixedPlayerIds.length) {
        state.turnIndex = 0;
      }
      if (typeof state.gameNumber !== 'number' || state.gameNumber < 1) state.gameNumber = 1;

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

    renderSetupPlayers(loadLastNames().length ? loadLastNames() : ['Player 1', 'Player 2']);
    showScreen('screen-setup');
  }

  function abandonGame() {
    if (!confirm('Abandon current game? Progress in this session will be lost.')) return;
    clearGameStorage();
    state = freshState();
    renderSetupPlayers(loadLastNames().length ? loadLastNames() : ['Player 1', 'Player 2']);
    showScreen('screen-setup');
  }

  function renumberSetupRows() {
    $('#setup-players .input-group-text').each(function (i) {
      $(this).text(i + 1);
    });
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
    $('#btn-busted-turn').on('click', bustedTurn);
    $('#btn-abandon').on('click', abandonGame);

    $('#btn-new-from-finished').on('click', function () {
      clearGameStorage();
      state = freshState();
      renderSetupPlayers(loadLastNames().length ? loadLastNames() : ['Player 1', 'Player 2']);
      showScreen('screen-setup');
    });

    restoreOrSetup();
  });
})(jQuery);
