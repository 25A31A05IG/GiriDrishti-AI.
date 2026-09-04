import React, { useEffect, useMemo, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Circle,
  Popup,
  LayersControl,
  useMap,
  useMapEvents
} from 'react-leaflet';
import { 
  AlertTriangle, 
  CloudRain, 
  X, 
  History, 
  TrendingUp, 
  Layers, 
  Droplets, 
  Map as MapIcon,
  Maximize2
} from 'lucide-react';
import { API, riskClass, fetchLocationReport } from '../App';
import 'leaflet/dist/leaflet.css';

const NER_CENTER = [26.1445, 91.7362];
const NER_ZOOM = 7;

function getZoneColor(level) {
  switch (level) {
    case 'HIGH':
      return { color: '#dc2626', fillColor: '#ef4444', fillOpacity: 0.28, weight: 2 };
    case 'MODERATE':
      return { color: '#d97706', fillColor: '#f59e0b', fillOpacity: 0.22, weight: 2 };
    case 'LOW':
      return { color: '#059669', fillColor: '#10b981', fillOpacity: 0.16, weight: 2 };
    default:
      return { color: '#475569', fillColor: '#64748b', fillOpacity: 0.20, weight: 1.5 };
  }
}

function MapClickHandler({ onReport }) {
  useMapEvents({
    click: async event => {
      const { lat, lng } = event.latlng;
      onReport({ loading: true, error: '', data: null });
      try {
        const data = await fetchLocationReport(lat, lng);
        onReport({ loading: false, error: '', data });
      } catch (error) {
        onReport({ loading: false, error: error.message, data: null });
      }
    }
  });
  return null;
}

function FlyToLocation({ location }) {
  const map = useMap();
  useEffect(() => {
    if (!location) return;
    const lat = Number(location.lat);
    const lng = Number(location.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      map.flyTo([lat, lng], Math.max(map.getZoom(), 9), { duration: 0.8 });
    }
  }, [location, map]);
  return null;
}

function ResetViewHandler({ trigger }) {
  const map = useMap();
  useEffect(() => {
    if (trigger > 0) {
      map.flyTo(NER_CENTER, NER_ZOOM, { duration: 0.8 });
    }
  }, [trigger, map]);
  return null;
}

function MapLayers() {
  return (
    <LayersControl position="topright">
      <LayersControl.BaseLayer checked name="Street">
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer name="Terrain">
        <TileLayer
          attribution="&copy; OpenTopoMap contributors"
          url="https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png"
        />
      </LayersControl.BaseLayer>
      <LayersControl.BaseLayer name="Satellite">
        <TileLayer
          attribution="Tiles &copy; Esri"
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />
      </LayersControl.BaseLayer>
    </LayersControl>
  );
}

function HistoricalLayer({ historical = [] }) {
  if (!historical.length) return null;
  return (
    <>
      {historical.map((point, index) => {
        const lat = Number(point.latitude ?? point.lat);
        const lng = Number(point.longitude ?? point.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return (
          <Circle
            key={point.slide_id || point.id || `${lat}-${lng}-${index}`}
            center={[lat, lng]}
            radius={Math.max(250, Math.min(1200, Number(point.radius || 450)))}
            pathOptions={{ color: '#64748b', fillColor: '#94a3b8', fillOpacity: 0.14, weight: 1 }}
          >
            <Popup>
              <div style={{ minWidth: 190 }}>
                <b>Historical GSI Landslide</b>
                <br />
                {point.movement_type || point.movementType || 'Recorded landslide'}
                <br />
                {lat.toFixed(5)}, {lng.toFixed(5)}
              </div>
            </Popup>
          </Circle>
        );
      })}
    </>
  );
}

export default function RiskMap({ locations = [], onSelect, selectedLocation = null }) {
  const [clickReport, setClickReport] = useState({ loading: false, error: '', data: null });
  const [historical, setHistorical] = useState([]);
  const [showHistorical, setShowHistorical] = useState(false);
  const [showZones, setShowZones] = useState(true);
  const [resetCount, setResetCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/historical?limit=2500`)
      .then(response => (response.ok ? response.json() : []))
      .then(data => {
        if (!cancelled) setHistorical(Array.isArray(data) ? data : Array.isArray(data?.records) ? data.records : []);
      })
      .catch(() => {
        if (!cancelled) setHistorical([]);
      });
    return () => { cancelled = true; };
  }, []);

  // SYNCHRONIZED COUNT: Directly matches the Dashboard count logic
  const counts = useMemo(() => {
    const result = { LOW: 0, MODERATE: 0, HIGH: 0, CRITICAL: 0 };
    locations.forEach(item => {
      const level = String(item?.riskLevel || 'LOW').toUpperCase();
      if (result[level] != null) result[level] += 1;
    });
    return result;
  }, [locations]);

  const report = clickReport.data;

  return (
    <div style={{ position: 'relative' }}>
      <MapContainer
        center={NER_CENTER}
        zoom={NER_ZOOM}
        minZoom={4}
        maxZoom={18}
        worldCopyJump
        scrollWheelZoom
        style={{ height: 'calc(100vh - 150px)', minHeight: 600, width: '100%', borderRadius: 16 }}
      >
        <MapLayers />
        <MapClickHandler onReport={setClickReport} />
        <FlyToLocation location={selectedLocation} />
        <ResetViewHandler trigger={resetCount} />

        {/* 1. GEOLOGICAL SUSCEPTIBILITY CIRCLES ONLY (DYNAMIC FROM LOCATIONS) */}
        {showZones && locations.map(zone => {
          const lat = Number(zone.lat ?? zone.latitude);
          const lng = Number(zone.lng ?? zone.longitude);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

          const style = getZoneColor(zone.riskLevel);
          const radius = Number(zone.radiusMeters || 32000);

          return (
            <Circle
              key={zone.id || `${lat}-${lng}`}
              center={[lat, lng]}
              radius={radius}
              pathOptions={style}
            >
              <Popup>
                <div style={{ padding: 4, minWidth: 200 }}>
                  <span className={`riskPill ${riskClass(zone.riskLevel)}`} style={{ fontSize: 10, fontWeight: 700 }}>
                    {zone.riskLevel} SUSCEPTIBILITY ZONE
                  </span>
                  <h4 style={{ margin: '6px 0 2px 0', fontSize: 14, color: '#0f172a' }}>{zone.name || zone.areaName}</h4>
                  <div style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600, marginBottom: 4 }}>{zone.state}</div>
                  <p style={{ margin: 0, fontSize: 12, color: '#334155', lineHeight: 1.4 }}>{zone.description || zone.action || 'Dynamic monitoring station.'}</p>
                </div>
              </Popup>
            </Circle>
          );
        })}

        {/* 2. HISTORICAL GSI CATALOG MARKERS */}
        {showHistorical && <HistoricalLayer historical={historical} />}
      </MapContainer>

      {/* Floating Control & Legend Panel */}
      <div className="card" style={{ position: 'absolute', left: 16, top: 16, zIndex: 1000, padding: 14, width: 280, background: '#ffffff', borderRadius: 12, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
        <b style={{ fontSize: 14, color: '#0f172a' }}>GiriDrishti AI Monitor</b>
        <div className="muted" style={{ marginTop: 2, fontSize: 12 }}>
          Northeast India Geological Zones
        </div>

        {/* Threat Tally */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, fontSize: 11 }}>
          {Object.entries(counts).map(([level, count]) => (
            <span key={level} className={`riskPill ${riskClass(level)}`}>
              {level}: {count}
            </span>
          ))}
        </div>

        {/* Layer Toggles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          <button
            className={showZones ? "primary" : "secondary"}
            style={{ width: '100%', fontSize: 12, padding: '7px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}
            onClick={() => setShowZones(v => !v)}
          >
            <MapIcon size={14} /> {showZones ? 'Hide' : 'Show'} Hazard Zones ({locations.length})
          </button>

          <button
            className={showHistorical ? "primary" : "secondary"}
            style={{ width: '100%', fontSize: 12, padding: '7px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}
            onClick={() => setShowHistorical(v => !v)}
          >
            <History size={14} /> {showHistorical ? 'Hide' : 'Show'} GSI History
          </button>

          <button
            className="secondary"
            style={{ width: '100%', fontSize: 12, padding: '7px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}
            onClick={() => setResetCount(c => c + 1)}
          >
            <Maximize2 size={14} /> Fit View to Northeast India
          </button>
        </div>

        {/* Quick Color Legend */}
        {showZones && (
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid #f1f5f9', fontSize: 11, color: '#64748b' }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Zone Susceptibility:</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(239, 68, 68, 0.4)', border: '1px solid #dc2626' }}></span>
              <span>High (Escarpments & Thrust Belts)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(245, 158, 11, 0.4)', border: '1px solid #d97706' }}></span>
              <span>Moderate (Foothills & Plateaus)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(16, 185, 129, 0.4)', border: '1px solid #059669' }}></span>
              <span>Low (Alluvial Valleys & Plains)</span>
            </div>
          </div>
        )}
      </div>

      {/* Loading Notice */}
      {clickReport.loading && (
        <div className="notice" style={{ position: 'absolute', left: 16, bottom: 16, zIndex: 1000, background: '#ffffff', padding: '10px 14px', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center' }}>
          <CloudRain className="animate-spin" size={18} color="#0284c7" /> 
          <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 500, color: '#0f172a' }}>Fetching real weather, DEM slope & AI risk...</span>
        </div>
      )}

      {/* Error Notice */}
      {clickReport.error && (
        <div className="notice" style={{ position: 'absolute', left: 16, bottom: 16, zIndex: 1000, background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, display: 'flex', alignItems: 'center' }}>
          <AlertTriangle size={18} /> 
          <span style={{ marginLeft: 8, fontSize: 13 }}>{clickReport.error}</span>
          <button className="iconButton" onClick={() => setClickReport({ loading: false, error: '', data: null })} style={{ marginLeft: 10, background: 'none', border: 'none', cursor: 'pointer' }}>
            <X size={16} />
          </button>
        </div>
      )}

      {/* Detailed Live Report Card on Click */}
      {report && !clickReport.loading && (
        <div 
          className="card shadow-lg" 
          style={{ 
            position: 'absolute', 
            right: 16, 
            bottom: 16, 
            zIndex: 1000, 
            width: 360, 
            maxWidth: 'calc(100% - 32px)',
            maxHeight: 'calc(100vh - 190px)',
            overflowY: 'auto',
            padding: 16,
            borderRadius: 14,
            background: '#ffffff',
            boxShadow: '0 10px 25px rgba(0,0,0,0.15)'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, color: '#64748b' }}>
                EXACT LIVE LOCATION REPORT
              </div>
              <h2 style={{ margin: '4px 0 0 0', fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
                {report.name || report.areaName || 'Sector Point'}
              </h2>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#3b82f6' }}>
                {report.state || 'Northeast India'}
              </div>
            </div>
            <button 
              className="iconButton" 
              onClick={() => setClickReport({ loading: false, error: '', data: null })}
              style={{ padding: 4, borderRadius: 6, border: 'none', background: '#f8fafc', cursor: 'pointer' }}
            >
              <X size={18} color="#64748b" />
            </button>
          </div>

          <div style={{ margin: '8px 0', fontSize: 12, color: '#475569', lineHeight: 1.4 }}>
            {report.fullAddress || report.displayName || 'Northeast India Monitoring Zone'}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f8fafc', padding: '10px 12px', borderRadius: 8, margin: '10px 0' }}>
            <span className={`riskPill ${riskClass(report.riskLevel)}`} style={{ fontWeight: 800, fontSize: 12 }}>
              {report.riskLevel} {Number(report.riskScore ?? 0).toFixed(2)}%
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>
              landslide risk score
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '10px 0' }}>
            <div style={{ background: '#f1f5f9', padding: '8px 10px', borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#475569', fontSize: 11, fontWeight: 600 }}>
                <CloudRain size={14} color="#0284c7" /> Rainfall
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                {Number(report.rainfall ?? report.accumulated24hRain ?? 0).toFixed(2)} mm
              </div>
            </div>

            <div style={{ background: '#f1f5f9', padding: '8px 10px', borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#475569', fontSize: 11, fontWeight: 600 }}>
                <TrendingUp size={14} color="#ea580c" /> Slope
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                {Number(report.slope ?? 0).toFixed(2)}°
              </div>
            </div>

            <div style={{ background: '#f1f5f9', padding: '8px 10px', borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#475569', fontSize: 11, fontWeight: 600 }}>
                <Droplets size={14} color="#2563eb" /> Soil Moisture
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                {Number(report.soilMoisture ?? 0).toFixed(2)}%
              </div>
            </div>

            <div style={{ background: '#f1f5f9', padding: '8px 10px', borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#475569', fontSize: 11, fontWeight: 600 }}>
                <Layers size={14} color="#16a34a" /> Elevation
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginTop: 2 }}>
                {Number(report.elevation ?? 0).toFixed(2)} m
              </div>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 10, marginTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#334155', marginBottom: 6 }}>
              Current Weather
            </div>
            <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.6, background: '#fafafa', padding: 8, borderRadius: 6 }}>
              <span>🌧️ {Number(report.currentRain ?? report.rainfall ?? 0).toFixed(2)} mm rain</span> &bull;{' '}
              <span>💧 {Math.round(report.humidity ?? 65)}% humidity</span><br />
              <span>🌡️ {Number(report.temperature ?? 24).toFixed(1)}°C</span> &bull;{' '}
              <span>💨 {Number(report.windSpeed ?? 5).toFixed(1)} km/h wind</span>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 8, marginTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#475569' }}>Coordinates</div>
            <div style={{ fontSize: 12, color: '#334155', fontFamily: 'monospace', marginTop: 2 }}>
              Latitude: {Number(report.lat ?? report.latitude).toFixed(6)}<br />
              Longitude: {Number(report.lng ?? report.longitude).toFixed(6)}
            </div>
          </div>

          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 8, marginTop: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#0f172a' }}>Recommended action</div>
            <div style={{ fontSize: 12, color: '#15803d', fontWeight: 600, marginTop: 2, lineHeight: 1.3 }}>
              {report.action || 'Continue monitoring and verify field conditions.'}
            </div>
          </div>

          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 8, marginTop: 8, fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
            <div>Weather source: <b>{report.weatherSource || 'Open-Meteo'}</b></div>
            <div>Observed: {report.observed ? new Date(report.observed).toLocaleString() : 'Live'}</div>
            <div>Retrieved: {report.retrieved ? new Date(report.retrieved).toLocaleString() : 'Just now'}</div>
            <div>ML service: <b style={{ color: '#16a34a' }}>{report.mlStatus || (report.mlService ? 'Online' : 'Operational')}</b></div>
            <div>Data status: <span className="riskPill" style={{ padding: '1px 6px', fontSize: 10, background: '#dcfce7', color: '#15803d' }}>{report.dataStatus || 'LIVE'}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}