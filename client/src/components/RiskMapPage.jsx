import React from 'react';

import PageTitle from './PageTitle';
import RiskMap from './RiskMap';

import {
  MapPinned,
  Activity
} from 'lucide-react';

export default function RiskMapPage({
  locations = [],
  onSelect
}) {

  return (
    <>
      <PageTitle
        title="Global Risk Map"
        sub="Live AI-based landslide risk monitoring with real environmental observations."
        icon={<MapPinned />}
      />

      <div
        className="notice"
        style={{
          marginBottom: 18
        }}
      >
        <Activity />

        <div>
          <b>
            Live AI monitoring
          </b>

          <span>
            Risk points are generated from
            current environmental conditions.
            No fixed demonstration risk zones
            are used.
          </span>
        </div>

      </div>

      <section className="card">

        <RiskMap
          locations={
            locations
          }
          onSelect={
            onSelect
          }
        />

      </section>
    </>
  );
}