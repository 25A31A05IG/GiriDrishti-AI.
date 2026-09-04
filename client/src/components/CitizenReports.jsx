// src/components/CitizenReports.jsx

import React, { useState, useEffect } from 'react';
import { Camera, MapPin, AlertTriangle, CheckCircle, Clock, Upload, RefreshCw } from 'lucide-react';
import { API } from '../App';

export default function CitizenReports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form State
  const [type, setType] = useState('Rockfall');
  const [description, setDescription] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [photo, setPhoto] = useState(null);

  const fetchReports = async () => {
    try {
      const cleanApi = API.replace(/\/+$/, '');
      const res = await fetch(`${cleanApi}/reports`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setReports(Array.isArray(data) ? data : []);
    } catch {
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  }, []);

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation not supported by this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLat(pos.coords.latitude.toFixed(5));
        setLng(pos.coords.longitude.toFixed(5));
      },
      err => setError('Could not retrieve GPS coordinates: ' + err.message)
    );
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSubmitting(true);

    try {
      const cleanApi = API.replace(/\/+$/, '');
      const formData = new FormData();
      formData.append('type', type);
      formData.append('description', description);
      if (lat) formData.append('lat', lat);
      if (lng) formData.append('lng', lng);
      if (photo) formData.append('photo', photo);

      const res = await fetch(`${cleanApi}/reports`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to submit report`);

      setSuccess('Hazard report submitted successfully to GiriDrishti emergency network.');
      setDescription('');
      setPhoto(null);
      fetchReports();
    } catch (err) {
      setError(err.message || 'Failed to submit report');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Camera size={26} color="#2563eb" /> Citizen Disaster Reporting
          </h1>
          <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: 13 }}>
            Crowdsourced slope instabilities, road blockages, and early signs of ground displacement.
          </p>
        </div>

        <button 
          className="secondary" 
          onClick={fetchReports} 
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, padding: '8px 14px', cursor: 'pointer' }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh Reports
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, alignItems: 'start' }}>
        {/* Report Submission Form */}
        <div className="card" style={{ padding: 22, background: '#ffffff', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px 0', color: '#0f172a' }}>
            Submit Live Hazard Observation
          </h2>

          {error && (
            <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 12px', borderRadius: 8, fontSize: 13, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} /> <span>{error}</span>
            </div>
          )}

          {success && (
            <div style={{ background: '#dcfce7', color: '#166534', padding: '10px 12px', borderRadius: 8, fontSize: 13, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle size={16} /> <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                Hazard Type
              </label>
              <select 
                value={type} 
                onChange={e => setType(e.target.value)}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff', outline: 'none' }}
              >
                <option value="Rockfall">Rockfall / Boulder Roll</option>
                <option value="Debris Slide">Active Debris Slide</option>
                <option value="Mudflow">Mudflow / Slurry Runoff</option>
                <option value="Road Blockage">Highway / Road Blockage</option>
                <option value="Pore Spring Surge">New Spring / Muddy Discharge</option>
                <option value="Structural Crack">Tension Cracks on Hillside</option>
              </select>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#334155' }}>
                  Coordinates (Latitude & Longitude)
                </label>
                <button 
                  type="button" 
                  onClick={handleGetCurrentLocation}
                  style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 11, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                >
                  <MapPin size={12} /> Use GPS
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input 
                  type="number" 
                  step="any"
                  placeholder="Latitude (e.g. 25.27)" 
                  value={lat} 
                  onChange={e => setLat(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, outline: 'none' }}
                />
                <input 
                  type="number" 
                  step="any"
                  placeholder="Longitude (e.g. 91.73)" 
                  value={lng} 
                  onChange={e => setLng(e.target.value)}
                  style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, outline: 'none' }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                Description & Impact
              </label>
              <textarea 
                rows={3}
                placeholder="Detail current rainfall, affected roads, toe erosion, or stranded traffic..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                required
                style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: 13, outline: 'none', resize: 'vertical' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                Attach Photo (Optional)
              </label>
              <input 
                type="file" 
                accept="image/*"
                onChange={e => setPhoto(e.target.files[0] || null)}
                style={{ fontSize: 12, color: '#64748b' }}
              />
            </div>

            <button 
              type="submit" 
              className="primary" 
              disabled={submitting}
              style={{ marginTop: 6, padding: '10px', fontSize: 13, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <Upload size={14} /> {submitting ? 'Transmitting Report...' : 'Transmit Report'}
            </button>
          </form>
        </div>

        {/* Existing Reports Feed */}
        <div>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 14px 0', color: '#0f172a' }}>
            Recent Field Reports ({reports.length})
          </h2>

          {reports.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', background: '#f8fafc', borderRadius: 12, border: '1px dashed #cbd5e1', color: '#64748b', fontSize: 13 }}>
              No field incidents reported yet today.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {reports.map((r, i) => (
                <div key={r.id || i} className="card" style={{ padding: 14, background: '#ffffff', borderRadius: 10, borderLeft: '4px solid #3b82f6', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <b style={{ color: '#0f172a', fontSize: 14 }}>{r.type}</b>
                    <span style={{ fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={11} /> {r.createdAt ? new Date(r.createdAt).toLocaleTimeString() : 'Recent'}
                    </span>
                  </div>
                  <p style={{ margin: '6px 0', fontSize: 13, color: '#334155', lineHeight: 1.4 }}>
                    {r.description}
                  </p>
                  {r.lat && r.lng && (
                    <div style={{ fontSize: 11, color: '#2563eb', display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <MapPin size={12} /> {Number(r.lat).toFixed(4)}, {Number(r.lng).toFixed(4)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}