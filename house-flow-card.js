/* house-flow-card: Haus in der Mitte, beliebig viele Verbraucher drumherum (Flussansicht) */
const HFC_COLORS = ['#4fc3f7', '#81c784', '#ffb74d', '#ba68c8', '#f06292', '#4db6ac', '#fff176', '#a1887f', '#90a4ae', '#7986cb', '#e57373', '#aed581'];

const hfcEsc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[ch]));

class HouseFlowCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._sig = null;
  }

  static getStubConfig() {
    return {
      home: { entity: 'sensor.haus_leistung', name: 'Haus' },
      devices: [{ entity: 'sensor.steckdose_leistung', name: 'Steckdose', icon: 'mdi:power-socket-eu' }],
    };
  }

  setConfig(config) {
    if (!config || !config.home || !config.home.entity) throw new Error('home.entity fehlt: Bitte einen Sensor mit der Gesamtleistung des Hauses angeben.');
    if (!Array.isArray(config.devices) || config.devices.length === 0) throw new Error('devices fehlt oder ist leer: Bitte mindestens einen Verbraucher angeben.');
    config.devices.forEach((d, i) => {
      if (!d || !d.entity) throw new Error(`devices[${i}].entity fehlt`);
    });
    this._config = Object.assign({
      watt_threshold: 1000,
      active_threshold: 1,
      max_expected_power: 600,
      min_flow_rate: 0.75,
      max_flow_rate: 6,
      aspect_ratio: 1,
      max_width: 600,
      show_remaining: true,
      remaining_name: 'Sonstige',
    }, config);
    this._sig = null;
    this._build();
    if (this._hass) this._refresh();
  }

  getCardSize() {
    return 7;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._config) return;
    this._refresh();
  }

  _build() {
    const c = this._config;
    const n = c.devices.length;
    const ratio = Number(c.aspect_ratio) || 1;
    const W = 100 * ratio;
    const H = 100;
    const cx = W / 2;
    const cy = H / 2;
    const rD = 9;
    const rH = 14;
    const rx = W / 2 - rD - 3;
    const ry = H / 2 - rD - 7;
    const homeColor = hfcEsc(c.home.color || '#5c9ce6');

    let lines = '';
    let nodes = '';
    c.devices.forEach((d, i) => {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const x = cx + rx * Math.cos(a);
      const y = cy + ry * Math.sin(a);
      const dx = x - cx;
      const dy = y - cy;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const x1 = cx + ux * rH;
      const y1 = cy + uy * rH;
      const x2 = x - ux * rD;
      const y2 = y - uy * rD;
      const color = hfcEsc(d.color || HFC_COLORS[i % HFC_COLORS.length]);
      const above = y <= cy + 1;
      lines += `<line class="base" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`
        + `<line class="flow" data-i="${i}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="stroke:${color}"/>`;
      nodes += `<div class="node dev" data-i="${i}" data-entity="${hfcEsc(d.entity)}" style="left:${(x / W) * 100}%;top:${(y / H) * 100}%;width:${((2 * rD) / W) * 100}%;--c:${color}">`
        + `<span class="lbl ${above ? 'above' : 'below'}"></span>`
        + `<ha-icon></ha-icon><span class="val">–</span></div>`;
    });

    const title = c.title ? `<div class="title">${hfcEsc(c.title)}</div>` : '';
    const maxWidth = Number(c.max_width) || 600;
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card { padding: 8px 12px 12px; overflow: hidden; }
        .title { font-size: 1.1rem; font-weight: 500; padding: 8px 4px 0; color: var(--primary-text-color); }
        .wrap { position: relative; width: 100%; max-width: ${maxWidth}px; margin: 0 auto;
                aspect-ratio: ${W} / ${H}; container-type: inline-size; }
        svg { position: absolute; inset: 0; width: 100%; height: 100%; }
        .base { stroke: var(--divider-color, #888); stroke-width: 0.5; opacity: 0.55; }
        .flow { stroke-width: 1.7; stroke-linecap: round; stroke-dasharray: 0.01 4; opacity: 0;
                animation: hfc-flow var(--dur, 3s) linear infinite; transition: opacity .4s; }
        .flow.on { opacity: 1; }
        @keyframes hfc-flow { to { stroke-dashoffset: -4.01; } }
        .node { position: absolute; transform: translate(-50%, -50%); aspect-ratio: 1; border-radius: 50%;
                box-sizing: border-box; border: 2px solid var(--divider-color, #888);
                background: var(--ha-card-background, var(--card-background-color, #1c1c1c));
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                cursor: pointer; transition: border-color .4s, box-shadow .4s, opacity .4s; }
        .node.on { border-color: var(--c); box-shadow: 0 0 10px -1px var(--c); }
        .node.na { opacity: 0.45; }
        .node ha-icon { --mdc-icon-size: clamp(16px, 4.6cqw, 30px); color: var(--secondary-text-color); transition: color .4s; }
        .node.on ha-icon { color: var(--c); }
        .val { font-size: clamp(9px, 2.5cqw, 15px); line-height: 1.1; color: var(--primary-text-color); white-space: nowrap; }
        .lbl { position: absolute; left: 50%; transform: translateX(-50%); white-space: nowrap;
               font-size: clamp(9px, 2.4cqw, 14px); color: var(--secondary-text-color); max-width: 24cqw;
               overflow: hidden; text-overflow: ellipsis; text-align: center; pointer-events: none; }
        .lbl.above { bottom: calc(100% + 3px); }
        .lbl.below { top: calc(100% + 3px); }
        .home { --c: ${homeColor}; width: ${((2 * rH) / W) * 100}%; border-width: 3px; }
        .home ha-icon { --mdc-icon-size: clamp(22px, 6.5cqw, 42px); }
        .home .val { font-size: clamp(12px, 4cqw, 24px); font-weight: 500; }
        .home .rest { font-size: clamp(8px, 2cqw, 12px); color: var(--secondary-text-color); white-space: nowrap; }
      </style>
      <ha-card>
        ${title}
        <div class="wrap">
          <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${lines}</svg>
          ${nodes}
          <div class="node home" data-entity="${hfcEsc(c.home.entity)}" style="left:50%;top:50%">
            <ha-icon></ha-icon><span class="val">–</span><span class="rest"></span>
          </div>
        </div>
      </ha-card>`;

    this.shadowRoot.querySelectorAll('.node').forEach((el) => {
      el.addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('hass-more-info', {
          detail: { entityId: el.dataset.entity }, bubbles: true, composed: true,
        }));
      });
    });
  }

  // Leistung in Watt oder null, wenn nicht verfügbar / nicht numerisch / Entität fehlt.
  _power(id) {
    const s = this._hass && this._hass.states && this._hass.states[id];
    if (!s) return null;
    const raw = String(s.state).trim();
    if (raw === '') return null;
    const v = Number(raw);
    if (!Number.isFinite(v)) return null;
    const u = String((s.attributes && s.attributes.unit_of_measurement) || 'W').toLowerCase();
    if (u === 'kw') return v * 1000;
    if (u === 'mw') return v * 1e6;
    return v;
  }

  _fmt(w) {
    if (w === null) return '–';
    const lang = (this._hass && this._hass.locale && this._hass.locale.language) || 'de';
    const nf = (v, d) => v.toLocaleString(lang, { minimumFractionDigits: d, maximumFractionDigits: d });
    const abs = Math.abs(w);
    if (abs >= this._config.watt_threshold) return nf(w / 1000, 1) + ' kW';
    if (abs > 0 && abs < 10) return nf(w, 1) + ' W';
    return nf(w, 0) + ' W';
  }

  // Sekunden pro Durchlauf: max_flow_rate bei 0 W, min_flow_rate ab max_expected_power.
  _dur(w) {
    const c = this._config;
    const f = Math.min(1, Math.max(0, w / c.max_expected_power));
    return Math.round((c.max_flow_rate - f * (c.max_flow_rate - c.min_flow_rate)) * 100) / 100;
  }

  _name(cfg, id) {
    if (cfg.name) return cfg.name;
    const s = this._hass.states[id];
    return (s && s.attributes && s.attributes.friendly_name) || id;
  }

  _icon(cfg, id, fallback) {
    if (cfg.icon) return cfg.icon;
    const s = this._hass.states[id];
    return (s && s.attributes && s.attributes.icon) || fallback;
  }

  // Berechnet alle Anzeigewerte ohne DOM-Zugriff.
  _compute() {
    const c = this._config;
    let sum = 0;
    const devices = c.devices.map((d) => {
      const w = this._power(d.entity);
      if (w !== null && w > 0) sum += w;
      const active = w !== null && w >= c.active_threshold;
      return {
        watts: w,
        text: this._fmt(w),
        active,
        unavailable: w === null,
        dur: active ? this._dur(w) : null,
        name: this._name(d, d.entity),
        icon: this._icon(d, d.entity, 'mdi:flash'),
      };
    });
    const hw = this._power(c.home.entity);
    const remaining = hw === null ? null : Math.max(0, hw - sum);
    return {
      devices,
      home: {
        watts: hw,
        text: this._fmt(hw),
        active: hw !== null && hw >= c.active_threshold,
        unavailable: hw === null,
        icon: this._icon(c.home, c.home.entity, 'mdi:home-lightning-bolt'),
        remaining,
        remainingText: c.show_remaining && remaining !== null
          ? `${c.remaining_name}: ${this._fmt(remaining)}`
          : '',
      },
    };
  }

  _refresh() {
    const c = this._config;
    const ids = [c.home.entity].concat(c.devices.map((d) => d.entity));
    const sig = ids.map((id) => {
      const s = this._hass.states && this._hass.states[id];
      return s ? s.state + '|' + ((s.attributes && s.attributes.unit_of_measurement) || '') : 'x';
    }).join(';');
    if (sig === this._sig) return;
    this._sig = sig;

    const m = this._compute();
    this._model = m;
    const root = this.shadowRoot;

    m.devices.forEach((dm, i) => {
      const node = root.querySelector(`.dev[data-i="${i}"]`);
      const flow = root.querySelector(`.flow[data-i="${i}"]`);
      if (!node || !flow) return;
      node.classList.toggle('on', dm.active);
      node.classList.toggle('na', dm.unavailable);
      flow.classList.toggle('on', dm.active);
      if (dm.active) flow.style.setProperty('--dur', dm.dur + 's');
      node.querySelector('.val').textContent = dm.text;
      node.querySelector('.lbl').textContent = dm.name;
      node.querySelector('ha-icon').setAttribute('icon', dm.icon);
    });

    const home = root.querySelector('.home');
    home.classList.toggle('on', m.home.active);
    home.classList.toggle('na', m.home.unavailable);
    home.setAttribute('title', this._name(c.home, c.home.entity));
    home.querySelector('.val').textContent = m.home.text;
    home.querySelector('ha-icon').setAttribute('icon', m.home.icon);
    home.querySelector('.rest').textContent = m.home.remainingText;
  }
}

if (!customElements.get('house-flow-card')) customElements.define('house-flow-card', HouseFlowCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === 'house-flow-card')) {
  window.customCards.push({
    type: 'house-flow-card',
    name: 'House Flow Card',
    description: 'Haus in der Mitte, beliebig viele Verbraucher mit Leistung und animiertem Fluss',
  });
}
