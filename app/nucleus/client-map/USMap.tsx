'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from 'react-simple-maps';
import type { ChapterWithGeo } from './page';

const GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json';

const FIPS_TO_STATE: Record<string, string> = {
  '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA',
  '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL',
  '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN',
  '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME',
  '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS',
  '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH',
  '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND',
  '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI',
  '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT',
  '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI',
  '56': 'WY',
};

interface USMapProps {
  chapters: ChapterWithGeo[];
  activeStates: Set<string>;
  selected: ChapterWithGeo | null;
  onSelect: (c: ChapterWithGeo | null) => void;
}

export default function USMap({ chapters, activeStates, selected, onSelect }: USMapProps) {
  return (
    <div style={{ width: '100%', height: 480 }}>
      <ComposableMap
        projection="geoAlbersUsa"
        style={{ width: '100%', height: '100%' }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }: { geographies: any[] }) =>
            geographies.map((geo: any) => {
              const stateAbbr = FIPS_TO_STATE[String(geo.id).padStart(2, '0')];
              const isActive = stateAbbr ? activeStates.has(stateAbbr) : false;
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={isActive ? '#059669' : '#1e2d45'}
                  stroke="#0d1117"
                  strokeWidth={0.5}
                  style={{
                    default: { outline: 'none' },
                    hover: { fill: isActive ? '#10b981' : '#253550', outline: 'none' },
                    pressed: { outline: 'none' },
                  }}
                />
              );
            })
          }
        </Geographies>

        {chapters.map((c) => (
          <Marker
            key={c.id}
            coordinates={[c.lng, c.lat]}
            onClick={() => onSelect(selected?.id === c.id ? null : c)}
          >
            <circle
              r={7}
              fill={selected?.id === c.id ? '#fbbf24' : '#f59e0b'}
              stroke={selected?.id === c.id ? '#fff' : 'rgba(255,255,255,0.6)'}
              strokeWidth={selected?.id === c.id ? 2 : 1.5}
              style={{
                cursor: 'pointer',
                filter: selected?.id === c.id ? 'drop-shadow(0 0 6px #f59e0b)' : undefined,
                transition: 'all 0.15s',
              }}
            />
            <circle r={3} fill="#fef3c7" style={{ pointerEvents: 'none' }} />
          </Marker>
        ))}
      </ComposableMap>
    </div>
  );
}
