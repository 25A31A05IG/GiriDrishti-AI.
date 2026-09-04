import React, {
  useEffect,
  useState
} from 'react';

import {
  getAreaName,
  getRiskPointName,
  riskClass,
  reverseGeocode
} from '../App';


function formatTime(
  value
) {
  if (!value) {
    return 'Unavailable';
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return 'Unavailable';
  }

  return date.toLocaleString(
    'en-IN',
    {
      dateStyle:
        'medium',
      timeStyle:
        'short'
    }
  );
}


function value(
  input,
  suffix = ''
) {
  if (
    input === null ||
    input === undefined ||
    input === ''
  ) {
    return 'Unavailable';
  }

  return `${input}${suffix}`;
}


export default function RiskPointPopup({
  location
}) {
  const [
    area,
    setArea
  ] = useState(
    getAreaName(location)
  );

  const [
    loadingArea,
    setLoadingArea
  ] = useState(
    getAreaName(location) ===
      'Unknown Area'
  );


  useEffect(() => {
    let cancelled =
      false;

    const existing =
      getAreaName(location);

    if (
      existing !==
      'Unknown Area'
    ) {
      setArea(existing);
      setLoadingArea(false);
      return;
    }

    const lat =
      Number(
        location?.lat
      );

    const lng =
      Number(
        location?.lng
      );

    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lng)
    ) {
      setLoadingArea(false);
      return;
    }

    reverseGeocode(
      lat,
      lng
    )
      .then(result => {
        if (
          !cancelled
        ) {
          setArea(
            result.areaName
          );
        }
      })
      .finally(() => {
        if (
          !cancelled
        ) {
          setLoadingArea(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [location]);


  const weatherTime =
    location?.weatherDataTime ||
    location?.weatherUpdatedAt;

  const checkedTime =
    location?.checkedAt ||
    location?.updatedAt;


  return (
    <div className="mapPopup">

      <b>
        {loadingArea
          ? 'Finding area...'
          : area}
      </b>

      <span>
        {location?.state ||
          'Northeast India'}
      </span>

      <small>
        {getRiskPointName(
          location
        )}
      </small>

      <strong
        className={riskClass(
          location?.riskLevel
        )}
      >
        {location?.riskLevel ||
          'UNKNOWN'}
        {' • '}
        {location?.riskScore ??
          '—'}
        %
      </strong>

      <small>
        📍{' '}
        {Number(
          location?.lat
        ).toFixed(5)}
        {' , '}
        {Number(
          location?.lng
        ).toFixed(5)}
      </small>

      <small>
        🌧 Rainfall 24h:{' '}
        {value(
          location?.rainfallLast24h,
          ' mm'
        )}
      </small>

      <small>
        💧 Soil moisture:{' '}
        {location?.soilMoisture ===
        null ||
        location?.soilMoisture ===
          undefined
          ? 'Unavailable'
          : `${(
              Number(
                location.soilMoisture
              ) * 100
            ).toFixed(1)}%`}
      </small>

      <small>
        🌡 Temperature:{' '}
        {value(
          location?.temperature,
          ' °C'
        )}
      </small>

      <small>
        💨 Wind:{' '}
        {value(
          location?.windSpeed,
          ' km/h'
        )}
      </small>

      <small>
        ⛰ Elevation:{' '}
        {value(
          location?.elevation,
          ' m'
        )}
      </small>

      <small>
        📐 Slope:{' '}
        {value(
          location?.slope,
          '°'
        )}
      </small>

      <small>
        🗺 Historical slides nearby:{' '}
        {location?.nearbyHistoricalSlides ??
          'Unavailable'}
      </small>

      <small>
        AI score:{' '}
        {location?.aiScore ??
          'Unavailable'}
        %
      </small>

      <small>
        Weather data:{' '}
        {formatTime(
          weatherTime
        )}
      </small>

      <small>
        System checked:{' '}
        {formatTime(
          checkedTime
        )}
      </small>

      <small>
        Source:{' '}
        {location?.weatherSource ||
          'Open-Meteo'}
      </small>

      <small>
        Terrain:{' '}
        {location?.terrainSource ||
          'DEM'}
      </small>

    </div>
  );
}