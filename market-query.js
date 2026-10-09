const ALLOWED_FIELDS = new Set(['price','change_pct','volume','avg_volume','relative_volume','open','high','low','sma20','sma50','sma200','ema20','rsi14','atr14','vwap','macd','macd_signal','bb_upper','bb_lower','stochastic_k','cci20','obv','roc10']);

function tokenize(source) {
  const tokens = [];
  const regex = /\s*(<=|>=|!=|=|<|>|\(|\)|\bAND\b|\bOR\b|[A-Za-z_][A-Za-z0-9_]*|-?\d+(?:\.\d+)?%?)\s*/gy;
  let index = 0;
  while (index < source.length) {
    regex.lastIndex = index;
    const match = regex.exec(source);
    if (!match) throw new Error(`Unexpected query text near: ${source.slice(index, index + 20)}`);
    tokens.push(match[1]); index = regex.lastIndex;
  }
  return tokens;
}

function parseQuery(source) {
  const tokens = tokenize(String(source || '').trim()); let at = 0;
  const peek = () => tokens[at]; const take = () => tokens[at++];
  function atom() {
    if (peek() === '(') { take(); const node = orExpr(); if (take() !== ')') throw new Error('Missing closing parenthesis.'); return node; }
    const field = take()?.toLowerCase();
    if (!ALLOWED_FIELDS.has(field)) throw new Error(`Unknown field "${field}". Supported: ${[...ALLOWED_FIELDS].join(', ')}.`);
    const op = take(); if (!['<', '<=', '>', '>=', '=', '!='].includes(op)) throw new Error(`Expected a comparison operator after ${field}.`);
    const valueToken = take();
    if (!valueToken) throw new Error(`Missing value for ${field}.`);
    const numeric = Number(valueToken.replace(/%$/, ''));
    if (!Number.isFinite(numeric) && !ALLOWED_FIELDS.has(valueToken.toLowerCase())) throw new Error(`Invalid value "${valueToken}".`);
    return { type: 'compare', field, op, value: Number.isFinite(numeric) ? numeric : valueToken.toLowerCase() };
  }
  function andExpr() { let node = atom(); while (peek()?.toUpperCase() === 'AND') { take(); node = { type: 'and', left: node, right: atom() }; } return node; }
  function orExpr() { let node = andExpr(); while (peek()?.toUpperCase() === 'OR') { take(); node = { type: 'or', left: node, right: andExpr() }; } return node; }
  if (!tokens.length) throw new Error('Write a query such as change_pct <= -3 AND volume > avg_volume.');
  const ast = orExpr(); if (at !== tokens.length) throw new Error(`Unexpected token "${peek()}".`); return ast;
}

function evaluateQuery(node, row) {
  if (node.type === 'and') return evaluateQuery(node.left, row) && evaluateQuery(node.right, row);
  if (node.type === 'or') return evaluateQuery(node.left, row) || evaluateQuery(node.right, row);
  if (row[node.field] == null || (typeof node.value === 'string' && row[node.value] == null)) return false;
  const left = Number(row[node.field]); const right = typeof node.value === 'number' ? node.value : Number(row[node.value]);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  return ({ '<': left < right, '<=': left <= right, '>': left > right, '>=': left >= right, '=': left === right, '!=': left !== right })[node.op];
}

module.exports = { ALLOWED_FIELDS, parseQuery, evaluateQuery };
