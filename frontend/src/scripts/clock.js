(function(){
  const svg = document.querySelector('.d20clock');
  if(!svg) return;

  const hour = svg.querySelector('.hour');
  const minute = svg.querySelector('.minute');

  function setTime(){
    const now = new Date();
    const m = now.getMinutes();
    const h = now.getHours() % 12 + m/60;
    const mDeg = m * 6;          // 360 / 60
    const hDeg = h * 30;         // 360 / 12
    minute.setAttribute('transform', `rotate(${mDeg} 32 32)`);
    hour.setAttribute('transform', `rotate(${hDeg} 32 32)`);
  }

  setTime();
  // tick at the start of each minute
  const msToNext = 60000 - (Date.now() % 60000);
  setTimeout(function(){
    setTime();
    setInterval(setTime, 60000);
  }, msToNext);
})();
