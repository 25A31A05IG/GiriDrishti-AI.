// src/components/Dashboard.jsx

import React, { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import Stats from './Stats';
import RiskMap from './RiskMap';
import Flow from './Flow';
import { sameId, riskClass } from '../App';

export default function Dashboard({
  locations = [],
  counts: externalCounts,
  avg,
  alerts = [],
  onSelect,
  setPage,
  selectedLocation
}) {
  // Purely dynamic stats tally matching the server's telemetry
  const synchronizedCounts = useMemo(() => {
    let critical = 0;
    let high = 0;
    let moderate = 0;
    let low = 0;

    locations.forEach(item => {
      const lvl = String(item?.riskLevel || 'LOW').toUpperCase();
      if (lvl === 'CRITICAL') critical += 1;
      else if (lvl === 'HIGH') high += 1;
      else if (lvl === 'MODERATE') moderate += 1;
      else low += 1;
    });

    return {
      CRITICAL: critical,
      HIGH: high,
      MODERATE: moderate,
      LOW: low,
      critical,
      high,
      moderate,
      low,
      Critical: critical,
      High: high,
      Moderate: moderate,
      Low: low
    };
  }, [locations]);

  const handleAlertClick = (alert) => {
    const matched = locations.find(x => 
      sameId(x.id, alert.locationId) || 
      sameId(x.id, alert.id) ||
      (Math.abs(Number(x.lat) - Number(alert.lat)) < 0.08 && Math.abs(Number(x.lng) - Number(alert.lng)) < 0.08)
    );

    onSelect?.(matched || alert);
    setPage?.('map');
  };

  return (
    <>
      <div className="hero">
        <div>
          <p className="eyebrow">NORTH EASTERN REGION • REAL-TIME AI RISK INTELLIGENCE</p>
          <h1>Landslide Risk<br /><span>Command Center</span></h1>
          <p>Autonomous AI evaluating dynamic rainfall, pore-water pressure, and slope gradients updated every minute.</p>
        </div>

        <div className="heroBadge">
          <div className="pulse"><span /></div>
          <b>AI INGESTION ACTIVE</b>
          <small>60s Continuous Telemetry</small>
        </div>
      </div>

      <Stats counts={synchronizedCounts} avg={avg} />

      <div className="grid2">
        <section className="card mapCard">
          <div className="cardHead">
            <div>
              <h2>Regional Risk Map</h2>
              <p>Live telemetry stations across Northeast India.</p>
            </div>
            <button onClick={() => setPage('map')} className="textBtn">
              Open full map <ChevronRight size={16} />
            </button>
          </div>

          <RiskMap
            locations={locations}
            onSelect={onSelect}
            selectedLocation={selectedLocation}
            compact
          />
        </section>

        <section className="card">
          <div className="cardHead">
            <div>
              <h2>Priority Alerts ({alerts.length})</h2>
              <p>Actively breached thresholds from live sensors.</p>
            </div>
            <button onClick={() => setPage('alerts')} className="textBtn">
              View all <ChevronRight size={16} />
            </button>
          </div>

          <div className="alertList">
            {alerts.length === 0 ? (
              <p className="muted">No stations currently in HIGH or CRITICAL alert state.</p>
            ) : (
              alerts.slice(0, 5).map(alert => (
                <div
                  className="alertRow"
                  key={alert.id}
                  onClick={() => handleAlertClick(alert)}
                  style={{ cursor: 'pointer' }}
                >
                  <span className={`riskPill ${riskClass(alert.riskLevel)}`}>
                    {alert.riskLevel}
                  </span>

                  <div>
                    <b>{alert.name || alert.location}</b>
                    <small>{alert.state}</small>
                  </div>

                  <strong>{Number(alert.riskScore || 0).toFixed(1)}%</strong>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="card how">
        <div className="cardHead">
          <div>
            <h2>Continuous Ingestion Workflow</h2>
            <p>Data cycle operating every 60 seconds.</p>
          </div>
        </div>

        <div className="flow">
          <Flow n="01" t="Ingest" d="Live 24h precipitation, soil moisture & DEM slope" />
          <Flow n="02" t="Infer" d="Nonlinear pore-pressure and shear stress inference" />
          <Flow n="03" t="Detect" d="Evaluate 1-minute deltas against warning thresholds" />
          <Flow n="04" t="Dispatch" d="Dynamic broadcast to Map, Alerts and Dashboard" />
        </div>
      </section>
    </>
  );
}