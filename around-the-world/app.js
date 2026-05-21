(function ($) {
  'use strict';

  var MAX_THROWS_PER_ROUND = 3;

  var STORAGE_GAME = 'aroundWorldState';
  var STORAGE_NAMES = 'dartsLastPlayerNames';

  var state = {
    phase: 'setup',
    mode: 'asc',
    playerName: '',
    /** Next wedge the player must hit (1–20). */
    nextRequired: 1,
    totalDarts: 0,
    dartsThisRound: 0,
    roundNumber: 1,
    /** Unconfirmed darts this round: 'hit' | 'miss' (max 3 − dartsThisRound). */
    pendingRound: [],
    /** Mode random only: permutation of 1..20 fixed at game start. */
    visitOrder: null,
    /** Mode random only: index 0..19 = current target in visitOrder; 20 = finished. */
    progressIndex: 0,
    /** Darts thrown per sector 1–20 while that sector was active (hits and misses). */
    sectorThrows: null,
  };

  function freshSectorThrows() {
    var throws = {};
    var i;
    for (i = 1; i <= 20; i++) throws[i] = 0;
    return throws;
  }

  function ensureSectorThrows() {
    if (!state.sectorThrows || typeof state.sectorThrows !== 'object') {
      if (state.sectorHits && typeof state.sectorHits === 'object') {
        state.sectorThrows = state.sectorHits;
        delete state.sectorHits;
      } else {
        state.sectorThrows = freshSectorThrows();
      }
      return;
    }
    var i;
    for (i = 1; i <= 20; i++) {
      if (typeof state.sectorThrows[i] !== 'number') state.sectorThrows[i] = 0;
    }
  }

  function sectorThrowCount(sector) {
    ensureSectorThrows();
    var n = state.sectorThrows[sector];
    return typeof n === 'number' ? n : 0;
  }

  function recordSectorThrow(sector) {
    if (sector < 1 || sector > 20) return;
    ensureSectorThrows();
    state.sectorThrows[sector] = sectorThrowCount(sector) + 1;
  }

  /** Wedge number for the next confirmed Hit. */
  function currentHitSector() {
    if (state.mode === 'random' && state.visitOrder && state.visitOrder.length === 20) {
      var pi = state.progressIndex;
      if (pi < 0 || pi > 19) return null;
      return state.visitOrder[pi];
    }
    var nr = state.nextRequired;
    return nr >= 1 && nr <= 20 ? nr : null;
  }

  /** Sector numbers in display order for the scoreboard (visit sequence). */
  function scoreboardSectorRows() {
    if (state.mode === 'random' && state.visitOrder && state.visitOrder.length === 20) {
      return state.visitOrder.slice();
    }
    if (state.mode === 'desc') {
      var desc = [];
      var i;
      for (i = 20; i >= 1; i--) desc.push(i);
      return desc;
    }
    var asc = [];
    for (i = 1; i <= 20; i++) asc.push(i);
    return asc;
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
      return Array.isArray(arr) ? arr.filter(function (n) {
        return typeof n === 'string' && n.trim();
      }) : [];
    } catch (e) {
      return [];
    }
  }

  function showScreen(id) {
    $('.screen').addClass('d-none');
    $('#' + id).removeClass('d-none');
    $('#btn-abandon').toggleClass('d-none', id === 'screen-setup' || id === 'screen-finished');
  }

  function shuffleVisitOrder() {
    var arr = [];
    var i;
    for (i = 1; i <= 20; i++) arr.push(i);
    for (i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function validateVisitOrderStructure(vo) {
    if (!Array.isArray(vo) || vo.length !== 20) return false;
    var seen = {};
    var i;
    for (i = 0; i < 20; i++) {
      var v = Number(vo[i]);
      if (isNaN(v) || v < 1 || v > 20 || seen[v]) return false;
      seen[v] = true;
    }
    return true;
  }

  /** Up to three upcoming wedge numbers for this round (from state). */
  function roundTriple() {
    var mode = state.mode;
    var t = [];
    var i;
    if (mode === 'random') {
      var vo = state.visitOrder;
      var pi = state.progressIndex;
      if (!vo || vo.length !== 20) return t;
      for (i = 0; i < MAX_THROWS_PER_ROUND && pi + i < 20; i++) t.push(vo[pi + i]);
      return t;
    }
    var nextReq = state.nextRequired;
    if (mode === 'asc') {
      for (i = 0; i < MAX_THROWS_PER_ROUND && nextReq + i <= 20; i++) t.push(nextReq + i);
    } else {
      for (i = 0; i < MAX_THROWS_PER_ROUND && nextReq - i >= 1; i++) t.push(nextReq - i);
    }
    return t;
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

  function updateRoundHighlight(triple, activeSector) {
    ensureDartboardSectors();
    if (!triple || !triple.length) {
      resetAllSectorWedgesNeutral();
      return;
    }
    var inRound = {};
    var ti;
    for (ti = 0; ti < triple.length; ti++) inRound[triple[ti]] = true;

    $('#dartboard-sectors path').each(function () {
      var $p = $(this);
      var s = Number($p.attr('data-sector'));
      var idx = Number($p.attr('data-wedge-index'));
      var band = $p.attr('data-band');
      if (inRound[s] && s === activeSector) {
        $p.attr('class', 'dart-sector dart-band dart-sector--target');
      } else if (inRound[s]) {
        $p.attr('class', wedgeNeutralClasses(idx, band) + ' dart-sector--round-secondary');
      } else {
        $p.attr('class', wedgeNeutralClasses(idx, band));
      }
    });
  }

  function renderRoundNumbers(triple, activeSector) {
    var $host = $('#round-wedge-numbers');
    $host.empty();
    if (!triple.length) {
      $host.append($('<span class="text-muted small">—</span>'));
      return;
    }
    triple.forEach(function (n, i) {
      if (i > 0) {
        $host.append($('<span class="text-muted round-wedge-sep px-1" aria-hidden="true">→</span>'));
      }
      var $span = $('<span class="round-wedge-num"></span>').text(String(n));
      if (n === activeSector) $span.addClass('round-wedge-num--active');
      $host.append($span);
    });
  }

  /**
   * Next wedge a Hit would refer to after applying current pending queue (miss does not advance).
   */
  function peekHitButtonTarget() {
    var mode = state.mode;
    var nr;
    var pidx;
    var vo;
    if (mode === 'random') {
      vo = state.visitOrder;
      pidx = state.progressIndex;
      if (!vo || vo.length !== 20 || pidx > 19) {
        return { labelNr: null, canHit: false };
      }
      nr = vo[pidx];
    } else {
      nr = state.nextRequired;
    }

    var i;
    for (i = 0; i < state.pendingRound.length; i++) {
      if (state.pendingRound[i] === 'miss') continue;
      if (mode === 'random') {
        if (pidx >= 19) {
          return { labelNr: null, canHit: false };
        }
        pidx += 1;
        if (pidx >= 20) {
          return { labelNr: null, canHit: false };
        }
        nr = vo[pidx];
      } else if (mode === 'asc') {
        if (nr === 20) {
          return { labelNr: null, canHit: false };
        }
        nr += 1;
      } else {
        if (nr === 1) {
          return { labelNr: null, canHit: false };
        }
        nr -= 1;
      }
    }
    var canHit =
      state.phase === 'playing' && nr >= 1 && nr <= 20;
    return {
      labelNr: canHit ? nr : null,
      canHit: canHit,
    };
  }

  function renderRoundVisuals(triple, activeSectorOverride) {
    var list = triple || roundTriple();
    var next =
      typeof activeSectorOverride === 'number'
        ? activeSectorOverride
        : state.nextRequired;
    updateRoundHighlight(list, next);
    renderRoundNumbers(list, next);
  }

  /** Pending line with wedge numbers, e.g. "Hit 4 → Miss 5 → Hit 6". */
  function formatPendingWithWedges() {
    var mode = state.mode;
    var nr;
    var pidx;
    var vo;
    if (mode === 'random') {
      vo = state.visitOrder;
      pidx = state.progressIndex;
      nr = vo[pidx];
    } else {
      nr = state.nextRequired;
    }
    var parts = [];
    var i;
    for (i = 0; i < state.pendingRound.length; i++) {
      if (state.pendingRound[i] === 'miss') {
        parts.push('Miss ' + nr);
      } else {
        parts.push('Hit ' + nr);
        if (mode === 'random') {
          if (pidx >= 19) {
            pidx = 20;
          } else {
            pidx += 1;
            nr = vo[pidx];
          }
        } else if (mode === 'asc') {
          if (nr === 20) nr = 21;
          else nr += 1;
        } else {
          if (nr === 1) nr = 0;
          else nr -= 1;
        }
      }
    }
    return parts.join(' → ');
  }

  function renderSectorScoreboard() {
    ensureSectorThrows();
    var $table = $('#sector-hits-table');
    if (!$table.length) return;

    var $thead = $table.find('thead').empty();
    var $tbody = $table.find('tbody').empty();
    var $headRow = $('<tr></tr>');
    $headRow.append($('<th scope="col"></th>').text('Sector'));
    $headRow.append($('<th scope="col" class="text-end"></th>').text('Throws'));
    $thead.append($headRow);

    var sectors = scoreboardSectorRows();
    var si;
    for (si = 0; si < sectors.length; si++) {
      var sector = sectors[si];
      var throws = sectorThrowCount(sector);
      var $row = $('<tr></tr>');
      $row.append($('<th scope="row"></th>').text(String(sector)));
      $row.append($('<td class="text-end"></td>').text(String(throws)));
      $tbody.append($row);
    }

    var $totalRow = $('<tr class="table-light fw-semibold"></tr>');
    $totalRow.append($('<th scope="row"></th>').text('Total darts'));
    $totalRow.append($('<td class="text-end"></td>').text(String(state.totalDarts)));
    $tbody.append($totalRow);
  }

  function gameFinished() {
    state.phase = 'finished';
    saveGame();
    $('#final-dart-count').text(String(state.totalDarts));
    renderSectorScoreboard();
    showScreen('screen-finished');
  }

  function bumpRoundAfterThreeCommittedDarts() {
    if (state.phase !== 'playing') return;
    if (state.dartsThisRound >= MAX_THROWS_PER_ROUND) {
      state.dartsThisRound = 0;
      state.roundNumber += 1;
    }
  }

  /** Apply one confirmed miss; mutates state. */
  function applyCommittedMiss() {
    if (state.phase !== 'playing') return;
    var missSector = currentHitSector();
    if (missSector !== null) recordSectorThrow(missSector);
    state.totalDarts += 1;
    state.dartsThisRound += 1;
    bumpRoundAfterThreeCommittedDarts();
  }

  /**
   * Apply one confirmed hit on the active wedge; mutates state.
   * @returns {'ok'|'game-over'}
   */
  function applyCommittedHit() {
    if (state.phase !== 'playing') return 'ok';
    var hitSector = currentHitSector();
    if (hitSector !== null) recordSectorThrow(hitSector);
    state.totalDarts += 1;
    state.dartsThisRound += 1;

    if (state.mode === 'random') {
      if (state.progressIndex === 19) {
        state.progressIndex = 20;
        return 'game-over';
      }
      state.progressIndex += 1;
      state.nextRequired = state.visitOrder[state.progressIndex];
      bumpRoundAfterThreeCommittedDarts();
      return 'ok';
    }

    if (state.mode === 'asc') {
      if (state.nextRequired === 20) {
        state.nextRequired = 21;
        return 'game-over';
      }
      state.nextRequired += 1;
    } else {
      if (state.nextRequired === 1) {
        state.nextRequired = 0;
        return 'game-over';
      }
      state.nextRequired -= 1;
    }

    bumpRoundAfterThreeCommittedDarts();
    return 'ok';
  }

  function appendPending(outcome) {
    if (state.phase !== 'playing') return;
    var cap =
      MAX_THROWS_PER_ROUND - state.dartsThisRound - state.pendingRound.length;
    if (cap <= 0) return;
    state.pendingRound.push(outcome);
    saveGame();
    renderGame();
  }

  function confirmRound() {
    if (state.phase !== 'playing' || !state.pendingRound.length) return;
    var batch = state.pendingRound.slice();
    state.pendingRound = [];
    var i;
    for (i = 0; i < batch.length; i++) {
      if (state.phase !== 'playing') break;
      if (batch[i] === 'hit') {
        if (applyCommittedHit() === 'game-over') {
          saveGame();
          gameFinished();
          return;
        }
      } else {
        applyCommittedMiss();
      }
    }
    saveGame();
    renderGame();
  }

  function resetPending() {
    if (state.phase !== 'playing') return;
    state.pendingRound = [];
    saveGame();
    renderGame();
  }

  function endRoundEarly() {
    if (state.phase !== 'playing') return;
    if (state.dartsThisRound < 1 || state.dartsThisRound >= MAX_THROWS_PER_ROUND) return;
    state.dartsThisRound = 0;
    state.roundNumber += 1;
    saveGame();
    renderGame();
  }

  function normalizeLoadedState(s) {
    if (!s || typeof s !== 'object') return null;
    var phase = s.phase;
    if (phase !== 'setup' && phase !== 'playing' && phase !== 'finished') return null;
    var mode =
      s.mode === 'desc' ? 'desc' : s.mode === 'random' ? 'random' : 'asc';
    var name = typeof s.playerName === 'string' ? s.playerName : '';
    var nr = Number(s.nextRequired);
    var td = Number(s.totalDarts);
    var dtr = Number(s.dartsThisRound);
    var rn = Number(s.roundNumber);
    var pIx = Number(s.progressIndex);

    if (phase === 'playing') {
      if (isNaN(td) || td < 0) return null;
      if (isNaN(dtr) || dtr < 0 || dtr > MAX_THROWS_PER_ROUND) return null;
      if (isNaN(rn) || rn < 1) return null;
      if (mode === 'random') {
        if (!validateVisitOrderStructure(s.visitOrder)) return null;
        if (isNaN(pIx) || pIx < 0 || pIx > 19) return null;
        var vo = s.visitOrder;
        if (isNaN(nr) || nr !== vo[pIx]) return null;
      } else {
        if (isNaN(nr) || nr < 1 || nr > 20) return null;
      }
    }
    if (phase === 'finished') {
      if (isNaN(td) || td < 0) return null;
      if (isNaN(nr)) return null;
      if (mode === 'random') {
        if (!validateVisitOrderStructure(s.visitOrder)) return null;
        if (isNaN(pIx) || pIx !== 20) return null;
      } else if (mode === 'asc' && (nr < 21 || nr > 21)) return null;
      else if (mode === 'desc' && nr !== 0) return null;
    }
    var pendingRound = normalizePendingArray(s.pendingRound, dtr);

    var visitOrder =
      mode === 'random' && validateVisitOrderStructure(s.visitOrder)
        ? s.visitOrder.slice()
        : null;
    var progressIndex =
      mode === 'random'
        ? isNaN(pIx)
          ? 0
          : pIx
        : 0;

    return {
      phase: phase,
      mode: mode,
      playerName: name,
      nextRequired: isNaN(nr)
        ? mode === 'asc'
          ? 1
          : mode === 'desc'
            ? 20
            : 1
        : nr,
      totalDarts: isNaN(td) ? 0 : td,
      dartsThisRound: isNaN(dtr) ? 0 : dtr,
      roundNumber: isNaN(rn) ? 1 : rn,
      pendingRound: phase === 'playing' ? pendingRound : [],
      visitOrder: visitOrder,
      progressIndex: progressIndex,
      sectorThrows:
        s.sectorThrows && typeof s.sectorThrows === 'object'
          ? s.sectorThrows
          : s.sectorHits && typeof s.sectorHits === 'object'
            ? s.sectorHits
            : freshSectorThrows(),
    };
  }

  function normalizePendingArray(raw, dartsThisRound) {
    var out = [];
    if (!Array.isArray(raw)) return out;
    var maxLen = Math.max(0, MAX_THROWS_PER_ROUND - (typeof dartsThisRound === 'number' ? dartsThisRound : 0));
    var i;
    for (i = 0; i < raw.length && out.length < maxLen; i++) {
      if (raw[i] === 'hit' || raw[i] === 'miss') out.push(raw[i]);
    }
    return out;
  }

  function renderGame() {
    $('#stat-player').text(state.playerName || '—');
    var previewTotalDarts = state.totalDarts + state.pendingRound.length;
    $('#stat-total-darts').text(String(previewTotalDarts));
    var triple = roundTriple();
    var wedgeCount = triple.length;
    var peek = peekHitButtonTarget();
    var highlightSector =
      typeof peek.labelNr === 'number' ? peek.labelNr : state.nextRequired;
    renderRoundVisuals(triple, highlightSector);

    var pendingSlots =
      MAX_THROWS_PER_ROUND - state.dartsThisRound - state.pendingRound.length;
    var pendingFull = pendingSlots <= 0;

    $('#btn-hit')
      .prop('disabled', !peek.canHit || pendingFull)
      .text(peek.canHit && typeof peek.labelNr === 'number' ? 'Hit ' + peek.labelNr : '—');
    $('#btn-miss').prop('disabled', pendingFull);

    var hasPending = state.pendingRound.length > 0;
    $('#btn-confirm-round').prop('disabled', !hasPending);
    $('#btn-reset-round').prop('disabled', !hasPending);

    var $hint = $('#pending-hint');
    if ($hint.length) {
      $hint.text(hasPending ? 'Pending: ' + formatPendingWithWedges() : '');
    }

    var showNN =
      wedgeCount < MAX_THROWS_PER_ROUND &&
      state.dartsThisRound > 0 &&
      state.dartsThisRound < MAX_THROWS_PER_ROUND &&
      !hasPending;
    $('#btn-nn').toggleClass('d-none', !showNN);

    updateRandomProgress();
  }

  /**
   * Random mode: wedge count for progress preview = committed progressIndex plus
   * simulated Hit outcomes in pending (Miss does not advance). Matches Reset/Confirm behaviour.
   */
  function randomPreviewClearedAfterPending() {
    var pidx = state.progressIndex;
    var i;
    for (i = 0; i < state.pendingRound.length; i++) {
      if (state.pendingRound[i] === 'miss') continue;
      if (pidx >= 19) {
        return 20;
      }
      pidx += 1;
    }
    return Math.min(20, pidx);
  }

  /** Progress bar for Random mode — updates live with Hit/Miss/Reset (pending preview). */
  function updateRandomProgress() {
    var $card = $('#random-progress-card');
    if (!$card.length) return;
    var show = state.phase === 'playing' && state.mode === 'random';
    $card.toggleClass('d-none', !show);
    if (!show) return;
    var cleared = randomPreviewClearedAfterPending();
    var pct = (cleared / 20) * 100;
    $('#random-progress-fill').css('width', pct + '%');
    $('#random-progress').attr({
      'aria-valuenow': String(cleared),
      'aria-valuetext': cleared + ' of 20 wedges cleared (includes pending)',
    });
    $('#random-progress-label').text(cleared + ' / 20');
  }

  function startGameFromSetup() {
    var name = $('#setup-player-name').val().trim();
    if (!name) {
      alert('Enter your name.');
      return;
    }
    var sel = $('input[name="setup-mode"]:checked').val();
    var mode =
      sel === 'desc' ? 'desc' : sel === 'random' ? 'random' : 'asc';
    saveLastNames([name]);

    state.phase = 'playing';
    state.playerName = name;
    state.mode = mode;
    state.visitOrder = mode === 'random' ? shuffleVisitOrder() : null;
    state.progressIndex = mode === 'random' ? 0 : 0;
    state.nextRequired =
      mode === 'asc' ? 1 : mode === 'desc' ? 20 : state.visitOrder[0];
    state.totalDarts = 0;
    state.dartsThisRound = 0;
    state.roundNumber = 1;
    state.pendingRound = [];
    state.sectorThrows = freshSectorThrows();

    saveGame();
    renderGame();
    showScreen('screen-game');
  }

  function abandonGame() {
    clearGameStorage();
    state.phase = 'setup';
    state.mode = 'asc';
    state.playerName = '';
    state.nextRequired = 1;
    state.totalDarts = 0;
    state.dartsThisRound = 0;
    state.roundNumber = 1;
    state.pendingRound = [];
    state.visitOrder = null;
    state.progressIndex = 0;
    state.sectorThrows = null;
    var last = loadLastNames();
    $('#setup-player-name').val(last.length ? last[0] : 'Player 1');
    $('input[name="setup-mode"][value="asc"]').prop('checked', true);
    showScreen('screen-setup');
  }

  function tryRestoreSession() {
    var raw = loadGame();
    var s = normalizeLoadedState(raw);
    if (!s) {
      if (raw) clearGameStorage();
      return;
    }
    state = s;
    if (state.phase === 'setup') return;
    if (state.phase === 'finished') {
      $('#final-dart-count').text(String(state.totalDarts));
      renderSectorScoreboard();
      showScreen('screen-finished');
      return;
    }
    if (state.phase === 'playing') {
      $('#setup-player-name').val(state.playerName || 'Player 1');
      $('input[name="setup-mode"][value="' + state.mode + '"]').prop('checked', true);
      renderGame();
      showScreen('screen-game');
    }
  }

  $(function () {
    var last = loadLastNames();
    $('#setup-player-name').val(last.length ? last[0] : 'Player 1');

    $('#btn-start-game').on('click', startGameFromSetup);
    $('#btn-abandon').on('click', function () {
      if (confirm('Abandon this game? Progress will be lost.')) abandonGame();
    });

    $('#btn-hit').on('click', function () {
      appendPending('hit');
    });
    $('#btn-miss').on('click', function () {
      appendPending('miss');
    });
    $('#btn-confirm-round').on('click', confirmRound);
    $('#btn-reset-round').on('click', resetPending);
    $('#btn-nn').on('click', function () {
      endRoundEarly();
    });

    $('#btn-new-from-finished').on('click', function () {
      abandonGame();
    });

    tryRestoreSession();
  });
})(jQuery);
