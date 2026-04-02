// node_modules/@lit/reactive-element/css-tag.js
var t = globalThis;
var e = t.ShadowRoot && (void 0 === t.ShadyCSS || t.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype;
var s = /* @__PURE__ */ Symbol();
var o = /* @__PURE__ */ new WeakMap();
var n = class {
  constructor(t4, e5, o5) {
    if (this._$cssResult$ = true, o5 !== s) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = t4, this.t = e5;
  }
  get styleSheet() {
    let t4 = this.o;
    const s4 = this.t;
    if (e && void 0 === t4) {
      const e5 = void 0 !== s4 && 1 === s4.length;
      e5 && (t4 = o.get(s4)), void 0 === t4 && ((this.o = t4 = new CSSStyleSheet()).replaceSync(this.cssText), e5 && o.set(s4, t4));
    }
    return t4;
  }
  toString() {
    return this.cssText;
  }
};
var r = (t4) => new n("string" == typeof t4 ? t4 : t4 + "", void 0, s);
var i = (t4, ...e5) => {
  const o5 = 1 === t4.length ? t4[0] : e5.reduce((e6, s4, o6) => e6 + ((t5) => {
    if (true === t5._$cssResult$) return t5.cssText;
    if ("number" == typeof t5) return t5;
    throw Error("Value passed to 'css' function must be a 'css' function result: " + t5 + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
  })(s4) + t4[o6 + 1], t4[0]);
  return new n(o5, t4, s);
};
var S = (s4, o5) => {
  if (e) s4.adoptedStyleSheets = o5.map((t4) => t4 instanceof CSSStyleSheet ? t4 : t4.styleSheet);
  else for (const e5 of o5) {
    const o6 = document.createElement("style"), n4 = t.litNonce;
    void 0 !== n4 && o6.setAttribute("nonce", n4), o6.textContent = e5.cssText, s4.appendChild(o6);
  }
};
var c = e ? (t4) => t4 : (t4) => t4 instanceof CSSStyleSheet ? ((t5) => {
  let e5 = "";
  for (const s4 of t5.cssRules) e5 += s4.cssText;
  return r(e5);
})(t4) : t4;

// node_modules/@lit/reactive-element/reactive-element.js
var { is: i2, defineProperty: e2, getOwnPropertyDescriptor: h, getOwnPropertyNames: r2, getOwnPropertySymbols: o2, getPrototypeOf: n2 } = Object;
var a = globalThis;
var c2 = a.trustedTypes;
var l = c2 ? c2.emptyScript : "";
var p = a.reactiveElementPolyfillSupport;
var d = (t4, s4) => t4;
var u = { toAttribute(t4, s4) {
  switch (s4) {
    case Boolean:
      t4 = t4 ? l : null;
      break;
    case Object:
    case Array:
      t4 = null == t4 ? t4 : JSON.stringify(t4);
  }
  return t4;
}, fromAttribute(t4, s4) {
  let i7 = t4;
  switch (s4) {
    case Boolean:
      i7 = null !== t4;
      break;
    case Number:
      i7 = null === t4 ? null : Number(t4);
      break;
    case Object:
    case Array:
      try {
        i7 = JSON.parse(t4);
      } catch (t5) {
        i7 = null;
      }
  }
  return i7;
} };
var f = (t4, s4) => !i2(t4, s4);
var b = { attribute: true, type: String, converter: u, reflect: false, useDefault: false, hasChanged: f };
Symbol.metadata ?? (Symbol.metadata = /* @__PURE__ */ Symbol("metadata")), a.litPropertyMetadata ?? (a.litPropertyMetadata = /* @__PURE__ */ new WeakMap());
var y = class extends HTMLElement {
  static addInitializer(t4) {
    this._$Ei(), (this.l ?? (this.l = [])).push(t4);
  }
  static get observedAttributes() {
    return this.finalize(), this._$Eh && [...this._$Eh.keys()];
  }
  static createProperty(t4, s4 = b) {
    if (s4.state && (s4.attribute = false), this._$Ei(), this.prototype.hasOwnProperty(t4) && ((s4 = Object.create(s4)).wrapped = true), this.elementProperties.set(t4, s4), !s4.noAccessor) {
      const i7 = /* @__PURE__ */ Symbol(), h3 = this.getPropertyDescriptor(t4, i7, s4);
      void 0 !== h3 && e2(this.prototype, t4, h3);
    }
  }
  static getPropertyDescriptor(t4, s4, i7) {
    const { get: e5, set: r4 } = h(this.prototype, t4) ?? { get() {
      return this[s4];
    }, set(t5) {
      this[s4] = t5;
    } };
    return { get: e5, set(s5) {
      const h3 = e5?.call(this);
      r4?.call(this, s5), this.requestUpdate(t4, h3, i7);
    }, configurable: true, enumerable: true };
  }
  static getPropertyOptions(t4) {
    return this.elementProperties.get(t4) ?? b;
  }
  static _$Ei() {
    if (this.hasOwnProperty(d("elementProperties"))) return;
    const t4 = n2(this);
    t4.finalize(), void 0 !== t4.l && (this.l = [...t4.l]), this.elementProperties = new Map(t4.elementProperties);
  }
  static finalize() {
    if (this.hasOwnProperty(d("finalized"))) return;
    if (this.finalized = true, this._$Ei(), this.hasOwnProperty(d("properties"))) {
      const t5 = this.properties, s4 = [...r2(t5), ...o2(t5)];
      for (const i7 of s4) this.createProperty(i7, t5[i7]);
    }
    const t4 = this[Symbol.metadata];
    if (null !== t4) {
      const s4 = litPropertyMetadata.get(t4);
      if (void 0 !== s4) for (const [t5, i7] of s4) this.elementProperties.set(t5, i7);
    }
    this._$Eh = /* @__PURE__ */ new Map();
    for (const [t5, s4] of this.elementProperties) {
      const i7 = this._$Eu(t5, s4);
      void 0 !== i7 && this._$Eh.set(i7, t5);
    }
    this.elementStyles = this.finalizeStyles(this.styles);
  }
  static finalizeStyles(s4) {
    const i7 = [];
    if (Array.isArray(s4)) {
      const e5 = new Set(s4.flat(1 / 0).reverse());
      for (const s5 of e5) i7.unshift(c(s5));
    } else void 0 !== s4 && i7.push(c(s4));
    return i7;
  }
  static _$Eu(t4, s4) {
    const i7 = s4.attribute;
    return false === i7 ? void 0 : "string" == typeof i7 ? i7 : "string" == typeof t4 ? t4.toLowerCase() : void 0;
  }
  constructor() {
    super(), this._$Ep = void 0, this.isUpdatePending = false, this.hasUpdated = false, this._$Em = null, this._$Ev();
  }
  _$Ev() {
    this._$ES = new Promise((t4) => this.enableUpdating = t4), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), this.constructor.l?.forEach((t4) => t4(this));
  }
  addController(t4) {
    (this._$EO ?? (this._$EO = /* @__PURE__ */ new Set())).add(t4), void 0 !== this.renderRoot && this.isConnected && t4.hostConnected?.();
  }
  removeController(t4) {
    this._$EO?.delete(t4);
  }
  _$E_() {
    const t4 = /* @__PURE__ */ new Map(), s4 = this.constructor.elementProperties;
    for (const i7 of s4.keys()) this.hasOwnProperty(i7) && (t4.set(i7, this[i7]), delete this[i7]);
    t4.size > 0 && (this._$Ep = t4);
  }
  createRenderRoot() {
    const t4 = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
    return S(t4, this.constructor.elementStyles), t4;
  }
  connectedCallback() {
    this.renderRoot ?? (this.renderRoot = this.createRenderRoot()), this.enableUpdating(true), this._$EO?.forEach((t4) => t4.hostConnected?.());
  }
  enableUpdating(t4) {
  }
  disconnectedCallback() {
    this._$EO?.forEach((t4) => t4.hostDisconnected?.());
  }
  attributeChangedCallback(t4, s4, i7) {
    this._$AK(t4, i7);
  }
  _$ET(t4, s4) {
    const i7 = this.constructor.elementProperties.get(t4), e5 = this.constructor._$Eu(t4, i7);
    if (void 0 !== e5 && true === i7.reflect) {
      const h3 = (void 0 !== i7.converter?.toAttribute ? i7.converter : u).toAttribute(s4, i7.type);
      this._$Em = t4, null == h3 ? this.removeAttribute(e5) : this.setAttribute(e5, h3), this._$Em = null;
    }
  }
  _$AK(t4, s4) {
    const i7 = this.constructor, e5 = i7._$Eh.get(t4);
    if (void 0 !== e5 && this._$Em !== e5) {
      const t5 = i7.getPropertyOptions(e5), h3 = "function" == typeof t5.converter ? { fromAttribute: t5.converter } : void 0 !== t5.converter?.fromAttribute ? t5.converter : u;
      this._$Em = e5;
      const r4 = h3.fromAttribute(s4, t5.type);
      this[e5] = r4 ?? this._$Ej?.get(e5) ?? r4, this._$Em = null;
    }
  }
  requestUpdate(t4, s4, i7, e5 = false, h3) {
    if (void 0 !== t4) {
      const r4 = this.constructor;
      if (false === e5 && (h3 = this[t4]), i7 ?? (i7 = r4.getPropertyOptions(t4)), !((i7.hasChanged ?? f)(h3, s4) || i7.useDefault && i7.reflect && h3 === this._$Ej?.get(t4) && !this.hasAttribute(r4._$Eu(t4, i7)))) return;
      this.C(t4, s4, i7);
    }
    false === this.isUpdatePending && (this._$ES = this._$EP());
  }
  C(t4, s4, { useDefault: i7, reflect: e5, wrapped: h3 }, r4) {
    i7 && !(this._$Ej ?? (this._$Ej = /* @__PURE__ */ new Map())).has(t4) && (this._$Ej.set(t4, r4 ?? s4 ?? this[t4]), true !== h3 || void 0 !== r4) || (this._$AL.has(t4) || (this.hasUpdated || i7 || (s4 = void 0), this._$AL.set(t4, s4)), true === e5 && this._$Em !== t4 && (this._$Eq ?? (this._$Eq = /* @__PURE__ */ new Set())).add(t4));
  }
  async _$EP() {
    this.isUpdatePending = true;
    try {
      await this._$ES;
    } catch (t5) {
      Promise.reject(t5);
    }
    const t4 = this.scheduleUpdate();
    return null != t4 && await t4, !this.isUpdatePending;
  }
  scheduleUpdate() {
    return this.performUpdate();
  }
  performUpdate() {
    if (!this.isUpdatePending) return;
    if (!this.hasUpdated) {
      if (this.renderRoot ?? (this.renderRoot = this.createRenderRoot()), this._$Ep) {
        for (const [t6, s5] of this._$Ep) this[t6] = s5;
        this._$Ep = void 0;
      }
      const t5 = this.constructor.elementProperties;
      if (t5.size > 0) for (const [s5, i7] of t5) {
        const { wrapped: t6 } = i7, e5 = this[s5];
        true !== t6 || this._$AL.has(s5) || void 0 === e5 || this.C(s5, void 0, i7, e5);
      }
    }
    let t4 = false;
    const s4 = this._$AL;
    try {
      t4 = this.shouldUpdate(s4), t4 ? (this.willUpdate(s4), this._$EO?.forEach((t5) => t5.hostUpdate?.()), this.update(s4)) : this._$EM();
    } catch (s5) {
      throw t4 = false, this._$EM(), s5;
    }
    t4 && this._$AE(s4);
  }
  willUpdate(t4) {
  }
  _$AE(t4) {
    this._$EO?.forEach((t5) => t5.hostUpdated?.()), this.hasUpdated || (this.hasUpdated = true, this.firstUpdated(t4)), this.updated(t4);
  }
  _$EM() {
    this._$AL = /* @__PURE__ */ new Map(), this.isUpdatePending = false;
  }
  get updateComplete() {
    return this.getUpdateComplete();
  }
  getUpdateComplete() {
    return this._$ES;
  }
  shouldUpdate(t4) {
    return true;
  }
  update(t4) {
    this._$Eq && (this._$Eq = this._$Eq.forEach((t5) => this._$ET(t5, this[t5]))), this._$EM();
  }
  updated(t4) {
  }
  firstUpdated(t4) {
  }
};
y.elementStyles = [], y.shadowRootOptions = { mode: "open" }, y[d("elementProperties")] = /* @__PURE__ */ new Map(), y[d("finalized")] = /* @__PURE__ */ new Map(), p?.({ ReactiveElement: y }), (a.reactiveElementVersions ?? (a.reactiveElementVersions = [])).push("2.1.2");

// node_modules/lit-html/lit-html.js
var t2 = globalThis;
var i3 = (t4) => t4;
var s2 = t2.trustedTypes;
var e3 = s2 ? s2.createPolicy("lit-html", { createHTML: (t4) => t4 }) : void 0;
var h2 = "$lit$";
var o3 = `lit$${Math.random().toFixed(9).slice(2)}$`;
var n3 = "?" + o3;
var r3 = `<${n3}>`;
var l2 = document;
var c3 = () => l2.createComment("");
var a2 = (t4) => null === t4 || "object" != typeof t4 && "function" != typeof t4;
var u2 = Array.isArray;
var d2 = (t4) => u2(t4) || "function" == typeof t4?.[Symbol.iterator];
var f2 = "[ 	\n\f\r]";
var v = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g;
var _ = /--!?>/g;
var m = />/g;
var p2 = RegExp(`>|${f2}(?:([^\\s"'>=/]+)(${f2}*=${f2}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g");
var g = /'/g;
var $ = /"/g;
var y2 = /^(?:script|style|textarea|title)$/i;
var x = (t4) => (i7, ...s4) => ({ _$litType$: t4, strings: i7, values: s4 });
var b2 = x(1);
var w = x(2);
var T = x(3);
var E = /* @__PURE__ */ Symbol.for("lit-noChange");
var A = /* @__PURE__ */ Symbol.for("lit-nothing");
var C = /* @__PURE__ */ new WeakMap();
var P = l2.createTreeWalker(l2, 129);
function V(t4, i7) {
  if (!u2(t4) || !t4.hasOwnProperty("raw")) throw Error("invalid template strings array");
  return void 0 !== e3 ? e3.createHTML(i7) : i7;
}
var N = (t4, i7) => {
  const s4 = t4.length - 1, e5 = [];
  let n4, l3 = 2 === i7 ? "<svg>" : 3 === i7 ? "<math>" : "", c4 = v;
  for (let i8 = 0; i8 < s4; i8++) {
    const s5 = t4[i8];
    let a3, u3, d3 = -1, f3 = 0;
    for (; f3 < s5.length && (c4.lastIndex = f3, u3 = c4.exec(s5), null !== u3); ) f3 = c4.lastIndex, c4 === v ? "!--" === u3[1] ? c4 = _ : void 0 !== u3[1] ? c4 = m : void 0 !== u3[2] ? (y2.test(u3[2]) && (n4 = RegExp("</" + u3[2], "g")), c4 = p2) : void 0 !== u3[3] && (c4 = p2) : c4 === p2 ? ">" === u3[0] ? (c4 = n4 ?? v, d3 = -1) : void 0 === u3[1] ? d3 = -2 : (d3 = c4.lastIndex - u3[2].length, a3 = u3[1], c4 = void 0 === u3[3] ? p2 : '"' === u3[3] ? $ : g) : c4 === $ || c4 === g ? c4 = p2 : c4 === _ || c4 === m ? c4 = v : (c4 = p2, n4 = void 0);
    const x2 = c4 === p2 && t4[i8 + 1].startsWith("/>") ? " " : "";
    l3 += c4 === v ? s5 + r3 : d3 >= 0 ? (e5.push(a3), s5.slice(0, d3) + h2 + s5.slice(d3) + o3 + x2) : s5 + o3 + (-2 === d3 ? i8 : x2);
  }
  return [V(t4, l3 + (t4[s4] || "<?>") + (2 === i7 ? "</svg>" : 3 === i7 ? "</math>" : "")), e5];
};
var S2 = class _S {
  constructor({ strings: t4, _$litType$: i7 }, e5) {
    let r4;
    this.parts = [];
    let l3 = 0, a3 = 0;
    const u3 = t4.length - 1, d3 = this.parts, [f3, v2] = N(t4, i7);
    if (this.el = _S.createElement(f3, e5), P.currentNode = this.el.content, 2 === i7 || 3 === i7) {
      const t5 = this.el.content.firstChild;
      t5.replaceWith(...t5.childNodes);
    }
    for (; null !== (r4 = P.nextNode()) && d3.length < u3; ) {
      if (1 === r4.nodeType) {
        if (r4.hasAttributes()) for (const t5 of r4.getAttributeNames()) if (t5.endsWith(h2)) {
          const i8 = v2[a3++], s4 = r4.getAttribute(t5).split(o3), e6 = /([.?@])?(.*)/.exec(i8);
          d3.push({ type: 1, index: l3, name: e6[2], strings: s4, ctor: "." === e6[1] ? I : "?" === e6[1] ? L : "@" === e6[1] ? z : H }), r4.removeAttribute(t5);
        } else t5.startsWith(o3) && (d3.push({ type: 6, index: l3 }), r4.removeAttribute(t5));
        if (y2.test(r4.tagName)) {
          const t5 = r4.textContent.split(o3), i8 = t5.length - 1;
          if (i8 > 0) {
            r4.textContent = s2 ? s2.emptyScript : "";
            for (let s4 = 0; s4 < i8; s4++) r4.append(t5[s4], c3()), P.nextNode(), d3.push({ type: 2, index: ++l3 });
            r4.append(t5[i8], c3());
          }
        }
      } else if (8 === r4.nodeType) if (r4.data === n3) d3.push({ type: 2, index: l3 });
      else {
        let t5 = -1;
        for (; -1 !== (t5 = r4.data.indexOf(o3, t5 + 1)); ) d3.push({ type: 7, index: l3 }), t5 += o3.length - 1;
      }
      l3++;
    }
  }
  static createElement(t4, i7) {
    const s4 = l2.createElement("template");
    return s4.innerHTML = t4, s4;
  }
};
function M(t4, i7, s4 = t4, e5) {
  if (i7 === E) return i7;
  let h3 = void 0 !== e5 ? s4._$Co?.[e5] : s4._$Cl;
  const o5 = a2(i7) ? void 0 : i7._$litDirective$;
  return h3?.constructor !== o5 && (h3?._$AO?.(false), void 0 === o5 ? h3 = void 0 : (h3 = new o5(t4), h3._$AT(t4, s4, e5)), void 0 !== e5 ? (s4._$Co ?? (s4._$Co = []))[e5] = h3 : s4._$Cl = h3), void 0 !== h3 && (i7 = M(t4, h3._$AS(t4, i7.values), h3, e5)), i7;
}
var R = class {
  constructor(t4, i7) {
    this._$AV = [], this._$AN = void 0, this._$AD = t4, this._$AM = i7;
  }
  get parentNode() {
    return this._$AM.parentNode;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  u(t4) {
    const { el: { content: i7 }, parts: s4 } = this._$AD, e5 = (t4?.creationScope ?? l2).importNode(i7, true);
    P.currentNode = e5;
    let h3 = P.nextNode(), o5 = 0, n4 = 0, r4 = s4[0];
    for (; void 0 !== r4; ) {
      if (o5 === r4.index) {
        let i8;
        2 === r4.type ? i8 = new k(h3, h3.nextSibling, this, t4) : 1 === r4.type ? i8 = new r4.ctor(h3, r4.name, r4.strings, this, t4) : 6 === r4.type && (i8 = new Z(h3, this, t4)), this._$AV.push(i8), r4 = s4[++n4];
      }
      o5 !== r4?.index && (h3 = P.nextNode(), o5++);
    }
    return P.currentNode = l2, e5;
  }
  p(t4) {
    let i7 = 0;
    for (const s4 of this._$AV) void 0 !== s4 && (void 0 !== s4.strings ? (s4._$AI(t4, s4, i7), i7 += s4.strings.length - 2) : s4._$AI(t4[i7])), i7++;
  }
};
var k = class _k {
  get _$AU() {
    return this._$AM?._$AU ?? this._$Cv;
  }
  constructor(t4, i7, s4, e5) {
    this.type = 2, this._$AH = A, this._$AN = void 0, this._$AA = t4, this._$AB = i7, this._$AM = s4, this.options = e5, this._$Cv = e5?.isConnected ?? true;
  }
  get parentNode() {
    let t4 = this._$AA.parentNode;
    const i7 = this._$AM;
    return void 0 !== i7 && 11 === t4?.nodeType && (t4 = i7.parentNode), t4;
  }
  get startNode() {
    return this._$AA;
  }
  get endNode() {
    return this._$AB;
  }
  _$AI(t4, i7 = this) {
    t4 = M(this, t4, i7), a2(t4) ? t4 === A || null == t4 || "" === t4 ? (this._$AH !== A && this._$AR(), this._$AH = A) : t4 !== this._$AH && t4 !== E && this._(t4) : void 0 !== t4._$litType$ ? this.$(t4) : void 0 !== t4.nodeType ? this.T(t4) : d2(t4) ? this.k(t4) : this._(t4);
  }
  O(t4) {
    return this._$AA.parentNode.insertBefore(t4, this._$AB);
  }
  T(t4) {
    this._$AH !== t4 && (this._$AR(), this._$AH = this.O(t4));
  }
  _(t4) {
    this._$AH !== A && a2(this._$AH) ? this._$AA.nextSibling.data = t4 : this.T(l2.createTextNode(t4)), this._$AH = t4;
  }
  $(t4) {
    const { values: i7, _$litType$: s4 } = t4, e5 = "number" == typeof s4 ? this._$AC(t4) : (void 0 === s4.el && (s4.el = S2.createElement(V(s4.h, s4.h[0]), this.options)), s4);
    if (this._$AH?._$AD === e5) this._$AH.p(i7);
    else {
      const t5 = new R(e5, this), s5 = t5.u(this.options);
      t5.p(i7), this.T(s5), this._$AH = t5;
    }
  }
  _$AC(t4) {
    let i7 = C.get(t4.strings);
    return void 0 === i7 && C.set(t4.strings, i7 = new S2(t4)), i7;
  }
  k(t4) {
    u2(this._$AH) || (this._$AH = [], this._$AR());
    const i7 = this._$AH;
    let s4, e5 = 0;
    for (const h3 of t4) e5 === i7.length ? i7.push(s4 = new _k(this.O(c3()), this.O(c3()), this, this.options)) : s4 = i7[e5], s4._$AI(h3), e5++;
    e5 < i7.length && (this._$AR(s4 && s4._$AB.nextSibling, e5), i7.length = e5);
  }
  _$AR(t4 = this._$AA.nextSibling, s4) {
    for (this._$AP?.(false, true, s4); t4 !== this._$AB; ) {
      const s5 = i3(t4).nextSibling;
      i3(t4).remove(), t4 = s5;
    }
  }
  setConnected(t4) {
    void 0 === this._$AM && (this._$Cv = t4, this._$AP?.(t4));
  }
};
var H = class {
  get tagName() {
    return this.element.tagName;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  constructor(t4, i7, s4, e5, h3) {
    this.type = 1, this._$AH = A, this._$AN = void 0, this.element = t4, this.name = i7, this._$AM = e5, this.options = h3, s4.length > 2 || "" !== s4[0] || "" !== s4[1] ? (this._$AH = Array(s4.length - 1).fill(new String()), this.strings = s4) : this._$AH = A;
  }
  _$AI(t4, i7 = this, s4, e5) {
    const h3 = this.strings;
    let o5 = false;
    if (void 0 === h3) t4 = M(this, t4, i7, 0), o5 = !a2(t4) || t4 !== this._$AH && t4 !== E, o5 && (this._$AH = t4);
    else {
      const e6 = t4;
      let n4, r4;
      for (t4 = h3[0], n4 = 0; n4 < h3.length - 1; n4++) r4 = M(this, e6[s4 + n4], i7, n4), r4 === E && (r4 = this._$AH[n4]), o5 || (o5 = !a2(r4) || r4 !== this._$AH[n4]), r4 === A ? t4 = A : t4 !== A && (t4 += (r4 ?? "") + h3[n4 + 1]), this._$AH[n4] = r4;
    }
    o5 && !e5 && this.j(t4);
  }
  j(t4) {
    t4 === A ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t4 ?? "");
  }
};
var I = class extends H {
  constructor() {
    super(...arguments), this.type = 3;
  }
  j(t4) {
    this.element[this.name] = t4 === A ? void 0 : t4;
  }
};
var L = class extends H {
  constructor() {
    super(...arguments), this.type = 4;
  }
  j(t4) {
    this.element.toggleAttribute(this.name, !!t4 && t4 !== A);
  }
};
var z = class extends H {
  constructor(t4, i7, s4, e5, h3) {
    super(t4, i7, s4, e5, h3), this.type = 5;
  }
  _$AI(t4, i7 = this) {
    if ((t4 = M(this, t4, i7, 0) ?? A) === E) return;
    const s4 = this._$AH, e5 = t4 === A && s4 !== A || t4.capture !== s4.capture || t4.once !== s4.once || t4.passive !== s4.passive, h3 = t4 !== A && (s4 === A || e5);
    e5 && this.element.removeEventListener(this.name, this, s4), h3 && this.element.addEventListener(this.name, this, t4), this._$AH = t4;
  }
  handleEvent(t4) {
    "function" == typeof this._$AH ? this._$AH.call(this.options?.host ?? this.element, t4) : this._$AH.handleEvent(t4);
  }
};
var Z = class {
  constructor(t4, i7, s4) {
    this.element = t4, this.type = 6, this._$AN = void 0, this._$AM = i7, this.options = s4;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AI(t4) {
    M(this, t4);
  }
};
var j = { M: h2, P: o3, A: n3, C: 1, L: N, R, D: d2, V: M, I: k, H, N: L, U: z, B: I, F: Z };
var B = t2.litHtmlPolyfillSupport;
B?.(S2, k), (t2.litHtmlVersions ?? (t2.litHtmlVersions = [])).push("3.3.2");
var D = (t4, i7, s4) => {
  const e5 = s4?.renderBefore ?? i7;
  let h3 = e5._$litPart$;
  if (void 0 === h3) {
    const t5 = s4?.renderBefore ?? null;
    e5._$litPart$ = h3 = new k(i7.insertBefore(c3(), t5), t5, void 0, s4 ?? {});
  }
  return h3._$AI(t4), h3;
};

// node_modules/lit-element/lit-element.js
var s3 = globalThis;
var i4 = class extends y {
  constructor() {
    super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
  }
  createRenderRoot() {
    var _a;
    const t4 = super.createRenderRoot();
    return (_a = this.renderOptions).renderBefore ?? (_a.renderBefore = t4.firstChild), t4;
  }
  update(t4) {
    const r4 = this.render();
    this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t4), this._$Do = D(r4, this.renderRoot, this.renderOptions);
  }
  connectedCallback() {
    super.connectedCallback(), this._$Do?.setConnected(true);
  }
  disconnectedCallback() {
    super.disconnectedCallback(), this._$Do?.setConnected(false);
  }
  render() {
    return E;
  }
};
i4._$litElement$ = true, i4["finalized"] = true, s3.litElementHydrateSupport?.({ LitElement: i4 });
var o4 = s3.litElementPolyfillSupport;
o4?.({ LitElement: i4 });
(s3.litElementVersions ?? (s3.litElementVersions = [])).push("4.2.2");

// node_modules/lit-html/directive.js
var e4 = (t4) => (...e5) => ({ _$litDirective$: t4, values: e5 });
var i5 = class {
  constructor(t4) {
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AT(t4, e5, i7) {
    this._$Ct = t4, this._$AM = e5, this._$Ci = i7;
  }
  _$AS(t4, e5) {
    return this.update(t4, e5);
  }
  update(t4, e5) {
    return this.render(...e5);
  }
};

// node_modules/lit-html/directive-helpers.js
var { I: t3 } = j;
var m2 = {};
var p3 = (o5, t4 = m2) => o5._$AH = t4;

// node_modules/lit-html/directives/keyed.js
var i6 = e4(class extends i5 {
  constructor() {
    super(...arguments), this.key = A;
  }
  render(r4, t4) {
    return this.key = r4, t4;
  }
  update(r4, [t4, e5]) {
    return t4 !== this.key && (p3(r4), this.key = t4), e5;
  }
});

// src/index.ts
var getGlobalHass = () => window.hass;
var DEFAULT_LANGUAGE = "en";
var BASE_URL = new URL(".", import.meta.url).toString().replace(/\/$/, "");
var translationsCache = /* @__PURE__ */ new Map();
var translationsInFlight = /* @__PURE__ */ new Map();
var translationLookupCache = /* @__PURE__ */ new Map();
var getStoredLanguage = () => {
  try {
    return localStorage.getItem("selectedLanguage") ?? void 0;
  } catch {
    return void 0;
  }
};
var getLanguage = (target) => {
  const globalHass = getGlobalHass();
  const targetLang = target && typeof target !== "function" ? target.language || target.locale?.language : void 0;
  return targetLang || globalHass?.language || globalHass?.locale?.language || document.documentElement.lang || getStoredLanguage() || navigator.language || DEFAULT_LANGUAGE;
};
var fetchTranslations = async (baseUrl, language) => {
  const response = await fetch(
    `${baseUrl}/translations/${language}.json`
  ).catch(() => null);
  if (!response || !response.ok) return null;
  try {
    return await response.json();
  } catch {
    return null;
  }
};
var ensureTranslations = async (target) => {
  const language = getLanguage(target);
  if (translationsCache.has(language)) return;
  const inFlight = translationsInFlight.get(language);
  if (inFlight) {
    await inFlight;
    return;
  }
  const cache = (strings) => {
    translationsCache.set(language, strings);
    translationLookupCache.delete(language);
  };
  const loadPromise = (async () => {
    const languageStrings = await fetchTranslations(BASE_URL, language);
    if (languageStrings) return cache(languageStrings);
    const baseLanguage = language.split("-")[0];
    if (baseLanguage && baseLanguage !== language) {
      const baseStrings = await fetchTranslations(BASE_URL, baseLanguage);
      if (baseStrings) return cache(baseStrings);
    }
    cache(await fetchTranslations(BASE_URL, DEFAULT_LANGUAGE) ?? {});
  })();
  translationsInFlight.set(language, loadPromise);
  await loadPromise;
  translationsInFlight.delete(language);
};
var resolveTranslationValue = (strings, key) => {
  const directValue = strings[key];
  if (typeof directValue === "string") return directValue;
  const cardStrings = strings.card;
  if (!cardStrings || typeof cardStrings !== "object") return null;
  const parts = key.split(".");
  let current = cardStrings;
  for (const part of parts) {
    if (!current || typeof current !== "object") return null;
    current = current[part];
  }
  return typeof current === "string" ? current : null;
};
var localize = (target, key) => {
  const language = getLanguage(target);
  const strings = translationsCache.get(language) || translationsCache.get(DEFAULT_LANGUAGE);
  if (!strings) return key;
  let cachedLookups = translationLookupCache.get(language);
  if (!cachedLookups) {
    cachedLookups = /* @__PURE__ */ new Map();
    translationLookupCache.set(language, cachedLookups);
  }
  const cachedValue = cachedLookups.get(key);
  if (cachedValue !== void 0) return cachedValue;
  const resolved = resolveTranslationValue(strings, key) ?? key;
  cachedLookups.set(key, resolved);
  return resolved;
};
var EMPTY_ZONE_STATUS = {
  state: null,
  kind: null,
  start: null,
  end: null
};
var normalizeMatchValue = (value) => String(value ?? "").trim().toLowerCase();
var normalizePlateValue = (value) => normalizeMatchValue(value).replace(/[^a-z0-9]/g, "");
var createFavoriteIndex = (favorites) => {
  const byPlate = /* @__PURE__ */ new Map();
  const byPlateName = /* @__PURE__ */ new Map();
  const byValue = /* @__PURE__ */ new Map();
  for (const favorite of favorites) {
    const plateKey = normalizePlateValue(favorite.license_plate);
    if (plateKey) {
      byPlate.set(plateKey, favorite);
      const nameKey = normalizeMatchValue(favorite.name);
      if (nameKey) byPlateName.set(`${plateKey}|${nameKey}`, favorite);
    }
    const nameValueKey = normalizeMatchValue(favorite.name);
    if (nameValueKey) byValue.set(nameValueKey, favorite);
  }
  return { byPlate, byPlateName, byValue };
};
var clearFavoriteTransientState = (context) => {
  Object.assign(context, {
    _pendingRemoveFavoriteId: null,
    _favoriteRemoveInFlight: false,
    _addFavoriteChecked: false,
    _suppressFavoriteClear: false
  });
};
var invalidateFavoritesCache = (context, options) => {
  Object.assign(context, { _favoritesLoadedFor: null, _favoritesError: null });
  if (options?.resetRetryAfter) context._favoritesRetryAfter = 0;
  if (options?.clearLoading) context._favoritesLoading = false;
};
var setPendingPermitDefaults = (context, entryId, force = false) => {
  Object.assign(context, {
    _pendingPermitDefaultsEntryId: entryId,
    _pendingPermitDefaultsForce: force
  });
};
var applyZoneStatus = (context, status) => {
  Object.assign(context, {
    _zoneState: status?.state ?? null,
    _windowKind: status?.kind ?? null,
    _windowStartIso: status?.start ?? null,
    _windowEndIso: status?.end ?? null
  });
};
var resetZoneStatusThrottle = (context) => context._zoneStatusTsByEntryId.clear();
var openDateTimePickerForField = (field) => {
  if (!field) return;
  const input = field instanceof HTMLInputElement ? field : field.shadowRoot?.querySelector(
    "input"
  );
  if (!input) return;
  if (typeof input.showPicker === "function") {
    input.showPicker();
    return;
  }
  input.focus();
};
var DOMAIN = "city_visitor_parking";
var RESERVATION_STARTED_EVENT = "city-visitor-parking-reservation-started";
var createStatusState = () => ({
  message: "",
  type: "info",
  clearHandle: null
});
var setStatusState = (state, message, type, requestRender, clearAfterMs) => {
  if (state.clearHandle !== null) {
    window.clearTimeout(state.clearHandle);
    state.clearHandle = null;
  }
  state.message = message;
  state.type = type;
  if (clearAfterMs) {
    state.clearHandle = window.setTimeout(() => {
      state.clearHandle = null;
      state.message = "";
      state.type = "info";
      requestRender();
    }, clearAfterMs);
  }
};
var clearStatusState = (state, requestRender) => {
  if (state.clearHandle !== null) {
    window.clearTimeout(state.clearHandle);
    state.clearHandle = null;
  }
  if (!state.message && state.type === "info") return;
  state.message = "";
  state.type = "info";
  requestRender();
};
var BASE_CARD_STYLES = i`
  :host {
    display: block;
  }
  ha-card {
    position: relative;
  }
  .row {
    margin: 0;
  }
  .card-content {
    display: flex;
    flex-direction: column;
    gap: var(--entities-card-row-gap, var(--card-row-gap, var(--ha-space-2)));
  }
  .card-header {
    display: flex;
    justify-content: space-between;
  }
  .card-header .name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .icon {
    padding: 0 var(--ha-space-4) 0 var(--ha-space-2);
  }
  ha-alert {
    margin: 0;
  }
  .spinner {
    display: flex;
    align-items: center;
    gap: var(--ha-space-2);
    color: var(--secondary-text-color);
    font-size: 0.85rem;
  }
  .datetime-row {
    position: relative;
  }
  .datetime-row ha-textfield {
    width: 100%;
  }
  .datetime-picker-button {
    position: absolute;
    inset-inline-end: var(--ha-space-1);
    top: 50%;
    transform: translateY(-50%);
    z-index: 1;
  }
`;
var buildPermitOptions = (entries) => entries.map((entry) => ({
  id: entry.entry_id,
  label: (entry.title || entry.entry_id || "").trim() || entry.entry_id
})).sort((first, second) => first.label.localeCompare(second.label));
var buildPermitTitleMap = (entries) => new Map(
  entries.map((entry) => [entry.entry_id, entry.title || entry.entry_id])
);
var fetchPermitEntries = async (hass) => hass.callWS({
  type: "config_entries/get",
  type_filter: ["device", "hub", "service"],
  domain: DOMAIN
});
var resolvePermitLabelsByDevice = (devices, entryTitles) => {
  const labels = /* @__PURE__ */ new Map();
  for (const device of devices) {
    const entryIds = Array.isArray(device.config_entries) ? device.config_entries : [];
    const entryId = entryIds.find((id) => entryTitles.has(id)) ?? entryIds[0];
    if (!entryId) continue;
    labels.set(device.id, entryTitles.get(entryId) ?? entryId);
  }
  return labels;
};
var errorMessage = (err, fallbackKey, localizeFn) => {
  for (const msg of [
    err?.message,
    err?.data?.message
  ]) {
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return localizeFn(fallbackKey);
};
var pad = (value) => String(value).padStart(2, "0");
var formatDate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
var formatDateTimeLocal = (date) => `${formatDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
var HA_STARTING_MESSAGE_KEY = "ui.panel.lovelace.warning.starting";
var getCardText = (key) => {
  const value = localize(getGlobalHass(), key);
  return value === key ? null : value;
};
var getConfigEntryId = (config) => config?.config_entry_id ?? null;
var filterDomainDevices = (devices, domain = DOMAIN) => devices.filter(
  (device) => (device.identifiers ?? []).some(
    (identifier) => identifier[0] === domain
  )
);
var getHassLanguage = (hass) => {
  if (typeof hass?.language === "string" && hass.language) return hass.language;
  const loc = hass?.locale;
  return typeof loc?.language === "string" ? loc.language : void 0;
};
var renderCardHeader = (title, icon) => {
  if (!title && !icon) return A;
  return b2`
    <h1 class="card-header">
      <div class="name">
        ${icon ? b2`<ha-icon class="icon" .icon=${icon}></ha-icon>` : A}
        ${title}
      </div>
    </h1>
  `;
};
var renderPermitSelect = (params) => {
  return b2`
    <div class="row">
      <ha-selector
        id="permitSelect"
        .hass=${params.hass}
        .selector=${{
    config_entry: {
      integration: DOMAIN
    }
  }}
        .label=${params.label}
        .value=${params.value}
        .required=${false}
        ?disabled=${params.disabled}
        @value-changed=${params.onSelected}
      ></ha-selector>
    </div>
  `;
};
var renderFavoriteSelect = (params) => {
  if (!params.showFavorites) return A;
  const selectOptions = [];
  const favoriteItems = [];
  const seenValues = /* @__PURE__ */ new Set();
  for (const favorite of params.favoritesOptions) {
    const name = favorite.name?.trim();
    const value = name || "";
    const valueKey = normalizeMatchValue(value);
    if (!valueKey || seenValues.has(valueKey)) continue;
    seenValues.add(valueKey);
    const label = name || "";
    favoriteItems.push({
      value,
      label
    });
  }
  favoriteItems.sort(
    (first, second) => first.label.localeCompare(second.label) || first.value.localeCompare(second.value)
  );
  selectOptions.push(...favoriteItems);
  const inputValue = params.favoriteValue;
  const selectContent = b2`
    <ha-selector
      id="favorite"
      .hass=${params.hass}
      .selector=${{
    select: {
      options: selectOptions,
      mode: "dropdown",
      custom_value: true,
      clearable: true
    }
  }}
      .label=${params.localize("field.name")}
      .value=${inputValue}
      .required=${false}
      ?disabled=${params.favoriteSelectDisabled}
      @value-changed=${params.onSelected}
    ></ha-selector>
  `;
  const wrappedSelect = params.wrapSelect ? params.wrapSelect(selectContent) : selectContent;
  return b2`
    <div class="row">
      ${wrappedSelect}
      ${params.favoritesError ? b2`<ha-alert alert-type="warning">
            ${params.favoritesError}
          </ha-alert>` : A}
    </div>
  `;
};
var renderFavoriteActionRow = (params) => b2`
  <div class="row actions">
    <div class="favorite-actions">
      ${params.showFavorites ? params.showRemoveFavorite ? b2`
              <ha-formfield
                id="removeFavoriteWrap"
                .label=${params.localize("action.remove_favorite")}
              >
                <ha-icon-button
                  id="removeFavorite"
                  title=${params.localize("action.remove_favorite")}
                  aria-label=${params.localize("action.remove_favorite")}
                  data-favorite-id=${params.selectedFavoriteId}
                  ?disabled=${params.favoriteRemoveDisabled}
                >
                  <div class="leading">
                    <ha-icon icon="mdi:trash-can-outline"></ha-icon>
                  </div>
                </ha-icon-button>
              </ha-formfield>
            ` : params.showAddFavorite ? b2`
                <ha-formfield
                  id="addFavoriteWrap"
                  .label=${params.localize("action.add_favorite")}
                >
                  <ha-checkbox
                    id="addFavorite"
                    .checked=${params.addFavoriteChecked}
                  ></ha-checkbox>
                </ha-formfield>
              ` : A : A}
    </div>
    ${params.startButtonSuccess ? b2`
          <ha-button
            id="startReservation"
            class="start-button success"
            variant="success"
            appearance="filled"
            ?disabled=${params.startDisabled}
            aria-label=${params.localize("action.start_reservation")}
            title=${params.localize("action.start_reservation")}
          >
            ${params.localize("action.start_reservation")}
          </ha-button>
        ` : b2`
          <ha-button
            id="startReservation"
            class="start-button"
            ?disabled=${params.startDisabled}
            aria-label=${params.localize("action.start_reservation")}
            title=${params.localize("action.start_reservation")}
          >
            ${params.localize("action.start_reservation")}
          </ha-button>
        `}
  </div>
`;
var createLocalize = (getHass) => (key, ..._args) => localize(getHass(), key);
var createErrorMessage = (getHass) => (err, fallbackKey) => errorMessage(err, fallbackKey, (key) => localize(getHass(), key));
var getLoadingMessage = (hass) => {
  const hassLocalize = typeof hass === "function" ? hass : hass?.localize;
  const haMessage = hassLocalize?.(HA_STARTING_MESSAGE_KEY);
  if (haMessage && haMessage !== HA_STARTING_MESSAGE_KEY) return haMessage;
  const key = "message.home_assistant_loading";
  const message = localize(hass, key);
  return message === key ? "" : message;
};
var renderLoadingCard = (hass) => {
  const loadingMessage = getLoadingMessage(
    hass ?? getGlobalHass()
  );
  return b2`
    <ha-card>
      <div class="card-content">
        <ha-alert alert-type="warning">${loadingMessage}</ha-alert>
      </div>
    </ha-card>
  `;
};
var renderStatusAlert = (state) => state.message ? b2`<ha-alert alert-type=${state.type}>${state.message}</ha-alert>` : A;
var formatOptionalDateTimeLocal = (value) => {
  const date = parseDateTimeValue(value);
  return date ? formatDateTimeLocal(date) : "";
};
var parseDateTimeValue = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
var isHassRunning = (hass) => hass?.config?.state === "RUNNING";
var createRenderScheduler = (requestUpdate) => {
  let handle = null;
  return () => {
    if (handle !== null) return;
    handle = window.requestAnimationFrame(() => {
      handle = null;
      requestUpdate();
    });
  };
};
var isInEditor = (startNode) => {
  const selector = "hui-card-preview, hui-card-picker, hui-card-element-editor, hui-card-edit-mode, hui-dialog-edit-card";
  let node = startNode;
  while (node) {
    if (node instanceof HTMLElement && node.matches(selector)) return true;
    if (node instanceof HTMLElement && node.assignedSlot) {
      node = node.assignedSlot;
      continue;
    }
    const root = node.getRootNode?.();
    if (root instanceof ShadowRoot) {
      node = root.host;
      continue;
    }
    node = node.parentNode;
  }
  return false;
};
var BaseLocalizedCard = class extends i4 {
  constructor() {
    super(...arguments);
    this._config = null;
    this._hass = null;
    this._statusState = createStatusState();
    this._requestRender = createRenderScheduler(() => this.requestUpdate());
    this._localize = createLocalize(() => this._hass);
    this._errorMessage = createErrorMessage(() => this._hass);
  }
  _setStatus(message, type, clearAfterMs) {
    setStatusState(
      this._statusState,
      message,
      type,
      this._requestRender,
      clearAfterMs
    );
  }
  _clearStatus() {
    clearStatusState(this._statusState, this._requestRender);
  }
  _isInEditor() {
    return isInEditor(this);
  }
};
var defineElementIfMissing = (tagName, ctor) => {
  const scopedRegistry = window.__scopedElementsRegistry;
  for (const registry of [customElements, scopedRegistry]) {
    if (registry && !registry.get(tagName)) registry.define(tagName, ctor);
  }
};
var registerCustomCard = (cardType, ctor, name, description) => {
  defineElementIfMissing(cardType, ctor);
  const win = window;
  win.customCards = win.customCards || [];
  const existing = win.customCards.find((card) => card.type === cardType);
  if (existing) {
    existing.name = name;
    existing.description = description;
    return;
  }
  win.customCards.push({ type: cardType, name, description });
};
var registerCustomCardWithTranslations = (cardType, ctor, nameKey, descriptionKey) => {
  const registerCard = () => {
    const name = getCardText(nameKey) ?? cardType;
    const description = descriptionKey ? getCardText(descriptionKey) ?? "" : "";
    registerCustomCard(cardType, ctor, name, description);
  };
  registerCard();
  const hass = getGlobalHass();
  void ensureTranslations(hass).then(registerCard);
};
var hideCustomCardFromPicker = (cardType) => {
  const applyPatch = (pickerCtor) => {
    const { prototype } = pickerCtor;
    if (!prototype.__cvpHideTypes) prototype.__cvpHideTypes = /* @__PURE__ */ new Set();
    prototype.__cvpHideTypes.add(cardType);
    if (prototype.__cvpHidePatched) return;
    const originalLoadCards = prototype._loadCards;
    if (!originalLoadCards) return;
    prototype._loadCards = function() {
      originalLoadCards.call(this);
      const hideTypes = prototype.__cvpHideTypes;
      if (Array.isArray(this._cards)) {
        this._cards = this._cards.filter((entry) => !hideTypes?.has(entry.card?.type ?? ""));
      }
    };
    prototype.__cvpHidePatched = true;
  };
  const existing = customElements.get("hui-card-picker");
  if (existing) {
    applyPatch(existing);
  } else {
    customElements.whenDefined("hui-card-picker").then(
      () => applyPatch(customElements.get("hui-card-picker"))
    );
  }
};
var BaseCardEditor = class extends i4 {
  setConfig(config) {
    this._config = config;
    this.requestUpdate();
  }
  _handleValueChanged(ev) {
    ev.stopPropagation();
    const config = ev.detail?.value ?? {};
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config },
        bubbles: true,
        composed: true
      })
    );
  }
};
var buildFormHelpers = (localizeTarget, prefix) => {
  const resolve = (section, name) => {
    const fieldName = name === "config_entry_id" ? "config_entry" : name;
    const key = `${prefix}.${section}.${fieldName}`;
    const result = localize(localizeTarget, key);
    return result === key ? "" : result;
  };
  return {
    computeLabel: (schema) => resolve("field", schema.name),
    computeHelper: (schema) => resolve("description", schema.name)
  };
};
var buildCardTypeOptions = (localizeTarget, prefix) => {
  const newKey = `${prefix}.value.card_type.new`;
  const activeKey = `${prefix}.value.card_type.active`;
  const newLabel = localize(localizeTarget, newKey);
  const activeLabel = localize(localizeTarget, activeKey);
  return [
    [
      "custom:city-visitor-parking-card",
      newLabel === newKey ? "New reservation card" : newLabel
    ],
    [
      "custom:city-visitor-parking-active-card",
      activeLabel === activeKey ? "Active reservations card" : activeLabel
    ]
  ];
};
var buildCardEditorSchema = (cardTypeOptions, displayOptionsExpanded) => [
  {
    type: "select",
    name: "type",
    default: "custom:city-visitor-parking-card",
    options: cardTypeOptions
  },
  { name: "title", selector: { text: {} }, required: false },
  { name: "icon", selector: { icon: {} }, required: false },
  {
    type: "expandable",
    name: "display_options",
    expanded: displayOptionsExpanded,
    flatten: true,
    schema: [
      {
        name: "config_entry_id",
        selector: { config_entry: { integration: DOMAIN } },
        required: false
      },
      { name: "show_favorites", selector: { boolean: {} }, default: true },
      { name: "show_start_time", selector: { boolean: {} }, default: true },
      { name: "show_end_time", selector: { boolean: {} }, default: true },
      { name: "default_license_plate", selector: { text: {} }, required: false }
    ]
  }
];
var CityVisitorParkingCardEditor = class extends BaseCardEditor {
  render() {
    if (!this.hass) return b2``;
    const localizeTarget = this.hass;
    void ensureTranslations(localizeTarget);
    const { computeLabel, computeHelper } = buildFormHelpers(
      localizeTarget,
      "editor"
    );
    const cardTypeOptions = buildCardTypeOptions(localizeTarget, "editor");
    const displayOptionsExpanded = Boolean(
      this._config?.config_entry_id || this._config?.show_favorites === false || this._config?.show_start_time === false || this._config?.show_end_time === false || this._config?.default_license_plate
    );
    return b2`
      <ha-form
        .hass=${this.hass}
        .data=${this._config ?? {}}
        .schema=${buildCardEditorSchema(
      cardTypeOptions,
      displayOptionsExpanded
    )}
        .computeLabel=${computeLabel}
        .computeHelper=${computeHelper}
        @value-changed=${this._handleValueChanged}
      ></ha-form>
    `;
  }
};
defineElementIfMissing(
  "city-visitor-parking-card-editor",
  CityVisitorParkingCardEditor
);
var createConfigFormGetter = (prefix, buildSchema) => async (hassOrLocalize) => {
  const localizeTarget = hassOrLocalize && typeof hassOrLocalize !== "function" ? hassOrLocalize : getGlobalHass() ?? hassOrLocalize;
  await ensureTranslations(localizeTarget);
  const { computeLabel, computeHelper } = buildFormHelpers(
    localizeTarget,
    prefix
  );
  const cardTypeOptions = buildCardTypeOptions(localizeTarget, prefix);
  return {
    schema: buildSchema(cardTypeOptions, localizeTarget),
    computeLabel,
    computeHelper
  };
};
var getCardConfigForm = createConfigFormGetter(
  "editor",
  (cardTypeOptions) => buildCardEditorSchema(cardTypeOptions, false)
);
var buildActiveCardEditorSchema = (cardTypeOptions, displayOptionsExpanded, displayOptionsTitle) => [
  {
    type: "select",
    name: "type",
    default: "custom:city-visitor-parking-active-card",
    options: cardTypeOptions
  },
  { name: "title", selector: { text: {} }, required: false },
  { name: "icon", selector: { icon: {} }, required: false },
  {
    type: "expandable",
    name: "display_options",
    title: displayOptionsTitle,
    expanded: displayOptionsExpanded,
    flatten: true,
    schema: [
      {
        name: "config_entry_id",
        selector: { config_entry: { integration: DOMAIN } },
        required: false
      }
    ]
  }
];
var CityVisitorParkingActiveCardEditor = class extends BaseCardEditor {
  render() {
    if (!this.hass) return b2``;
    const localizeTarget = this.hass;
    void ensureTranslations(localizeTarget);
    const { computeLabel, computeHelper } = buildFormHelpers(
      localizeTarget,
      "active_editor"
    );
    const cardTypeOptions = buildCardTypeOptions(
      localizeTarget,
      "active_editor"
    );
    const displayOptionsTitle = localize(
      localizeTarget,
      "active_editor.field.display_options"
    );
    const displayOptionsExpanded = Boolean(this._config?.config_entry_id);
    return b2`
      <ha-form
        .hass=${this.hass}
        .data=${this._config ?? {}}
        .schema=${buildActiveCardEditorSchema(
      cardTypeOptions,
      displayOptionsExpanded,
      displayOptionsTitle
    )}
        .computeLabel=${computeLabel}
        .computeHelper=${computeHelper}
        @value-changed=${this._handleValueChanged}
      ></ha-form>
    `;
  }
};
defineElementIfMissing(
  "city-visitor-parking-active-card-editor",
  CityVisitorParkingActiveCardEditor
);
var getActiveCardConfigForm = createConfigFormGetter(
  "active_editor",
  (cardTypeOptions, target) => buildActiveCardEditorSchema(
    cardTypeOptions,
    false,
    localize(target, "active_editor.field.display_options")
  )
);
(() => {
  const CARD_TYPE = "city-visitor-parking-card";
  const WS_LIST_FAVORITES = "city_visitor_parking/favorites";
  const WS_GET_STATUS = "city_visitor_parking/status";
  const STATUS_THROTTLE_MS = 15e3;
  const STATUS_REFRESH_MS = 6e4;
  const INPUT_VALUE_IDS = /* @__PURE__ */ new Set([
    "licensePlate",
    "startDateTime",
    "endDateTime"
  ]);
  const CHANGE_VALUE_IDS = /* @__PURE__ */ new Set(["startDateTime", "endDateTime"]);
  class CityVisitorParkingNewReservationCard extends BaseLocalizedCard {
    constructor() {
      super(...arguments);
      this._deviceId = null;
      this._deviceEntryId = null;
      this._deviceLoadPromise = null;
      this._deviceIdByEntryId = /* @__PURE__ */ new Map();
      this._favorites = [];
      this._favoritesError = null;
      this._favoritesLoadedFor = null;
      this._favoritesRetryAfter = 0;
      this._favoritesLoading = false;
      this._favoritesByPlate = /* @__PURE__ */ new Map();
      this._favoritesByPlateName = /* @__PURE__ */ new Map();
      this._favoritesByValue = /* @__PURE__ */ new Map();
      this._permitOptions = [];
      this._permitOptionsLoaded = false;
      this._permitOptionsLoading = false;
      this._permitOptionsLoadPromise = null;
      this._formValues = {};
      this._pendingRemoveFavoriteId = null;
      this._selectedEntryId = null;
      this._startButtonSuccess = false;
      this._startButtonSuccessTimeout = null;
      this._startInFlight = false;
      this._favoriteRemoveInFlight = false;
      this._addFavoriteChecked = false;
      this._suppressFavoriteClear = false;
      this._zoneState = null;
      this._windowKind = null;
      this._windowStartIso = null;
      this._windowEndIso = null;
      this._zoneStatusTsByEntryId = /* @__PURE__ */ new Map();
      this._zoneStatusInFlightByEntryId = /* @__PURE__ */ new Map();
      this._zoneStatusByEntryId = /* @__PURE__ */ new Map();
      this._pendingPermitDefaultsEntryId = null;
      this._pendingPermitDefaultsForce = false;
      this._statusRefreshHandle = null;
      this._statusVisibilityHandler = null;
      this._translationsReady = false;
      this._translationsLanguage = null;
      this._onClick = (event) => this._handleClick(event);
      this._onInput = (event) => this._handleInput(event);
      this._onChange = (event) => this._handleChange(event);
      this._onPermitSelectChange = (event) => this._handlePermitSelectChange(event);
      this._onFavoriteSelectChange = (event) => this._handleFavoriteSelectChange(event);
      this._onDateTimePickerClick = (event) => this._handleDateTimePickerClick(event);
    }
    static async getConfigForm(hass) {
      return getCardConfigForm(hass);
    }
    static getConfigElement() {
      return document.createElement("city-visitor-parking-card-editor");
    }
    static getStubConfig() {
      return {
        type: `custom:${CARD_TYPE}`,
        show_favorites: true,
        show_start_time: true,
        show_end_time: true
      };
    }
    setConfig(config) {
      if (!config || !config.type) {
        throw new Error(
          localize(
            this._hass ?? getGlobalHass(),
            "message.invalid_config"
          )
        );
      }
      const priorEntryId = this._getActiveEntryId();
      const priorShowFavorites = this._config?.show_favorites ?? true;
      this._config = {
        show_favorites: config.show_favorites !== false,
        show_start_time: config.show_start_time !== false,
        show_end_time: config.show_end_time !== false,
        ...config
      };
      if (this._config.default_license_plate && !this._formValues["licensePlate"]) {
        this._setInputValue("licensePlate", this._config.default_license_plate);
      }
      if (priorShowFavorites && !this._config.show_favorites) {
        this._resetFavoritesState();
        this._setInputValue("favorite", "");
      }
      if (getConfigEntryId(this._config)) {
        this._selectedEntryId = null;
      }
      const entryChanged = this._getActiveEntryId() !== priorEntryId;
      if (this._config.device_id) {
        this._deviceId = this._config.device_id;
        this._deviceEntryId = getConfigEntryId(this._config);
        if (entryChanged) this._resetFavoritesState();
      } else if (entryChanged) {
        this._resetDeviceState();
      }
      this._syncEntryState(true);
    }
    set hass(hass) {
      const prev = this._prevHaState;
      this._prevHaState = hass.config?.state;
      this._hass = hass;
      const nextLanguage = this._getTranslationLanguage(hass);
      if (nextLanguage !== this._translationsLanguage || !this._translationsReady) {
        this._translationsReady = false;
        void ensureTranslations(this._hass).then(() => {
          this._translationsReady = true;
          this._translationsLanguage = nextLanguage;
          this.requestUpdate();
        });
      }
      if (prev !== "RUNNING" && hass.config?.state === "RUNNING") {
        invalidateFavoritesCache(this, { resetRetryAfter: true });
        resetZoneStatusThrottle(this);
      }
      this._syncEntryState(false);
    }
    disconnectedCallback() {
      super.disconnectedCallback();
      this._clearStatusRefresh();
    }
    getCardSize() {
      return 4;
    }
    async _ensureDeviceId() {
      if (!this._hass) return;
      const entryId = this._getActiveEntryId();
      if (!entryId) return;
      if (this._config?.device_id) {
        this._deviceId = this._config.device_id;
        this._deviceEntryId = getConfigEntryId(this._config) || entryId;
        return;
      }
      if (this._deviceEntryId === entryId && this._deviceId) return;
      const cachedDeviceId = this._deviceIdByEntryId.get(entryId);
      if (cachedDeviceId !== void 0) {
        this._deviceId = cachedDeviceId;
        this._deviceEntryId = entryId;
        this._requestRender();
        return;
      }
      if (this._deviceLoadPromise) return;
      this._deviceLoadPromise = this._hass.callWS({ type: "config/device_registry/list" }).then((devices) => {
        const match = devices.find(
          (device) => (device.identifiers ?? []).some(
            (identifier) => identifier[0] === DOMAIN
          ) && Array.isArray(device.config_entries) && device.config_entries.includes(entryId)
        );
        const deviceId = match ? match.id : null;
        this._deviceId = deviceId;
        if (deviceId) this._deviceIdByEntryId.set(entryId, deviceId);
        this._deviceEntryId = entryId;
      }).catch(() => {
        this._deviceId = null;
        this._deviceEntryId = entryId;
      }).finally(() => {
        this._deviceLoadPromise = null;
        this._requestRender();
      });
    }
    _ensurePermitOptions() {
      if (getConfigEntryId(this._config) || !this._hass) return;
      if (this._permitOptionsLoaded || this._permitOptionsLoadPromise) return;
      void this._loadPermitOptions();
    }
    _maybeSelectSinglePermit() {
      if (getConfigEntryId(this._config)) return;
      if (!this._permitOptionsLoaded || this._permitOptions.length !== 1)
        return;
      if (this._getActiveEntryId()) return;
      this._handlePermitChange(this._permitOptions[0].id);
    }
    async _loadPermitOptions() {
      if (!this._hass || getConfigEntryId(this._config)) return;
      const hass = this._hass;
      if (this._permitOptionsLoadPromise) return this._permitOptionsLoadPromise;
      this._permitOptionsLoading = true;
      this._requestRender();
      const loadPromise = (async () => {
        try {
          const result = await fetchPermitEntries(hass);
          this._permitOptions = buildPermitOptions(result);
          this._permitOptionsLoaded = true;
          this._maybeSelectSinglePermit();
        } catch {
          this._permitOptions = [];
          this._permitOptionsLoaded = false;
        } finally {
          this._permitOptionsLoading = false;
          this._permitOptionsLoadPromise = null;
          this._requestRender();
        }
      })();
      this._permitOptionsLoadPromise = loadPromise;
      return loadPromise;
    }
    async _maybeLoadFavorites() {
      if (!this._hass || !this._config?.show_favorites) return;
      if (!isHassRunning(this._hass)) return;
      const entryId = this._getActiveEntryId();
      if (!entryId) return;
      if (Date.now() < this._favoritesRetryAfter) return;
      if (this._favoritesLoading) return;
      if (this._favoritesLoadedFor === entryId) return;
      this._favoritesLoadedFor = entryId;
      this._favoritesError = null;
      this._favoritesLoading = true;
      this._requestRender();
      try {
        const result = await this._hass.callWS({
          type: WS_LIST_FAVORITES,
          config_entry_id: entryId
        });
        this._setFavorites(
          Array.isArray(result?.favorites) ? result.favorites : []
        );
        this._favoritesRetryAfter = 0;
      } catch (err) {
        invalidateFavoritesCache(this);
        this._favoritesRetryAfter = Date.now() + 15e3;
        this._setFavorites([]);
        this._favoritesError = this._errorMessage(
          err,
          "message.load_favorites_failed"
        );
      } finally {
        this._favoritesLoading = false;
        if (this._pendingRemoveFavoriteId) {
          const pendingId = normalizeMatchValue(this._pendingRemoveFavoriteId);
          const stillPresent = this._favorites.some(
            (favorite) => {
              const candidate = normalizeMatchValue(
                favorite.id || favorite.license_plate
              );
              return candidate === pendingId;
            }
          );
          if (this._favoritesError || stillPresent) {
            this._setStatus(
              this._localize("message.favorite_remove_failed"),
              "warning"
            );
          } else {
            this._setStatus(
              this._localize("message.favorite_removed"),
              "success",
              5e3
            );
            this._setInputValue("licensePlate", "");
            this._setInputValue("favorite", "");
          }
          this._pendingRemoveFavoriteId = null;
        }
        this._requestRender();
      }
    }
    async _loadZoneStatusForEntry(entryId) {
      if (!this._hass || !entryId) return;
      const hass = this._hass;
      const force = this._pendingPermitDefaultsEntryId === entryId;
      const now = Date.now();
      const lastTs = this._zoneStatusTsByEntryId.get(entryId);
      if (!force && lastTs !== void 0 && now - lastTs < STATUS_THROTTLE_MS)
        return;
      const inFlight = this._zoneStatusInFlightByEntryId.get(entryId);
      if (inFlight) return inFlight;
      const loadPromise = (async () => {
        let status;
        try {
          status = this._normalizeZoneStatus(
            await hass.callWS({
              type: WS_GET_STATUS,
              config_entry_id: entryId
            })
          );
        } catch {
          status = EMPTY_ZONE_STATUS;
        }
        this._zoneStatusByEntryId.set(entryId, status);
        if (entryId === this._getActiveEntryId()) {
          applyZoneStatus(this, status);
          this._applyPendingPermitDefaults(entryId);
        }
        this._zoneStatusTsByEntryId.set(entryId, Date.now());
        this._zoneStatusInFlightByEntryId.delete(entryId);
        this._requestRender();
      })();
      this._zoneStatusInFlightByEntryId.set(entryId, loadPromise);
      return loadPromise;
    }
    _getFavoriteActionState() {
      if (!this._config?.show_favorites) {
        return {
          showAddFavorite: false,
          showRemoveFavorite: false,
          selectedFavorite: null,
          removeFavorite: null
        };
      }
      const controlsDisabled = this._isInEditor();
      const license = this._getInputValue("licensePlate").trim();
      const name = this._getInputValue("favorite").trim();
      const selectedFavorite = this._findFavoriteByValue(
        this._getInputValue("favorite")
      );
      const selectedFavoriteMatchesLicense = selectedFavorite ? this._selectedFavoriteMatchesLicense(selectedFavorite, license) : false;
      const licenseFavorite = this._findFavorite(license, "");
      const removeFavorite = selectedFavoriteMatchesLicense ? selectedFavorite : licenseFavorite;
      const matchingFavorite = name ? this._findFavorite(license, name) : licenseFavorite;
      const canManageFavorites = !controlsDisabled && !this._favoritesLoading && Boolean(this._deviceId);
      const showAddFavorite = canManageFavorites && Boolean(license) && Boolean(name) && !matchingFavorite && !licenseFavorite && !selectedFavoriteMatchesLicense;
      const showRemoveFavorite = canManageFavorites && Boolean(removeFavorite?.id || removeFavorite?.license_plate);
      return {
        showAddFavorite: showAddFavorite && !showRemoveFavorite,
        showRemoveFavorite,
        selectedFavorite,
        removeFavorite
      };
    }
    render() {
      if (!this._config) return b2``;
      if (!this._hass || this._hass.config?.state === "NOT_RUNNING") {
        return renderLoadingCard(this._hass ?? getGlobalHass());
      }
      if (!this._translationsReady) return b2``;
      const priorLicense = this._getInputValue("licensePlate");
      const priorStartDateTime = this._getInputValue("startDateTime");
      const priorEndDateTime = this._getInputValue("endDateTime");
      const priorFavorite = this._getInputValue("favorite");
      const title = this._config.title || "";
      const icon = this._config.icon;
      const showFavorites = this._config.show_favorites ?? true;
      const showStart = this._config.show_start_time ?? true;
      const showEnd = this._config.show_end_time ?? true;
      const activeEntryId = this._getActiveEntryId();
      const showPermitPicker = !getConfigEntryId(this._config) && !(this._permitOptionsLoaded && this._permitOptions.length === 1);
      const hasTarget = Boolean(activeEntryId);
      const hasLicense = Boolean(priorLicense.trim());
      const favoriteValue = hasTarget ? priorFavorite : "";
      const hasDevice = Boolean(this._deviceId);
      const controlsDisabled = this._isInEditor();
      const localizeFn = this._localize;
      const permitSelectValue = activeEntryId ?? "";
      const permitSelectDisabled = controlsDisabled || this._permitOptionsLoading;
      const { showAddFavorite, showRemoveFavorite, removeFavorite } = this._getFavoriteActionState();
      const favoriteRemoveDisabled = controlsDisabled || this._favoriteRemoveInFlight;
      const favoritesOptions = this._favorites;
      const favoriteSelectDisabled = controlsDisabled || this._favoritesLoading;
      const startDisabled = controlsDisabled || !hasDevice || !hasTarget || !hasLicense || this._startInFlight;
      const todayStart = /* @__PURE__ */ new Date();
      todayStart.setHours(0, 0, 0, 0);
      const minDateTime = formatDateTimeLocal(todayStart);
      return b2`
        <ha-card
          @click=${this._onClick}
          @input=${this._onInput}
          @change=${this._onChange}
        >
          ${renderCardHeader(title, icon)}
          <div class="card-content">
            ${showPermitPicker ? renderPermitSelect({
        hass: this._hass,
        label: localizeFn("field.permit"),
        value: permitSelectValue,
        disabled: permitSelectDisabled,
        onSelected: this._onPermitSelectChange
      }) : A}
            ${renderFavoriteSelect({
        showFavorites,
        favoriteValue,
        favoriteSelectDisabled,
        hass: this._hass,
        favoritesOptions,
        favoritesError: this._favoritesError,
        localize: localizeFn,
        onSelected: this._onFavoriteSelectChange,
        wrapSelect: (content) => i6(activeEntryId ?? "", content)
      })}
            <div class="row">
              <ha-textfield
                id="licensePlate"
                .label=${localizeFn("field.license_plate")}
                placeholder=${localizeFn("placeholder.license_plate")}
                .value=${priorLicense}
              ></ha-textfield>
            </div>
            ${showStart ? b2`
                  <div class="row datetime-row">
                    <ha-textfield
                      type="datetime-local"
                      id="startDateTime"
                      .label=${localizeFn("field.start_time")}
                      .value=${priorStartDateTime}
                      .min=${minDateTime}
                      ?disabled=${controlsDisabled}
                      @input=${this._onInput}
                      @change=${this._onChange}
                    ></ha-textfield>
                    <ha-icon-button
                      class="datetime-picker-button"
                      data-picker-field="startDateTime"
                      aria-label=${localizeFn("field.start_time")}
                      title=${localizeFn("field.start_time")}
                      ?disabled=${controlsDisabled}
                      @click=${this._onDateTimePickerClick}
                    >
                      <ha-icon icon="mdi:calendar-month-outline"></ha-icon>
                    </ha-icon-button>
                  </div>
                ` : A}
            ${showEnd ? b2`
                  <div class="row datetime-row">
                    <ha-textfield
                      type="datetime-local"
                      id="endDateTime"
                      .label=${localizeFn("field.end_time")}
                      .value=${priorEndDateTime}
                      .min=${minDateTime}
                      ?disabled=${controlsDisabled}
                      @input=${this._onInput}
                      @change=${this._onChange}
                    ></ha-textfield>
                    <ha-icon-button
                      class="datetime-picker-button"
                      data-picker-field="endDateTime"
                      aria-label=${localizeFn("field.end_time")}
                      title=${localizeFn("field.end_time")}
                      ?disabled=${controlsDisabled}
                      @click=${this._onDateTimePickerClick}
                    >
                      <ha-icon icon="mdi:calendar-month-outline"></ha-icon>
                    </ha-icon-button>
                  </div>
                ` : A}
            ${renderFavoriteActionRow({
        showFavorites,
        showAddFavorite,
        showRemoveFavorite,
        selectedFavoriteId: removeFavorite?.id || removeFavorite?.license_plate || "",
        favoriteRemoveDisabled,
        addFavoriteChecked: this._addFavoriteChecked,
        startButtonSuccess: this._startButtonSuccess,
        startDisabled,
        localize: localizeFn
      })}
          </div>
        </ha-card>
      `;
    }
    updated() {
      if (!this._config) return;
      const controlsDisabled = this._isInEditor();
      this.toggleAttribute("data-preview", controlsDisabled);
      if (this._addFavoriteChecked) {
        const { showAddFavorite } = this._getFavoriteActionState();
        if (!showAddFavorite) {
          this._addFavoriteChecked = false;
          this._requestRender();
        }
      }
    }
    _scheduleFavoriteActionsUpdate() {
      if (!this._config?.show_favorites) return;
      const license = this._getInputValue("licensePlate").trim();
      const name = this._getInputValue("favorite").trim();
      const matchingFavorite = this._findFavorite(license, name);
      if (matchingFavorite) {
        const matchingValue = (matchingFavorite.name || "").trim();
        const currentValue = normalizeMatchValue(
          this._getInputValue("favorite")
        );
        if (matchingValue && currentValue !== normalizeMatchValue(matchingValue)) {
          this._setInputValue("favorite", matchingValue);
        }
      }
      const { showAddFavorite } = this._getFavoriteActionState();
      if (!showAddFavorite && this._addFavoriteChecked) {
        this._addFavoriteChecked = false;
      }
      this._requestRender();
    }
    _handleClick(event) {
      if (this._isInEditor()) return;
      const target = event.target;
      if (!target) return;
      const removeButton = target.closest("#removeFavorite");
      if (removeButton) {
        const id = removeButton.getAttribute("data-favorite-id") ?? "";
        void this._removeFavorite(id);
        return;
      }
      const startButton = target.closest("#startReservation");
      if (startButton) void this._handleStart();
    }
    _handleInput(event) {
      const field = this._getValueFromEvent(event, INPUT_VALUE_IDS);
      if (field) this._setInputValue(field.id, field.value);
      if (field?.id === "licensePlate") {
        this._scheduleFavoriteActionsUpdate();
        return;
      }
      this._maybeSyncEndWithStart(field?.id);
    }
    _handleChange(event) {
      const target = event.target;
      if (!target) return;
      const field = this._getValueFromEvent(event, CHANGE_VALUE_IDS);
      if (field) this._setInputValue(field.id, field.value);
      if (target.id === "addFavorite") {
        this._addFavoriteChecked = target.checked;
        this._scheduleFavoriteActionsUpdate();
        return;
      }
      this._maybeSyncEndWithStart(field?.id);
    }
    _maybeSyncEndWithStart(fieldId) {
      if (fieldId === "startDateTime" && this._config?.show_start_time && this._config?.show_end_time) {
        this._syncEndWithStart();
      }
    }
    _handleDateTimePickerClick(event) {
      if (this._isInEditor()) return;
      event.stopPropagation();
      const target = event.currentTarget;
      const fieldId = target?.dataset.pickerField;
      if (!fieldId) return;
      openDateTimePickerForField(this.renderRoot.querySelector(`#${fieldId}`));
    }
    _handlePermitSelectChange(event) {
      if (this._isInEditor()) return;
      const detail = event.detail;
      const target = event.currentTarget;
      const hasDetailValue = detail != null && Object.prototype.hasOwnProperty.call(detail, "value");
      const value = hasDetailValue ? detail.value ?? "" : target?.value ?? "";
      const nextValue = value ?? "";
      this._handlePermitChange(nextValue);
    }
    _handleFavoriteSelectChange(event) {
      if (!this._config?.show_favorites || this._isInEditor()) return;
      const detail = event.detail;
      const select = event.currentTarget;
      const path = event.composedPath();
      const pathValueElement = path.find(
        (node) => node instanceof HTMLElement && (node.id === "favorite" || node.getAttribute("id") === "favorite")
      );
      const hasDetailValue = detail != null && Object.prototype.hasOwnProperty.call(detail, "value");
      const selectedValue = hasDetailValue ? detail.value ?? "" : select?.value ?? pathValueElement?.value ?? "";
      const nextValue = selectedValue;
      if (this._suppressFavoriteClear) {
        this._suppressFavoriteClear = false;
        if (!nextValue) {
          this._setInputValue("favorite", "");
          this._scheduleFavoriteActionsUpdate();
          return;
        }
      }
      if (!nextValue) {
        this._setInputValue("favorite", "");
        void this._applyFavoriteSelection("", "");
        return;
      }
      const favorite = this._favoritesByValue.get(
        normalizeMatchValue(nextValue)
      );
      if (favorite) {
        const preferredValue = (favorite.name || "").trim();
        this._setInputValue("favorite", preferredValue);
        void this._applyFavoriteSelection(
          favorite.license_plate || nextValue,
          favorite.name ?? ""
        );
        return;
      }
      this._setInputValue("favorite", nextValue);
      void this._applyFavoriteSelection(
        this._getInputValue("licensePlate"),
        nextValue
      );
    }
    _handlePermitChange(value) {
      if (!value) {
        this._selectedEntryId = null;
        setPendingPermitDefaults(this, null);
        this._clearStatusRefresh();
        this._resetDeviceState();
        this._clearFormValues();
        this._setInputValue("licensePlate", "");
        this._clearStatus();
        return;
      }
      if (value === this._selectedEntryId && this._deviceEntryId === value && this._deviceId) {
        return;
      }
      this._selectedEntryId = value;
      setPendingPermitDefaults(this, value, true);
      this._resetDeviceState();
      this._suppressFavoriteClear = false;
      this._setInputValue("favorite", "");
      applyZoneStatus(this, this._zoneStatusByEntryId.get(value) ?? null);
      this._clearStatus();
      this._ensureDeviceId();
      this._maybeLoadFavorites();
      void this._loadZoneStatusForEntry(value);
      this._setupStatusRefresh(value);
    }
    _resetFavoritesState() {
      invalidateFavoritesCache(this, {
        resetRetryAfter: true,
        clearLoading: true
      });
      clearFavoriteTransientState(this);
      this._setFavorites([]);
    }
    _resetDeviceState() {
      this._deviceId = null;
      this._deviceEntryId = null;
      applyZoneStatus(this, null);
      this._resetFavoritesState();
    }
    _clearFormValues() {
      const hadValues = Object.keys(this._formValues).length > 0;
      const hadAddFavoriteChecked = this._addFavoriteChecked;
      this._formValues = {};
      if (this._config?.default_license_plate) {
        this._formValues["licensePlate"] = this._config.default_license_plate;
      }
      clearFavoriteTransientState(this);
      if (hadValues || hadAddFavoriteChecked) this._requestRender();
    }
    _syncEntryState(forceSetupRefresh) {
      const entryId = this._getActiveEntryId();
      applyZoneStatus(
        this,
        entryId ? this._zoneStatusByEntryId.get(entryId) ?? null : null
      );
      if (getConfigEntryId(this._config) && entryId) {
        setPendingPermitDefaults(this, entryId);
      }
      this._requestRender();
      this._ensureDeviceId();
      this._ensurePermitOptions();
      this._maybeSelectSinglePermit();
      if (entryId) void this._loadZoneStatusForEntry(entryId);
      if (forceSetupRefresh || this._statusRefreshHandle === null) {
        this._setupStatusRefresh(entryId);
      }
      void this._maybeLoadFavorites();
    }
    _setupStatusRefresh(entryId) {
      this._clearStatusRefresh();
      if (!getConfigEntryId(this._config) || !entryId) return;
      const refresh = () => {
        if (!this._hass) return;
        const activeEntryId = this._getActiveEntryId();
        if (!activeEntryId || activeEntryId !== entryId) return;
        setPendingPermitDefaults(this, entryId);
        void this._loadZoneStatusForEntry(entryId);
      };
      this._statusRefreshHandle = window.setInterval(
        refresh,
        STATUS_REFRESH_MS
      );
      this._statusVisibilityHandler = () => {
        if (document.visibilityState === "visible") refresh();
      };
      document.addEventListener(
        "visibilitychange",
        this._statusVisibilityHandler
      );
    }
    _clearStatusRefresh() {
      if (this._statusRefreshHandle !== null) {
        window.clearInterval(this._statusRefreshHandle);
        this._statusRefreshHandle = null;
      }
      if (this._statusVisibilityHandler !== null) {
        document.removeEventListener(
          "visibilitychange",
          this._statusVisibilityHandler
        );
        this._statusVisibilityHandler = null;
      }
    }
    _setFavorites(favorites) {
      this._favorites = favorites;
      const { byPlate, byPlateName, byValue } = createFavoriteIndex(favorites);
      this._favoritesByPlate = byPlate;
      this._favoritesByPlateName = byPlateName;
      this._favoritesByValue = byValue;
    }
    _applyPendingPermitDefaults(entryId) {
      if (this._pendingPermitDefaultsEntryId !== entryId) return;
      this._applyStatusDefaultsToForm(this._pendingPermitDefaultsForce);
      setPendingPermitDefaults(this, null, false);
    }
    _findFavorite(license, name) {
      const licenseKey = normalizePlateValue(license);
      const nameKey = normalizeMatchValue(name);
      if (!licenseKey) return null;
      if (!nameKey) return this._favoritesByPlate.get(licenseKey) ?? null;
      return this._favoritesByPlateName.get(`${licenseKey}|${nameKey}`) ?? null;
    }
    _findFavoriteByValue(value) {
      const favoriteValue = normalizeMatchValue(value);
      if (!favoriteValue) return null;
      return this._favoritesByValue.get(favoriteValue) ?? null;
    }
    _normalizeZoneStatus(payload) {
      const state = payload?.state === "chargeable" || payload?.state === "free" ? payload.state : null;
      const kind = payload?.window_kind === "current" || payload?.window_kind === "next" ? payload.window_kind : null;
      const str = (v2) => typeof v2 === "string" && v2 ? v2 : null;
      return {
        state,
        kind,
        start: kind ? str(payload?.window_start) : null,
        end: kind ? str(payload?.window_end) : null
      };
    }
    _selectedFavoriteMatchesLicense(favorite, license) {
      const key = normalizePlateValue(favorite.license_plate || favorite.id);
      return Boolean(key) && key === normalizePlateValue(license);
    }
    _addFavorite(license, name) {
      if (!this._hass || !this._deviceId || !license || !this._config?.show_favorites)
        return;
      invalidateFavoritesCache(this);
      this._hass.callService(DOMAIN, "add_favorite", {
        device_id: this._deviceId,
        license_plate: license,
        ...name ? { name } : {}
      });
      this._maybeLoadFavorites();
    }
    async _removeFavorite(favoriteId) {
      if (!this._hass || !this._deviceId || !favoriteId || !this._config?.show_favorites)
        return;
      if (this._favoriteRemoveInFlight) return;
      this._favoriteRemoveInFlight = true;
      this._pendingRemoveFavoriteId = favoriteId;
      this._setStatus(
        this._localize("message.removing_favorite"),
        "info",
        5e3
      );
      this._requestRender();
      invalidateFavoritesCache(this);
      try {
        await this._hass.callService(DOMAIN, "remove_favorite", {
          device_id: this._deviceId,
          favorite_id: favoriteId
        });
      } catch (err) {
        this._setStatus(
          this._errorMessage(err, "message.favorite_remove_failed"),
          "warning"
        );
        this._pendingRemoveFavoriteId = null;
        this._favoriteRemoveInFlight = false;
        this._requestRender();
        return;
      }
      await this._maybeLoadFavorites();
      this._favoriteRemoveInFlight = false;
      this._requestRender();
    }
    async _handleStart() {
      if (!this._hass) return;
      if (!this._deviceId) {
        this._setStatus(
          this._localize("message.select_permit_before_start"),
          "warning"
        );
        this._requestRender();
        return;
      }
      if (this._startInFlight) return;
      this._startInFlight = true;
      this._requestRender();
      const license = this._getInputValue("licensePlate").trim();
      const { start, end } = this._resolveTimes();
      const validationError = !license ? "message.license_plate_required" : !start || !end ? "message.start_end_required" : end <= start ? "message.end_before_start" : null;
      if (validationError) {
        this._setStatus(this._localize(validationError), "warning");
        this._startInFlight = false;
        this._requestRender();
        return;
      }
      const name = this._getInputValue("favorite").trim();
      const { showAddFavorite } = this._getFavoriteActionState();
      if (this._addFavoriteChecked && showAddFavorite) {
        this._addFavorite(license, name);
        this._addFavoriteChecked = false;
      }
      try {
        await this._hass.callService(DOMAIN, "start_reservation", {
          device_id: this._deviceId,
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          license_plate: license
        });
      } catch (err) {
        const message = this._errorMessage(
          err,
          "message.reservation_start_failed"
        );
        this._setStatus(message, "warning");
        this._startInFlight = false;
        this._requestRender();
        return;
      }
      this._setStatus(
        this._localize("message.reservation_requested"),
        "success",
        5e3
      );
      this._setStartButtonSuccess();
      this._startInFlight = false;
      this._requestRender();
      window.dispatchEvent(
        new CustomEvent(RESERVATION_STARTED_EVENT, {
          detail: {
            device_id: this._deviceId,
            license_plate: license,
            name
          }
        })
      );
    }
    _setStartButtonSuccess() {
      if (this._startButtonSuccessTimeout) {
        window.clearTimeout(this._startButtonSuccessTimeout);
      }
      this._startButtonSuccess = true;
      this._requestRender();
      this._startButtonSuccessTimeout = window.setTimeout(() => {
        this._startButtonSuccess = false;
        this._startButtonSuccessTimeout = null;
        this._requestRender();
      }, 1e3);
    }
    _resolveTimes() {
      const now = /* @__PURE__ */ new Date();
      if (!this._config) return { start: null, end: null };
      const showStart = this._config.show_start_time;
      const showEnd = this._config.show_end_time;
      const fallbackStart = new Date(now.getTime() + 60 * 1e3);
      const startValue = showStart ? this._getInputValue("startDateTime") : "";
      const endValue = showEnd ? this._getInputValue("endDateTime") : "";
      const start = parseDateTimeValue(startValue) ?? fallbackStart;
      const fallbackEnd = new Date(start.getTime() + 60 * 60 * 1e3);
      const end = parseDateTimeValue(endValue) ?? fallbackEnd;
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()))
        return { start: null, end: null };
      return { start, end };
    }
    _getInputValue(id) {
      return this._formValues[id] ?? "";
    }
    _getValueFromEvent(event, ids) {
      const customEvent = event;
      const detailValue = customEvent.detail?.value;
      const path = event.composedPath();
      let element = null;
      let inputElement = null;
      for (const node of path) {
        if (!element && node instanceof HTMLElement && ids.has(node.id)) {
          element = node;
          if (typeof detailValue === "string") break;
          continue;
        }
        if (!inputElement && (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)) {
          inputElement = node;
        }
        if (element && inputElement) break;
      }
      if (!element) return null;
      if (typeof detailValue === "string") {
        return { id: element.id, value: detailValue };
      }
      const value = inputElement?.value ?? element.value ?? "";
      return { id: element.id, value };
    }
    _setInputValue(id, value) {
      if (this._formValues[id] === value) return;
      this._formValues[id] = value;
      this._requestRender();
    }
    _syncEndWithStart() {
      if (!this._config?.show_end_time) return;
      const startValue = this._getInputValue("startDateTime");
      if (!startValue) return;
      const start = parseDateTimeValue(startValue);
      if (!start) return;
      const end = this._resolveDefaultEnd(start, 60 * 1e3);
      this._setInputValue("endDateTime", formatDateTimeLocal(end));
    }
    _getStatusDefaultTimes(now) {
      const startDefault = new Date(now.getTime() + 6e4);
      const endDefault = new Date(now);
      endDefault.setHours(23, 59, 0, 0);
      const w2 = this._getRelevantWindowTimes();
      if (!w2) return { start: startDefault, end: endDefault };
      return {
        start: this._zoneState === "free" ? w2.start : startDefault,
        end: w2.end
      };
    }
    _getRelevantWindowTimes() {
      const validKind = this._zoneState === "chargeable" && this._windowKind === "current" || this._zoneState === "free" && this._windowKind === "next";
      if (!validKind) return null;
      const start = parseDateTimeValue(this._windowStartIso);
      const end = parseDateTimeValue(this._windowEndIso);
      if (!start || !end || end <= start) return null;
      return { start, end };
    }
    _resolveDefaultEnd(start, offsetMs) {
      const window2 = this._getRelevantWindowTimes();
      if (window2 && window2.end > start) return window2.end;
      const fallback = new Date(start.getTime() + offsetMs);
      if (!window2) {
        const dayEnd = new Date(start);
        dayEnd.setHours(23, 59, 0, 0);
        return dayEnd > start ? dayEnd : fallback;
      }
      return fallback;
    }
    _applyStatusDefaultsToForm(force = false) {
      if (!this._config) return;
      const now = /* @__PURE__ */ new Date();
      const defaults = this._getStatusDefaultTimes(now);
      if (this._config.show_start_time) {
        const current = force ? null : parseDateTimeValue(this._getInputValue("startDateTime"));
        if (!current) {
          this._setInputValue(
            "startDateTime",
            formatDateTimeLocal(defaults.start)
          );
        } else if (current <= now) {
          this._setInputValue(
            "startDateTime",
            formatDateTimeLocal(new Date(now.getTime() + 6e4))
          );
        }
      }
      if (this._config.show_end_time) {
        if (force || !this._getInputValue("endDateTime")) {
          this._setInputValue("endDateTime", formatDateTimeLocal(defaults.end));
        }
      }
    }
    async _applyFavoriteSelection(plate, name) {
      this._setInputValue("favorite", name);
      this._setInputValue("licensePlate", plate);
      await this.updateComplete;
      this._scheduleFavoriteActionsUpdate();
    }
    _getActiveEntryId() {
      return getConfigEntryId(this._config) || this._selectedEntryId;
    }
    _getTranslationLanguage(hass) {
      return getHassLanguage(hass) || navigator.language || "en";
    }
  }
  CityVisitorParkingNewReservationCard.styles = [
    BASE_CARD_STYLES,
    i`
        ha-textfield,
        ha-select,
        ha-selector {
          width: 100%;
        }
        .actions {
          display: flex;
          gap: var(--ha-space-2);
          align-items: center;
          justify-content: space-between;
        }
        .favorite-actions {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
        }
        .leading {
          width: 48px;
          min-width: 48px;
          height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .leading ha-icon,
        .leading mwc-icon {
          width: 24px;
          height: 24px;
          transform: translateY(-4px);
        }
        .start-button {
          margin-left: auto;
        }
      `
  ];
  registerCustomCardWithTranslations(
    CARD_TYPE,
    CityVisitorParkingNewReservationCard,
    "name",
    "description"
  );
})();
(() => {
  const CARD_TYPE = "city-visitor-parking-active-card";
  const SERVICE_LIST_RESERVATIONS = "list_reservations";
  const SERVICE_UPDATE_RESERVATION = "update_reservation";
  const SERVICE_END_RESERVATION = "end_reservation";
  const UPDATE_START_FLAG = 1;
  const UPDATE_END_FLAG = 2;
  class CityVisitorParkingActiveCard extends BaseLocalizedCard {
    constructor() {
      super(...arguments);
      this._activeReservations = [];
      this._activeReservationsById = /* @__PURE__ */ new Map();
      this._activeReservationsError = null;
      this._activeReservationsLoadedFor = null;
      this._activeReservationsLoading = false;
      this._reservationUpdateFlagsByDevice = /* @__PURE__ */ new Map();
      this._devicesPromise = null;
      this._configEntriesPromise = null;
      this._permitLabelsByDeviceId = /* @__PURE__ */ new Map();
      this._reservationStartedHandler = null;
      this._reservationInFlight = /* @__PURE__ */ new Set();
      this._endButtonSuccessByReservationId = /* @__PURE__ */ new Set();
      this._endButtonSuccessTimeoutByReservationId = /* @__PURE__ */ new Map();
      this._endButtonSuccessResolverByReservationId = /* @__PURE__ */ new Map();
      this._pendingReservationNameByKey = /* @__PURE__ */ new Map();
      this._reservationInputValues = /* @__PURE__ */ new Map();
      this._onActionClick = (event) => this._handleActionClick(event);
      this._onReservationInput = (event) => this._handleReservationInput(event);
      this._onReservationChange = (event) => this._handleReservationChange(event);
      this._onReservationPickerClick = (event) => this._handleReservationPickerClick(event);
    }
    connectedCallback() {
      super.connectedCallback();
      if (!this._reservationStartedHandler) {
        this._reservationStartedHandler = (event) => {
          const detail = event.detail;
          const deviceId = (detail?.device_id ?? "").trim();
          const licensePlate = (detail?.license_plate ?? "").trim();
          const name = (detail?.name ?? "").trim();
          if (deviceId && licensePlate && name) {
            this._setPendingReservationName(deviceId, licensePlate, name);
          }
          void this._maybeLoadActiveReservations(true);
        };
      }
      window.addEventListener(
        RESERVATION_STARTED_EVENT,
        this._reservationStartedHandler
      );
    }
    disconnectedCallback() {
      for (const timeoutHandle of this._endButtonSuccessTimeoutByReservationId.values()) {
        window.clearTimeout(timeoutHandle);
      }
      this._endButtonSuccessTimeoutByReservationId.clear();
      for (const resolve of this._endButtonSuccessResolverByReservationId.values()) {
        resolve();
      }
      this._endButtonSuccessResolverByReservationId.clear();
      this._endButtonSuccessByReservationId.clear();
      this._pendingReservationNameByKey.clear();
      if (this._reservationStartedHandler) {
        window.removeEventListener(
          RESERVATION_STARTED_EVENT,
          this._reservationStartedHandler
        );
      }
      super.disconnectedCallback();
    }
    static async getConfigForm(hass) {
      return getActiveCardConfigForm(hass);
    }
    static getConfigElement() {
      return document.createElement("city-visitor-parking-active-card-editor");
    }
    static getStubConfig() {
      return { type: `custom:${CARD_TYPE}` };
    }
    setConfig(config) {
      if (!config || !config.type) {
        throw new Error(
          localize(
            this._hass ?? getGlobalHass(),
            "message.invalid_config"
          )
        );
      }
      this._config = { ...config };
      this._requestRender();
      void this._maybeLoadActiveReservations();
    }
    set hass(hass) {
      this._hass = hass;
      void ensureTranslations(this._hass).then(() => this._requestRender());
      this._requestRender();
      void this._maybeLoadActiveReservations();
    }
    getCardSize() {
      return 3;
    }
    async _maybeLoadActiveReservations(force = false) {
      if (!this._hass || !this._config) return;
      if (!isHassRunning(this._hass)) return;
      const entryId = this._getActiveEntryId();
      const target = entryId ?? "all";
      if (this._activeReservationsLoading || !force && this._activeReservationsLoadedFor === target && !this._activeReservationsError) {
        return;
      }
      this._activeReservationsLoading = true;
      this._activeReservationsError = null;
      this._requestRender();
      try {
        let devices = await this._getDomainDevices();
        if (entryId) {
          devices = devices.filter(
            (device) => (device.config_entries ?? []).includes(entryId)
          );
        }
        if (!devices.length) {
          this._activeReservations = [];
          this._activeReservationsById.clear();
          this._reservationUpdateFlagsByDevice.clear();
          this._activeReservationsLoadedFor = target;
          return;
        }
        const entryTitles = await this._getConfigEntryTitles();
        this._permitLabelsByDeviceId = resolvePermitLabelsByDevice(
          devices,
          entryTitles
        );
        const results = await Promise.all(
          devices.map(
            (device) => this._hass.callWS({
              type: "call_service",
              domain: DOMAIN,
              service: SERVICE_LIST_RESERVATIONS,
              return_response: true,
              service_data: { device_id: device.id }
            })
          )
        );
        const collected = [];
        const collectedById = /* @__PURE__ */ new Map();
        const reservationUpdateFlagsByDevice = /* @__PURE__ */ new Map();
        for (const [index, result] of results.entries()) {
          const device = devices[index];
          const response = result?.response ?? result;
          const activeReservations = response?.reservations;
          const updateFields = response?.reservation_update_fields;
          if (Array.isArray(updateFields)) {
            const updateFlags = (updateFields.includes("start_time") ? UPDATE_START_FLAG : 0) | (updateFields.includes("end_time") ? UPDATE_END_FLAG : 0);
            reservationUpdateFlagsByDevice.set(device.id, updateFlags);
          }
          if (Array.isArray(activeReservations)) {
            for (const reservation of activeReservations) {
              const resolvedReservation = reservation.device_id ? reservation : { ...reservation, device_id: device.id };
              collected.push(resolvedReservation);
              collectedById.set(
                resolvedReservation.reservation_id,
                resolvedReservation
              );
            }
          }
        }
        this._reservationUpdateFlagsByDevice = reservationUpdateFlagsByDevice;
        this._activeReservations = collected;
        this._activeReservationsById = collectedById;
        this._activeReservationsLoadedFor = target;
        for (const reservationId of this._reservationInputValues.keys()) {
          if (!collectedById.has(reservationId)) {
            this._reservationInputValues.delete(reservationId);
          }
        }
        this._prunePendingReservationNames();
        for (const reservationId of this._endButtonSuccessByReservationId) {
          if (collectedById.has(reservationId)) continue;
          const timeoutHandle = this._endButtonSuccessTimeoutByReservationId.get(reservationId);
          if (timeoutHandle !== void 0) {
            window.clearTimeout(timeoutHandle);
            this._endButtonSuccessTimeoutByReservationId.delete(reservationId);
          }
          this._endButtonSuccessResolverByReservationId.get(reservationId)?.();
          this._endButtonSuccessResolverByReservationId.delete(reservationId);
          this._endButtonSuccessByReservationId.delete(reservationId);
        }
      } catch (err) {
        this._activeReservations = [];
        this._activeReservationsById.clear();
        this._reservationUpdateFlagsByDevice.clear();
        this._activeReservationsError = this._errorMessage(
          err,
          "message.active_reservations_failed"
        );
        this._activeReservationsLoadedFor = null;
      } finally {
        this._activeReservationsLoading = false;
        this._requestRender();
      }
    }
    render() {
      if (!this._config) return b2``;
      if (!isHassRunning(this._hass)) {
        return renderLoadingCard(this._hass ?? getGlobalHass());
      }
      const title = this._config.title || "";
      const icon = this._config.icon;
      const controlsDisabled = this._isInEditor();
      return b2`
        <ha-card @click=${this._onActionClick}>
          ${renderCardHeader(title, icon)}
          <div class="card-content">
            ${this._renderActiveReservations(controlsDisabled)}
            ${renderStatusAlert(this._statusState)}
          </div>
        </ha-card>
      `;
    }
    _renderActiveReservations(controlsDisabled) {
      const hasReservations = this._activeReservations.length > 0;
      const showEmpty = !this._activeReservationsLoading && !this._activeReservationsError && !hasReservations;
      return b2`
        <div class="row active-reservations">
          ${this._activeReservationsError ? b2`
                <ha-alert alert-type="warning">
                  ${this._activeReservationsError}
                </ha-alert>
              ` : A}
          ${showEmpty ? b2`<div class="active-reservations-empty">
                ${this._localize("message.no_active_reservations")}
              </div>` : A}
          ${this._activeReservations.map(
        (reservation) => this._renderActiveReservation(reservation, controlsDisabled)
      )}
        </div>
      `;
    }
    _renderActiveReservation(reservation, controlsDisabled) {
      const name = reservation.name ?? reservation.favorite_name;
      const license = reservation.license_plate ?? "";
      const pendingName = !name && reservation.device_id ? this._getPendingReservationName(reservation.device_id, license) : null;
      const identify = name || pendingName || license || reservation.reservation_id;
      const permitLabel = reservation.device_id ? this._permitLabelsByDeviceId.get(reservation.device_id) : null;
      const updateFlags = this._getReservationUpdateFlags(
        reservation.device_id
      );
      const allowStart = Boolean(updateFlags & UPDATE_START_FLAG);
      const allowEnd = Boolean(updateFlags & UPDATE_END_FLAG);
      const isBusy = this._reservationInFlight.has(reservation.reservation_id);
      const endButtonSuccess = this._endButtonSuccessByReservationId.has(
        reservation.reservation_id
      );
      const startValue = this._getReservationInputOverride(
        reservation.reservation_id,
        "start"
      ) ?? formatOptionalDateTimeLocal(reservation.start_time);
      const endValue = this._getReservationInputOverride(reservation.reservation_id, "end") ?? formatOptionalDateTimeLocal(reservation.end_time);
      const startMin = formatOptionalDateTimeLocal(reservation.start_time);
      const endMin = startValue || startMin;
      return b2`
        <div class="active-reservation">
          <div class="active-reservation-summary">
            <div class="active-reservation-heading">${identify}</div>
            ${license ? b2`<div class="active-reservation-label">
                  ${this._localize("field.license_plate")}: ${license}
                </div>` : A}
            ${permitLabel ? b2`<div class="active-reservation-label">
                  ${this._localize("field.permit")}: ${permitLabel}
                </div>` : A}
          </div>
          <div class="active-reservation-times">
            <div class="datetime-row">
              <ha-textfield
                type="datetime-local"
                data-reservation-id=${reservation.reservation_id}
                data-field="start"
                .value=${startValue}
                .min=${startMin}
                .label=${this._localize("field.start_time")}
                ?disabled=${controlsDisabled || !allowStart || isBusy}
                @input=${this._onReservationInput}
                @change=${this._onReservationChange}
              ></ha-textfield>
              <ha-icon-button
                class="datetime-picker-button"
                data-picker-reservation-id=${reservation.reservation_id}
                data-picker-field="start"
                aria-label=${this._localize("field.start_time")}
                title=${this._localize("field.start_time")}
                ?disabled=${controlsDisabled || !allowStart || isBusy}
                @click=${this._onReservationPickerClick}
              >
                <ha-icon icon="mdi:calendar-month-outline"></ha-icon>
              </ha-icon-button>
            </div>
            <div class="datetime-row">
              <ha-textfield
                type="datetime-local"
                data-reservation-id=${reservation.reservation_id}
                data-field="end"
                .value=${endValue}
                .min=${endMin}
                .label=${this._localize("field.end_time")}
                ?disabled=${controlsDisabled || !allowEnd || isBusy}
                @input=${this._onReservationInput}
                @change=${this._onReservationChange}
              ></ha-textfield>
              <ha-icon-button
                class="datetime-picker-button"
                data-picker-reservation-id=${reservation.reservation_id}
                data-picker-field="end"
                aria-label=${this._localize("field.end_time")}
                title=${this._localize("field.end_time")}
                ?disabled=${controlsDisabled || !allowEnd || isBusy}
                @click=${this._onReservationPickerClick}
              >
                <ha-icon icon="mdi:calendar-month-outline"></ha-icon>
              </ha-icon-button>
            </div>
          </div>
          <div class="active-reservation-actions">
            ${endButtonSuccess ? b2`
                  <ha-button
                    class="active-reservation-end success"
                    data-reservation-id=${reservation.reservation_id}
                    variant="success"
                    appearance="filled"
                    ?disabled=${controlsDisabled || isBusy}
                  >
                    ${this._localize("button.end_reservation")}
                  </ha-button>
                ` : b2`
                  <ha-button
                    class="active-reservation-end"
                    data-reservation-id=${reservation.reservation_id}
                    ?disabled=${controlsDisabled || isBusy}
                  >
                    ${this._localize("button.end_reservation")}
                  </ha-button>
                `}
          </div>
        </div>
      `;
    }
    _handleActionClick(event) {
      const target = event.target;
      if (!target) return;
      const endButton = target.closest(
        "ha-button.active-reservation-end"
      );
      if (endButton) {
        const reservationId = endButton.dataset.reservationId ?? "";
        if (this._endButtonSuccessByReservationId.has(reservationId)) return;
        void this._handleActiveReservationEnd(reservationId);
      }
    }
    _handleReservationPickerClick(event) {
      if (this._isInEditor()) return;
      event.stopPropagation();
      const target = event.currentTarget;
      const reservationId = target?.dataset.pickerReservationId;
      const field = target?.dataset.pickerField;
      if (!reservationId || field !== "start" && field !== "end") return;
      const pickerField = Array.from(
        this.renderRoot.querySelectorAll(
          "ha-textfield[data-reservation-id][data-field]"
        )
      ).find(
        (element) => element.dataset.reservationId === reservationId && element.dataset.field === field
      );
      openDateTimePickerForField(pickerField ?? null);
    }
    _handleReservationInput(event, resolved) {
      const reservationField = resolved ?? this._getReservationField(event);
      if (!reservationField) return;
      const { reservationId, fieldKey, value } = reservationField;
      const current = this._reservationInputValues.get(reservationId);
      if (current) {
        current[fieldKey] = value;
        return;
      }
      const nextValue = {
        [fieldKey]: value
      };
      this._reservationInputValues.set(reservationId, nextValue);
    }
    _handleReservationChange(event) {
      if (this._isInEditor()) return;
      const reservationField = this._getReservationField(event);
      if (!reservationField) return;
      this._handleReservationInput(event, reservationField);
      void this._handleActiveReservationUpdate(reservationField.reservationId);
    }
    _getReservationField(event) {
      const customEvent = event;
      const detailValue = customEvent.detail?.value;
      const path = event.composedPath();
      let fieldElement = null;
      let inputElement = null;
      for (const node of path) {
        if (!fieldElement && node instanceof HTMLElement && Boolean(node.dataset.reservationId)) {
          const nodeField = node.dataset.field;
          if (nodeField === "start" || nodeField === "end") {
            fieldElement = node;
            if (typeof detailValue === "string") break;
            continue;
          }
        }
        if (!inputElement && (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)) {
          inputElement = node;
        }
        if (fieldElement && inputElement) break;
      }
      if (!fieldElement) return null;
      const reservationId = fieldElement.dataset.reservationId ?? "";
      const field = fieldElement.dataset.field;
      if (!reservationId || field !== "start" && field !== "end") return null;
      return {
        reservationId,
        fieldKey: field,
        value: detailValue ?? inputElement?.value ?? fieldElement.value ?? ""
      };
    }
    _getReservationUpdateFlags(deviceId) {
      if (!deviceId) return 0;
      return this._reservationUpdateFlagsByDevice.get(deviceId) ?? 0;
    }
    _getReservationInputOverride(reservationId, fieldKey) {
      return this._reservationInputValues.get(reservationId)?.[fieldKey];
    }
    _reservationNameKey(deviceId, licensePlate) {
      const resolvedDeviceId = (deviceId ?? "").trim();
      const plateKey = normalizePlateValue(licensePlate);
      if (!resolvedDeviceId || !plateKey) return null;
      return `${resolvedDeviceId}|${plateKey}`;
    }
    _setPendingReservationName(deviceId, licensePlate, name) {
      const key = this._reservationNameKey(deviceId, licensePlate);
      if (!key || !name) return;
      this._pendingReservationNameByKey.set(key, {
        name,
        expiresAt: Date.now() + 30 * 60 * 1e3
      });
    }
    _getPendingReservationName(deviceId, licensePlate) {
      const key = this._reservationNameKey(deviceId, licensePlate);
      if (!key) return null;
      const entry = this._pendingReservationNameByKey.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= Date.now()) {
        this._pendingReservationNameByKey.delete(key);
        return null;
      }
      return entry.name;
    }
    _prunePendingReservationNames() {
      const now = Date.now();
      for (const [key, entry] of this._pendingReservationNameByKey) {
        if (entry.expiresAt <= now) {
          this._pendingReservationNameByKey.delete(key);
        }
      }
    }
    _beginReservationAction(reservationId) {
      if (this._reservationInFlight.has(reservationId)) return false;
      this._reservationInFlight.add(reservationId);
      this._requestRender();
      return true;
    }
    _endReservationAction(reservationId) {
      this._reservationInFlight.delete(reservationId);
      this._requestRender();
    }
    _getReservationTarget(reservationId) {
      const reservation = this._activeReservationsById.get(reservationId);
      const deviceId = reservation?.device_id ?? "";
      return reservation && deviceId ? { reservation, deviceId } : null;
    }
    _completeReservationActionSuccess(reservationId, successMessageKey, invalidateLoadedFor = true) {
      this._setStatus(this._localize(successMessageKey), "success", 5e3);
      this._reservationInputValues.delete(reservationId);
      this._endReservationAction(reservationId);
      if (invalidateLoadedFor) this._activeReservationsLoadedFor = null;
    }
    _setEndButtonSuccess(reservationId) {
      const existingTimeout = this._endButtonSuccessTimeoutByReservationId.get(reservationId);
      if (existingTimeout !== void 0) {
        window.clearTimeout(existingTimeout);
        this._endButtonSuccessResolverByReservationId.get(reservationId)?.();
        this._endButtonSuccessResolverByReservationId.delete(reservationId);
      }
      this._endButtonSuccessByReservationId.add(reservationId);
      this._requestRender();
      return new Promise((resolve) => {
        this._endButtonSuccessResolverByReservationId.set(
          reservationId,
          resolve
        );
        const timeoutHandle = window.setTimeout(() => {
          this._endButtonSuccessTimeoutByReservationId.delete(reservationId);
          this._endButtonSuccessResolverByReservationId.delete(reservationId);
          this._endButtonSuccessByReservationId.delete(reservationId);
          this._requestRender();
          resolve();
        }, 1e3);
        this._endButtonSuccessTimeoutByReservationId.set(
          reservationId,
          timeoutHandle
        );
      });
    }
    async _handleActiveReservationUpdate(reservationId) {
      if (!this._hass || !reservationId) return;
      const target = this._getReservationTarget(reservationId);
      if (!target) return;
      const { reservation, deviceId } = target;
      if (!this._beginReservationAction(reservationId)) return;
      const updateFlags = this._getReservationUpdateFlags(deviceId);
      const allowStart = Boolean(updateFlags & UPDATE_START_FLAG);
      const allowEnd = Boolean(updateFlags & UPDATE_END_FLAG);
      if (!allowStart && !allowEnd) {
        this._endReservationAction(reservationId);
        return;
      }
      const startValue = allowStart ? (this._getReservationInputOverride(reservationId, "start") ?? formatOptionalDateTimeLocal(reservation.start_time)).trim() : "";
      const endValue = allowEnd ? (this._getReservationInputOverride(reservationId, "end") ?? formatOptionalDateTimeLocal(reservation.end_time)).trim() : "";
      const startDate = allowStart ? parseDateTimeValue(startValue) : parseDateTimeValue(reservation.start_time);
      const endDate = allowEnd ? parseDateTimeValue(endValue) : parseDateTimeValue(reservation.end_time);
      const updateError = allowStart && !startDate || allowEnd && !endDate ? "message.start_end_required" : startDate && endDate && endDate <= startDate ? "message.end_before_start" : null;
      if (updateError) {
        this._setStatus(this._localize(updateError), "warning");
        this._endReservationAction(reservationId);
        return;
      }
      try {
        const serviceData = {
          device_id: deviceId,
          reservation_id: reservationId
        };
        if (allowStart && startDate)
          serviceData.start_time = startDate.toISOString();
        if (allowEnd && endDate) serviceData.end_time = endDate.toISOString();
        await this._hass.callService(
          DOMAIN,
          SERVICE_UPDATE_RESERVATION,
          serviceData
        );
      } catch (err) {
        this._setStatus(
          this._errorMessage(err, "message.reservation_update_failed"),
          "warning"
        );
        this._endReservationAction(reservationId);
        return;
      }
      this._completeReservationActionSuccess(
        reservationId,
        "message.reservation_updated"
      );
      await this._maybeLoadActiveReservations(true);
    }
    async _handleActiveReservationEnd(reservationId) {
      if (!this._hass || !reservationId) return;
      const target = this._getReservationTarget(reservationId);
      if (!target) return;
      const { deviceId } = target;
      if (!this._beginReservationAction(reservationId)) return;
      try {
        await this._hass.callService(DOMAIN, SERVICE_END_RESERVATION, {
          device_id: deviceId,
          reservation_id: reservationId
        });
      } catch (err) {
        this._setStatus(
          this._errorMessage(err, "message.reservation_end_failed"),
          "warning"
        );
        this._endReservationAction(reservationId);
        return;
      }
      this._completeReservationActionSuccess(
        reservationId,
        "message.reservation_ended",
        false
      );
      await this._setEndButtonSuccess(reservationId);
      this._activeReservationsLoadedFor = null;
      await this._maybeLoadActiveReservations(true);
    }
    async _getConfigEntryTitles() {
      if (!this._hass) return /* @__PURE__ */ new Map();
      if (this._configEntriesPromise) return this._configEntriesPromise;
      const promise = fetchPermitEntries(this._hass).then(buildPermitTitleMap).catch(() => /* @__PURE__ */ new Map()).finally(() => {
        this._configEntriesPromise = null;
      });
      this._configEntriesPromise = promise;
      return promise;
    }
    async _getDomainDevices() {
      if (!this._hass) return [];
      if (this._devicesPromise) return this._devicesPromise;
      const devicesPromise = this._hass.callWS({ type: "config/device_registry/list" }).then((devices) => filterDomainDevices(devices)).finally(() => {
        this._devicesPromise = null;
      });
      this._devicesPromise = devicesPromise;
      return devicesPromise;
    }
    _getActiveEntryId() {
      return getConfigEntryId(this._config);
    }
  }
  CityVisitorParkingActiveCard.styles = [
    BASE_CARD_STYLES,
    i`
        .active-reservations {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }
        .active-reservation {
          border: 1px solid var(--divider-color);
          border-radius: var(--ha-card-border-radius, var(--ha-space-2));
          padding: var(--ha-space-3);
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }
        .active-reservation-summary {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
        }
        .active-reservation-heading {
          font-weight: 600;
        }
        .active-reservation-label {
          color: var(--secondary-text-color);
          font-family: var(--primary-font-family, "Roboto", "Noto", sans-serif);
          font-size: 14px;
          font-weight: 400;
        }
        .active-reservation-times {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
          gap: var(--ha-space-2);
        }
        .active-reservation-times ha-textfield {
          width: 100%;
        }
        .active-reservation-actions {
          display: flex;
          gap: var(--ha-space-2);
          flex-wrap: wrap;
        }
        .active-reservation-end {
          margin-left: auto;
        }
        .active-reservations-empty {
          font-size: 0.9rem;
          color: var(--secondary-text-color);
        }
      `
  ];
  registerCustomCardWithTranslations(
    CARD_TYPE,
    CityVisitorParkingActiveCard,
    "name",
    ""
  );
  hideCustomCardFromPicker(CARD_TYPE);
})();
/*! Bundled license information:

@lit/reactive-element/css-tag.js:
  (**
   * @license
   * Copyright 2019 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

@lit/reactive-element/reactive-element.js:
lit-html/lit-html.js:
lit-element/lit-element.js:
lit-html/directive.js:
  (**
   * @license
   * Copyright 2017 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/is-server.js:
  (**
   * @license
   * Copyright 2022 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/directive-helpers.js:
  (**
   * @license
   * Copyright 2020 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)

lit-html/directives/keyed.js:
  (**
   * @license
   * Copyright 2021 Google LLC
   * SPDX-License-Identifier: BSD-3-Clause
   *)
*/
