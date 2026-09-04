import React from 'react';
import {
  CloudRain,
  Navigation,
  Gauge,
  Mountain,
  ChevronRight
} from 'lucide-react';

import {
  getAreaName,
  getRiskPointName,
  riskClass
} from '../App';

export default function DynamicZoneDetails({
  location,
  onSelect,
  loading = false
}) {
  return (
    <div className="selectedZone">
      <div className="selectedZoneHeader">
        <div>
          <span
            className={`riskPill ${riskClass(
              location.riskLevel
            )}`}
          >
            {location.riskLevel}
          </span>

          <h3>
            {loading
              ? 'Finding area...'
              : getAreaName(location)}
          </h3>

          <p>
            {location.state ||
              'Northeast India'}
          </p>

          <small>
            {getRiskPointName(location)}
          </small>
        </div>

        <strong className="selectedScore">
          {location.riskScore ?? 0}%
        </strong>
      </div>

      <div className="zoneFeatures">
        <div>
          <CloudRain size={16} />
          <span>Rainfall</span>
          <b>
            {Number(
              location.rainfall || 0
            ).toFixed(2)} mm
          </b>
        </div>

        <div>
          <Navigation size={16} />
          <span>Slope</span>
          <b>{location.slope ?? 0}°</b>
        </div>

        <div>
          <Gauge size={16} />
          <span>Soil moisture</span>
          <b>
            {Number(
              location.soilMoisture || 0
            ).toFixed(2)}%
          </b>
        </div>

        <div>
          <Mountain size={16} />
          <span>Elevation</span>
          <b>
            {location.elevation ?? 0} m
          </b>
        </div>
      </div>

      <div className="zoneExposure">
        <b>Live Conditions</b>

        <div>
          <span>
            🌧️ Current rain:{' '}
            {Number(
              location.currentRain || 0
            ).toFixed(2)} mm
          </span>

          <span>
            💧 Humidity:{' '}
            {Number(
              location.humidity || 0
            ).toFixed(0)}%
          </span>

          <span>
            🌡️ Temperature:{' '}
            {Number(
              location.temperature || 0
            ).toFixed(1)}°C
          </span>

          <span>
            💨 Wind:{' '}
            {Number(
              location.windSpeed || 0
            ).toFixed(1)} km/h
          </span>
        </div>
      </div>

      <button
        className="primary inspectButton"
        onClick={() => onSelect(location)}
      >
        Inspect live report
        <ChevronRight size={15} />
      </button>
    </div>
  );
}