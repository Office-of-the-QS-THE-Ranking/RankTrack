/*
 * Formulas in a methodology, written the way the bodies print them: ({1.5} − {1.6}) / {1.5} × 100, where {code} is
 * another indicator's value. A small parser, never eval: numbers, + − × ÷ (or * /), parentheses, and min, max, abs,
 * round, sum. Anything missing, or a division by zero, makes the result null rather than a misleading number.
 */

type Node =
  | { t: "num"; v: number }
  | { t: "ref"; code: string }
  | { t: "neg"; a: Node }
  | { t: "bin"; op: "+" | "-" | "*" | "/"; a: Node; b: Node }
  | { t: "fn"; name: Fn; args: Node[] };

const FNS = ["min", "max", "abs", "round", "sum"] as const;
type Fn = (typeof FNS)[number];

type Token = { k: "num"; v: number } | { k: "ref"; code: string } | { k: "op"; v: string } | { k: "id"; v: string };

const OPS: Record<string, string> = { "+": "+", "-": "-", "−": "-", "–": "-", "*": "*", "×": "*", "x": "*", "/": "/", "÷": "/", "(": "(", ")": ")", ",": "," };

function tokens(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "{") {
      const end = src.indexOf("}", i);
      if (end < 0) throw new Error("An indicator reference is missing its closing brace.");
      const code = src.slice(i + 1, end).trim();
      if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(code)) throw new Error(`“${code}” is not an indicator code.`);
      out.push({ k: "ref", code });
      i = end + 1;
      continue;
    }
    const num = /^(\d+(?:\.\d+)?|\.\d+)(%?)/.exec(src.slice(i));
    if (num) {
      out.push({ k: "num", v: Number(num[1]) / (num[2] ? 100 : 1) });
      i += num[0].length;
      continue;
    }
    const id = /^[a-z]+/.exec(src.slice(i));
    // A lone x between operands is multiplication, as some methodologies print it.
    if (id && !(id[0] === "x" && out.length && out[out.length - 1].k !== "op")) {
      out.push({ k: "id", v: id[0] });
      i += id[0].length;
      continue;
    }
    if (OPS[c]) {
      out.push({ k: "op", v: OPS[c] });
      i++;
      continue;
    }
    throw new Error(`Unexpected “${c}” in the formula.`);
  }
  return out;
}

function parse(src: string): Node {
  const ts = tokens(src);
  let p = 0;
  const peek = () => ts[p];
  const isOp = (v: string) => peek()?.k === "op" && (peek() as { v: string }).v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new Error(`Expected “${v}” in the formula.`);
    p++;
  };
  const primary = (): Node => {
    const t = peek();
    if (!t) throw new Error("The formula ends too soon.");
    if (t.k === "num") {
      p++;
      return { t: "num", v: t.v };
    }
    if (t.k === "ref") {
      p++;
      return { t: "ref", code: t.code };
    }
    if (t.k === "id") {
      if (!(FNS as readonly string[]).includes(t.v)) throw new Error(`“${t.v}” is not a function the Hub knows (min, max, abs, round, sum).`);
      p++;
      expect("(");
      const args: Node[] = [];
      if (!isOp(")")) {
        args.push(sum());
        while (isOp(",")) {
          p++;
          args.push(sum());
        }
      }
      expect(")");
      return { t: "fn", name: t.v as Fn, args };
    }
    if (isOp("(")) {
      p++;
      const n = sum();
      expect(")");
      return n;
    }
    throw new Error("Expected a number, an {indicator} or a parenthesis.");
  };
  const unary = (): Node => {
    if (isOp("-")) {
      p++;
      return { t: "neg", a: unary() };
    }
    if (isOp("+")) {
      p++;
      return unary();
    }
    return primary();
  };
  const product = (): Node => {
    let n = unary();
    while (isOp("*") || isOp("/")) {
      const op = (ts[p++] as { v: "*" | "/" }).v;
      n = { t: "bin", op, a: n, b: unary() };
    }
    return n;
  };
  const sum = (): Node => {
    let n = product();
    while (isOp("+") || isOp("-")) {
      const op = (ts[p++] as { v: "+" | "-" }).v;
      n = { t: "bin", op, a: n, b: product() };
    }
    return n;
  };
  const n = sum();
  if (p < ts.length) throw new Error("The formula has something extra at the end.");
  return n;
}

const compiled = new Map<string, Node>();

function compile(src: string): Node {
  let n = compiled.get(src);
  if (!n) {
    n = parse(src);
    if (compiled.size > 2000) compiled.clear();
    compiled.set(src, n);
  }
  return n;
}

/** Why a formula can't be read, or null when it can. */
export function formulaProblem(src: string): string | null {
  try {
    parse(src);
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : "The formula can't be read.";
  }
}

/** The indicator codes a formula reads, in order of first use. */
export function refsOf(src: string): string[] {
  const out: string[] = [];
  const walk = (n: Node) => {
    if (n.t === "ref") {
      if (!out.includes(n.code)) out.push(n.code);
    } else if (n.t === "neg") walk(n.a);
    else if (n.t === "bin") {
      walk(n.a);
      walk(n.b);
    } else if (n.t === "fn") n.args.forEach(walk);
  };
  walk(compile(src));
  return out;
}

/** The formula's value, or null when an input is missing or it divides by zero. */
export function evaluate(src: string, lookup: (code: string) => number | null | undefined): number | null {
  const ev = (n: Node): number | null => {
    switch (n.t) {
      case "num":
        return n.v;
      case "ref": {
        const v = lookup(n.code);
        return typeof v === "number" && Number.isFinite(v) ? v : null;
      }
      case "neg": {
        const a = ev(n.a);
        return a === null ? null : -a;
      }
      case "bin": {
        const a = ev(n.a);
        const b = ev(n.b);
        if (a === null || b === null) return null;
        if (n.op === "+") return a + b;
        if (n.op === "-") return a - b;
        if (n.op === "*") return a * b;
        return b === 0 ? null : a / b;
      }
      case "fn": {
        const args = n.args.map(ev);
        if (args.some((x) => x === null)) return null;
        const xs = args as number[];
        if (n.name === "min") return xs.length ? Math.min(...xs) : null;
        if (n.name === "max") return xs.length ? Math.max(...xs) : null;
        if (n.name === "sum") return xs.reduce((s, x) => s + x, 0);
        if (n.name === "abs") return xs.length === 1 ? Math.abs(xs[0]) : null;
        return xs.length === 1 ? Math.round(xs[0]) : xs.length === 2 ? Math.round(xs[0] * 10 ** xs[1]) / 10 ** xs[1] : null;
      }
    }
  };
  const r = ev(compile(src));
  return r !== null && Number.isFinite(r) ? r : null;
}
