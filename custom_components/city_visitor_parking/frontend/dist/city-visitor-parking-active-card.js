// node_modules/@lit/reactive-element/css-tag.js
var t = globalThis;
var e = t.ShadowRoot && (void 0 === t.ShadyCSS || t.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype;
var s = /* @__PURE__ */ Symbol();
var o = /* @__PURE__ */ new WeakMap();
var n = class {
  constructor(t3, e4, o5) {
    if (this._$cssResult$ = true, o5 !== s) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = t3, this.t = e4;
  }
  get styleSheet() {
    let t3 = this.o;
    const s4 = this.t;
    if (e && void 0 === t3) {
      const e4 = void 0 !== s4 && 1 === s4.length;
      e4 && (t3 = o.get(s4)), void 0 === t3 && ((this.o = t3 = new CSSStyleSheet()).replaceSync(this.cssText), e4 && o.set(s4, t3));
    }
    return t3;
  }
  toString() {
    return this.cssText;
  }
};
var r = (t3) => new n("string" == typeof t3 ? t3 : t3 + "", void 0, s);
var i = (t3, ...e4) => {
  const o5 = 1 === t3.length ? t3[0] : e4.reduce((e5, s4, o6) => e5 + ((t4) => {
    if (true === t4._$cssResult$) return t4.cssText;
    if ("number" == typeof t4) return t4;
    throw Error("Value passed to 'css' function must be a 'css' function result: " + t4 + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
  })(s4) + t3[o6 + 1], t3[0]);
  return new n(o5, t3, s);
};
var S = (s4, o5) => {
  if (e) s4.adoptedStyleSheets = o5.map((t3) => t3 instanceof CSSStyleSheet ? t3 : t3.styleSheet);
  else for (const e4 of o5) {
    const o6 = document.createElement("style"), n4 = t.litNonce;
    void 0 !== n4 && o6.setAttribute("nonce", n4), o6.textContent = e4.cssText, s4.appendChild(o6);
  }
};
var c = e ? (t3) => t3 : (t3) => t3 instanceof CSSStyleSheet ? ((t4) => {
  let e4 = "";
  for (const s4 of t4.cssRules) e4 += s4.cssText;
  return r(e4);
})(t3) : t3;

// node_modules/@lit/reactive-element/reactive-element.js
var { is: i2, defineProperty: e2, getOwnPropertyDescriptor: h, getOwnPropertyNames: r2, getOwnPropertySymbols: o2, getPrototypeOf: n2 } = Object;
var a = globalThis;
var c2 = a.trustedTypes;
var l = c2 ? c2.emptyScript : "";
var p = a.reactiveElementPolyfillSupport;
var d = (t3, s4) => t3;
var u = { toAttribute(t3, s4) {
  switch (s4) {
    case Boolean:
      t3 = t3 ? l : null;
      break;
    case Object:
    case Array:
      t3 = null == t3 ? t3 : JSON.stringify(t3);
  }
  return t3;
}, fromAttribute(t3, s4) {
  let i5 = t3;
  switch (s4) {
    case Boolean:
      i5 = null !== t3;
      break;
    case Number:
      i5 = null === t3 ? null : Number(t3);
      break;
    case Object:
    case Array:
      try {
        i5 = JSON.parse(t3);
      } catch (t4) {
        i5 = null;
      }
  }
  return i5;
} };
var f = (t3, s4) => !i2(t3, s4);
var b = { attribute: true, type: String, converter: u, reflect: false, useDefault: false, hasChanged: f };
Symbol.metadata ?? (Symbol.metadata = /* @__PURE__ */ Symbol("metadata")), a.litPropertyMetadata ?? (a.litPropertyMetadata = /* @__PURE__ */ new WeakMap());
var y = class extends HTMLElement {
  static addInitializer(t3) {
    this._$Ei(), (this.l ?? (this.l = [])).push(t3);
  }
  static get observedAttributes() {
    return this.finalize(), this._$Eh && [...this._$Eh.keys()];
  }
  static createProperty(t3, s4 = b) {
    if (s4.state && (s4.attribute = false), this._$Ei(), this.prototype.hasOwnProperty(t3) && ((s4 = Object.create(s4)).wrapped = true), this.elementProperties.set(t3, s4), !s4.noAccessor) {
      const i5 = /* @__PURE__ */ Symbol(), h3 = this.getPropertyDescriptor(t3, i5, s4);
      void 0 !== h3 && e2(this.prototype, t3, h3);
    }
  }
  static getPropertyDescriptor(t3, s4, i5) {
    const { get: e4, set: r4 } = h(this.prototype, t3) ?? { get() {
      return this[s4];
    }, set(t4) {
      this[s4] = t4;
    } };
    return { get: e4, set(s5) {
      const h3 = e4?.call(this);
      r4?.call(this, s5), this.requestUpdate(t3, h3, i5);
    }, configurable: true, enumerable: true };
  }
  static getPropertyOptions(t3) {
    return this.elementProperties.get(t3) ?? b;
  }
  static _$Ei() {
    if (this.hasOwnProperty(d("elementProperties"))) return;
    const t3 = n2(this);
    t3.finalize(), void 0 !== t3.l && (this.l = [...t3.l]), this.elementProperties = new Map(t3.elementProperties);
  }
  static finalize() {
    if (this.hasOwnProperty(d("finalized"))) return;
    if (this.finalized = true, this._$Ei(), this.hasOwnProperty(d("properties"))) {
      const t4 = this.properties, s4 = [...r2(t4), ...o2(t4)];
      for (const i5 of s4) this.createProperty(i5, t4[i5]);
    }
    const t3 = this[Symbol.metadata];
    if (null !== t3) {
      const s4 = litPropertyMetadata.get(t3);
      if (void 0 !== s4) for (const [t4, i5] of s4) this.elementProperties.set(t4, i5);
    }
    this._$Eh = /* @__PURE__ */ new Map();
    for (const [t4, s4] of this.elementProperties) {
      const i5 = this._$Eu(t4, s4);
      void 0 !== i5 && this._$Eh.set(i5, t4);
    }
    this.elementStyles = this.finalizeStyles(this.styles);
  }
  static finalizeStyles(s4) {
    const i5 = [];
    if (Array.isArray(s4)) {
      const e4 = new Set(s4.flat(1 / 0).reverse());
      for (const s5 of e4) i5.unshift(c(s5));
    } else void 0 !== s4 && i5.push(c(s4));
    return i5;
  }
  static _$Eu(t3, s4) {
    const i5 = s4.attribute;
    return false === i5 ? void 0 : "string" == typeof i5 ? i5 : "string" == typeof t3 ? t3.toLowerCase() : void 0;
  }
  constructor() {
    super(), this._$Ep = void 0, this.isUpdatePending = false, this.hasUpdated = false, this._$Em = null, this._$Ev();
  }
  _$Ev() {
    this._$ES = new Promise((t3) => this.enableUpdating = t3), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), this.constructor.l?.forEach((t3) => t3(this));
  }
  addController(t3) {
    (this._$EO ?? (this._$EO = /* @__PURE__ */ new Set())).add(t3), void 0 !== this.renderRoot && this.isConnected && t3.hostConnected?.();
  }
  removeController(t3) {
    this._$EO?.delete(t3);
  }
  _$E_() {
    const t3 = /* @__PURE__ */ new Map(), s4 = this.constructor.elementProperties;
    for (const i5 of s4.keys()) this.hasOwnProperty(i5) && (t3.set(i5, this[i5]), delete this[i5]);
    t3.size > 0 && (this._$Ep = t3);
  }
  createRenderRoot() {
    const t3 = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
    return S(t3, this.constructor.elementStyles), t3;
  }
  connectedCallback() {
    this.renderRoot ?? (this.renderRoot = this.createRenderRoot()), this.enableUpdating(true), this._$EO?.forEach((t3) => t3.hostConnected?.());
  }
  enableUpdating(t3) {
  }
  disconnectedCallback() {
    this._$EO?.forEach((t3) => t3.hostDisconnected?.());
  }
  attributeChangedCallback(t3, s4, i5) {
    this._$AK(t3, i5);
  }
  _$ET(t3, s4) {
    const i5 = this.constructor.elementProperties.get(t3), e4 = this.constructor._$Eu(t3, i5);
    if (void 0 !== e4 && true === i5.reflect) {
      const h3 = (void 0 !== i5.converter?.toAttribute ? i5.converter : u).toAttribute(s4, i5.type);
      this._$Em = t3, null == h3 ? this.removeAttribute(e4) : this.setAttribute(e4, h3), this._$Em = null;
    }
  }
  _$AK(t3, s4) {
    const i5 = this.constructor, e4 = i5._$Eh.get(t3);
    if (void 0 !== e4 && this._$Em !== e4) {
      const t4 = i5.getPropertyOptions(e4), h3 = "function" == typeof t4.converter ? { fromAttribute: t4.converter } : void 0 !== t4.converter?.fromAttribute ? t4.converter : u;
      this._$Em = e4;
      const r4 = h3.fromAttribute(s4, t4.type);
      this[e4] = r4 ?? this._$Ej?.get(e4) ?? r4, this._$Em = null;
    }
  }
  requestUpdate(t3, s4, i5, e4 = false, h3) {
    if (void 0 !== t3) {
      const r4 = this.constructor;
      if (false === e4 && (h3 = this[t3]), i5 ?? (i5 = r4.getPropertyOptions(t3)), !((i5.hasChanged ?? f)(h3, s4) || i5.useDefault && i5.reflect && h3 === this._$Ej?.get(t3) && !this.hasAttribute(r4._$Eu(t3, i5)))) return;
      this.C(t3, s4, i5);
    }
    false === this.isUpdatePending && (this._$ES = this._$EP());
  }
  C(t3, s4, { useDefault: i5, reflect: e4, wrapped: h3 }, r4) {
    i5 && !(this._$Ej ?? (this._$Ej = /* @__PURE__ */ new Map())).has(t3) && (this._$Ej.set(t3, r4 ?? s4 ?? this[t3]), true !== h3 || void 0 !== r4) || (this._$AL.has(t3) || (this.hasUpdated || i5 || (s4 = void 0), this._$AL.set(t3, s4)), true === e4 && this._$Em !== t3 && (this._$Eq ?? (this._$Eq = /* @__PURE__ */ new Set())).add(t3));
  }
  async _$EP() {
    this.isUpdatePending = true;
    try {
      await this._$ES;
    } catch (t4) {
      Promise.reject(t4);
    }
    const t3 = this.scheduleUpdate();
    return null != t3 && await t3, !this.isUpdatePending;
  }
  scheduleUpdate() {
    return this.performUpdate();
  }
  performUpdate() {
    if (!this.isUpdatePending) return;
    if (!this.hasUpdated) {
      if (this.renderRoot ?? (this.renderRoot = this.createRenderRoot()), this._$Ep) {
        for (const [t5, s5] of this._$Ep) this[t5] = s5;
        this._$Ep = void 0;
      }
      const t4 = this.constructor.elementProperties;
      if (t4.size > 0) for (const [s5, i5] of t4) {
        const { wrapped: t5 } = i5, e4 = this[s5];
        true !== t5 || this._$AL.has(s5) || void 0 === e4 || this.C(s5, void 0, i5, e4);
      }
    }
    let t3 = false;
    const s4 = this._$AL;
    try {
      t3 = this.shouldUpdate(s4), t3 ? (this.willUpdate(s4), this._$EO?.forEach((t4) => t4.hostUpdate?.()), this.update(s4)) : this._$EM();
    } catch (s5) {
      throw t3 = false, this._$EM(), s5;
    }
    t3 && this._$AE(s4);
  }
  willUpdate(t3) {
  }
  _$AE(t3) {
    this._$EO?.forEach((t4) => t4.hostUpdated?.()), this.hasUpdated || (this.hasUpdated = true, this.firstUpdated(t3)), this.updated(t3);
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
  shouldUpdate(t3) {
    return true;
  }
  update(t3) {
    this._$Eq && (this._$Eq = this._$Eq.forEach((t4) => this._$ET(t4, this[t4]))), this._$EM();
  }
  updated(t3) {
  }
  firstUpdated(t3) {
  }
};
y.elementStyles = [], y.shadowRootOptions = { mode: "open" }, y[d("elementProperties")] = /* @__PURE__ */ new Map(), y[d("finalized")] = /* @__PURE__ */ new Map(), p?.({ ReactiveElement: y }), (a.reactiveElementVersions ?? (a.reactiveElementVersions = [])).push("2.1.2");

// node_modules/lit-html/lit-html.js
var t2 = globalThis;
var i3 = (t3) => t3;
var s2 = t2.trustedTypes;
var e3 = s2 ? s2.createPolicy("lit-html", { createHTML: (t3) => t3 }) : void 0;
var h2 = "$lit$";
var o3 = `lit$${Math.random().toFixed(9).slice(2)}$`;
var n3 = "?" + o3;
var r3 = `<${n3}>`;
var l2 = document;
var c3 = () => l2.createComment("");
var a2 = (t3) => null === t3 || "object" != typeof t3 && "function" != typeof t3;
var u2 = Array.isArray;
var d2 = (t3) => u2(t3) || "function" == typeof t3?.[Symbol.iterator];
var f2 = "[ 	\n\f\r]";
var v = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g;
var _ = /--!?>/g;
var m = />/g;
var p2 = RegExp(`>|${f2}(?:([^\\s"'>=/]+)(${f2}*=${f2}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g");
var g = /'/g;
var $ = /"/g;
var y2 = /^(?:script|style|textarea|title)$/i;
var x = (t3) => (i5, ...s4) => ({ _$litType$: t3, strings: i5, values: s4 });
var b2 = x(1);
var w = x(2);
var T = x(3);
var E = /* @__PURE__ */ Symbol.for("lit-noChange");
var A = /* @__PURE__ */ Symbol.for("lit-nothing");
var C = /* @__PURE__ */ new WeakMap();
var P = l2.createTreeWalker(l2, 129);
function V(t3, i5) {
  if (!u2(t3) || !t3.hasOwnProperty("raw")) throw Error("invalid template strings array");
  return void 0 !== e3 ? e3.createHTML(i5) : i5;
}
var N = (t3, i5) => {
  const s4 = t3.length - 1, e4 = [];
  let n4, l3 = 2 === i5 ? "<svg>" : 3 === i5 ? "<math>" : "", c4 = v;
  for (let i6 = 0; i6 < s4; i6++) {
    const s5 = t3[i6];
    let a3, u3, d3 = -1, f3 = 0;
    for (; f3 < s5.length && (c4.lastIndex = f3, u3 = c4.exec(s5), null !== u3); ) f3 = c4.lastIndex, c4 === v ? "!--" === u3[1] ? c4 = _ : void 0 !== u3[1] ? c4 = m : void 0 !== u3[2] ? (y2.test(u3[2]) && (n4 = RegExp("</" + u3[2], "g")), c4 = p2) : void 0 !== u3[3] && (c4 = p2) : c4 === p2 ? ">" === u3[0] ? (c4 = n4 ?? v, d3 = -1) : void 0 === u3[1] ? d3 = -2 : (d3 = c4.lastIndex - u3[2].length, a3 = u3[1], c4 = void 0 === u3[3] ? p2 : '"' === u3[3] ? $ : g) : c4 === $ || c4 === g ? c4 = p2 : c4 === _ || c4 === m ? c4 = v : (c4 = p2, n4 = void 0);
    const x2 = c4 === p2 && t3[i6 + 1].startsWith("/>") ? " " : "";
    l3 += c4 === v ? s5 + r3 : d3 >= 0 ? (e4.push(a3), s5.slice(0, d3) + h2 + s5.slice(d3) + o3 + x2) : s5 + o3 + (-2 === d3 ? i6 : x2);
  }
  return [V(t3, l3 + (t3[s4] || "<?>") + (2 === i5 ? "</svg>" : 3 === i5 ? "</math>" : "")), e4];
};
var S2 = class _S {
  constructor({ strings: t3, _$litType$: i5 }, e4) {
    let r4;
    this.parts = [];
    let l3 = 0, a3 = 0;
    const u3 = t3.length - 1, d3 = this.parts, [f3, v2] = N(t3, i5);
    if (this.el = _S.createElement(f3, e4), P.currentNode = this.el.content, 2 === i5 || 3 === i5) {
      const t4 = this.el.content.firstChild;
      t4.replaceWith(...t4.childNodes);
    }
    for (; null !== (r4 = P.nextNode()) && d3.length < u3; ) {
      if (1 === r4.nodeType) {
        if (r4.hasAttributes()) for (const t4 of r4.getAttributeNames()) if (t4.endsWith(h2)) {
          const i6 = v2[a3++], s4 = r4.getAttribute(t4).split(o3), e5 = /([.?@])?(.*)/.exec(i6);
          d3.push({ type: 1, index: l3, name: e5[2], strings: s4, ctor: "." === e5[1] ? I : "?" === e5[1] ? L : "@" === e5[1] ? z : H }), r4.removeAttribute(t4);
        } else t4.startsWith(o3) && (d3.push({ type: 6, index: l3 }), r4.removeAttribute(t4));
        if (y2.test(r4.tagName)) {
          const t4 = r4.textContent.split(o3), i6 = t4.length - 1;
          if (i6 > 0) {
            r4.textContent = s2 ? s2.emptyScript : "";
            for (let s4 = 0; s4 < i6; s4++) r4.append(t4[s4], c3()), P.nextNode(), d3.push({ type: 2, index: ++l3 });
            r4.append(t4[i6], c3());
          }
        }
      } else if (8 === r4.nodeType) if (r4.data === n3) d3.push({ type: 2, index: l3 });
      else {
        let t4 = -1;
        for (; -1 !== (t4 = r4.data.indexOf(o3, t4 + 1)); ) d3.push({ type: 7, index: l3 }), t4 += o3.length - 1;
      }
      l3++;
    }
  }
  static createElement(t3, i5) {
    const s4 = l2.createElement("template");
    return s4.innerHTML = t3, s4;
  }
};
function M(t3, i5, s4 = t3, e4) {
  if (i5 === E) return i5;
  let h3 = void 0 !== e4 ? s4._$Co?.[e4] : s4._$Cl;
  const o5 = a2(i5) ? void 0 : i5._$litDirective$;
  return h3?.constructor !== o5 && (h3?._$AO?.(false), void 0 === o5 ? h3 = void 0 : (h3 = new o5(t3), h3._$AT(t3, s4, e4)), void 0 !== e4 ? (s4._$Co ?? (s4._$Co = []))[e4] = h3 : s4._$Cl = h3), void 0 !== h3 && (i5 = M(t3, h3._$AS(t3, i5.values), h3, e4)), i5;
}
var R = class {
  constructor(t3, i5) {
    this._$AV = [], this._$AN = void 0, this._$AD = t3, this._$AM = i5;
  }
  get parentNode() {
    return this._$AM.parentNode;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  u(t3) {
    const { el: { content: i5 }, parts: s4 } = this._$AD, e4 = (t3?.creationScope ?? l2).importNode(i5, true);
    P.currentNode = e4;
    let h3 = P.nextNode(), o5 = 0, n4 = 0, r4 = s4[0];
    for (; void 0 !== r4; ) {
      if (o5 === r4.index) {
        let i6;
        2 === r4.type ? i6 = new k(h3, h3.nextSibling, this, t3) : 1 === r4.type ? i6 = new r4.ctor(h3, r4.name, r4.strings, this, t3) : 6 === r4.type && (i6 = new Z(h3, this, t3)), this._$AV.push(i6), r4 = s4[++n4];
      }
      o5 !== r4?.index && (h3 = P.nextNode(), o5++);
    }
    return P.currentNode = l2, e4;
  }
  p(t3) {
    let i5 = 0;
    for (const s4 of this._$AV) void 0 !== s4 && (void 0 !== s4.strings ? (s4._$AI(t3, s4, i5), i5 += s4.strings.length - 2) : s4._$AI(t3[i5])), i5++;
  }
};
var k = class _k {
  get _$AU() {
    return this._$AM?._$AU ?? this._$Cv;
  }
  constructor(t3, i5, s4, e4) {
    this.type = 2, this._$AH = A, this._$AN = void 0, this._$AA = t3, this._$AB = i5, this._$AM = s4, this.options = e4, this._$Cv = e4?.isConnected ?? true;
  }
  get parentNode() {
    let t3 = this._$AA.parentNode;
    const i5 = this._$AM;
    return void 0 !== i5 && 11 === t3?.nodeType && (t3 = i5.parentNode), t3;
  }
  get startNode() {
    return this._$AA;
  }
  get endNode() {
    return this._$AB;
  }
  _$AI(t3, i5 = this) {
    t3 = M(this, t3, i5), a2(t3) ? t3 === A || null == t3 || "" === t3 ? (this._$AH !== A && this._$AR(), this._$AH = A) : t3 !== this._$AH && t3 !== E && this._(t3) : void 0 !== t3._$litType$ ? this.$(t3) : void 0 !== t3.nodeType ? this.T(t3) : d2(t3) ? this.k(t3) : this._(t3);
  }
  O(t3) {
    return this._$AA.parentNode.insertBefore(t3, this._$AB);
  }
  T(t3) {
    this._$AH !== t3 && (this._$AR(), this._$AH = this.O(t3));
  }
  _(t3) {
    this._$AH !== A && a2(this._$AH) ? this._$AA.nextSibling.data = t3 : this.T(l2.createTextNode(t3)), this._$AH = t3;
  }
  $(t3) {
    const { values: i5, _$litType$: s4 } = t3, e4 = "number" == typeof s4 ? this._$AC(t3) : (void 0 === s4.el && (s4.el = S2.createElement(V(s4.h, s4.h[0]), this.options)), s4);
    if (this._$AH?._$AD === e4) this._$AH.p(i5);
    else {
      const t4 = new R(e4, this), s5 = t4.u(this.options);
      t4.p(i5), this.T(s5), this._$AH = t4;
    }
  }
  _$AC(t3) {
    let i5 = C.get(t3.strings);
    return void 0 === i5 && C.set(t3.strings, i5 = new S2(t3)), i5;
  }
  k(t3) {
    u2(this._$AH) || (this._$AH = [], this._$AR());
    const i5 = this._$AH;
    let s4, e4 = 0;
    for (const h3 of t3) e4 === i5.length ? i5.push(s4 = new _k(this.O(c3()), this.O(c3()), this, this.options)) : s4 = i5[e4], s4._$AI(h3), e4++;
    e4 < i5.length && (this._$AR(s4 && s4._$AB.nextSibling, e4), i5.length = e4);
  }
  _$AR(t3 = this._$AA.nextSibling, s4) {
    for (this._$AP?.(false, true, s4); t3 !== this._$AB; ) {
      const s5 = i3(t3).nextSibling;
      i3(t3).remove(), t3 = s5;
    }
  }
  setConnected(t3) {
    void 0 === this._$AM && (this._$Cv = t3, this._$AP?.(t3));
  }
};
var H = class {
  get tagName() {
    return this.element.tagName;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  constructor(t3, i5, s4, e4, h3) {
    this.type = 1, this._$AH = A, this._$AN = void 0, this.element = t3, this.name = i5, this._$AM = e4, this.options = h3, s4.length > 2 || "" !== s4[0] || "" !== s4[1] ? (this._$AH = Array(s4.length - 1).fill(new String()), this.strings = s4) : this._$AH = A;
  }
  _$AI(t3, i5 = this, s4, e4) {
    const h3 = this.strings;
    let o5 = false;
    if (void 0 === h3) t3 = M(this, t3, i5, 0), o5 = !a2(t3) || t3 !== this._$AH && t3 !== E, o5 && (this._$AH = t3);
    else {
      const e5 = t3;
      let n4, r4;
      for (t3 = h3[0], n4 = 0; n4 < h3.length - 1; n4++) r4 = M(this, e5[s4 + n4], i5, n4), r4 === E && (r4 = this._$AH[n4]), o5 || (o5 = !a2(r4) || r4 !== this._$AH[n4]), r4 === A ? t3 = A : t3 !== A && (t3 += (r4 ?? "") + h3[n4 + 1]), this._$AH[n4] = r4;
    }
    o5 && !e4 && this.j(t3);
  }
  j(t3) {
    t3 === A ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t3 ?? "");
  }
};
var I = class extends H {
  constructor() {
    super(...arguments), this.type = 3;
  }
  j(t3) {
    this.element[this.name] = t3 === A ? void 0 : t3;
  }
};
var L = class extends H {
  constructor() {
    super(...arguments), this.type = 4;
  }
  j(t3) {
    this.element.toggleAttribute(this.name, !!t3 && t3 !== A);
  }
};
var z = class extends H {
  constructor(t3, i5, s4, e4, h3) {
    super(t3, i5, s4, e4, h3), this.type = 5;
  }
  _$AI(t3, i5 = this) {
    if ((t3 = M(this, t3, i5, 0) ?? A) === E) return;
    const s4 = this._$AH, e4 = t3 === A && s4 !== A || t3.capture !== s4.capture || t3.once !== s4.once || t3.passive !== s4.passive, h3 = t3 !== A && (s4 === A || e4);
    e4 && this.element.removeEventListener(this.name, this, s4), h3 && this.element.addEventListener(this.name, this, t3), this._$AH = t3;
  }
  handleEvent(t3) {
    "function" == typeof this._$AH ? this._$AH.call(this.options?.host ?? this.element, t3) : this._$AH.handleEvent(t3);
  }
};
var Z = class {
  constructor(t3, i5, s4) {
    this.element = t3, this.type = 6, this._$AN = void 0, this._$AM = i5, this.options = s4;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AI(t3) {
    M(this, t3);
  }
};
var B = t2.litHtmlPolyfillSupport;
B?.(S2, k), (t2.litHtmlVersions ?? (t2.litHtmlVersions = [])).push("3.3.2");
var D = (t3, i5, s4) => {
  const e4 = s4?.renderBefore ?? i5;
  let h3 = e4._$litPart$;
  if (void 0 === h3) {
    const t4 = s4?.renderBefore ?? null;
    e4._$litPart$ = h3 = new k(i5.insertBefore(c3(), t4), t4, void 0, s4 ?? {});
  }
  return h3._$AI(t3), h3;
};

// node_modules/lit-element/lit-element.js
var s3 = globalThis;
var i4 = class extends y {
  constructor() {
    super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
  }
  createRenderRoot() {
    var _a;
    const t3 = super.createRenderRoot();
    return (_a = this.renderOptions).renderBefore ?? (_a.renderBefore = t3.firstChild), t3;
  }
  update(t3) {
    const r4 = this.render();
    this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t3), this._$Do = D(r4, this.renderRoot, this.renderOptions);
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

// src/localize.ts
var DEFAULT_LANGUAGE = "en";
var translationsCache = /* @__PURE__ */ new Map();
var translationsInFlight = /* @__PURE__ */ new Map();
var getGlobalHass = () => {
  const globalHass = window.hass;
  if (globalHass) {
    return globalHass;
  }
  return null;
};
var getLanguage = (target) => {
  const globalHass = getGlobalHass();
  if (!target || typeof target === "function") {
    return globalHass?.locale?.language || globalHass?.language || navigator.language || DEFAULT_LANGUAGE;
  }
  return target.locale?.language || target.language || globalHass?.locale?.language || globalHass?.language || DEFAULT_LANGUAGE;
};
var getBaseUrl = () => new URL(".", import.meta.url).toString().replace(/\/$/, "");
var fetchTranslations = async (baseUrl, language) => {
  const response = await fetch(
    `${baseUrl}/translations/${language}.json`
  ).catch(() => null);
  if (!response || !response.ok) {
    return null;
  }
  try {
    return await response.json();
  } catch {
    return null;
  }
};
var ensureTranslations = async (target) => {
  const language = getLanguage(target);
  if (translationsCache.has(language)) {
    return;
  }
  const inFlight = translationsInFlight.get(language);
  if (inFlight) {
    await inFlight;
    return;
  }
  const loadPromise = (async () => {
    const baseUrl = getBaseUrl();
    const languageStrings = await fetchTranslations(baseUrl, language);
    if (languageStrings) {
      translationsCache.set(language, languageStrings);
      return;
    }
    const baseLanguage = language.split("-")[0];
    if (baseLanguage && baseLanguage !== language) {
      const baseStrings = await fetchTranslations(baseUrl, baseLanguage);
      if (baseStrings) {
        translationsCache.set(language, baseStrings);
        return;
      }
    }
    const fallbackStrings = await fetchTranslations(baseUrl, DEFAULT_LANGUAGE);
    translationsCache.set(language, fallbackStrings ?? {});
  })();
  translationsInFlight.set(language, loadPromise);
  await loadPromise;
  translationsInFlight.delete(language);
};
var localize = (target, key) => {
  const language = getLanguage(target);
  const strings = translationsCache.get(language) || translationsCache.get(DEFAULT_LANGUAGE);
  if (strings) {
    const directValue = strings[key];
    if (typeof directValue === "string") {
      return directValue;
    }
    const cardStrings = strings.card;
    if (cardStrings && typeof cardStrings === "object") {
      const parts = key.split(".");
      let current = cardStrings;
      for (const part of parts) {
        if (!current || typeof current !== "object") {
          current = void 0;
          break;
        }
        current = current[part];
      }
      if (typeof current === "string") {
        return current;
      }
    }
  }
  return key;
};

// src/card-shared.ts
var DOMAIN = "city_visitor_parking";
var errorMessage = (err, fallbackKey, localizeFn) => {
  const message = err?.message;
  if (typeof message === "string" && message.trim()) {
    return message;
  }
  const dataMessage = err?.data?.message;
  if (typeof dataMessage === "string" && dataMessage.trim()) {
    return dataMessage;
  }
  return localizeFn(fallbackKey);
};
var pad = (value) => String(value).padStart(2, "0");
var formatDate = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
var formatDateTimeLocal = (date) => `${formatDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
var isInEditor = (startNode) => {
  const selector = "hui-card-preview, hui-card-picker, hui-card-element-editor, hui-card-edit-mode, hui-dialog-edit-card";
  let node = startNode;
  while (node) {
    if (node instanceof HTMLElement && node.matches(selector)) {
      return true;
    }
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
var registerCustomCard = (cardType, ctor, name, description) => {
  const scopedRegistry = window.__scopedElementsRegistry;
  const registries = new Set(
    [customElements, scopedRegistry].filter(
      (registry) => Boolean(registry)
    )
  );
  for (const registry of registries) {
    if (!registry.get(cardType)) {
      registry.define(cardType, ctor);
    }
  }
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

// src/city-visitor-parking-active-card-editor.ts
var getFieldKey = (prefix, name) => {
  const fieldName = name === "config_entry_id" ? "config_entry" : name;
  return `${prefix}.${fieldName}`;
};
var getActiveCardConfigForm = async (hassOrLocalize) => {
  await ensureTranslations(hassOrLocalize);
  const defaultTitleKey = "section.active_reservations";
  const defaultTitleValue = localize(hassOrLocalize, defaultTitleKey);
  const defaultTitle = defaultTitleValue === defaultTitleKey ? "Active reservations" : defaultTitleValue;
  return {
    schema: [
      {
        name: "config_entry_id",
        selector: { config_entry: { integration: DOMAIN } },
        required: false
      },
      {
        name: "title",
        selector: { text: {} },
        default: defaultTitle,
        required: false
      },
      {
        name: "icon",
        selector: { icon: {} },
        required: false
      }
    ],
    computeLabel: (schema) => localize(hassOrLocalize, getFieldKey("active_editor.field", schema.name)),
    computeHelper: (schema) => {
      const key = getFieldKey("active_editor.description", schema.name);
      const helper = localize(hassOrLocalize, key);
      return helper === key ? "" : helper;
    }
  };
};

// src/city-visitor-parking-active-card.ts
(() => {
  const CARD_TYPE = "city-visitor-parking-active-card";
  const SERVICE_LIST_ACTIVE_RESERVATIONS = "list_active_reservations";
  const SERVICE_UPDATE_RESERVATION = "update_reservation";
  const SERVICE_END_RESERVATION = "end_reservation";
  class CityVisitorParkingActiveCard extends i4 {
    constructor() {
      super();
      this._config = null;
      this._hass = null;
      this._activeReservations = [];
      this._activeReservationsError = null;
      this._activeReservationsLoadedFor = null;
      this._activeReservationsLoading = false;
      this._reservationUpdateFieldsByDevice = {};
      this._devicesPromise = null;
      this._status = "";
      this._statusType = "info";
      this._reservationStartedHandler = null;
      this._renderHandle = null;
      this._reservationInFlight = /* @__PURE__ */ new Set();
      this._reservationInputValues = /* @__PURE__ */ new Map();
      this._onActionClick = (event) => this._handleActionClick(event);
      this._onReservationInput = (event) => this._handleReservationInput(event);
    }
    connectedCallback() {
      super.connectedCallback();
      if (!this._reservationStartedHandler) {
        this._reservationStartedHandler = () => {
          void this._maybeLoadActiveReservations(true);
        };
      }
      window.addEventListener(
        "city-visitor-parking-reservation-started",
        this._reservationStartedHandler
      );
    }
    disconnectedCallback() {
      if (this._reservationStartedHandler) {
        window.removeEventListener(
          "city-visitor-parking-reservation-started",
          this._reservationStartedHandler
        );
      }
      super.disconnectedCallback();
    }
    static async getConfigForm(hass) {
      return getActiveCardConfigForm(hass);
    }
    static getStubConfig() {
      return {
        type: `custom:${CARD_TYPE}`
      };
    }
    setConfig(config) {
      if (!config || !config.type) {
        const globalHass2 = window.hass;
        throw new Error(
          localize(this._hass ?? globalHass2, "message.invalid_config")
        );
      }
      this._config = { ...config };
      this._requestRender();
      void this._maybeLoadActiveReservations();
    }
    set hass(hass) {
      this._hass = hass;
      void ensureTranslations(this._hass).then(() => this.requestUpdate());
      this._requestRender();
      void this._maybeLoadActiveReservations();
    }
    getCardSize() {
      return 3;
    }
    async _maybeLoadActiveReservations(force = false) {
      if (!this._hass || !this._config) {
        return;
      }
      const target = this._config.config_entry_id ?? "all";
      if (this._activeReservationsLoading || !force && this._activeReservationsLoadedFor === target && !this._activeReservationsError) {
        return;
      }
      this._activeReservationsLoading = true;
      this._activeReservationsError = null;
      this._requestRender();
      try {
        let devices = await this._getDomainDevices();
        if (this._config.config_entry_id) {
          devices = devices.filter(
            (device) => (device.config_entries ?? []).includes(
              this._config.config_entry_id
            )
          );
        }
        if (!devices.length) {
          this._activeReservations = [];
          this._activeReservationsLoadedFor = target;
          return;
        }
        const results = await Promise.all(
          devices.map(
            (device) => this._hass.callWS({
              type: "call_service",
              domain: DOMAIN,
              service: SERVICE_LIST_ACTIVE_RESERVATIONS,
              return_response: true,
              service_data: {
                device_id: device.id
              }
            })
          )
        );
        const collected = [];
        for (const [index, result] of results.entries()) {
          const device = devices[index];
          const activeReservations = result?.active_reservations || result?.response?.active_reservations;
          const updateFields = result?.reservation_update_fields || result?.response?.reservation_update_fields;
          if (Array.isArray(updateFields)) {
            this._reservationUpdateFieldsByDevice[device.id] = updateFields;
          }
          if (Array.isArray(activeReservations)) {
            collected.push(
              ...activeReservations.map((reservation) => ({
                ...reservation,
                device_id: reservation.device_id || device.id
              }))
            );
          }
        }
        this._activeReservations = collected;
        this._activeReservationsLoadedFor = target;
        const activeIds = new Set(
          collected.map((reservation) => reservation.reservation_id)
        );
        for (const reservationId of this._reservationInputValues.keys()) {
          if (!activeIds.has(reservationId)) {
            this._reservationInputValues.delete(reservationId);
          }
        }
      } catch (err) {
        this._activeReservations = [];
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
    _requestRender() {
      if (this._renderHandle !== null) {
        return;
      }
      this._renderHandle = window.requestAnimationFrame(() => {
        this._renderHandle = null;
        this.requestUpdate();
      });
    }
    render() {
      if (!this._config) {
        return b2``;
      }
      if (!this._hass) {
        return b2`
          <ha-card>
            <div class="card-content">
              <ha-alert alert-type="warning">
                ${this._getLoadingMessage()}
              </ha-alert>
            </div>
          </ha-card>
        `;
      }
      const title = this._config.title || "";
      const icon = this._config.icon;
      const showHeader = Boolean(title || icon);
      const controlsDisabled = this._isInEditor();
      return b2`
        <ha-card @click=${this._onActionClick}>
          ${showHeader ? b2`
                <h1 class="card-header">
                  <div class="name">
                    ${icon ? b2`<ha-icon class="icon" .icon=${icon}></ha-icon>` : A}
                    ${title}
                  </div>
                </h1>
              ` : A}
          <div class="card-content">
            ${this._renderActiveReservations(controlsDisabled)}
            ${this._status ? b2`<ha-alert alert-type=${this._statusType}
                  >${this._status}</ha-alert
                >` : A}
          </div>
        </ha-card>
      `;
    }
    _renderActiveReservations(controlsDisabled) {
      const hasReservations = this._activeReservations.length > 0;
      const showEmpty = !this._activeReservationsLoading && !this._activeReservationsError && !hasReservations;
      return b2`
        <div class="row active-reservations">
          ${this._activeReservationsLoading ? b2`
                <div class="row spinner">
                  <ha-spinner size="small"></ha-spinner>
                  <span
                    >${this._localize(
        "message.loading_active_reservations"
      )}</span
                  >
                </div>
              ` : A}
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
      const identify = name || license || reservation.reservation_id;
      const updateFields = reservation.device_id && this._reservationUpdateFieldsByDevice[reservation.device_id] ? this._reservationUpdateFieldsByDevice[reservation.device_id] : [];
      const allowStart = updateFields.includes("start_time");
      const allowEnd = updateFields.includes("end_time");
      const allowUpdate = allowStart || allowEnd;
      const isBusy = this._reservationInFlight.has(reservation.reservation_id);
      const inputOverrides = this._reservationInputValues.get(
        reservation.reservation_id
      );
      const startOverride = inputOverrides?.start;
      const endOverride = inputOverrides?.end;
      const startValue = startOverride !== void 0 ? startOverride : this._formatReservationDateTime(reservation.start_time);
      const endValue = endOverride !== void 0 ? endOverride : this._formatReservationDateTime(reservation.end_time);
      return b2`
        <div class="active-reservation">
          <div class="active-reservation-summary">
            <div class="active-reservation-heading">${identify}</div>
            ${license ? b2`<div class="active-reservation-label">
                  ${this._localize("field.license_plate")}: ${license}
                </div>` : A}
          </div>
          <div class="active-reservation-times">
            <ha-textfield
              class="reservation-input active-reservation-start"
              data-reservation-id=${reservation.reservation_id}
              data-field="start"
              .label=${this._localize("field.start_time")}
              type="datetime-local"
              .value=${startValue}
              ?disabled=${controlsDisabled || !allowStart || isBusy}
              @input=${this._onReservationInput}
            ></ha-textfield>
            <ha-textfield
              class="reservation-input active-reservation-end"
              data-reservation-id=${reservation.reservation_id}
              data-field="end"
              .label=${this._localize("field.end_time")}
              type="datetime-local"
              .value=${endValue}
              ?disabled=${controlsDisabled || !allowEnd || isBusy}
              @input=${this._onReservationInput}
            ></ha-textfield>
          </div>
          <div class="active-reservation-actions">
            <ha-button
              class="active-reservation-update"
              data-reservation-id=${reservation.reservation_id}
              ?outlined=${true}
              ?disabled=${controlsDisabled || isBusy || !allowUpdate}
            >
              ${this._localize("button.update_reservation")}
            </ha-button>
            <ha-button
              class="active-reservation-end"
              data-reservation-id=${reservation.reservation_id}
              ?disabled=${controlsDisabled || isBusy}
            >
              ${this._localize("button.end_reservation")}
            </ha-button>
          </div>
        </div>
      `;
    }
    _handleActionClick(event) {
      const target = event.target;
      if (!target) {
        return;
      }
      const updateButton = target.closest(
        "ha-button.active-reservation-update"
      );
      if (updateButton) {
        const reservationId = updateButton.dataset.reservationId ?? "";
        void this._handleActiveReservationUpdate(reservationId);
        return;
      }
      const endButton = target.closest(
        "ha-button.active-reservation-end"
      );
      if (endButton) {
        const reservationId = endButton.dataset.reservationId ?? "";
        void this._handleActiveReservationEnd(reservationId);
      }
    }
    _handleReservationInput(event) {
      const target = event.target;
      if (!target) {
        return;
      }
      const element = target;
      const reservationId = element.dataset.reservationId ?? "";
      const field = element.dataset.field;
      if (!reservationId || field !== "start" && field !== "end") {
        return;
      }
      const fieldKey = field === "start" ? "start" : "end";
      const value = target.value ?? "";
      const current = this._reservationInputValues.get(reservationId) ?? {};
      this._reservationInputValues.set(reservationId, {
        ...current,
        [fieldKey]: value
      });
    }
    async _handleActiveReservationUpdate(reservationId) {
      if (!this._hass || !reservationId) {
        return;
      }
      const reservation = this._activeReservations.find(
        (item) => item.reservation_id === reservationId
      );
      if (!reservation) {
        return;
      }
      const deviceId = reservation.device_id ?? "";
      if (!deviceId) {
        return;
      }
      if (this._reservationInFlight.has(reservationId)) {
        return;
      }
      this._reservationInFlight.add(reservationId);
      this._requestRender();
      const updateFields = this._reservationUpdateFieldsByDevice[deviceId] ?? [];
      const allowStart = updateFields.includes("start_time");
      const allowEnd = updateFields.includes("end_time");
      if (!allowStart && !allowEnd) {
        this._reservationInFlight.delete(reservationId);
        this._requestRender();
        return;
      }
      const inputOverrides = this._reservationInputValues.get(reservationId);
      const startValue = allowStart ? inputOverrides?.start !== void 0 ? inputOverrides.start.trim() : this._formatReservationDateTime(reservation.start_time) : "";
      const endValue = allowEnd ? inputOverrides?.end !== void 0 ? inputOverrides.end.trim() : this._formatReservationDateTime(reservation.end_time) : "";
      if (allowStart && !startValue || allowEnd && !endValue) {
        this._status = this._localize("message.start_end_required");
        this._statusType = "warning";
        this._reservationInFlight.delete(reservationId);
        this._requestRender();
        return;
      }
      const parseDate = (value) => {
        if (!value) {
          return null;
        }
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
      };
      const startDate = allowStart ? parseDate(startValue) : parseDate(reservation.start_time);
      const endDate = allowEnd ? parseDate(endValue) : parseDate(reservation.end_time);
      if (allowStart && !startDate || allowEnd && !endDate) {
        this._status = this._localize("message.start_end_required");
        this._statusType = "warning";
        this._reservationInFlight.delete(reservationId);
        this._requestRender();
        return;
      }
      if (startDate && endDate && endDate <= startDate) {
        this._status = this._localize("message.end_before_start");
        this._statusType = "warning";
        this._reservationInFlight.delete(reservationId);
        this._requestRender();
        return;
      }
      try {
        const serviceData = {
          device_id: deviceId,
          reservation_id: reservationId
        };
        if (allowStart && startDate) {
          serviceData.start_time = startDate.toISOString();
        }
        if (allowEnd && endDate) {
          serviceData.end_time = endDate.toISOString();
        }
        await this._hass.callService(
          DOMAIN,
          SERVICE_UPDATE_RESERVATION,
          serviceData
        );
      } catch (err) {
        this._status = this._errorMessage(
          err,
          "message.reservation_update_failed"
        );
        this._statusType = "warning";
        this._reservationInFlight.delete(reservationId);
        this._requestRender();
        return;
      }
      this._status = this._localize("message.reservation_updated");
      this._statusType = "success";
      this._reservationInputValues.delete(reservationId);
      this._reservationInFlight.delete(reservationId);
      this._activeReservationsLoadedFor = null;
      await this._maybeLoadActiveReservations(true);
    }
    async _handleActiveReservationEnd(reservationId) {
      if (!this._hass || !reservationId) {
        return;
      }
      const reservation = this._activeReservations.find(
        (item) => item.reservation_id === reservationId
      );
      const deviceId = reservation?.device_id ?? "";
      if (!deviceId) {
        return;
      }
      if (this._reservationInFlight.has(reservationId)) {
        return;
      }
      this._reservationInFlight.add(reservationId);
      this._requestRender();
      try {
        await this._hass.callService(DOMAIN, SERVICE_END_RESERVATION, {
          device_id: deviceId,
          reservation_id: reservationId
        });
      } catch (err) {
        this._status = this._errorMessage(
          err,
          "message.reservation_end_failed"
        );
        this._statusType = "warning";
        this._reservationInFlight.delete(reservationId);
        this._requestRender();
        return;
      }
      this._status = this._localize("message.reservation_ended");
      this._statusType = "success";
      this._reservationInputValues.delete(reservationId);
      this._reservationInFlight.delete(reservationId);
      this._activeReservationsLoadedFor = null;
      await this._maybeLoadActiveReservations(true);
    }
    _formatReservationDateTime(value) {
      if (!value) {
        return "";
      }
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return "";
      }
      return formatDateTimeLocal(date);
    }
    _localize(key, ..._args) {
      return localize(this._hass, key);
    }
    _errorMessage(err, fallbackKey) {
      return errorMessage(err, fallbackKey, this._localize.bind(this));
    }
    _getLoadingMessage() {
      const key = "message.home_assistant_loading";
      const message = localize(this._hass, key);
      return message === key ? "Home Assistant is loading. Not all data is available yet." : message;
    }
    async _getDomainDevices() {
      if (!this._hass) {
        return [];
      }
      if (this._devicesPromise) {
        return this._devicesPromise;
      }
      this._devicesPromise = this._hass.callWS({ type: "config/device_registry/list" }).then(
        (devices) => devices.filter(
          (device) => (device.identifiers ?? []).some(
            (identifier) => identifier[0] === DOMAIN
          )
        )
      ).finally(() => {
        this._devicesPromise = null;
      });
      return this._devicesPromise;
    }
    _isInEditor() {
      return isInEditor(this);
    }
  }
  CityVisitorParkingActiveCard.styles = i`
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
        gap: var(
          --entities-card-row-gap,
          var(--card-row-gap, var(--ha-space-2))
        );
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
        font-size: 0.85rem;
        color: var(--secondary-text-color);
      }
      .active-reservation-times {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
        gap: var(--ha-space-2);
      }
      .reservation-input {
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
    `;
  const globalHass = window.hass;
  const getCardText = (key, fallback) => {
    const value = localize(globalHass, key);
    return value === key ? fallback : value;
  };
  const registerCard = () => {
    registerCustomCard(
      CARD_TYPE,
      CityVisitorParkingActiveCard,
      getCardText("active_name", "City visitor parking active"),
      getCardText(
        "active_description",
        "Show your active visitor parking reservations."
      )
    );
  };
  registerCard();
  void ensureTranslations(globalHass).then(registerCard);
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
*/
