export function tireContactReading(wheel) {
  if (!(wheel.load > 0)) return {load: 0, lateral: 0};
  return {load: wheel.load, lateral: wheel.lateralForceN};
}

export function createTireReadout(host) {
  const rows = ['앞 왼쪽', '앞 오른쪽', '뒤 왼쪽', '뒤 오른쪽'].map(label => {
    const item = document.createElement('div');
    const name = document.createElement('span'), reading = document.createElement('b');
    name.textContent = label;
    item.append(name, reading);
    host.append(item);
    return {item, reading};
  });
  return sim => {
    sim.wheels.forEach((wheel, i) => {
      const {load, lateral} = tireContactReading(wheel);
      const values = rows[i];
      values.item.classList.toggle('airborne', load <= 0);
      values.reading.textContent = load > 0
        ? (load / 1000).toFixed(2) + ' / ' + (Math.abs(lateral) < 5 ? '0.00' : (lateral > 0 ? '+' : '−') + (Math.abs(lateral) / 1000).toFixed(2))
        : '비접지';
    });
  };
}
