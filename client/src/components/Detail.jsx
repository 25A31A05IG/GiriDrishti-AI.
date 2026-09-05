import React from 'react';
import {
  X,
  CloudRain,
  Navigation,
  Gauge,
  Mountain,
  AlertTriangle,
  ShieldCheck,
  Users
} from 'lucide-react';

import Feature from './Feature';

import {
  getAreaName,
  getRiskPointName,
  riskClass
} from '../App';

export default function Detail({
  location,
  onClose
}) {
  if (!location) return null;

  const areaName = getAreaName(location);

  const risk = String(
    location.riskLevel || ''
  ).toUpperCase();

  const action =
    risk === 'CRITICAL'
      ? 'Immediate field inspection; consider road restriction and notify nearby communities.'
      : risk === 'HIGH'
      ? 'Field inspection and enhanced monitoring; prepare local warning.'
      : risk === 'MODERATE'
      ? 'Continue enhanced monitoring and verify field conditions.'
      : risk === 'LOW'
      ? 'Continue monitoring and verify field conditions.'
      : 'Live AI assessment is currently unavailable.';

  const hasRisk = Number.isFinite(
    Number(location.riskScore)
  );

  const hasRain = Number.isFinite(
    Number(location.rainfall)
  );

  const hasSlope = Number.isFinite(
    Number(location.slope)
  );

  const hasSoil = Number.isFinite(
    Number(location.soilMoisture)
  );

  const hasElevation = Number.isFinite(
    Number(location.elevation)
  );

  const impactRadius = location.impactRadiusKm;
  const affectedPopulation = location.estimatedPopulationAffected;
  const safeShelter = location.safeShelter;

  return (
    <div className="overlay">
      <div className="drawer">

        <button
          className="close"
          onClick={onClose}
        >
          <X />
        </button>

        <p className="eyebrow">
          {location.clickedLocation
            ? 'EXACT LIVE LOCATION REPORT'
            : 'LIVE RISK ASSESSMENT'}
        </p>

        <h2>
          {areaName === 'Unknown Area'
            ? 'Selected Location'
            : areaName}
        </h2>

        <p>
          {location.state ||
            'Northeast India'}
        </p>

        <p
          style={{
            fontSize: 12,
            opacity: 0.65
          }}
        >
          {getRiskPointName(location)}
        </p>

        {location.displayName && (
          <p
            style={{
              fontSize: 12,
              opacity: 0.7
            }}
          >
            {location.displayName}
          </p>
        )}

        <div
          className={`bigRisk ${riskClass(
            location.riskLevel
          )}`}
        >
          <span>
            {location.riskLevel ||
              'UNAVAILABLE'}
          </span>

          <strong>
            {hasRisk
              ? `${Number(
                  location.riskScore
                ).toFixed(2)}%`
              : '--'}
          </strong>

          <small>
            landslide risk score
          </small>
        </div>

        {/* Dynamic Density-Based Population & Impact Radius Section */}
        {(impactRadius || affectedPopulation) && (
          <div style={{ background: '#334155', padding: '12px 14px', borderRadius: 10, marginBottom: 16, color: '#f8fafc', fontSize: 13 }}>
            <div style={{ fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6, color: '#f87171' }}>
              <AlertTriangle size={15} /> Impact & Density Population Estimate
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div>
                <span style={{ fontSize: 11, opacity: 0.8 }}>Impact Radius:</span><br />
                <b>{impactRadius ? `${impactRadius} km` : '--'}</b>
              </div>
              <div>
                <span style={{ fontSize: 11, opacity: 0.8 }}>Affected Residents:</span><br />
                <b>{affectedPopulation ? `~${affectedPopulation.toLocaleString()}` : '--'}</b>
              </div>
            </div>
          </div>
        )}

        {/* Dynamic Nearest Safe Evacuation Shelter Section */}
        {safeShelter && (
          <div style={{ background: '#064e3b', border: '1px solid #059669', padding: '12px 14px', borderRadius: 10, marginBottom: 16, color: '#ecfdf5', fontSize: 13 }}>
            <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6, color: '#34d399' }}>
              <ShieldCheck size={16} /> Nearest Safe Evacuation Shelter
            </div>
            <div>
              <div><b>{safeShelter.shelterName}</b></div>
              <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>Distance: <b>{safeShelter.distanceKm} km away</b></div>
            </div>
          </div>
        )}

        <div className="featureGrid">

          <Feature
            icon={<CloudRain />}
            label="Rainfall"
            value={
              hasRain
                ? `${Number(
                    location.rainfall
                  ).toFixed(2)} mm`
                : '--'
            }
          />

          <Feature
            icon={<Navigation />}
            label="Slope"
            value={
              hasSlope
                ? `${Number(
                    location.slope
                  ).toFixed(2)}°`
                : '--'
            }
          />

          <Feature
            icon={<Gauge />}
            label="Soil moisture"
            value={
              hasSoil
                ? `${Number(
                    location.soilMoisture
                  ).toFixed(2)}%`
                : '--'
            }
          />

          <Feature
            icon={<Mountain />}
            label="Elevation"
            value={
              hasElevation
                ? `${Number(
                    location.elevation
                  ).toFixed(2)} m`
                : '--'
            }
          />

        </div>

        <h3>
          Current Weather
        </h3>

        <div className="exposure">

          <span>
            🌧️{' '}
            {Number.isFinite(
              Number(
                location.currentRain
              )
            )
              ? `${Number(
                  location.currentRain
                ).toFixed(2)} mm current rain`
              : '--'}
          </span>

          <span>
            💧{' '}
            {Number.isFinite(
              Number(
                location.humidity
              )
            )
              ? `${Number(
                  location.humidity
                ).toFixed(0)}% humidity`
              : '--'}
          </span>

          <span>
            🌡️{' '}
            {Number.isFinite(
              Number(
                location.temperature
              )
            )
              ? `${Number(
                  location.temperature
                ).toFixed(1)}°C`
              : '--'}
          </span>

          <span>
            💨{' '}
            {Number.isFinite(
              Number(
                location.windSpeed
              )
            )
              ? `${Number(
                  location.windSpeed
                ).toFixed(1)} km/h wind`
              : '--'}
          </span>

        </div>

        <h3>
          Coordinates
        </h3>

        <div className="exposure">

          <span>
            Latitude:{' '}
            {Number.isFinite(
              Number(location.lat)
            )
              ? Number(
                  location.lat
                ).toFixed(6)
              : '--'}
          </span>

          <span>
            Longitude:{' '}
            {Number.isFinite(
              Number(location.lng)
            )
              ? Number(
                  location.lng
                ).toFixed(6)
              : '--'}
          </span>

        </div>

        <div className="recommend">

          <b>
            Recommended action
          </b>

          <p>
            {action}
          </p>

        </div>

        <div
          style={{
            marginTop: 16,
            fontSize: 12,
            opacity: 0.7
          }}
        >

          Weather source:{' '}
          {location.weatherSource ||
            'Open-Meteo live weather'}

          <br />

          Observed:{' '}
          {location.weatherObservedAt
            ? new Date(
                location.weatherObservedAt
              ).toLocaleString()
            : 'Not available'}

          <br />

          Retrieved:{' '}
          {location.weatherRetrievedAt
            ? new Date(
                location.weatherRetrievedAt
              ).toLocaleString()
            : 'Not available'}

          <br />

          ML service:{' '}

          {location.mlService === true
            ? 'Online'
            : 'Unavailable'}

          <br />

          Data status:{' '}

          {location.dataStatus ||
            'UNKNOWN'}

          {location.stale && (
            <>
              <br />
              Data freshness: Stale / unavailable
            </>
          )}

        </div>

      </div>
    </div>
  );
}
