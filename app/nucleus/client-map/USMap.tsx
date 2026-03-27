'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useEffect, useRef } from 'react';
import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from 'react-simple-maps';
import { X } from 'lucide-react';
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

// Map state abbreviation → display name
const STATE_NAMES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'D.C.', FL: 'Florida',
  GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana',
  IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine',
  MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi',
  MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin',
  WY: 'Wyoming',
};

interface USMapProps {
  chapters: ChapterWithGeo[];
  activeStates: Set<string>;
  selected: ChapterWithGeo | null;
  onSelect: (c: ChapterWithGeo | null) => void;
  chaptersByState: Record<string, ChapterWithGeo[]>;
}

export default function USMap({ chapters, activeStates, selected, onSelect, chaptersByState }: USMapProps) {
  const [statePanel, setStatePanel] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close panel on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setStatePanel(null);
      }
    }
    if (statePanel) {
      document.addEventListener('mousedown', handleClick);
    }
    return () => document.removeEventListener('mousedown', handleClick);
  }, [statePanel]);

  function handleStateClick(stateAbbr: string) {
    if (!activeStates.has(stateAbbr)) return;
    // Clicking the same state toggles it closed
    setStatePanel((prev) => (prev === stateAbbr ? null : stateAbbr));
    // Deselect any pin
    onSelect(null);
  }

  const panelChapters = statePanel ? (chaptersByState[statePanel] ?? []) : [];

  return (
    <div style={{ width: '100%', height: 480 }} className="relative">
      <ComposableMap
        projection="geoAlbersUsa"
        style={{ width: '100%', height: '100%' }}
      >
        <Geographies geography={GEO_URL}>
          {({ geographies }: { geographies: any[] }) =>
            geographies.map((geo: any) => {
              const stateAbbr = FIPS_TO_STATE[String(geo.id).padStart(2, '0')];
              const isActive = stateAbbr ? activeStates.has(stateAbbr) : false;
              const isSelectedState = stateAbbr === statePanel;
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={isSelectedState ? '#10b981' : isActive ? '#059669' : '#1e2d45'}
                  stroke="#0d1117"
                  strokeWidth={0.5}
                  style={{
                    default: { outline: 'none' },
                    hover: {
                      fill: isActive ? '#10b981' : '#253550',
                      outline: 'none',
                      cursor: isActive ? 'pointer' : 'default',
                    },
                    pressed: { outline: 'none' },
                  }}
                  onClick={() => stateAbbr && handleStateClick(stateAbbr)}
                />
              );
            })
          }
        </Geographies>

        {chapters.map((c) => (
          <Marker
            key={c.id}
            coordinates={[c.lng, c.lat]}
            onClick={() => {
              onSelect(selected?.id === c.id ? null : c);
              setStatePanel(null);
            }}
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

      {/* State chapter panel */}
      {statePanel && panelChapters.length > 0 && (
        <div
          ref={panelRef}
          className="absolute top-4 left-4 w-72 bg-[#0d1117] border border-slate-600 rounded-xl shadow-2xl z-50 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-[#141b27]">
            <div>
              <p className="text-sm font-semibold text-white">
                {STATE_NAMES[statePanel] ?? statePanel}
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {panelChapters.length} chapter{panelChapters.length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={() => setStatePanel(null)}
              className="text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-700"
            >
              <X size={14} />
            </button>
          </div>

          {/* Chapter list */}
          <div className="max-h-64 overflow-y-auto divide-y divide-slate-800">
            {panelChapters.map((c) => {
              const isActive = c.status === 'active';
              return (
                <div
                  key={c.id}
                  className="px-4 py-3 hover:bg-slate-800/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{c.chapter_name.trim()}</p>
                      <p className="text-xs text-slate-400 mt-0.5 truncate">{c.school.trim()}</p>
                    </div>
                    <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium mt-0.5 ${
                      isActive
                        ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-700/50'
                        : 'bg-amber-900/50 text-amber-400 border border-amber-700/50'
                    }`}>
                      {isActive ? 'Active' : 'Onboarding'}
                    </span>
                  </div>
                  <p className="text-xs text-emerald-400 font-semibold mt-1.5">
                    ${c.arr.toLocaleString()}/yr
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
