// Othello board for the browser. The black disc with eyes and the green board come from
// the "Grok Bot Othello stream" game in kusoge-arcade (MIT).
export function faceSVG(state = 'normal') {
  const R = 48, cx = 50, cy = 50;
  const eye = (dx, dy, w, h) => `<rect x="${cx + dx - w / 2}" y="${cy + dy - h / 2}" width="${w}" height="${h}" rx="${w / 2}" fill="#fff" transform="rotate(-28 ${cx + dx} ${cy + dy})"/>`;
  let eyes;
  if (state === 'think') eyes = eye(.20 * R, -.56 * R, .14 * R, .36 * R) + eye(.55 * R, -.60 * R, .12 * R, .33 * R) + [0, 1, 2].map(i => `<circle cx="${cx - .57 * R + i * .17 * R}" cy="${cy + .38 * R}" r="${.05 * R}" fill="#fff"/>`).join('');
  else if (state === 'happy') eyes = `<path d="M${cx + .17 * R} ${cy - .45 * R} q${.1 * R} ${-.2 * R} ${.2 * R} 0 M${cx + .5 * R} ${cy - .5 * R} q${.1 * R} ${-.2 * R} ${.2 * R} 0" stroke="#fff" stroke-width="${.085 * R}" fill="none" stroke-linecap="round"/>`;
  else eyes = eye(.25 * R, -.50 * R, .14 * R, .30 * R) + eye(.59 * R, -.54 * R, .12 * R, .28 * R);
  return `<svg viewBox="0 0 100 100"><circle cx="${cx}" cy="${cy}" r="${R}" fill="#050505"/>${eyes}</svg>`;
}
const WHITE_SVG = '<svg viewBox="0 0 100 100"><defs><radialGradient id="wg" cx="40%" cy="35%"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#d9d9d9"/></radialGradient></defs><circle cx="50" cy="50" r="48" fill="url(#wg)"/></svg>';
const BLACK_SVG = faceSVG();

export const sideDisc = side => (side === 'black' ? BLACK_SVG : WHITE_SVG);

export function mount(el, { onMove }) {
  let size = 0, cells = [], prev = null;

  function build(n) {
    size = n; el.innerHTML = ''; cells = [];
    el.style.gridTemplateColumns = `repeat(${n},1fr)`;
    el.style.gridTemplateRows = `repeat(${n},1fr)`;
    el.style.setProperty('--disc', Math.round((480 / n) * .84) + 'px');
    for (let i = 0; i < n * n; i++) {
      const c = document.createElement('button');
      c.className = 'cell'; c.type = 'button';
      c.setAttribute('aria-label', String.fromCharCode(97 + (i % n)) + (Math.floor(i / n) + 1));
      c.appendChild(Object.assign(document.createElement('div'), { className: 'disc' }));
      c.addEventListener('click', () => { if (c.classList.contains('hint')) onMove(c.getAttribute('aria-label')); });
      el.appendChild(c); cells.push(c);
    }
    prev = null;
  }

  return {
    render(pub) {
      const st = pub.match.state;
      if (st.size !== size) build(st.size);
      const last = st.history.filter(h => h.move !== 'pass').at(-1);
      const flipped = new Set(prev && last ? last.flipped : []);
      cells.forEach((c, i) => {
        const v = st.cells[i], coord = c.getAttribute('aria-label');
        const d = c.firstChild;
        if (!prev || prev[i] !== v) {
          d.innerHTML = v ? sideDisc(v) : '';
          if (prev && v) { d.classList.remove('flip', 'place'); void d.offsetWidth; d.classList.add(flipped.has(coord) ? 'flip' : 'place'); }
        }
        c.classList.toggle('last', !!last && last.move === coord);
        c.classList.toggle('hint', pub.legal.includes(coord));
      });
      prev = st.cells.slice();
    },
  };
}

export function summary(pub) {
  const st = pub.match.state;
  const empty = st.cells.filter(v => !v).length;
  return `残り ${empty} マス`;
}
