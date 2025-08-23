/* global window */
(function () {
  'use strict';

  const MAPS = {
    viridis:  [[0,'#440154'],[0.25,'#3b528b'],[0.5,'#21918c'],[0.75,'#5ec962'],[1,'#fde725']],
    plasma:   [[0,'#0d0887'],[0.25,'#6a00a8'],[0.5,'#b12a90'],[0.75,'#e16462'],[1,'#fca636']],
    cividis:  [[0,'#00204c'],[0.25,'#2c3e70'],[0.5,'#606c7c'],[0.75,'#9da472'],[1,'#f9e721']],
    twilight: [[0,'#1e1745'],[0.25,'#373a97'],[0.5,'#73518c'],[0.75,'#b06b6d'],[1,'#d3c6b9']],
    lava:     [[0,'#000004'],[0.2,'#320a5a'],[0.4,'#781c6d'],[0.6,'#bb3654'],[0.8,'#ed6925'],[1,'#fcffa4']]
  };

  function hexToRgb(hex) {
    const m = /^#?([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})$/i.exec(hex);
    return m ? { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) } : { r:0,g:0,b:0 };
  }
  function rgbToCss({r,g,b}) { return `rgb(${r}, ${g}, ${b})`; }

  function interpStops(stops, t) {
    if (t <= 0) return hexToRgb(stops[0][1]);
    if (t >= 1) return hexToRgb(stops[stops.length - 1][1]);
    for (let i=0;i<stops.length-1;i++) {
      const [t0,c0] = stops[i], [t1,c1] = stops[i+1];
      if (t >= t0 && t <= t1) {
        const k = (t - t0) / (t1 - t0);
        const a = hexToRgb(c0), b = hexToRgb(c1);
        return { r: Math.round(a.r + (b.r-a.r)*k), g: Math.round(a.g + (b.g-a.g)*k), b: Math.round(a.b + (b.b-a.b)*k) };
      }
    }
    return hexToRgb(stops[stops.length - 1][1]);
  }

  function colorAt(mapName, t) {
    const stops = MAPS[mapName] || MAPS.viridis;
    return rgbToCss(interpStops(stops, Math.max(0, Math.min(1, t))));
  }

  // compression: when total>=11, everything <= total-10 collapses to black
  function shadeForCount(count, total, mapName) {
    const n = total || 0;
    const threshold = n >= 11 ? (n - 10) : 0;
    if (n <= 0) return '#0a0a0a';
    if (count <= threshold) return '#0a0a0a';

    const denom = Math.max(1, n - threshold);
    const t0 = (count - threshold) / denom;
    const t = mapName === 'twilight' ? t0 : Math.pow(t0, 0.85); // mild gamma except twilight
    return colorAt(mapName, t);
  }

  window.colormap = { colorAt, shadeForCount };
})();
