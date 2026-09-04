import React from 'react';
import { Gauge } from 'lucide-react';

function Stat({ n, label, c }) {
  return (
    <div className={`stat ${c}`}>
      <div>
        <strong>{n}</strong>
        <span>{label} points</span>
      </div>
    </div>
  );
}

export default function Stats({ counts = {}, avg = 0 }) {
  return (
    <div className="stats">
      <Stat n={counts.critical} label="Critical" c="critical" />
      <Stat n={counts.high} label="High" c="high" />
      <Stat n={counts.moderate} label="Moderate" c="moderate" />
      <Stat n={counts.low} label="Low" c="low" />

      <div className="stat ai">
        <div className="statIcon">
          <Gauge />
        </div>

        <div>
          <strong>{avg}%</strong>
          <span>Regional avg.</span>
        </div>
      </div>
    </div>
  );
}
