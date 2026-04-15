// ─────────────────────────────────────────
// REGEX PARSER & THOMPSON'S CONSTRUCTION
// ─────────────────────────────────────────

let nfaGlobal = null;
let dfaGlobal = null;
let currentTab = 'enfa';

// ─── AST Nodes ───
class ASTChar  { constructor(c) { this.type='char'; this.char=c; } }
class ASTEps   { constructor()  { this.type='eps'; } }
class ASTConcat{ constructor(l,r){ this.type='concat'; this.left=l; this.right=r; } }
class ASTUnion { constructor(l,r){ this.type='union'; this.left=l; this.right=r; } }
class ASTStar  { constructor(e)  { this.type='star'; this.expr=e; } }

// ─── Parser (recursive descent) ───
function parse(regex) {
  let pos = 0;
  const s = regex;

  function expr() {
    let node = concat();
    while (pos < s.length && s[pos] === '|') {
      pos++;
      const right = concat();
      node = new ASTUnion(node, right);
    }
    return node;
  }

  function concat() {
    let node = repeat();
    while (pos < s.length && s[pos] !== ')' && s[pos] !== '|') {
      const right = repeat();
      node = new ASTConcat(node, right);
    }
    return node;
  }

  function repeat() {
    let node = atom();
    while (pos < s.length && (s[pos] === '*' || s[pos] === '+' || s[pos] === '?')) {
      const op = s[pos++];
      if (op === '*') node = new ASTStar(node);
      else if (op === '+') node = new ASTConcat(node, new ASTStar(structuredClone ? JSON.parse(JSON.stringify(node)) : node));
      else if (op === '?') node = new ASTUnion(node, new ASTEps());
    }
    return node;
  }

  function atom() {
    if (pos >= s.length) return new ASTEps();
    if (s[pos] === '(') {
      pos++;
      const node = expr();
      if (pos < s.length && s[pos] === ')') pos++;
      else throw new Error('Unmatched parenthesis');
      return node;
    }
    if (s[pos] === 'ε' || s[pos] === '') return (pos++, new ASTEps());
    const c = s[pos++];
    if (c === '*' || c === '+' || c === '?' || c === ')' || c === '|')
      throw new Error('Unexpected operator: ' + c);
    return new ASTChar(c);
  }

  const result = expr();
  if (pos < s.length) throw new Error('Unexpected character: ' + s[pos]);
  return result;
}

// ─── NFA State ───
let stateId = 0;
class NFAState {
  constructor() {
    this.id = stateId++;
    this.transitions = {}; // char -> [state]
    this.epsilons = [];
  }
  addTransition(c, state) {
    if (!this.transitions[c]) this.transitions[c] = [];
    this.transitions[c].push(state);
  }
  addEpsilon(state) { this.epsilons.push(state); }
}

// ─── Thompson's Construction ───
function thompson(ast) {
  function build(node) {
    const start = new NFAState();
    const accept = new NFAState();
    if (node.type === 'char') {
      start.addTransition(node.char, accept);
    } else if (node.type === 'eps') {
      start.addEpsilon(accept);
    } else if (node.type === 'concat') {
      const left  = build(node.left);
      const right = build(node.right);
      left.accept.addEpsilon(right.start);
      return { start: left.start, accept: right.accept };
    } else if (node.type === 'union') {
      const left  = build(node.left);
      const right = build(node.right);
      start.addEpsilon(left.start);
      start.addEpsilon(right.start);
      left.accept.addEpsilon(accept);
      right.accept.addEpsilon(accept);
    } else if (node.type === 'star') {
      const inner = build(node.expr);
      start.addEpsilon(inner.start);
      start.addEpsilon(accept);
      inner.accept.addEpsilon(inner.start);
      inner.accept.addEpsilon(accept);
    }
    return { start, accept };
  }
  return build(ast);
}

// ─── Collect all NFA states ───
function collectStates(nfa) {
  const visited = new Set();
  const queue = [nfa.start];
  while (queue.length) {
    const s = queue.shift();
    if (visited.has(s.id)) continue;
    visited.add(s.id);
    s.epsilons.forEach(t => queue.push(t));
    Object.values(s.transitions).forEach(ts => ts.forEach(t => queue.push(t)));
  }
  const stateMap = {};
  visited.forEach(id => stateMap[id] = id);
  return visited;
}

// ─── Epsilon closure ───
function epsClosure(states) {
  const closure = new Set(states.map(s => s.id));
  const queue = [...states];
  while (queue.length) {
    const s = queue.shift();
    s.epsilons.forEach(t => {
      if (!closure.has(t.id)) { closure.add(t.id); queue.push(t); }
    });
  }
  return closure;
}

function epsByIds(idSet, stateById) {
  return epsClosure(Array.from(idSet).map(id => stateById[id]));
}

// ─── Subset construction (NFA→DFA) ───
function nfaToDfa(nfa, alphabet) {
  const stateById = {};
  const allStates = [];
  const queue2 = [nfa.start];
  while (queue2.length) {
    const s = queue2.shift();
    if (stateById[s.id]) continue;
    stateById[s.id] = s;
    allStates.push(s);
    s.epsilons.forEach(t => queue2.push(t));
    Object.values(s.transitions).forEach(ts => ts.forEach(t => queue2.push(t)));
  }

  const startClosure = epsClosure([nfa.start]);
  const setKey = set => Array.from(set).sort((a,b)=>a-b).join(',');

  const dfaStates = {};
  const dfaTransitions = {};
  const dfaAccept = new Set();
  const workList = [startClosure];
  dfaStates[setKey(startClosure)] = setKey(startClosure);

  while (workList.length) {
    const current = workList.pop();
    const key = setKey(current);
    if (!dfaTransitions[key]) dfaTransitions[key] = {};

    if (current.has(nfa.accept.id)) dfaAccept.add(key);

    for (const c of alphabet) {
      const moved = new Set();
      current.forEach(id => {
        const s = stateById[id];
        if (s && s.transitions[c]) s.transitions[c].forEach(t => moved.add(t.id));
      });
      if (moved.size === 0) continue;
      const nextClosure = epsByIds(moved, stateById);
      const nextKey = setKey(nextClosure);
      if (!dfaStates[nextKey]) { dfaStates[nextKey] = nextKey; workList.push(nextClosure); }
      dfaTransitions[key][c] = nextKey;
    }
  }

  return {
    states: Object.keys(dfaStates),
    start: setKey(startClosure),
    accept: dfaAccept,
    transitions: dfaTransitions,
    alphabet
  };
}

// ─── Build & render ───
function buildAutomaton() {
  const raw = document.getElementById('regex-input').value.trim();
  const errEl = document.getElementById('error-msg');
  errEl.classList.remove('show');

  if (!raw) {
    errEl.textContent = 'Please enter a regular expression.';
    errEl.classList.add('show');
    return;
  }

  stateId = 0;
  let ast, nfa;
  try {
    ast = parse(raw);
    nfa = thompson(ast);
  } catch(e) {
    errEl.textContent = 'Parse error: ' + e.message;
    errEl.classList.add('show');
    return;
  }

  // Collect alphabet
  const alpha = new Set();
  function collectAlpha(node) {
    if (!node) return;
    if (node.type === 'char') alpha.add(node.char);
    if (node.type === 'concat' || node.type === 'union') { collectAlpha(node.left); collectAlpha(node.right); }
    if (node.type === 'star') collectAlpha(node.expr);
  }
  collectAlpha(ast);
  const alphabet = Array.from(alpha).sort();

  // Collect NFA states
  const allNFAStates = [];
  const visited = new Set();
  const bfsQ = [nfa.start];
  while (bfsQ.length) {
    const s = bfsQ.shift();
    if (visited.has(s.id)) continue;
    visited.add(s.id);
    allNFAStates.push(s);
    s.epsilons.forEach(t => bfsQ.push(t));
    Object.values(s.transitions).forEach(ts => ts.forEach(t => bfsQ.push(t)));
  }

  nfaGlobal = { ...nfa, allStates: allNFAStates, alphabet };
  dfaGlobal = nfaToDfa(nfa, alphabet);

  // Show sim panel
  document.getElementById('sim-panel').style.display = '';
  document.getElementById('sim-result').className = 'sim-result';
  document.getElementById('sim-chars').innerHTML = '';

  renderNFA();
  renderDFA();
  renderTable();
  renderInfo(raw, alphabet);

  // Show canvas
  document.getElementById('welcome-state').style.display = 'none';
  document.getElementById('nfa-canvas').style.display = 'block';
  document.getElementById('nfa-legend').style.display = 'flex';
}

// ─────────────────────────────────────────
// LAYOUT ENGINE (Layered graph layout)
// ─────────────────────────────────────────

function layoutNFA(states, startId, acceptId) {
  // BFS layers
  const layers = {};
  const visited = new Set();
  const queue = [{ id: startId, layer: 0 }];
  const stateMap = {};
  states.forEach(s => stateMap[s.id] = s);

  while (queue.length) {
    const { id, layer } = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    if (!layers[layer]) layers[layer] = [];
    layers[layer].push(id);
    const s = stateMap[id];
    if (!s) continue;
    s.epsilons.forEach(t => queue.push({ id: t.id, layer: layer + 1 }));
    Object.values(s.transitions).forEach(ts => ts.forEach(t => queue.push({ id: t.id, layer: layer + 1 })));
  }

  // Add any unvisited states
  states.forEach(s => {
    if (!visited.has(s.id)) {
      const maxLayer = Math.max(...Object.keys(layers).map(Number));
      if (!layers[maxLayer + 1]) layers[maxLayer + 1] = [];
      layers[maxLayer + 1].push(s.id);
    }
  });

  const NODE_W = 64, NODE_SPACING_X = 130, NODE_SPACING_Y = 110;
  const positions = {};
  const layerKeys = Object.keys(layers).map(Number).sort((a,b)=>a-b);

  layerKeys.forEach((layer, li) => {
    const nodes = layers[layer];
    nodes.forEach((id, ni) => {
      positions[id] = {
        x: 80 + li * NODE_SPACING_X,
        y: 80 + ni * NODE_SPACING_Y - (nodes.length - 1) * NODE_SPACING_Y / 2
      };
    });
  });

  return positions;
}

function layoutDFA(states, startKey) {
  // BFS layers for DFA (states are string keys)
  const layers = {};
  const visited = new Set();
  const queue = [{ id: startKey, layer: 0 }];

  while (queue.length) {
    const { id, layer } = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    if (!layers[layer]) layers[layer] = [];
    layers[layer].push(id);
    if (dfaGlobal.transitions[id]) {
      Object.values(dfaGlobal.transitions[id]).forEach(t => queue.push({ id: t, layer: layer + 1 }));
    }
  }

  states.forEach(s => {
    if (!visited.has(s)) {
      if (!layers[0]) layers[0] = [];
      layers[0].push(s);
    }
  });

  const NODE_SPACING_X = 150, NODE_SPACING_Y = 110;
  const positions = {};
  const layerKeys = Object.keys(layers).map(Number).sort((a,b)=>a-b);

  layerKeys.forEach((layer) => {
    const nodes = layers[layer];
    nodes.forEach((id, ni) => {
      positions[id] = {
        x: 80 + layer * NODE_SPACING_X,
        y: 80 + ni * NODE_SPACING_Y - (nodes.length - 1) * NODE_SPACING_Y / 2
      };
    });
  });

  return positions;
}

// ─────────────────────────────────────────
// CANVAS RENDERER
// ─────────────────────────────────────────

const COLORS = {
  bg: '#161920', bgNode: '#1e2230', border: '#2e3348',
  accent: '#7c6aff', accent2: '#a594ff', accentGlow: 'rgba(124,106,255,0.15)',
  teal: '#22d3ee', tealDim: 'rgba(34,211,238,0.12)',
  green: '#3fcf8e', greenDim: 'rgba(63,207,142,0.12)',
  text: '#e8eaf2', text2: '#9aa0bc', text3: '#5c6380',
  eps: '#5c6380', edge: '#3d4460'
};

let nfaViewState  = { scale: 1, offX: 0, offY: 0, dragging: false, startX: 0, startY: 0, startOffX: 0, startOffY: 0 };
let dfaViewState  = { scale: 1, offX: 0, offY: 0, dragging: false, startX: 0, startY: 0, startOffX: 0, startOffY: 0 };

function setupDrag(canvas, vs) {
  canvas.onmousedown = e => {
    vs.dragging = true; vs.startX = e.clientX; vs.startY = e.clientY;
    vs.startOffX = vs.offX; vs.startOffY = vs.offY;
    canvas.style.cursor = 'grabbing';
  };
  canvas.onmousemove = e => {
    if (!vs.dragging) return;
    vs.offX = vs.startOffX + (e.clientX - vs.startX);
    vs.offY = vs.startOffY + (e.clientY - vs.startY);
    if (currentTab === 'enfa') drawNFACanvas(); else if (currentTab === 'dfa') drawDFACanvas();
  };
  canvas.onmouseup = () => { vs.dragging = false; canvas.style.cursor = 'grab'; };
  canvas.onmouseleave = () => { vs.dragging = false; canvas.style.cursor = 'grab'; };
  canvas.onwheel = e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    vs.scale = Math.max(0.3, Math.min(3, vs.scale * factor));
    if (currentTab === 'enfa') drawNFACanvas(); else if (currentTab === 'dfa') drawDFACanvas();
  };
  canvas.style.cursor = 'grab';
}

function drawNode(ctx, x, y, label, type) {
  const R = 26;
  ctx.save();

  if (type === 'start') {
    ctx.shadowColor = COLORS.teal; ctx.shadowBlur = 12;
  } else if (type === 'accept') {
    ctx.shadowColor = COLORS.green; ctx.shadowBlur = 12;
  }

  ctx.beginPath();
  ctx.arc(x, y, R, 0, Math.PI * 2);
  ctx.fillStyle = type === 'start' ? COLORS.tealDim : type === 'accept' ? COLORS.greenDim : COLORS.bgNode;
  ctx.fill();
  ctx.strokeStyle = type === 'start' ? COLORS.teal : type === 'accept' ? COLORS.green : COLORS.accent;
  ctx.lineWidth = type === 'start' || type === 'accept' ? 2 : 1.5;
  ctx.stroke();
  ctx.shadowBlur = 0;

  if (type === 'accept') {
    ctx.beginPath();
    ctx.arc(x, y, R - 5, 0, Math.PI * 2);
    ctx.strokeStyle = COLORS.green;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.fillStyle = type === 'start' ? COLORS.teal : type === 'accept' ? COLORS.green : COLORS.accent2;
  ctx.font = '500 13px JetBrains Mono, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('q' + label, x, y);
  ctx.restore();
}

function drawArrow(ctx, x1, y1, x2, y2, label, color, curved) {
  color = color || COLORS.edge;
  const R = 26;
  const dx = x2 - x1, dy = y2 - y1;
  const dist = Math.sqrt(dx*dx + dy*dy);
  const ux = dx/dist, uy = dy/dist;

  const sx = x1 + ux * R, sy = y1 + uy * R;
  const ex = x2 - ux * R, ey = y2 - uy * R;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.2;

  if (curved) {
    const mx = (sx + ex) / 2 - dy * 0.4;
    const my = (sy + ey) / 2 + dx * 0.4;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(mx, my, ex, ey);
    ctx.stroke();
    const angle = Math.atan2(ey - my, ex - mx);
    drawArrowHead(ctx, ex, ey, angle, color);
    if (label) {
      ctx.fillStyle = COLORS.text2;
      ctx.font = '400 12px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, (sx+ex)/2 - dy*0.35, (sy+ey)/2 + dx*0.35);
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    const angle = Math.atan2(ey - sy, ex - sx);
    drawArrowHead(ctx, ex, ey, angle, color);
    if (label) {
      ctx.fillStyle = label === 'ε' ? COLORS.eps : COLORS.text2;
      ctx.font = label === 'ε' ? 'italic 14px Georgia, serif' : '400 12px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lx = (sx + ex) / 2 - uy * 12;
      const ly = (sy + ey) / 2 + ux * 12;
      ctx.fillText(label, lx, ly);
    }
  }
  ctx.restore();
}

function drawSelfLoop(ctx, x, y, label, color) {
  color = color || COLORS.edge;
  const R = 26, loopR = 18;
  const cx = x, cy = y - R - loopR;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(cx, cy, loopR, 0, Math.PI * 1.85);
  ctx.stroke();

  const angle = Math.PI * 0.05 + Math.PI * 0.5;
  drawArrowHead(ctx, cx + Math.cos(Math.PI * 1.85) * loopR, cy + Math.sin(Math.PI * 1.85) * loopR, angle, color);

  if (label) {
    ctx.fillStyle = label === 'ε' ? COLORS.eps : COLORS.text2;
    ctx.font = label === 'ε' ? 'italic 14px Georgia, serif' : '400 12px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy - loopR - 8);
  }
  ctx.restore();
}

function drawArrowHead(ctx, x, y, angle, color) {
  const size = 8;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size, -size/2);
  ctx.lineTo(-size, size/2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawInitArrow(ctx, x, y) {
  const R = 26;
  ctx.save();
  ctx.strokeStyle = COLORS.teal;
  ctx.fillStyle = COLORS.teal;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - R - 35, y);
  ctx.lineTo(x - R - 2, y);
  ctx.stroke();
  drawArrowHead(ctx, x - R - 2, y, 0, COLORS.teal);
  ctx.restore();
}

let nfaPositions = null;

function renderNFA() {
  const nfa = nfaGlobal;
  nfaPositions = layoutNFA(nfa.allStates, nfa.start.id, nfa.accept.id);
  drawNFACanvas();
}

function drawNFACanvas() {
  const nfa = nfaGlobal;
  if (!nfa) return;
  const canvas = document.getElementById('nfa-canvas');
  const wrap = canvas.parentElement;
  const W = wrap.clientWidth || 700;
  const H = 480;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  const vs = nfaViewState;
  ctx.save();
  ctx.translate(vs.offX + W * 0.02, vs.offY + H * 0.5);
  ctx.scale(vs.scale, vs.scale);

  const pos = nfaPositions;

  // Draw edges first
  nfa.allStates.forEach(s => {
    s.epsilons.forEach(t => {
      if (s.id === t.id) { drawSelfLoop(ctx, pos[s.id].x, pos[s.id].y, 'ε', COLORS.eps); return; }
      const curved = pos[t.id].y !== pos[s.id].y && Math.abs(pos[t.id].x - pos[s.id].x) < 10;
      drawArrow(ctx, pos[s.id].x, pos[s.id].y, pos[t.id].x, pos[t.id].y, 'ε', COLORS.eps, curved);
    });
    Object.entries(s.transitions).forEach(([c, targets]) => {
      targets.forEach(t => {
        if (s.id === t.id) { drawSelfLoop(ctx, pos[s.id].x, pos[s.id].y, c, COLORS.accent); return; }
        const curved = pos[t.id].y !== pos[s.id].y && Math.abs(pos[t.id].x - pos[s.id].x) < 10;
        drawArrow(ctx, pos[s.id].x, pos[s.id].y, pos[t.id].x, pos[t.id].y, c, COLORS.accent, curved);
      });
    });
  });

  drawInitArrow(ctx, pos[nfa.start.id].x, pos[nfa.start.id].y);

  nfa.allStates.forEach(s => {
    const type = s.id === nfa.start.id ? 'start' : s.id === nfa.accept.id ? 'accept' : 'normal';
    drawNode(ctx, pos[s.id].x, pos[s.id].y, s.id, type);
  });

  ctx.restore();
}

let dfaPositions = null;

function renderDFA() {
  const dfa = dfaGlobal;
  dfaPositions = layoutDFA(dfa.states, dfa.start);
  drawDFACanvas();
}

function drawDFACanvas() {
  const dfa = dfaGlobal;
  if (!dfa) return;
  const canvas = document.getElementById('dfa-canvas');
  const wrap = canvas.parentElement;
  const W = wrap.clientWidth || 700;
  const H = 480;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  const vs = dfaViewState;
  ctx.save();
  ctx.translate(vs.offX + W * 0.02, vs.offY + H * 0.5);
  ctx.scale(vs.scale, vs.scale);

  const pos = dfaPositions;
  const stateLabels = {};
  dfa.states.forEach((s, i) => { stateLabels[s] = i; });

  dfa.states.forEach(s => {
    if (!dfa.transitions[s]) return;
    Object.entries(dfa.transitions[s]).forEach(([c, t]) => {
      if (s === t) { drawSelfLoop(ctx, pos[s].x, pos[s].y, c, COLORS.accent); return; }
      const curved = pos[t].y !== pos[s].y && Math.abs(pos[t].x - pos[s].x) < 10;
      drawArrow(ctx, pos[s].x, pos[s].y, pos[t].x, pos[t].y, c, COLORS.accent, curved);
    });
  });

  drawInitArrow(ctx, pos[dfa.start].x, pos[dfa.start].y);

  dfa.states.forEach(s => {
    const type = s === dfa.start ? 'start' : dfa.accept.has(s) ? 'accept' : 'normal';
    drawNode(ctx, pos[s].x, pos[s].y, stateLabels[s], type);
  });

  ctx.restore();
}

function renderTable() {
  const dfa = dfaGlobal;
  if (!dfa) return;
  const stateLabels = {};
  dfa.states.forEach((s, i) => { stateLabels[s] = i; });

  let html = `<table class="trans-table"><thead><tr>
    <th>State</th><th>Type</th>`;
  dfa.alphabet.forEach(c => { html += `<th>${c}</th>`; });
  html += `</tr></thead><tbody>`;

  dfa.states.forEach(s => {
    const isStart = s === dfa.start;
    const isAccept = dfa.accept.has(s);
    html += `<tr><td>q${stateLabels[s]}</td><td>`;
    if (isStart) html += `<span class="state-badge state-start">→ start</span> `;
    if (isAccept) html += `<span class="state-badge state-accept">✓ accept</span>`;
    html += `</td>`;
    dfa.alphabet.forEach(c => {
      const t = dfa.transitions[s] && dfa.transitions[s][c];
      html += `<td>${t !== undefined ? 'q' + stateLabels[t] : '—'}</td>`;
    });
    html += `</tr>`;
  });
  html += `</tbody></table>`;
  document.getElementById('table-container').innerHTML = html;
}

function renderInfo(regex, alphabet) {
  const nfa = nfaGlobal, dfa = dfaGlobal;
  const html = `
    <div style="margin-bottom:20px">
      <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--text3);margin-bottom:12px">Expression</div>
      <table class="info-table">
        <tr><td>Input regex</td><td>${regex}</td></tr>
        <tr><td>Alphabet Σ</td><td>{ ${alphabet.join(', ')} }</td></tr>
      </table>
    </div>
    <div style="margin-bottom:20px">
      <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--text3);margin-bottom:12px">ε-NFA</div>
      <table class="info-table">
        <tr><td>States |Q|</td><td>${nfa.allStates.length}</td></tr>
        <tr><td>Start state</td><td>q${nfa.start.id}</td></tr>
        <tr><td>Accept state</td><td>q${nfa.accept.id}</td></tr>
        <tr><td>Construction</td><td>Thompson's construction</td></tr>
      </table>
    </div>
    <div>
      <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--text3);margin-bottom:12px">DFA (Subset Construction)</div>
      <table class="info-table">
        <tr><td>States |Q|</td><td>${dfa.states.length}</td></tr>
        <tr><td>Accept states</td><td>${dfa.accept.size}</td></tr>
        <tr><td>Method</td><td>Subset (powerset) construction</td></tr>
      </table>
    </div>
  `;
  document.getElementById('info-container').innerHTML = html;
}

// ─────────────────────────────────────────
// SIMULATION
// ─────────────────────────────────────────

function simulate() {
  const dfa = dfaGlobal;
  if (!dfa) return;
  const input = document.getElementById('sim-string').value;
  const charsEl = document.getElementById('sim-chars');
  const resultEl = document.getElementById('sim-result');

  charsEl.innerHTML = '';
  if (!input) { resultEl.className = 'sim-result'; return; }

  const chars = input.split('');
  chars.forEach(c => {
    const el = document.createElement('div');
    el.className = 'sim-char';
    el.textContent = c;
    charsEl.appendChild(el);
  });

  let current = dfa.start;
  let accepted = true;
  let stepIdx = 0;

  function step() {
    if (stepIdx >= chars.length) {
      const finalAccepted = dfa.accept.has(current);
      resultEl.className = 'sim-result ' + (finalAccepted ? 'accepted' : 'rejected');
      resultEl.innerHTML = finalAccepted
        ? `<span style="font-size:18px">✓</span> <span>String <strong>"${input}"</strong> is <strong>ACCEPTED</strong></span>`
        : `<span style="font-size:18px">✗</span> <span>String <strong>"${input}"</strong> is <strong>REJECTED</strong></span>`;
      const charEls = charsEl.querySelectorAll('.sim-char');
      charEls.forEach(el => el.className = 'sim-char ' + (finalAccepted ? 'accepted' : 'rejected'));
      return;
    }
    const c = chars[stepIdx];
    const charEl = charsEl.querySelectorAll('.sim-char')[stepIdx];
    charEl.classList.add('active');

    if (!dfa.transitions[current] || !dfa.transitions[current][c]) {
      accepted = false;
      resultEl.className = 'sim-result rejected';
      resultEl.innerHTML = `<span style="font-size:18px">✗</span> <span>Stuck at step ${stepIdx+1}: no transition on '<strong>${c}</strong>'</span>`;
      return;
    }
    current = dfa.transitions[current][c];
    stepIdx++;
    setTimeout(step, 120);
  }

  setTimeout(step, 0);
}

// ─────────────────────────────────────────
// UI CONTROLS
// ─────────────────────────────────────────

function switchTab(name) {
  currentTab = name;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  document.getElementById('content-' + name).classList.add('active');
  if (name === 'enfa' && nfaGlobal) drawNFACanvas();
  if (name === 'dfa' && dfaGlobal) drawDFACanvas();
}

function zoomIn() {
  const vs = currentTab === 'enfa' ? nfaViewState : dfaViewState;
  vs.scale = Math.min(3, vs.scale * 1.2);
  if (currentTab === 'enfa') drawNFACanvas(); else drawDFACanvas();
}
function zoomOut() {
  const vs = currentTab === 'enfa' ? nfaViewState : dfaViewState;
  vs.scale = Math.max(0.3, vs.scale * 0.8);
  if (currentTab === 'enfa') drawNFACanvas(); else drawDFACanvas();
}
function resetView() {
  const vs = currentTab === 'enfa' ? nfaViewState : dfaViewState;
  vs.scale = 1; vs.offX = 0; vs.offY = 0;
  if (currentTab === 'enfa') drawNFACanvas(); else drawDFACanvas();
}

function setExample(ex) {
  document.getElementById('regex-input').value = ex;
  buildAutomaton();
}

// Init drag on both canvases
window.addEventListener('load', () => {
  setupDrag(document.getElementById('nfa-canvas'), nfaViewState);
  setupDrag(document.getElementById('dfa-canvas'), dfaViewState);
});

// Enter key
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('regex-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') buildAutomaton();
  });
  setupDrag(document.getElementById('nfa-canvas'), nfaViewState);
  setupDrag(document.getElementById('dfa-canvas'), dfaViewState);
  setExample('a(b|c)*');
});
