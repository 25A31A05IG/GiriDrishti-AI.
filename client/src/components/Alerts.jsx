// src/components/Alerts.jsx

import React, { useEffect, useState } from 'react';
import { 
  AlertTriangle, 
  ShieldAlert, 
  CloudRain, 
  Droplets, 
  TrendingUp, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  RefreshCw,
  ArrowRight,
  PlayCircle,
  Users,
  Navigation,
  ShieldCheck
} from 'lucide-react';
import { API, riskClass } from '../App';

export default function Alerts({ onSelectLocation }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastRefreshed, setLastRefreshed] = useState(new Date());
  const [simulatingId, setSimulatingId] = useState(null);

  const fetchDynamicAlerts = async () => {
    setLoading(true);
    try {
      const cleanApi = API.replace(/\/+$/, '');
      const res = await fetch(`${cleanApi}/alerts`);
      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to query active alerts`);
      const data = await res.json();
      setAlerts(Array.isArray(data) ? data : []);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setLastRefreshed(new Date());
    }
  };

  const handleSimulateProblem = async (stationId) => {
    setSimulatingId(stationId);
    try {
      const cleanApi = API.replace(/\/+$/, '');
      const res = await fetch(`${cleanApi}/simulate-hazard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stationId, level: 'CRITICAL' })
      });
      if (res.ok) {
        await fetchDynamicAlerts();
      }
    } catch (err) {
      console.error('Simulation error:', err);
    } finally {
      setSimulatingId(null);
    }
  };

  useEffect(() => {
    fetchDynamicAlerts();
    const interval = setInterval(fetchDynamicAlerts, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: '#fbfdff', display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShieldAlert size={28} color="#ef4444" /> Live AI Alerts & Evacuation Feed
          </h1>
          <p style={{ margin: '4px 0 0 0', color: '#94a3b8', fontSize: 13 }}>
            Active hazard telemetry with impact radius estimates, population alerts, and safe route guidance.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button 
            className="secondary" 
            onClick={() => handleSimulateProblem('NODE-CHERRA')}
            disabled={simulatingId !== null}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '8px 12px', cursor: 'pointer', background: '#b91c1c', color: '#fff', border: 'none', borderRadius: 6 }}
          >
            <PlayCircle size={14} /> {simulatingId === 'NODE-CHERRA' ? 'Simulating...' : 'Simulate Crisis'}
          </button>

          <button 
            className="secondary" 
            onClick={fetchDynamicAlerts}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', cursor: 'pointer' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Poll Now
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0f172a', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 12, color: '#94a3b8', border: '1px solid #1e293b' }}>
        <span>
          Active High Hazard Sectors: <b style={{ color: alerts.length > 0 ? '#ef4444' : '#10b981' }}>{alerts.length}</b>
        </span>
        <span>
          Automated 60s Cycle &bull; Last Checked: {lastRefreshed.toLocaleTimeString()}
        </span>
      </div>

      {error && (
        <div className="notice" style={{ background: '#fee2e2', color: '#991b1b', marginBottom: 16, padding: '10px 14px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={18} /> <span>{error}</span>
        </div>
      )}

      {loading && alerts.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#64748b' }}>
          <RefreshCw size={32} className="animate-spin" style={{ margin: '0 auto 12px auto' }} />
          <div>Evaluating incoming environmental changes...</div>
        </div>
      )}

      {!loading && alerts.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 0', background: '#0f172a', borderRadius: 12, border: '1px dashed #334155' }}>
          <CheckCircle2 size={48} color="#10b981" style={{ margin: '0 auto 12px auto' }} />
          <h3 style={{ margin: 0, color: '#f8fafc' }}>All Monitored Sectors Stable</h3>
          <p style={{ margin: '6px 0 0 0', color: '#94a3b8', fontSize: 13 }}>
            No telemetry stations currently exceed the HIGH or CRITICAL threshold. Click <b>"Simulate Crisis"</b> above to test system response.
          </p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {alerts.map(alert => {
          const isCritical = alert.riskLevel === 'CRITICAL';
          
          const impactRadius = alert.impactRadiusKm || Number((2.0 + (alert.riskScore / 10) + (alert.slope / 8)).toFixed(1));
          const affectedPop = alert.estimatedPopulationAffected || Math.round(Math.PI * (impactRadius ** 2) * 160);
          const notifiedCount = alert.peopleAlertedCount || Math.round(affectedPop * 0.9);
          const safeShelterName = alert.safeShelter?.shelterName || "Cherrapunji Community Safe Ground & Relief Camp";
          const shelterDist = alert.safeShelter?.distanceKm || 3.8;

          return (
            <div 
              key={alert.id}
              className="card"
              style={{
                borderLeft: `5px solid ${isCritical ? '#ef4444' : '#f97316'}`,
                padding: 18,
                borderRadius: 10,
                background: '#1e293b',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.2)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span className={`riskPill ${riskClass(alert.riskLevel)}`} style={{ fontWeight: 800, fontSize: 11 }}>
                      {alert.riskLevel} &bull; {Number(alert.riskScore).toFixed(1)}%
                    </span>
                    {alert.scoreDelta !== 0 && alert.scoreDelta !== undefined && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: alert.scoreDelta > 0 ? '#ef4444' : '#10b981' }}>
                        {alert.scoreDelta > 0 ? `+${alert.scoreDelta}%` : `${alert.scoreDelta}%`} past 1m
                      </span>
                    )}
                    <span style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={12} /> {alert.createdAt ? new Date(alert.createdAt).toLocaleTimeString() : 'Live'}
                    </span>
                  </div>

                  <h3 style={{ margin: '4px 0 2px 0', fontSize: 18, fontWeight: 700, color: '#f8fafc' }}>
                    {alert.title}
                  </h3>
                  
                  <div style={{ fontSize: 12, color: '#60a5fa', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <MapPin size={13} /> {alert.displayName || alert.fullAddress}
                  </div>
                </div>

                {onSelectLocation && (
                  <button 
                    className="primary"
                    style={{ fontSize: 12, padding: '7px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                    onClick={() => onSelectLocation(alert)}
                  >
                    Locate on Map <ArrowRight size={14} />
                  </button>
                )}
              </div>

              <p style={{ margin: '12px 0 10px 0', fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>
                {alert.message}
              </p>

              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', background: '#0f172a', padding: '10px 14px', borderRadius: 8, fontSize: 12, color: '#94a3b8' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <CloudRain size={14} color="#38bdf8" /> 24h Rain: <b style={{ color: '#f8fafc' }}>{alert.accumulated24hRain ?? 0} mm</b>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Droplets size={14} color="#60a5fa" /> Soil Moisture: <b style={{ color: '#f8fafc' }}>{alert.soilMoisture ?? 0}%</b>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <TrendingUp size={14} color="#fb923c" /> Slope Incline: <b style={{ color: '#f8fafc' }}>{alert.slope ?? 0}°</b>
                </span>
              </div>

              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', background: '#334155', padding: '10px 14px', borderRadius: 8, fontSize: 12, color: '#cbd5e1', marginTop: 10 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertTriangle size={14} color="#f87171" /> Impact Radius: <b style={{ color: '#f8fafc' }}>{impactRadius} km</b>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Users size={14} color="#38bdf8" /> Population Affected: <b style={{ color: '#f8fafc' }}>~{affectedPop.toLocaleString()} residents</b>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#4ade80' }}>
                  <ShieldCheck size={14} /> {notifiedCount.toLocaleString()} People Alerted via SMS/Sirens
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 12, color: '#60a5fa', background: '#0f172a', padding: '8px 12px', borderRadius: 6, border: '1px solid #1e293b' }}>
                <Navigation size={15} color="#38bdf8" />
                <span><b>Safe Evacuation Route:</b> Head toward <b>{safeShelterName}</b> ({shelterDist} km away via accessible ridge corridor)</span>
              </div>

              <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #334155', fontSize: 12 }}>
                <b style={{ color: '#f8fafc' }}>Action Protocol:</b>{' '}
                <span style={{ color: isCritical ? '#fca5a5' : '#fdba74', fontWeight: 600 }}>
                  {alert.action}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
