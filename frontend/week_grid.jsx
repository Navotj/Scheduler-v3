import React, { useState } from 'react';
import './week_grid.css';

const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const hours = Array.from({ length: 14 }, (_, i) => i + 8); // 08:00 to 21:00

export default function WeekGrid() {
  const [selected, setSelected] = useState(new Set());
  const [mode, setMode] = useState('add'); // or 'subtract'
  const [weekOffset, setWeekOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const toggleCell = (key) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (mode === 'add') next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const getWeekStart = () => {
    const now = new Date();
    const start = new Date(now);
    start.setDate(now.getDate() - now.getDay() + (weekOffset * 7));
    start.setHours(0, 0, 0, 0);
    return start;
  };

  const handleMouseDown = (key) => {
    setIsDragging(true);
    toggleCell(key);
  };

  const handleMouseEnter = (key) => {
    if (isDragging) toggleCell(key);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const weekStart = getWeekStart();

  return (
    <div className="week-grid" onMouseLeave={handleMouseUp}>
      <div className="controls">
        <button onClick={() => setWeekOffset(weekOffset - 1)}>Previous Week</button>
        <button onClick={() => setWeekOffset(weekOffset + 1)}>Next Week</button>
        <button onClick={() => setMode(mode === 'add' ? 'subtract' : 'add')}>
          Mode: {mode}
        </button>
        <button onClick={() => console.log(Array.from(selected))}>Save</button>
      </div>
      <table className="grid">
        <thead>
          <tr>
            <th></th>
            {days.map((d, i) => {
              const day = new Date(weekStart);
              day.setDate(day.getDate() + i);
              return <th key={d}>{d}<br />{day.toLocaleDateString()}</th>;
            })}
          </tr>
        </thead>
        <tbody>
          {hours.map(h => (
            <tr key={h}>
              <td>{String(h).padStart(2, '0')}:00</td>
              {days.map((_, i) => {
                const cellDate = new Date(weekStart);
                cellDate.setDate(cellDate.getDate() + i);
                cellDate.setHours(h, 0, 0, 0);
                const key = cellDate.getTime();
                return (
                  <td
                    key={key}
                    className={selected.has(key) ? 'selected' : ''}
                    onMouseDown={() => handleMouseDown(key)}
                    onMouseEnter={() => handleMouseEnter(key)}
                    onMouseUp={handleMouseUp}
                  ></td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
