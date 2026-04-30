'use client';
import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Check,
  ChevronRight,
  Zap,
  Calendar,
  DollarSign,
  Shield,
  MessageSquare,
  User,
  Loader2,
  ArrowRight,
  Rocket,
  Phone,
  Radio,
  Database,
  Clock,
  Globe,
  Share2,
  Mail,
} from 'lucide-react';

// ─── Real Avatar URLs ─────────────────────────────────────────────────────────

const RA = {
  nashDehmer:  'https://api.trailblaize.net/storage/v1/object/public/user-avatar/6f14185e-61b9-468d-a0fc-1d46eb5e122d-1776171521116.jpg',
  ethanHill:   'https://api.trailblaize.net/storage/v1/object/public/user-avatar/cc27eb12-c5fb-4d60-86ef-74e6f28ad9a4-1776170865222.jpg',
  jakeCoppen:  'https://api.trailblaize.net/storage/v1/object/public/user-avatar/4be69e44-669f-442e-8859-731db416ea3b-1776172132818.jpg',
  gavinMurrey: 'https://api.trailblaize.net/storage/v1/object/public/user-avatar/365ac617-1637-4a85-b02c-b2b23b4307c7-1776171942678.jpg',
  payneParker: 'https://api.trailblaize.net/storage/v1/object/public/user-avatar/dec7107c-53b3-4613-8929-1357413117f5-1776171340287.jpg',
  andrewLongo: 'https://api.trailblaize.net/storage/v1/object/public/user-avatar/849b9364-7abd-4e0e-b777-56705b42b096-1776172803787.jpg',
};

// ─── Pricing ─────────────────────────────────────────────────────────────────

function getPriceTier(memberCount: number): number {
  if (memberCount < 100) return 99;
  if (memberCount < 175) return 199;
  if (memberCount < 250) return 299;
  if (memberCount < 325) return 399;
  if (memberCount < 400) return 499;
  return 599;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type OrgType =
  | 'Fraternity'
  | 'Sorority'
  | 'Club Sports'
  | 'Athletics'
  | 'Social Club'
  | 'Country Club'
  | 'Other';

const ORG_TYPES: OrgType[] = [
  'Fraternity',
  'Sorority',
  'Club Sports',
  'Athletics',
  'Social Club',
  'Country Club',
  'Other',
];

type AlumniCard = {
  name: string;
  bio: string;
  location: string | null;
  major: string;
  year: string;
  chapter: string;
  avatar: string | null;
  initials: string;
  color: string;
};

interface FormData {
  firstName: string;
  lastName: string;
  orgName: string;
  school: string;
  orgType: OrgType | '';
  designation: string;
  memberCount: string;
  leaderName: string;
  leaderEmail: string;
  leaderPhone: string;
  instagramHandle: string;
}

// ─── Filter Alumni Data ───────────────────────────────────────────────────────

const FILTER_ALUMNI: Record<string, AlumniCard[]> = {
  Finance: [
    { name: 'Ethan Hill',       bio: 'Financial Services Rep @ Fidelity',     location: 'Dallas, TX',      major: 'Finance',          year: '26', chapter: 'Alpha Chapter', avatar: RA.ethanHill,   initials: 'EH', color: '#0F172A' },
    { name: 'Garrett Smalley',  bio: 'Associate Underwriter @ Chubb',          location: 'Milton, GA',       major: 'Finance',          year: '25', chapter: 'Alpha Chapter', avatar: '/faces/face3.jpg', initials: 'GS', color: '#6366F1' },
    { name: 'Andrew Hopperton', bio: 'IB Analyst @ GSI Capital',               location: 'Tampa, FL',        major: 'Finance',          year: '25', chapter: 'Alpha Chapter', avatar: '/faces/face7.jpg', initials: 'AH', color: '#0EA5E9' },
    { name: 'Gavin Murrey',     bio: 'Credit Portfolio Analyst @ JPMorgan',    location: 'New York, NY',    major: 'Finance',          year: '26', chapter: 'Alpha Chapter', avatar: RA.gavinMurrey, initials: 'GM', color: '#0F172A' },
    { name: 'Peyton Pounds',    bio: 'Financial Advisor @ Williams Wealth',    location: 'Charlotte, NC',   major: 'Finance',          year: '23', chapter: 'Alpha Chapter', avatar: '/faces/face5.jpg', initials: 'PP', color: '#10B981' },
    { name: 'Luke Nayfa',       bio: 'MS Finance @ McCombs',                   location: 'Austin, TX',      major: 'Finance',          year: '25', chapter: 'Alpha Chapter', avatar: '/faces/face9.jpg', initials: 'LN', color: '#F59E0B' },
    { name: 'Jack Grier',       bio: 'Healthcare Recruiter @ Medasource',      location: 'Nashville, TN',   major: 'Finance',          year: '25', chapter: 'Alpha Chapter', avatar: null, initials: 'JG', color: '#EC4899' },
    { name: 'William Heusler',  bio: 'Analyst @ MSCI',                         location: 'New York, NY',    major: 'Finance',          year: '25', chapter: 'Alpha Chapter', avatar: null, initials: 'WH', color: '#8B5CF6' },
  ],
  'Real Estate': [
    { name: 'Eli Ridgeway',     bio: 'Development @ Watersound',               location: 'Nashville, TN',   major: 'Real Estate',      year: '24', chapter: 'Alpha Chapter', avatar: null, initials: 'ER', color: '#10B981' },
    { name: 'Charlie Parkman',  bio: 'Real Estate Associate',                  location: 'Dallas, TX',      major: 'Finance',          year: '24', chapter: 'Alpha Chapter', avatar: null, initials: 'CP', color: '#F59E0B' },
    { name: 'Cole Montgomery',  bio: 'Commercial Real Estate',                 location: 'Atlanta, GA',     major: 'Business',         year: '25', chapter: 'Alpha Chapter', avatar: null, initials: 'CM', color: '#0EA5E9' },
  ],
  Engineering: [
    { name: 'Abhi Bhabad',      bio: 'AI Product @ Search Party',              location: null,               major: 'Computer Science', year: '26', chapter: 'Alpha Chapter', avatar: '/faces/face12.jpg', initials: 'AB', color: '#10B981' },
    { name: 'Jake Coppen',      bio: 'Founder @ Scratch AI',                   location: 'New York, NY',    major: 'Finance',          year: '26', chapter: 'Alpha Chapter', avatar: RA.jakeCoppen,  initials: 'JC', color: '#0F172A' },
    { name: 'Thomas Pham',      bio: 'AI in Business',                          location: 'College Station, TX', major: 'AI in Business', year: '27', chapter: 'Alpha Chapter', avatar: '/faces/face10.jpg', initials: 'TP', color: '#6366F1' },
  ],
  Marketing: [
    { name: 'Payne Parker',     bio: 'Account Executive @ Knight Commercial',  location: 'Dallas, TX',      major: 'Marketing',        year: '26', chapter: 'Alpha Chapter', avatar: RA.payneParker, initials: 'PP', color: '#0F172A' },
    { name: 'Andrew Longo',     bio: 'GTM @ Glean',                             location: 'Nashville, TN',   major: 'Marketing',        year: '26', chapter: 'Alpha Chapter', avatar: RA.andrewLongo, initials: 'AL', color: '#6366F1' },
    { name: 'Carter Brown',     bio: 'Marketing Manager',                       location: 'Austin, TX',      major: 'Marketing',        year: '25', chapter: 'Alpha Chapter', avatar: null, initials: 'CB', color: '#EC4899' },
  ],
  Healthcare: [
    { name: 'Jack Grier',       bio: 'Healthcare Recruiter @ Medasource',      location: 'Nashville, TN',   major: 'Finance',          year: '25', chapter: 'Alpha Chapter', avatar: null, initials: 'JG', color: '#EC4899' },
    { name: 'Peyton Pounds',    bio: 'Financial Advisor @ Williams Wealth',    location: 'Charlotte, NC',   major: 'Finance',          year: '23', chapter: 'Alpha Chapter', avatar: '/faces/face5.jpg', initials: 'PP', color: '#10B981' },
    { name: 'Andrew Hopperton', bio: 'IB Analyst @ GSI Capital',               location: 'Tampa, FL',       major: 'Finance',          year: '25', chapter: 'Alpha Chapter', avatar: '/faces/face7.jpg', initials: 'AH', color: '#0EA5E9' },
  ],
  Consulting: [
    { name: 'Andrew Hopperton', bio: 'IB Analyst @ GSI Capital',               location: 'Tampa, FL',       major: 'Finance',          year: '25', chapter: 'Alpha Chapter', avatar: '/faces/face7.jpg', initials: 'AH', color: '#0EA5E9' },
    { name: 'Gavin Murrey',     bio: 'Credit Portfolio Analyst @ JPMorgan',    location: 'New York, NY',    major: 'Finance',          year: '26', chapter: 'Alpha Chapter', avatar: RA.gavinMurrey, initials: 'GM', color: '#0F172A' },
    { name: 'Luke Nayfa',       bio: 'MS Finance @ McCombs',                   location: 'Austin, TX',      major: 'Finance',          year: '25', chapter: 'Alpha Chapter', avatar: '/faces/face9.jpg', initials: 'LN', color: '#F59E0B' },
    { name: 'Ethan Hill',       bio: 'Financial Services Rep @ Fidelity',      location: 'Dallas, TX',      major: 'Finance',          year: '26', chapter: 'Alpha Chapter', avatar: RA.ethanHill,   initials: 'EH', color: '#0F172A' },
  ],
  Tech: [
    { name: 'Abhi Bhabad',      bio: 'AI Product @ Search Party',              location: null,               major: 'Computer Science', year: '26', chapter: 'Alpha Chapter', avatar: '/faces/face12.jpg', initials: 'AB', color: '#10B981' },
    { name: 'Jake Coppen',      bio: 'Founder @ Scratch AI',                   location: 'New York, NY',    major: 'Finance',          year: '26', chapter: 'Alpha Chapter', avatar: RA.jakeCoppen,  initials: 'JC', color: '#0F172A' },
    { name: 'Thomas Pham',      bio: 'AI in Business',                          location: 'College Station, TX', major: 'AI in Business', year: '27', chapter: 'Alpha Chapter', avatar: '/faces/face10.jpg', initials: 'TP', color: '#6366F1' },
    { name: 'Garrett Smalley',  bio: 'Associate @ Chubb',                       location: 'Milton, GA',      major: 'Finance',          year: '25', chapter: 'Alpha Chapter', avatar: '/faces/face3.jpg', initials: 'GS', color: '#6366F1' },
  ],
  Legal: [
    { name: 'Nash Dehmer',      bio: 'Dir of Operations @ US Senate',          location: 'Washington, DC',  major: 'Political Science', year: '23', chapter: 'Alpha Chapter', avatar: RA.nashDehmer, initials: 'ND', color: '#6366F1' },
    { name: 'Garrett Smalley',  bio: 'Associate Underwriter @ Chubb',          location: 'Milton, GA',      major: 'Finance',          year: '25', chapter: 'Alpha Chapter', avatar: '/faces/face3.jpg', initials: 'GS', color: '#6366F1' },
    { name: 'William Heusler',  bio: 'Analyst @ MSCI',                         location: 'New York, NY',    major: 'Finance',          year: '25', chapter: 'Alpha Chapter', avatar: null, initials: 'WH', color: '#8B5CF6' },
  ],
  Dallas: [
    { name: 'Ethan Hill',       bio: 'Financial Services Rep @ Fidelity',      location: 'Dallas, TX',      major: 'Finance',          year: '26', chapter: 'Alpha Chapter', avatar: RA.ethanHill,   initials: 'EH', color: '#0F172A' },
    { name: 'Nick Siebert',     bio: 'Dallas, TX',                              location: 'Dallas, TX',      major: 'Business',         year: '25', chapter: 'Alpha Chapter', avatar: null, initials: 'NS', color: '#F59E0B' },
    { name: 'Payne Parker',     bio: 'Account Executive @ Knight Commercial',  location: 'Dallas, TX',      major: 'Marketing',        year: '26', chapter: 'Alpha Chapter', avatar: RA.payneParker, initials: 'PP', color: '#EC4899' },
    { name: 'Joe Chatham',      bio: 'Dallas, TX',                              location: 'Dallas, TX',      major: 'Finance',          year: '24', chapter: 'Alpha Chapter', avatar: null, initials: 'JC', color: '#0EA5E9' },
  ],
  'New York': [
    { name: 'Jake Coppen',      bio: 'Founder @ Scratch AI',                   location: 'New York, NY',    major: 'Finance',          year: '26', chapter: 'Alpha Chapter', avatar: RA.jakeCoppen,  initials: 'JC', color: '#0F172A' },
    { name: 'William Heusler',  bio: 'Analyst @ MSCI',                         location: 'New York, NY',    major: 'Finance',          year: '25', chapter: 'Alpha Chapter', avatar: null, initials: 'WH', color: '#8B5CF6' },
    { name: 'Dimitri Nakis',    bio: 'New York, NY',                            location: 'New York, NY',    major: 'Finance',          year: '25', chapter: 'Alpha Chapter', avatar: null, initials: 'DN', color: '#EC4899' },
    { name: 'Gavin Murrey',     bio: 'Credit Portfolio Analyst @ JPMorgan',    location: 'New York, NY',    major: 'Finance',          year: '26', chapter: 'Alpha Chapter', avatar: RA.gavinMurrey, initials: 'GM', color: '#0F172A' },
  ],
  Nashville: [
    { name: 'Andrew Longo',     bio: 'GTM @ Glean',                             location: 'Nashville, TN',   major: 'Marketing',        year: '26', chapter: 'Alpha Chapter', avatar: RA.andrewLongo, initials: 'AL', color: '#6366F1' },
    { name: 'Carter Matulich',  bio: 'Nashville, TN',                           location: 'Nashville, TN',   major: 'Business',         year: '25', chapter: 'Alpha Chapter', avatar: null, initials: 'CM', color: '#10B981' },
    { name: 'Jack Grier',       bio: 'Healthcare Recruiter @ Medasource',      location: 'Nashville, TN',   major: 'Finance',          year: '25', chapter: 'Alpha Chapter', avatar: null, initials: 'JG', color: '#EC4899' },
    { name: 'Worth DuPerier',   bio: 'Nashville, TN',                           location: 'Nashville, TN',   major: 'Finance',          year: '24', chapter: 'Alpha Chapter', avatar: null, initials: 'WD', color: '#F59E0B' },
    { name: 'Tanner McCraney',  bio: 'Nashville, TN',                           location: 'Nashville, TN',   major: 'Finance',          year: '25', chapter: 'Alpha Chapter', avatar: null, initials: 'TM', color: '#0EA5E9' },
  ],
  Houston: [
    { name: 'Nash Dehmer',      bio: 'Dir of Operations @ US Senate',          location: 'Washington, DC',  major: 'Political Science', year: '23', chapter: 'Alpha Chapter', avatar: RA.nashDehmer, initials: 'ND', color: '#6366F1' },
    { name: 'Gavin Murrey',     bio: 'Credit Portfolio Analyst @ JPMorgan',    location: 'New York, NY',    major: 'Finance',          year: '26', chapter: 'Alpha Chapter', avatar: RA.gavinMurrey, initials: 'GM', color: '#0F172A' },
    { name: 'Peyton Pounds',    bio: 'Financial Advisor @ Williams Wealth',    location: 'Charlotte, NC',   major: 'Finance',          year: '23', chapter: 'Alpha Chapter', avatar: '/faces/face5.jpg', initials: 'PP', color: '#10B981' },
  ],
  'Washington DC': [
    { name: 'Nash Dehmer',      bio: 'Dir of Operations @ US Senate',          location: 'Washington, DC',  major: 'Political Science', year: '23', chapter: 'Alpha Chapter', avatar: RA.nashDehmer, initials: 'ND', color: '#6366F1' },
    { name: 'Andrew Hopperton', bio: 'IB Analyst @ GSI Capital',               location: 'Tampa, FL',       major: 'Finance',          year: '25', chapter: 'Alpha Chapter', avatar: '/faces/face7.jpg', initials: 'AH', color: '#0EA5E9' },
  ],
  Austin: [
    { name: 'Luke Nayfa',       bio: 'MS Finance @ McCombs',                   location: 'Austin, TX',      major: 'Finance',          year: '25', chapter: 'Alpha Chapter', avatar: '/faces/face9.jpg', initials: 'LN', color: '#F59E0B' },
    { name: 'Thomas Pham',      bio: 'AI in Business',                          location: 'College Station, TX', major: 'AI in Business', year: '27', chapter: 'Alpha Chapter', avatar: '/faces/face10.jpg', initials: 'TP', color: '#6366F1' },
    { name: 'Carter Brown',     bio: 'Marketing Manager',                       location: 'Austin, TX',      major: 'Marketing',        year: '25', chapter: 'Alpha Chapter', avatar: null, initials: 'CB', color: '#EC4899' },
  ],
};

// ─── Chapter Options ──────────────────────────────────────────────────────────

const CHAPTER_OPTIONS = [
  'KA @ Alabama', 'Sigma Nu @ Alabama', 'SAE @ Alabama', 'Sigma Chi @ Alabama', 'Pi Kappa Alpha @ Alabama', 'Kappa Sigma @ Alabama', 'Phi Delta Theta @ Alabama', 'Beta Theta Pi @ Alabama',
  'Sigma Chi @ Ole Miss', 'Sigma Nu @ Ole Miss', 'ATO @ Ole Miss', 'KA @ Ole Miss', 'SAE @ Ole Miss', 'Pi Kappa Alpha @ Ole Miss', 'Phi Delta Theta @ Ole Miss',
  'SAE @ Tennessee', 'Sigma Chi @ Tennessee', 'Pi Kappa Alpha @ Tennessee', 'KA @ Tennessee', 'Sigma Nu @ Tennessee', 'Phi Delta Theta @ Tennessee',
  'Theta Xi @ Boulder', 'Sigma Chi @ Colorado', 'SAE @ Colorado', 'Beta Theta Pi @ Colorado',
  'Sigma Chi @ Mississippi State', 'KA @ Mississippi State', 'Pi Kappa Alpha @ Mississippi State', 'SAE @ Mississippi State',
  'Sigma Chi @ Auburn', 'KA @ Auburn', 'SAE @ Auburn', 'Sigma Nu @ Auburn', 'Pi Kappa Alpha @ Auburn', 'Phi Delta Theta @ Auburn',
  'Sigma Chi @ LSU', 'KA @ LSU', 'SAE @ LSU', 'Sigma Nu @ LSU', 'Pi Kappa Alpha @ LSU',
  'Sigma Chi @ Georgia', 'KA @ Georgia', 'SAE @ Georgia', 'Pi Kappa Alpha @ Georgia', 'Sigma Nu @ Georgia',
  'Sigma Chi @ Florida', 'KA @ Florida', 'SAE @ Florida', 'Sigma Nu @ Florida', 'Pi Kappa Alpha @ Florida',
  'Sigma Chi @ Arkansas', 'KA @ Arkansas', 'SAE @ Arkansas', 'Pi Kappa Alpha @ Arkansas',
  'Sigma Chi @ Texas', 'KA @ Texas', 'SAE @ Texas', 'Phi Delta Theta @ Texas', 'Sigma Nu @ Texas',
  'Sigma Chi @ Texas A&M', 'KA @ Texas A&M', 'SAE @ Texas A&M', 'Pi Kappa Alpha @ Texas A&M',
  'Sigma Chi @ Vanderbilt', 'KA @ Vanderbilt', 'SAE @ Vanderbilt', 'Beta Theta Pi @ Vanderbilt',
  'Sigma Chi @ South Carolina', 'KA @ South Carolina', 'Pi Kappa Alpha @ South Carolina',
  'Sigma Chi @ Kentucky', 'KA @ Kentucky', 'SAE @ Kentucky', 'Sigma Nu @ Kentucky',
  'Sigma Chi @ Ohio State', 'SAE @ Ohio State', 'Sigma Nu @ Ohio State', 'Beta Theta Pi @ Ohio State',
  'Sigma Chi @ Michigan', 'SAE @ Michigan', 'Beta Theta Pi @ Michigan', 'Phi Delta Theta @ Michigan',
  'Sigma Chi @ Penn State', 'SAE @ Penn State', 'Pi Kappa Alpha @ Penn State',
  'Sigma Chi @ USC', 'SAE @ USC', 'Pi Kappa Alpha @ USC', 'Sigma Nu @ USC',
  'Sigma Chi @ UCLA', 'SAE @ UCLA', 'Beta Theta Pi @ UCLA',
  'Sigma Chi @ Arizona', 'SAE @ Arizona', 'KA @ Arizona', 'Pi Kappa Alpha @ Arizona',
  'Sigma Chi @ Arizona State', 'SAE @ Arizona State', 'Pi Kappa Alpha @ Arizona State',
  'Sigma Chi @ Indiana', 'SAE @ Indiana', 'Beta Theta Pi @ Indiana', 'Phi Delta Theta @ Indiana',
  'Sigma Chi @ Purdue', 'SAE @ Purdue', 'Beta Theta Pi @ Purdue',
  'Sigma Chi @ Missouri', 'KA @ Missouri', 'SAE @ Missouri', 'Pi Kappa Alpha @ Missouri',
  'Sigma Chi @ Oklahoma', 'KA @ Oklahoma', 'SAE @ Oklahoma', 'Pi Kappa Alpha @ Oklahoma',
  'KA @ Tulane', 'SAE @ Tulane', 'Pi Kappa Alpha @ Tulane', 'Sigma Nu @ Tulane',
];

// ─── AvatarImg — with initials fallback ──────────────────────────────────────

function AvatarImg({ src, name, initials, bg, size, style: extraStyle }: {
  src: string | null;
  name: string;
  initials: string;
  bg: string;
  size: number;
  style?: React.CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  const baseStyle: React.CSSProperties = {
    width: size,
    height: size,
    borderRadius: '50%',
    flexShrink: 0,
    ...extraStyle,
  };
  if (!src || failed) {
    return (
      <div style={{ ...baseStyle, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: Math.round(size * 0.32), fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>
        {initials}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={name}
      crossOrigin="anonymous"
      style={{ ...baseStyle, objectFit: 'cover' }}
      onError={() => setFailed(true)}
    />
  );
}

// ─── Network Filter Animation (Slide 2) ──────────────────────────────────────

function NetworkFilterAnimation() {
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [scrollKey, setScrollKey] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [targetCard, setTargetCard] = useState<AlumniCard | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const CATEGORIES = ['Finance', 'Real Estate', 'Engineering', 'Marketing', 'Healthcare', 'Consulting', 'Tech', 'Legal'];
  const LOCATIONS   = ['Dallas', 'New York', 'Nashville', 'Houston', 'Washington DC', 'Austin'];

  function handleFilter(filter: string) {
    if (timerRef.current) clearTimeout(timerRef.current);
    setActiveFilter(filter);
    setShowModal(false);
    setTargetCard(null);
    setScrollKey((k) => k + 1);
    const cards = FILTER_ALUMNI[filter] ?? [];
    timerRef.current = setTimeout(() => {
      const card = cards[Math.min(3, cards.length - 1)] ?? cards[0];
      if (card) { setTargetCard(card); setShowModal(true); }
    }, 3900);
  }

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const currentCards = activeFilter ? (FILTER_ALUMNI[activeFilter] ?? []) : [];
  const displayCards = currentCards.length < 5
    ? [...currentCards, ...currentCards, ...currentCards]
    : [...currentCards, ...currentCards];

  return (
    <div>
      {/* Category buttons */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' as const }}>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => handleFilter(cat)}
            style={{
              padding: '7px 15px', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600,
              cursor: 'pointer', fontFamily: "'Instrument Serif', Georgia, serif",
              border: '1.5px solid',
              background: activeFilter === cat ? '#0F172A' : 'white',
              color: activeFilter === cat ? 'white' : '#374151',
              borderColor: activeFilter === cat ? '#0F172A' : '#E5E7EB',
              transition: 'all 0.2s ease',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Location buttons */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' as const }}>
        {LOCATIONS.map((loc) => (
          <button
            key={loc}
            onClick={() => handleFilter(loc)}
            style={{
              padding: '6px 12px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 600,
              cursor: 'pointer', fontFamily: "'Instrument Serif', Georgia, serif",
              border: '1.5px solid',
              background: activeFilter === loc ? '#6366F1' : 'white',
              color: activeFilter === loc ? 'white' : '#6B7280',
              borderColor: activeFilter === loc ? '#6366F1' : '#E5E7EB',
              transition: 'all 0.2s ease',
            }}
          >
            📍 {loc}
          </button>
        ))}
      </div>

      {/* Scrolling cards */}
      <div style={{ width: '100%', overflow: 'hidden', height: '148px' }}>
        {!activeFilter ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontSize: '0.875rem', color: '#D1D5DB', fontFamily: "'Instrument Serif', Georgia, serif" }}>
              Select a category to find alumni…
            </div>
          </div>
        ) : (
          <div
            key={scrollKey}
            style={{
              display: 'flex',
              gap: '12px',
              animation: 'cardsScroll 3.8s cubic-bezier(0.25, 0.8, 0.3, 1) forwards',
            }}
          >
            {displayCards.map((card, idx) => (
              <div
                key={idx}
                style={{
                  flexShrink: 0,
                  width: '156px',
                  background: 'white',
                  border: '1.5px solid #E5E7EB',
                  borderRadius: '12px',
                  padding: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                }}
              >
                <AvatarImg src={card.avatar} name={card.name} initials={card.initials} bg={card.color} size={36} />
                <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#111827', lineHeight: 1.2, fontFamily: "'Instrument Serif', Georgia, serif" }}>{card.name}</div>
                <div style={{ fontSize: '0.7rem', color: '#6B7280', fontFamily: "'Instrument Serif', Georgia, serif" }}>{card.bio}</div>
                <div style={{ fontSize: '0.67rem', color: '#9CA3AF', fontFamily: "'Instrument Serif', Georgia, serif" }}>{card.major} · &apos;{card.year}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Expanded modal card */}
      {showModal && targetCard && (
        <div style={{ marginTop: '14px', animation: 'cardFloat 0.35s ease both' }}>
          <div style={{
            background: 'white',
            border: '2px solid #0F172A',
            borderRadius: '16px',
            padding: '20px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            display: 'flex',
            gap: '14px',
            alignItems: 'flex-start',
            position: 'relative',
          }}>
            <AvatarImg src={targetCard.avatar} name={targetCard.name} initials={targetCard.initials} bg={targetCard.color} size={52} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '1rem', color: '#111827', marginBottom: '3px', fontFamily: "'Instrument Serif', Georgia, serif" }}>{targetCard.name}</div>
              <div style={{ fontSize: '0.8125rem', color: '#6B7280', marginBottom: '8px', fontFamily: "'Instrument Serif', Georgia, serif" }}>{targetCard.bio}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {targetCard.location && (
                  <div style={{ fontSize: '0.75rem', color: '#9CA3AF', fontFamily: "'Instrument Serif', Georgia, serif" }}>📍 {targetCard.location}</div>
                )}
                <div style={{ fontSize: '0.75rem', color: '#9CA3AF', fontFamily: "'Instrument Serif', Georgia, serif" }}>🎓 {targetCard.major} · Class of &apos;{targetCard.year}</div>
                <div style={{ fontSize: '0.75rem', color: '#9CA3AF', fontFamily: "'Instrument Serif', Georgia, serif" }}>🏛️ {targetCard.chapter}</div>
              </div>
            </div>
            <button
              onClick={() => setShowModal(false)}
              style={{ position: 'absolute', top: '12px', right: '14px', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF', fontSize: '18px', lineHeight: 1, padding: '2px 4px' }}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Comm Hub Slide (Slide 5) ─────────────────────────────────────────────────

function CommHubSlide() {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 900);
    const t2 = setTimeout(() => setPhase(2), 2200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const emailRecips = [
    { avatar: RA.ethanHill,   initials: 'EH', bg: '#0F172A' },
    { avatar: RA.nashDehmer,  initials: 'ND', bg: '#6366F1' },
    { avatar: null,            initials: 'GS', bg: '#EC4899' },
    { avatar: null,            initials: 'AH', bg: '#0EA5E9' },
    { avatar: RA.payneParker, initials: 'PP', bg: '#10B981' },
  ];
  const textRecips = [
    { avatar: RA.jakeCoppen,  initials: 'JC', bg: '#0F172A' },
    { avatar: RA.gavinMurrey, initials: 'GM', bg: '#8B5CF6' },
    { avatar: RA.andrewLongo, initials: 'AL', bg: '#F59E0B' },
    { avatar: null,            initials: 'LN', bg: '#EC4899' },
    { avatar: null,            initials: 'AB', bg: '#10B981' },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '36px 24px 0', maxWidth: '680px', margin: '0 auto', width: '100%' }}>
      <h1 style={{ fontSize: 'clamp(1.75rem, 4.5vw, 2.75rem)', fontWeight: 700, color: '#111827', textAlign: 'center', margin: '0 0 8px', fontFamily: "'Instrument Serif', Georgia, serif", letterSpacing: '-0.02em', lineHeight: 1.15 }}>
        Never lose touch again.
      </h1>
      <p style={{ fontSize: '1rem', color: '#6B7280', textAlign: 'center', margin: '0 0 28px', fontFamily: "'Instrument Serif', Georgia, serif" }}>
        Reach every member — email or text, all in one place.
      </p>

      {/* Admin */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '16px', animation: 'cardFloat 0.4s ease 0.1s both' }}>
        <div style={{ width: '58px', height: '58px', borderRadius: '50%', background: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '3px solid white', boxShadow: '0 4px 16px rgba(15,23,42,0.25)' }}>
          <span style={{ color: 'white', fontWeight: 700, fontSize: '1rem', fontFamily: 'Inter, sans-serif' }}>TB</span>
        </div>
        <div style={{ marginTop: '5px', fontSize: '0.75rem', fontWeight: 600, color: '#374151', fontFamily: "'Instrument Serif', Georgia, serif" }}>Chapter Admin</div>
      </div>

      {/* Arrow */}
      <div style={{ fontSize: '1.25rem', marginBottom: '14px', color: '#9CA3AF', opacity: phase >= 1 ? 1 : 0, transition: 'opacity 0.4s ease 0.2s' }}>↓</div>

      {/* Two channel cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', width: '100%', maxWidth: '560px' }}>
        {/* Email */}
        <div style={{
          background: 'white', border: '1.5px solid #E5E7EB', borderRadius: '14px', padding: '18px',
          opacity: phase >= 1 ? 1 : 0,
          transform: phase >= 1 ? 'translateX(0)' : 'translateX(-24px)',
          transition: 'opacity 0.5s ease 0.1s, transform 0.5s ease 0.1s',
          boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span style={{ fontSize: '1.3rem' }}>📧</span>
            <div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#111827', fontFamily: "'Instrument Serif', Georgia, serif" }}>Email Campaign</div>
              <div style={{ fontSize: '0.7rem', color: '#6B7280', fontFamily: "'Instrument Serif', Georgia, serif" }}>Sent to 45 alumni</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' as const, marginBottom: '10px' }}>
            {emailRecips.map((r, i) => (
              <AvatarImg key={i} src={r.avatar} name="" initials={r.initials} bg={r.bg} size={28} />
            ))}
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: '#9CA3AF', fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>+40</div>
          </div>
          {phase >= 2 && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '12px', padding: '4px 10px', animation: 'connectedBadge 0.35s ease both' }}>
              <Check size={11} color="#16A34A" strokeWidth={3} />
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#16A34A', fontFamily: "'Instrument Serif', Georgia, serif" }}>Delivered</span>
            </div>
          )}
        </div>

        {/* SMS */}
        <div style={{
          background: 'white', border: '1.5px solid #E5E7EB', borderRadius: '14px', padding: '18px',
          opacity: phase >= 1 ? 1 : 0,
          transform: phase >= 1 ? 'translateX(0)' : 'translateX(24px)',
          transition: 'opacity 0.5s ease 0.28s, transform 0.5s ease 0.28s',
          boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span style={{ fontSize: '1.3rem' }}>💬</span>
            <div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#111827', fontFamily: "'Instrument Serif', Georgia, serif" }}>Text Blast</div>
              <div style={{ fontSize: '0.7rem', color: '#6B7280', fontFamily: "'Instrument Serif', Georgia, serif" }}>Sent to 128 members</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' as const, marginBottom: '10px' }}>
            {textRecips.map((r, i) => (
              <AvatarImg key={i} src={r.avatar} name="" initials={r.initials} bg={r.bg} size={28} />
            ))}
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#F3F4F6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: '#9CA3AF', fontWeight: 700, fontFamily: 'Inter, sans-serif' }}>+123</div>
          </div>
          {phase >= 2 && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '12px', padding: '4px 10px', animation: 'connectedBadge 0.35s ease 0.18s both' }}>
              <Check size={11} color="#16A34A" strokeWidth={3} />
              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#16A34A', fontFamily: "'Instrument Serif', Georgia, serif" }}>Delivered</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step Indicator ───────────────────────────────────────────────────────────

const STEPS = ['Overview', 'Org Info', 'Your Launch', 'Agreement', 'Payment', 'Confirmation'];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-10 px-4 flex-wrap gap-y-4">
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={label}>
            <div className="flex flex-col items-center gap-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${done ? 'bg-[#0F172A] text-white' : active ? 'bg-[#0F172A] text-white ring-4 ring-[#0F172A]/20' : 'bg-gray-200 text-gray-500'}`}>
                {done ? <Check size={14} /> : i + 1}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${active ? 'text-[#0F172A]' : done ? 'text-[#0F172A]' : 'text-gray-400'}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`flex-1 h-0.5 min-w-4 max-w-16 mx-1 mt-[-12px] rounded-full transition-all ${i < current ? 'bg-[#0F172A]' : 'bg-gray-200'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Full Agreement Text ──────────────────────────────────────────────────────

const FULL_AGREEMENT = `TRAILBLAIZE SOFTWARE AS A SERVICE AGREEMENT

This Software as a Service Agreement ("Agreement") is entered into between Trailblaize, Inc. ("Trailblaize") and the organization identified in this signup flow ("Client").

1. SERVICES
Trailblaize agrees to provide Client with access to the Trailblaize platform, including the alumni directory, message board, engagement tools, and related features, as further described at trailblaize.net (the "Services").

2. SUBSCRIPTION TERM
This Agreement commences on the date Client completes payment ("Effective Date") and continues for an initial term of twelve (12) months ("Initial Term"). After the Initial Term, this Agreement automatically converts to a month-to-month arrangement and may be terminated by either party with thirty (30) days written notice.

3. FEES AND PAYMENT
Client agrees to pay the monthly subscription fee determined by the member count provided at signup. Fees are billed monthly via the payment method on file with Stripe. Pricing may be updated at renewal with mutual written agreement. All fees are non-refundable except as required by law.

4. CLIENT DATA
Client retains full ownership of all data uploaded or generated by Client and its members ("Client Data"). Trailblaize will use Client Data solely to provide and improve the Services and will not sell Client Data to third parties. Client may request an export or deletion of Client Data at any time by contacting support@trailblaize.net.

5. CANCELLATION
After the Initial Term, Client may cancel this Agreement with thirty (30) days written notice to support@trailblaize.net. Cancellation does not relieve Client of the obligation to pay any fees accrued prior to the effective date of cancellation. No cancellation penalties apply after the Initial Term.

6. ACCEPTABLE USE
Client agrees to use the Services only for lawful purposes and in accordance with Trailblaize's Acceptable Use Policy. Client is responsible for all activity conducted through Client's account.

7. LIMITATION OF LIABILITY
TO THE MAXIMUM EXTENT PERMITTED BY LAW, TRAILBLAIZE'S TOTAL LIABILITY ARISING OUT OF OR RELATED TO THIS AGREEMENT SHALL NOT EXCEED THE FEES PAID BY CLIENT IN THE THREE (3) MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM.

8. GOVERNING LAW
This Agreement shall be governed by the laws of the State of Mississippi, without regard to conflict of law principles.

9. ENTIRE AGREEMENT
This Agreement constitutes the entire agreement between the parties and supersedes all prior negotiations, representations, or agreements relating to its subject matter.

By completing the signup process and providing a typed signature, Client acknowledges that it has read, understood, and agrees to be bound by this Agreement.`;

// ─── Main Page ────────────────────────────────────────────────────────────────

function SetUpPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const testMode = searchParams.get('test') === '1';

  const [step, setStep] = useState(0);
  const [subStep, setSubStep] = useState(0);
  const [subStepVisible, setSubStepVisible] = useState(true);
  const [launchSubStep, setLaunchSubStep] = useState(0);
  const [launchVisible, setLaunchVisible] = useState(true);

  // Form state
  const [form, setForm] = useState<FormData>({
    firstName: '',
    lastName: '',
    orgName: '',
    school: '',
    orgType: '',
    designation: '',
    memberCount: '',
    leaderName: '',
    leaderEmail: '',
    leaderPhone: '',
    instagramHandle: '',
  });

  // Chapter autocomplete
  const [chapterDropdownOpen, setChapterDropdownOpen] = useState(false);

  // Agreement state
  const [agreedName, setAgreedName] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [agreedAuthorized, setAgreedAuthorized] = useState(false);
  const [showFullAgreement, setShowFullAgreement] = useState(false);
  const [agreedAt] = useState(() => new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }));
  const [agreedAtISO] = useState(() => new Date().toISOString());

  // Payment state
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');

  // Confirmation state
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const [confirmDone, setConfirmDone] = useState(false);

  // Validation
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  const price = form.memberCount ? getPriceTier(Number(form.memberCount)) : null;

  // Handle URL params on load
  useEffect(() => {
    const success = searchParams.get('success');
    const sessionId = searchParams.get('session_id');
    const stepParam = searchParams.get('step');
    const bypassParam = searchParams.get('bypass');

    if (success === 'true' && bypassParam === '1') {
      setStep(5);
      const bypassData: Record<string, string> = {};
      searchParams.forEach((v, k) => { bypassData[k] = v; });
      handleBypassConfirmation(bypassData);
    } else if (success === 'true' && sessionId) {
      setStep(5);
      handleConfirmation(sessionId);
    } else if (stepParam) {
      setStep(Number(stepParam));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBypassConfirmation = useCallback(async (params: Record<string, string>) => {
    setConfirmLoading(true); setConfirmError('');
    try {
      const res = await fetch('/api/set-up/complete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bypass: true, ...params }),
      });
      const data = await res.json();
      if (!res.ok || data.error) setConfirmError(data.error || 'Something went wrong.');
      else setConfirmDone(true);
    } catch { setConfirmError('Network error. Please contact support@trailblaize.net.'); }
    finally { setConfirmLoading(false); }
  }, []);

  const handleConfirmation = useCallback(async (sessionId: string) => {
    setConfirmLoading(true); setConfirmError('');
    try {
      const res = await fetch('/api/set-up/complete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setConfirmError(data.error || 'Something went wrong. Please contact support@trailblaize.net.');
      } else {
        setConfirmDone(true);
      }
    } catch {
      setConfirmError('Network error. Please contact support@trailblaize.net.');
    } finally {
      setConfirmLoading(false);
    }
  }, []);

  function updateForm(field: keyof FormData, value: string) {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'firstName' || field === 'lastName') {
        next.leaderName = `${field === 'firstName' ? value : prev.firstName} ${field === 'lastName' ? value : prev.lastName}`.trim();
      }
      return next;
    });
    setErrors((prev) => ({ ...prev, [field]: '' }));
  }

  function validateSimpleForm(): boolean {
    const newErrors: Partial<Record<keyof FormData, string>> = {};
    if (!form.firstName.trim()) newErrors.firstName = 'First name is required';
    if (!form.lastName.trim()) newErrors.lastName = 'Last name is required';
    if (!form.orgName.trim()) newErrors.orgName = 'Chapter is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function validateStep1(): boolean {
    const newErrors: Partial<Record<keyof FormData, string>> = {};
    if (!form.orgName.trim()) newErrors.orgName = 'Organization name is required';
    if (!form.orgType) newErrors.orgType = 'Please select an org type';
    if (!form.memberCount || parseInt(form.memberCount) <= 0) newErrors.memberCount = 'Member count is required';
    if (!form.leaderName.trim()) newErrors.leaderName = 'Name is required';
    if (!form.leaderEmail.trim()) newErrors.leaderEmail = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.leaderEmail)) newErrors.leaderEmail = 'Invalid email';
    if (!form.leaderPhone.trim()) newErrors.leaderPhone = 'Phone is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function goToStep(n: number) {
    setStep(n);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function advanceSubStep() {
    setSubStepVisible(false);
    setTimeout(() => {
      setSubStep((s) => s + 1);
      setSubStepVisible(true);
    }, 220);
  }

  function advanceLaunchStep() {
    setLaunchVisible(false);
    setTimeout(() => {
      if (launchSubStep >= 5) {
        goToStep(3);
      } else {
        setLaunchSubStep((s) => s + 1);
        setLaunchVisible(true);
      }
    }, 220);
  }

  async function handleCheckout() {
    setCheckoutLoading(true); setCheckoutError('');
    try {
      const res = await fetch('/api/set-up/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, memberCount: Number(form.memberCount), agreedName, agreedAt: agreedAtISO }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setCheckoutError(data.error || 'Failed to create checkout session.');
      } else if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setCheckoutError('Network error. Please try again.');
    } finally {
      setCheckoutLoading(false);
    }
  }

  // ─── Step 0: Overview (animated walkthrough) ─────────────────────────────

  if (step === 0) {
    const TOTAL_SUBSTEPS = 6;

    // Slide 0: 6 real Alpha Chapter profile cards
    const slide0Profiles = [
      { name: 'Nash Dehmer',   bio: 'Dir of Operations @ US Senate',         location: 'Washington, DC', chapter: 'Alpha · PoliSci \'23', avatar: RA.nashDehmer,  initials: 'ND', color: '#6366F1' },
      { name: 'Ethan Hill',    bio: 'Financial Services Rep @ Fidelity',      location: 'Dallas, TX',     chapter: 'Alpha · Finance \'26', avatar: RA.ethanHill,   initials: 'EH', color: '#0F172A' },
      { name: 'Jake Coppen',   bio: 'Founder @ Scratch AI',                   location: 'New York, NY',   chapter: 'Alpha · Finance \'26', avatar: RA.jakeCoppen,  initials: 'JC', color: '#0F172A' },
      { name: 'Gavin Murrey',  bio: 'Credit Portfolio Analyst @ JPMorgan',   location: null,              chapter: 'Alpha · Finance \'26', avatar: RA.gavinMurrey, initials: 'GM', color: '#8B5CF6' },
      { name: 'Payne Parker',  bio: 'Account Executive @ Knight Commercial', location: 'Dallas, TX',     chapter: 'Alpha · Marketing \'26', avatar: RA.payneParker, initials: 'PP', color: '#EC4899' },
      { name: 'Andrew Longo',  bio: 'GTM @ Glean',                            location: 'Nashville, TN',  chapter: 'Alpha · Marketing \'26', avatar: RA.andrewLongo, initials: 'AL', color: '#F59E0B' },
    ];

    return (
      <div style={{ background: 'white', minHeight: '100vh', fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', flexDirection: 'column' }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap');
          @keyframes cardFloat {
            from { opacity: 0; transform: translateY(28px) scale(0.96); }
            to   { opacity: 1; transform: translateY(0)   scale(1); }
          }
          @keyframes cardsScroll {
            from { transform: translateX(110vw); }
            to   { transform: translateX(-420px); }
          }
          @keyframes avatarPop {
            from { opacity: 0; transform: scale(0.72); }
            to   { opacity: 1; transform: scale(1); }
          }
          @keyframes bubbleSlideLeft {
            from { opacity: 0; transform: translateX(-24px); }
            to   { opacity: 1; transform: translateX(0); }
          }
          @keyframes bubbleSlideRight {
            from { opacity: 0; transform: translateX(24px); }
            to   { opacity: 1; transform: translateX(0); }
          }
          @keyframes connectedBadge {
            from { opacity: 0; transform: scale(0.8) translateY(8px); }
            to   { opacity: 1; transform: scale(1) translateY(0); }
          }
          @keyframes spaceCardIn {
            from { opacity: 0; transform: translateX(-12px); }
            to   { opacity: 1; transform: translateX(0); }
          }
          @keyframes phoneIn {
            from { opacity: 0; transform: scale(0.88); }
            to   { opacity: 1; transform: scale(1); }
          }
          @media (max-width: 580px) {
            .slide0-grid { grid-template-columns: 1fr 1fr !important; }
          }
        `}</style>

        {testMode && (
          <div style={{ background: '#fef3c7', borderBottom: '1px solid #f59e0b', padding: '8px 16px', textAlign: 'center', fontSize: '0.8125rem', fontWeight: 600, color: '#92400e' }}>
            🧪 TEST MODE — No real charges will be made
          </div>
        )}

        {/* Nav */}
        <nav style={{ padding: '0 28px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #F3F4F6', background: 'white', flexShrink: 0 }}>
          <img src="/logos/logo-wordmark-navy.png" alt="Trailblaize" style={{ height: '28px' }} />
          <button
            onClick={() => goToStep(1)}
            style={{ padding: '8px 20px', borderRadius: '8px', background: '#0F172A', color: 'white', fontWeight: 600, fontSize: '0.875rem', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Get Started
          </button>
        </nav>

        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', padding: '14px 0', borderBottom: '1px solid #F3F4F6', flexShrink: 0 }}>
          {Array.from({ length: TOTAL_SUBSTEPS }).map((_, i) => (
            <div key={i} style={{
              width: i === subStep ? '22px' : '7px',
              height: '7px',
              borderRadius: '4px',
              background: i === subStep ? '#0F172A' : '#D1D5DB',
              transition: 'all 0.3s ease',
            }} />
          ))}
        </div>

        {/* Slide content */}
        <div style={{
          flex: 1,
          opacity: subStepVisible ? 1 : 0,
          transform: subStepVisible ? 'translateY(0)' : 'translateY(20px)',
          transition: 'opacity 0.22s ease, transform 0.22s ease',
          display: 'flex',
          flexDirection: 'column',
        }}>

          {/* ── Slide 0: Your network, in one place. ── */}
          {subStep === 0 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '36px 24px 0', maxWidth: '720px', margin: '0 auto', width: '100%' }}>
              <h1 style={{ fontSize: 'clamp(1.75rem, 4.5vw, 2.75rem)', fontWeight: 700, color: '#111827', textAlign: 'center', margin: '0 0 8px', fontFamily: "'Instrument Serif', Georgia, serif", letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                Your network, in one place.
              </h1>
              <p style={{ fontSize: '1rem', color: '#6B7280', textAlign: 'center', margin: '0 0 32px', fontFamily: "'Instrument Serif', Georgia, serif" }}>
                Every member and alumni, one tap away.
              </p>
              <div className="slide0-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', width: '100%', maxWidth: '600px' }}>
                {slide0Profiles.map((profile, i) => (
                  <div
                    key={profile.name}
                    style={{
                      background: 'white',
                      border: '1px solid #E5E7EB',
                      borderRadius: '12px',
                      padding: '14px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      animation: `cardFloat 0.55s ease ${i * 0.1 + 0.1}s both`,
                      boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                    }}
                  >
                    <AvatarImg src={profile.avatar} name={profile.name} initials={profile.initials} bg={profile.color} size={40} />
                    <div style={{ fontWeight: 700, fontSize: '0.8125rem', color: '#111827', lineHeight: 1.2, fontFamily: "'Instrument Serif', Georgia, serif" }}>{profile.name}</div>
                    <div style={{ fontSize: '0.72rem', color: '#6B7280', lineHeight: 1.3, fontFamily: "'Instrument Serif', Georgia, serif" }}>{profile.bio}</div>
                    {profile.location && (
                      <div style={{ fontSize: '0.67rem', color: '#9CA3AF', fontFamily: "'Instrument Serif', Georgia, serif" }}>📍 {profile.location}</div>
                    )}
                    <div style={{ fontSize: '0.65rem', color: '#9CA3AF', fontFamily: "'Instrument Serif', Georgia, serif" }}>🏛️ {profile.chapter}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Slide 1: Open Up Your Verified Network ── */}
          {subStep === 1 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '36px 24px 0', maxWidth: '720px', margin: '0 auto', width: '100%' }}>
              <h1 style={{ fontSize: 'clamp(1.75rem, 4.5vw, 2.75rem)', fontWeight: 700, color: '#111827', textAlign: 'center', margin: '0 0 8px', fontFamily: "'Instrument Serif', Georgia, serif", letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                Open Up Your <span style={{ fontStyle: 'italic' }}>Verified</span> Network
              </h1>
              <p style={{ fontSize: '1rem', color: '#6B7280', textAlign: 'center', margin: '0 0 24px', fontFamily: "'Instrument Serif', Georgia, serif" }}>
                Filter by industry, location, or interests.
              </p>
              <div style={{ width: '100%', maxWidth: '620px', animation: 'cardFloat 0.4s ease 0.1s both' }}>
                <NetworkFilterAnimation />
              </div>
            </div>
          )}

          {/* ── Slide 2: Start a conversation that matters. ── */}
          {subStep === 2 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '36px 24px 0', maxWidth: '520px', margin: '0 auto', width: '100%' }}>
              <h1 style={{ fontSize: 'clamp(1.75rem, 4.5vw, 2.75rem)', fontWeight: 700, color: '#111827', textAlign: 'center', margin: '0 0 8px', fontFamily: "'Instrument Serif', Georgia, serif", letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                Start a conversation that matters.
              </h1>
              <p style={{ fontSize: '1rem', color: '#6B7280', textAlign: 'center', margin: '0 0 32px', fontFamily: "'Instrument Serif', Georgia, serif" }}>
                Message any alumni directly — no LinkedIn required.
              </p>

              {/* Avatars */}
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '420px', marginBottom: '20px' }}>
                {/* Chadwick (active, initiator) */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', animation: 'avatarPop 0.4s ease 0.1s both' }}>
                  <AvatarImg src="/faces/face3.jpg" name="Chadwick Mask" initials="CM" bg="#0EA5E9" size={56} style={{ border: '2px solid #E5E7EB' }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#111827', fontFamily: "'Instrument Serif', Georgia, serif" }}>Chadwick Mask</div>
                    <div style={{ fontSize: '0.7rem', color: '#6B7280', fontFamily: "'Instrument Serif', Georgia, serif" }}>Finance · Active &apos;29</div>
                  </div>
                </div>
                {/* Nash (alumni, responder) */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', animation: 'avatarPop 0.4s ease 0.25s both' }}>
                  <AvatarImg src={RA.nashDehmer} name="Nash Dehmer" initials="ND" bg="#6366F1" size={56} style={{ border: '2px solid #E5E7EB' }} />
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#111827', fontFamily: "'Instrument Serif', Georgia, serif" }}>Nash Dehmer</div>
                    <div style={{ fontSize: '0.7rem', color: '#6B7280', fontFamily: "'Instrument Serif', Georgia, serif" }}>US Senate · DC &apos;23</div>
                  </div>
                </div>
              </div>

              {/* Message bubbles */}
              <div style={{ width: '100%', maxWidth: '420px', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', animation: 'bubbleSlideLeft 0.4s ease 0.8s both', opacity: 0 }}>
                  <AvatarImg src="/faces/face3.jpg" name="Chadwick" initials="CM" bg="#0EA5E9" size={28} />
                  <div style={{ background: '#F3F4F6', borderRadius: '14px 14px 14px 2px', padding: '10px 14px', maxWidth: '280px' }}>
                    <p style={{ fontSize: '0.8125rem', color: '#111827', margin: 0, lineHeight: 1.5, fontFamily: "'Instrument Serif', Georgia, serif" }}>
                      Hey Nash, saw you&apos;re working at the US Senate in DC — exploring a career in policy after graduation. Any advice on how to break in?
                    </p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', justifyContent: 'flex-end', animation: 'bubbleSlideRight 0.4s ease 2.4s both', opacity: 0 }}>
                  <div style={{ background: '#0F172A', borderRadius: '14px 14px 2px 14px', padding: '10px 14px', maxWidth: '280px' }}>
                    <p style={{ fontSize: '0.8125rem', color: 'white', margin: 0, lineHeight: 1.5, fontFamily: "'Instrument Serif', Georgia, serif" }}>
                      Definitely happy to help. My path was a bit unconventional — send me a message and let&apos;s find time to chat this week.
                    </p>
                  </div>
                  <AvatarImg src={RA.nashDehmer} name="Nash" initials="ND" bg="#6366F1" size={28} />
                </div>
              </div>

              {/* Connected badge */}
              <div style={{ animation: 'connectedBadge 0.4s ease 4.4s both', opacity: 0 }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '20px', padding: '7px 18px' }}>
                  <Check size={14} color="#16A34A" strokeWidth={2.5} />
                  <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#16A34A', fontFamily: "'Instrument Serif', Georgia, serif" }}>Connected</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Slide 3: Your chapter. Your alumni. One tap away. ── */}
          {subStep === 3 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '36px 24px 0', maxWidth: '680px', margin: '0 auto', width: '100%' }}>
              <h1 style={{ fontSize: 'clamp(1.75rem, 4.5vw, 2.75rem)', fontWeight: 700, color: '#111827', textAlign: 'center', margin: '0 0 8px', fontFamily: "'Instrument Serif', Georgia, serif", letterSpacing: '-0.02em', lineHeight: 1.15 }}>
                Your chapter. Your alumni.
                <br />One tap away.
              </h1>
              <p style={{ fontSize: '1rem', color: '#6B7280', textAlign: 'center', margin: '0 0 28px', fontFamily: "'Instrument Serif', Georgia, serif" }}>
                Spaces aren&apos;t just Greek — universities, clubs, companies.
              </p>

              {/* Phone mockup */}
              <div style={{
                width: '210px',
                minHeight: '340px',
                border: '3px solid #111827',
                borderRadius: '32px',
                padding: '14px 12px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                animation: 'phoneIn 0.5s ease 0.1s both',
                background: 'white',
              }}>
                <div style={{ width: '44px', height: '5px', background: '#D1D5DB', borderRadius: '4px', margin: '0 auto 4px' }} />
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: '2px', fontFamily: "'Instrument Serif', Georgia, serif" }}>Your Spaces</div>
                {[
                  { icon: '🎓', name: 'NYU',               sub: 'New York University',        count: '12,400+ alumni' },
                  { icon: '🏛️', name: 'Kappa Kappa Gamma', sub: 'ΚΚΓ Chapter',                count: '850 members' },
                  { icon: '💼', name: 'NYU Finance Club',   sub: 'Student Organization',       count: '320 members' },
                  { icon: '🏢', name: 'Goldman Sachs',      sub: 'Alumni & Employees',         count: '200+ alumni' },
                ].map((space, i) => (
                  <div key={space.name} style={{
                    background: '#F9FAFB',
                    border: '1px solid #E5E7EB',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    animation: `spaceCardIn 0.4s ease ${i * 0.15 + 0.35}s both`,
                    opacity: 0,
                  }}>
                    <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{space.icon}</span>
                    <div>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#111827', lineHeight: 1.2, fontFamily: "'Instrument Serif', Georgia, serif" }}>{space.name}</div>
                      <div style={{ fontSize: '0.62rem', color: '#9CA3AF', fontFamily: "'Instrument Serif', Georgia, serif" }}>{space.count}</div>
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'center', paddingTop: '8px' }}>
                  <div style={{ width: '40px', height: '4px', background: '#D1D5DB', borderRadius: '4px' }} />
                </div>
              </div>
            </div>
          )}

          {/* ── Slide 4 (NEW): Never lose touch again. ── */}
          {subStep === 4 && (
            <CommHubSlide />
          )}

          {/* ── Slide 5: Ready to claim your Space? (CTA) ── */}
          {subStep === 5 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 32px', maxWidth: '480px', margin: '0 auto', width: '100%', textAlign: 'center' }}>
              <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.25rem)', fontWeight: 700, color: '#111827', margin: '0 0 16px', fontFamily: "'Instrument Serif', Georgia, serif", letterSpacing: '-0.025em', lineHeight: 1.1 }}>
                Ready to claim
                <br />your Space?
              </h1>
              <p style={{ fontSize: '1.0625rem', color: '#6B7280', margin: '0 0 36px', lineHeight: 1.65, maxWidth: '340px', fontFamily: "'Instrument Serif', Georgia, serif" }}>
                Takes 2 minutes. No credit card required to get started.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: '100%', maxWidth: '300px' }}>
                <button
                  onClick={() => goToStep(1)}
                  style={{ padding: '14px 28px', borderRadius: '10px', background: '#0F172A', color: 'white', fontWeight: 700, fontSize: '1rem', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  Let&apos;s get started <ArrowRight size={18} />
                </button>
                <button
                  onClick={() => router.push('/waitlist')}
                  style={{ padding: '13px 28px', borderRadius: '10px', background: 'white', color: '#374151', fontWeight: 600, fontSize: '1rem', border: '1.5px solid #E5E7EB', cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Join the waitlist
                </button>
              </div>
            </div>
          )}

          {/* Bottom nav — hidden on CTA slide */}
          {subStep < 5 && (
            <div style={{ maxWidth: '720px', margin: '0 auto', width: '100%', padding: '24px 24px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                onClick={() => goToStep(1)}
                style={{ fontSize: '0.8125rem', color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
              >
                Skip to setup →
              </button>
              <button
                onClick={advanceSubStep}
                style={{ padding: '10px 28px', borderRadius: '8px', background: '#0F172A', color: 'white', fontWeight: 600, fontSize: '0.9375rem', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          )}

        </div>
      </div>
    );
  }

  // ─── Step 1: Form (First name, Last name, Chapter) ────────────────────────

  if (step === 1) {
    const filteredChapters = CHAPTER_OPTIONS.filter(
      (c) => form.orgName.trim().length > 0 && c.toLowerCase().includes(form.orgName.toLowerCase())
    ).slice(0, 8);

    return (
      <PageShell testMode={testMode}>
        <StepIndicator current={1} />
        <Card>
          <h2 style={S.h2}>Let&apos;s get you set up</h2>
          <p style={S.sub}>Just the basics for now — we&apos;ll collect the rest before you go live.</p>

          <div style={S.fieldWrap}>
            {/* First Name */}
            <Field label="First Name *" error={errors.firstName}>
              <input
                type="text"
                value={form.firstName}
                onChange={(e) => updateForm('firstName', e.target.value)}
                placeholder="First name"
                style={S.input(!!errors.firstName)}
              />
            </Field>

            {/* Last Name */}
            <Field label="Last Name *" error={errors.lastName}>
              <input
                type="text"
                value={form.lastName}
                onChange={(e) => updateForm('lastName', e.target.value)}
                placeholder="Last name"
                style={S.input(!!errors.lastName)}
              />
            </Field>

            {/* Chapter autocomplete */}
            <Field label="Your Chapter *" error={errors.orgName}>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  value={form.orgName}
                  onChange={(e) => {
                    updateForm('orgName', e.target.value);
                    setChapterDropdownOpen(true);
                  }}
                  onFocus={() => setChapterDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setChapterDropdownOpen(false), 160)}
                  placeholder="e.g. Sigma Chi @ Ole Miss"
                  style={S.input(!!errors.orgName)}
                  autoComplete="off"
                />
                {chapterDropdownOpen && filteredChapters.length > 0 && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                    background: 'white', border: '1px solid #E5E7EB', borderRadius: '10px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.09)', zIndex: 50, overflow: 'hidden',
                  }}>
                    {filteredChapters.map((chapter, i) => (
                      <button
                        key={chapter}
                        type="button"
                        onMouseDown={() => { updateForm('orgName', chapter); setChapterDropdownOpen(false); }}
                        style={{
                          display: 'block', width: '100%', textAlign: 'left' as const,
                          padding: '10px 14px', fontSize: '0.875rem', color: '#374151',
                          background: 'none', border: 'none',
                          borderBottom: i < filteredChapters.length - 1 ? '1px solid #F3F4F6' : 'none',
                          cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#F9FAFB'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                      >
                        {chapter}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Field>
          </div>

          <div style={S.actions}>
            <button onClick={() => goToStep(0)} style={S.backBtn}>← Back</button>
            <NavButton onClick={() => { if (validateSimpleForm()) goToStep(2); }}>
              Continue <ChevronRight size={16} />
            </NavButton>
          </div>
        </Card>
      </PageShell>
    );
  }

  // ─── Step 2: Your Launch ──────────────────────────────────────────────────

  if (step === 2) {
    const LAUNCH_TOTAL = 6;
    return (
      <div style={{ fontFamily: 'Inter, system-ui, sans-serif', minHeight: '100vh', background: 'white', display: 'flex', flexDirection: 'column' }}>
        <style>{`
          @keyframes nodePulse {
            0%, 100% { transform: scale(1); opacity: 0.85; }
            50% { transform: scale(1.3); opacity: 1; }
          }
          @keyframes fadeUp {
            from { opacity: 0; transform: translateY(24px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes checkPop {
            0% { transform: scale(0) rotate(-10deg); opacity: 0; }
            65% { transform: scale(1.18) rotate(3deg); opacity: 1; }
            100% { transform: scale(1) rotate(0); opacity: 1; }
          }
          @keyframes floatY {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-7px); }
          }
          @keyframes lineGrow {
            from { stroke-dashoffset: 200; opacity: 0; }
            to { stroke-dashoffset: 0; opacity: 1; }
          }
          @keyframes orbitIn {
            from { transform: scale(0); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
          }
          @keyframes glowPulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.4); }
            50% { box-shadow: 0 0 0 10px rgba(16,185,129,0); }
          }
          @keyframes rowFade {
            0% { opacity: 0.3; transform: translateX(-8px); }
            100% { opacity: 1; transform: translateX(0); }
          }
          @keyframes hubPulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.08); }
          }
          @keyframes nodeAppear {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @media (max-width: 640px) {
            .launch-grid { grid-template-columns: 1fr !important; }
            .launch-cards-grid { grid-template-columns: 1fr !important; }
            .launch-next-btn { width: 100% !important; justify-content: center !important; }
          }
        `}</style>

        {testMode && (
          <div style={{ background: '#fef3c7', borderBottom: '1px solid #f59e0b', padding: '8px 16px', textAlign: 'center', fontSize: '0.8125rem', fontWeight: 600, color: '#92400e' }}>
            🧪 TEST MODE - No real charges will be made
          </div>
        )}

        <nav style={{ background: 'white', borderBottom: '1px solid #F3F4F6', padding: '12px 24px', display: 'flex', alignItems: 'center' }}>
          <img src="/logos/logo-wordmark-navy.png" alt="Trailblaize" style={{ height: '28px' }} />
        </nav>

        <div style={{ background: 'white' }}>
          <div style={{ maxWidth: '640px', margin: '0 auto', padding: '24px 24px 0' }}>
            <StepIndicator current={2} />
          </div>
        </div>

        {/* Progress dots */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', padding: '14px 0', background: 'white', borderBottom: '1px solid #F3F4F6', flexShrink: 0 }}>
          {Array.from({ length: LAUNCH_TOTAL }).map((_, i) => (
            <div key={i} style={{
              width: i === launchSubStep ? '22px' : '7px',
              height: '7px',
              borderRadius: '4px',
              background: i === launchSubStep ? '#0F172A' : '#D1D5DB',
              transition: 'all 0.3s ease',
            }} />
          ))}
        </div>

        <div style={{
          flex: 1,
          opacity: launchVisible ? 1 : 0,
          transform: launchVisible ? 'translateY(0)' : 'translateY(20px)',
          transition: 'opacity 0.22s ease, transform 0.22s ease',
          display: 'flex',
          flexDirection: 'column',
        }}>

          {/* Sub-step 0: Collaborative Launch */}
          {launchSubStep === 0 && (
            <div style={{ flex: 1, padding: 'clamp(32px, 5vw, 56px) 16px 0', maxWidth: '680px', margin: '0 auto', width: '100%' }}>
              <div className="launch-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '40px', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: 'rgba(16,185,129,0.13)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'glowPulse 2.8s ease infinite' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.5" fill="#10B981" stroke="none"/>
                        </svg>
                      </div>
                      <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: 'rgba(16,185,129,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Rocket size={20} color="#10B981" />
                      </div>
                    </div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#10B981', textTransform: 'uppercase' as const, letterSpacing: '0.09em' }}>Step 1</span>
                  </div>
                  <h3 style={{ fontSize: 'clamp(1.25rem, 3vw, 1.5rem)', fontWeight: 700, color: '#111827', margin: '0 0 12px', lineHeight: 1.2 }}>Collaborative Launch</h3>
                  <p style={{ fontSize: '0.9375rem', color: '#6B7280', lineHeight: 1.7, margin: '0 0 10px' }}>
                    We create a <strong style={{ color: '#111827' }}>collaborative Instagram post with your chapter</strong>, driving early adopters to join from day one.
                  </p>
                  <p style={{ fontSize: '0.9375rem', color: '#6B7280', lineHeight: 1.7, margin: '0 0 10px' }}>
                    Members DM us or comment on the post for a private sign-up link.
                  </p>
                  <p style={{ fontSize: '0.9375rem', color: '#6B7280', lineHeight: 1.7, margin: 0 }}>
                    Those early adopters become your ambassadors, bringing in the rest of your alumni through real word-of-mouth.
                  </p>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  <div style={{ width: '230px', background: 'white', border: '1px solid #E5E7EB', borderRadius: '16px', overflow: 'hidden' }}>
                    <div style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.5" fill="white" stroke="none"/></svg>
                      </div>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#111827' }}>Direct Messages</span>
                    </div>
                    <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#E5E7EB', flexShrink: 0 }} />
                        <div style={{ background: '#F3F4F6', borderRadius: '12px 12px 12px 2px', padding: '8px 10px', maxWidth: '160px' }}>
                          <p style={{ fontSize: '0.75rem', color: '#111827', margin: 0, lineHeight: 1.4 }}>Hey! I saw the post about your chapter on Trailblaize. How do I join?</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <div style={{ background: '#0F172A', borderRadius: '12px 12px 2px 12px', padding: '8px 10px', maxWidth: '160px' }}>
                          <p style={{ fontSize: '0.75rem', color: 'white', margin: 0, lineHeight: 1.4 }}>Here&apos;s your private link: trailblaize.net/join/alpha...</p>
                        </div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: '0.6875rem', color: '#9CA3AF' }}>Seen</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Sub-step 1: Activate Your Network */}
          {launchSubStep === 1 && (
            <div style={{ flex: 1, padding: 'clamp(32px, 5vw, 56px) 16px 0', maxWidth: '680px', margin: '0 auto', width: '100%' }}>
              <div className="launch-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '40px', alignItems: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', order: 0 }}>
                  <svg viewBox="0 0 280 200" width="280" height="200" style={{ overflow: 'visible', maxWidth: '100%' }}>
                    <defs>
                      {[{cx:52,cy:52},{cx:228,cy:52},{cx:228,cy:148},{cx:52,cy:148},{cx:140,cy:16}].map((n,i) => (
                        <clipPath key={i} id={`ls1-clip-${i}`}><circle cx={n.cx} cy={n.cy} r={18} /></clipPath>
                      ))}
                    </defs>
                    {[
                      {cx:52,cy:52,d:0.25},{cx:228,cy:52,d:0.45},
                      {cx:228,cy:148,d:0.65},{cx:52,cy:148,d:0.85},{cx:140,cy:16,d:1.05},
                    ].map((n,i) => (
                      <line key={`line-${i}`} x1="140" y1="100" x2={n.cx} y2={n.cy}
                        stroke="#E5E7EB" strokeWidth="1.5"
                        style={{ opacity: 0, animation: `nodeAppear 0.5s ease ${n.d}s forwards` }} />
                    ))}
                    <circle cx="140" cy="100" r="24" fill="#0F172A" style={{ animation: 'hubPulse 2.5s ease infinite' }} />
                    <text x="140" y="104" textAnchor="middle" fill="white" fontSize="10" fontWeight="700">YOU</text>
                    {[
                      {cx:52,cy:52,d:0.3,avatar:RA.payneParker},
                      {cx:228,cy:52,d:0.5,avatar:RA.nashDehmer},
                      {cx:228,cy:148,d:0.7,avatar:RA.jakeCoppen},
                      {cx:52,cy:148,d:0.9,avatar:RA.andrewLongo},
                      {cx:140,cy:16,d:1.1,avatar:RA.gavinMurrey},
                    ].map((n,i) => (
                      <g key={`node-${i}`} style={{ opacity: 0, animation: `nodeAppear 0.5s ease ${n.d}s forwards` }}>
                        <image href={n.avatar} x={n.cx-18} y={n.cy-18} width={36} height={36}
                          clipPath={`url(#ls1-clip-${i})`} preserveAspectRatio="xMidYMid slice" />
                        <circle cx={n.cx} cy={n.cy} r={18} fill="none" stroke="#E5E7EB" strokeWidth="2" />
                      </g>
                    ))}
                  </svg>
                </div>
                <div style={{ order: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Phone size={20} color="#0F172A" />
                    </div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#10B981', textTransform: 'uppercase' as const, letterSpacing: '0.09em' }}>Step 2</span>
                  </div>
                  <h3 style={{ fontSize: 'clamp(1.25rem, 3vw, 1.5rem)', fontWeight: 700, color: '#111827', margin: '0 0 12px', lineHeight: 1.2 }}>Activate Your Network</h3>
                  <p style={{ fontSize: '0.9375rem', color: '#6B7280', lineHeight: 1.7, margin: '0 0 10px' }}>
                    We personally call your early adopters, connecting them with each other by industry, city, and shared interests.
                  </p>
                  <p style={{ fontSize: '0.9375rem', color: '#6B7280', lineHeight: 1.7, margin: 0 }}>
                    Looking for a job, a mentor, advice, or just curious who&apos;s really in your network? We make those introductions happen.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Sub-step 2: Meet Alumni Where They Are */}
          {launchSubStep === 2 && (
            <div style={{ flex: 1, padding: 'clamp(32px, 5vw, 56px) 16px 0', maxWidth: '680px', margin: '0 auto', width: '100%' }}>
              <div className="launch-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '40px', alignItems: 'center', marginBottom: '32px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Radio size={20} color="#10B981" />
                    </div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#10B981', textTransform: 'uppercase' as const, letterSpacing: '0.09em' }}>Step 3</span>
                  </div>
                  <h3 style={{ fontSize: 'clamp(1.25rem, 3vw, 1.5rem)', fontWeight: 700, color: '#111827', margin: '0 0 12px', lineHeight: 1.2 }}>Meet Alumni Where They Are</h3>
                  <p style={{ fontSize: '0.9375rem', color: '#6B7280', lineHeight: 1.7, margin: '0 0 10px' }}>
                    We utilize any channels you already have, including Facebook groups, LinkedIn, and GroupMe, providing <strong style={{ color: '#111827' }}>custom flyers, blurbs, and a private sign-up link</strong> for each.
                  </p>
                  <p style={{ fontSize: '0.9375rem', color: '#6B7280', lineHeight: 1.7, margin: 0 }}>
                    Alumni can also find your space on our mobile app and request access. You approve or reject requests. You are always in control.
                  </p>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                  <div style={{ position: 'relative', width: '220px', height: '160px' }}>
                    <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: '52px', height: '52px', borderRadius: '14px', background: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'hubPulse 2.5s ease infinite', zIndex: 2 }}>
                      <Share2 size={22} color="white" />
                    </div>
                    {[
                      {label:'f', bg:'#1877F2', top:'4px', left:'10px', d:'0.2s'},
                      {label:'in', bg:'#0A66C2', top:'4px', right:'10px', d:'0.4s'},
                      {label:'G', bg:'#25D366', bottom:'4px', left:'10px', d:'0.6s'},
                      {label:'✉', bg:'#6366F1', bottom:'4px', right:'10px', d:'0.8s'},
                      {label:'📱', bg:'#374151', top:'calc(50% - 20px)', right:'-2px', d:'1.0s'},
                    ].map((c,i) => (
                      <div key={i} style={{
                        position: 'absolute',
                        ...(c.top !== undefined ? {top: c.top} : {}),
                        ...(c.bottom !== undefined ? {bottom: c.bottom} : {}),
                        ...(c.left !== undefined ? {left: c.left} : {}),
                        ...(c.right !== undefined ? {right: c.right} : {}),
                        width: '40px', height: '40px', borderRadius: '10px', background: c.bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontSize: '0.75rem', fontWeight: 700,
                        animation: `orbitIn 0.5s ease ${c.d} both, floatY 3s ease ${i * 0.5}s infinite`,
                        zIndex: 1,
                      }}>
                        {c.label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              {/* Messaging mock */}
              <div style={{ background: 'rgba(15,23,42,0.97)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <MessageSquare size={14} color="#10B981" />
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>Messages</span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>Payne Parker</span>
                </div>
                {[
                  { initials: 'EH', name: 'Ethan Hill',   preview: "Hey Payne, saw you're at Knight Commercial. I know a few guys in Dallas real estate — let me connect you.", time: '2m ago', unread: true,  color: '#0F172A', avatar: RA.ethanHill },
                  { initials: 'ND', name: 'Nash Dehmer',  preview: "Would love to connect you with someone at the Senate if policy is interesting to you.",                   time: '1h ago', unread: false, color: '#6366F1', avatar: RA.nashDehmer },
                  { initials: 'JC', name: 'Jake Coppen',  preview: "Great to see you on here. We're growing at Scratch AI — let's catch up.",                                 time: '3h ago', unread: false, color: '#0F172A', avatar: RA.jakeCoppen },
                ].map((m, i) => (
                  <div key={i} style={{ padding: '12px 16px', borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.06)' : 'none', display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <AvatarImg src={m.avatar} name={m.name} initials={m.initials} bg={m.color} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                        <span style={{ fontSize: '0.8125rem', fontWeight: m.unread ? 700 : 600, color: 'white' }}>{m.name}</span>
                        <span style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>{m.time}</span>
                      </div>
                      <p style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{m.preview}</p>
                    </div>
                    {m.unread && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10B981', flexShrink: 0 }} />}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sub-step 3: Database Outreach */}
          {launchSubStep === 3 && (
            <div style={{ flex: 1, padding: 'clamp(32px, 5vw, 56px) 16px 0', maxWidth: '680px', margin: '0 auto', width: '100%' }}>
              <div className="launch-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '40px', alignItems: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', order: 0 }}>
                  <div style={{ width: '240px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '12px', overflow: 'hidden' }}>
                    <div style={{ background: '#0F172A', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Database size={14} color="#10B981" />
                      <span style={{ color: 'white', fontSize: '0.75rem', fontWeight: 600 }}>alumni_contacts.csv</span>
                    </div>
                    {[
                      {name:'Payne P.', d:'0.2s'},{name:'Nash D.', d:'0.5s'},
                      {name:'Gavin M.', d:'0.8s'},{name:'Ethan H.', d:'1.1s'},{name:'Jake C.', d:'1.4s'},
                    ].map((row,i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', borderBottom: '1px solid #F3F4F6', animation: `rowFade 0.5s ease ${row.d} both` }}>
                        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#111827' }}>{row.name}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Mail size={12} color="#10B981" style={{ animation: `checkPop 0.4s ease ${parseFloat(row.d) + 0.3}s both`, opacity: 0 }} />
                          <div style={{ width: '16px', height: '16px', borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: `checkPop 0.4s ease ${parseFloat(row.d) + 0.5}s both`, opacity: 0 }}>
                            <Check size={9} color="#16a34a" strokeWidth={3} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ order: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Database size={20} color="#0F172A" />
                    </div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#10B981', textTransform: 'uppercase' as const, letterSpacing: '0.09em' }}>Step 4</span>
                  </div>
                  <h3 style={{ fontSize: 'clamp(1.25rem, 3vw, 1.5rem)', fontWeight: 700, color: '#111827', margin: '0 0 12px', lineHeight: 1.2 }}>Database Outreach</h3>
                  <p style={{ fontSize: '0.9375rem', color: '#6B7280', lineHeight: 1.7, margin: '0 0 10px' }}>
                    Have a spreadsheet of alumni contacts? We <strong style={{ color: '#111827' }}>email every alumni three times</strong> and personally text everyone via iMessage.
                  </p>
                  <p style={{ fontSize: '0.9375rem', color: '#6B7280', lineHeight: 1.7, margin: 0 }}>
                    We verify contact info, clean up the data, and invite each one personally to join your platform.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Sub-step 4: Alumni Sign Up in Minutes */}
          {launchSubStep === 4 && (
            <div style={{ padding: 'clamp(32px, 5vw, 56px) 16px 0', maxWidth: '680px', margin: '0 auto', width: '100%' }}>
              <div style={{ marginBottom: '28px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                  <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Clock size={20} color="#10B981" />
                  </div>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#10B981', textTransform: 'uppercase' as const, letterSpacing: '0.09em' }}>Step 5</span>
                </div>
                <h3 style={{ fontSize: 'clamp(1.25rem, 3vw, 1.5rem)', fontWeight: 700, color: '#111827', margin: '0 0 10px', lineHeight: 1.2 }}>Alumni Sign Up in Minutes</h3>
                <p style={{ fontSize: '0.9375rem', color: '#6B7280', lineHeight: 1.7, margin: 0, maxWidth: '480px' }}>
                  Once alumni receive the invite, joining is frictionless. Create a profile, join your space, done. Then the whole network opens up.
                </p>
              </div>
              <div className="launch-cards-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                <div style={{ background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', padding: '20px' }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#10B981', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '14px' }}>Step 1</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginBottom: '4px' }}>
                    <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '2px dashed rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2px' }}>
                      <User size={18} color="rgba(255,255,255,0.4)" />
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '6px', height: '28px', display: 'flex', alignItems: 'center', padding: '0 10px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>Chadwick Mask</span>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '6px', height: '28px', display: 'flex', alignItems: 'center', padding: '0 10px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>Finance · Senior</span>
                    </div>
                    <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '6px', height: '28px', display: 'flex', alignItems: 'center', padding: '0 10px' }}>
                      <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>Oxford, MS</span>
                    </div>
                  </div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'white', margin: '14px 0 4px' }}>Create Profile</h4>
                  <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, margin: 0 }}>Name, photo, industry, city, grad year</p>
                </div>
                <div style={{ background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', padding: '20px' }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#10B981', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '14px' }}>Step 2</div>
                  <div style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', padding: '12px', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.1)' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#10B981' }}>TB</span>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'white' }}>Alpha Chapter</div>
                        <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.45)' }}>247 members</div>
                      </div>
                    </div>
                    <button style={{ width: '100%', padding: '7px', borderRadius: '7px', background: '#10B981', color: 'white', fontSize: '0.75rem', fontWeight: 700, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>Request to Join</button>
                  </div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'white', margin: '14px 0 4px' }}>Join Your Space</h4>
                  <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, margin: 0 }}>Request access — admin approves in one tap</p>
                </div>
                <div style={{ background: '#0F172A', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '14px', padding: '20px' }}>
                  <div style={{ fontSize: '0.65rem', fontWeight: 700, color: '#10B981', textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: '14px' }}>Step 3</div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px 0 8px' }}>
                    <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(16,185,129,0.15)', border: '2px solid rgba(16,185,129,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '10px', animation: 'checkPop 0.5s ease 0.3s both' }}>
                      <Check size={26} color="#10B981" strokeWidth={2.5} />
                    </div>
                    <span style={{ fontSize: '1rem', fontWeight: 700, color: 'white' }}>You&apos;re in!</span>
                    <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', marginTop: '4px', textAlign: 'center' as const }}>Connected to Alpha Chapter</span>
                  </div>
                  <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'white', margin: '14px 0 4px' }}>Fully Connected</h4>
                  <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5, margin: 0 }}>Message alumni, explore the network, get opportunities</p>
                </div>
              </div>
            </div>
          )}

          {/* Sub-step 5: Your Digital Community */}
          {launchSubStep === 5 && (
            <div style={{ flex: 1, padding: 'clamp(32px, 5vw, 56px) 16px 0', maxWidth: '680px', margin: '0 auto', width: '100%' }}>
              <div className="launch-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '40px', alignItems: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', order: 0 }}>
                  <svg viewBox="0 0 260 180" width="260" height="180" style={{ overflow: 'visible', maxWidth: '100%' }}>
                    <defs>
                      {[{cx:86,cy:52},{cx:174,cy:52},{cx:174,cy:128},{cx:86,cy:128}].map((n,i) => (
                        <clipPath key={i} id={`ls5i-clip-${i}`}><circle cx={n.cx} cy={n.cy} r={11} /></clipPath>
                      ))}
                      {[{cx:42,cy:38},{cx:218,cy:38},{cx:218,cy:142},{cx:42,cy:142},{cx:130,cy:12},{cx:130,cy:168}].map((n,i) => (
                        <clipPath key={i} id={`ls5o-clip-${i}`}><circle cx={n.cx} cy={n.cy} r={7} /></clipPath>
                      ))}
                    </defs>
                    <circle cx="130" cy="90" r="18" fill="#0F172A" style={{ animation: 'hubPulse 2.5s ease infinite' }} />
                    <text x="130" y="94" textAnchor="middle" fill="white" fontSize="9" fontWeight="700">TB</text>
                    {[
                      {cx:86,cy:52,d:'0.2s',avatar:RA.payneParker},
                      {cx:174,cy:52,d:'0.4s',avatar:RA.nashDehmer},
                      {cx:174,cy:128,d:'0.6s',avatar:RA.jakeCoppen},
                      {cx:86,cy:128,d:'0.8s',avatar:RA.andrewLongo},
                    ].map((n,i) => (
                      <g key={i}>
                        <line x1="130" y1="90" x2={n.cx} y2={n.cy} stroke="#E5E7EB" strokeWidth="1.5"
                          strokeDasharray="200" strokeDashoffset="200"
                          style={{ animation: `lineGrow 0.5s ease ${n.d} both` }} />
                        <image href={n.avatar} x={n.cx-11} y={n.cy-11} width={22} height={22}
                          clipPath={`url(#ls5i-clip-${i})`} preserveAspectRatio="xMidYMid slice"
                          style={{ animation: `orbitIn 0.4s ease ${n.d} both, nodePulse 2.6s ease ${i * 0.5}s infinite` }} />
                        <circle cx={n.cx} cy={n.cy} r={11} fill="none" stroke="#E5E7EB" strokeWidth="1.5"
                          style={{ animation: `orbitIn 0.4s ease ${n.d} both` }} />
                      </g>
                    ))}
                    {[
                      {cx:42,cy:38,fromX:86,fromY:52,d:'1.0s',avatar:RA.ethanHill},
                      {cx:218,cy:38,fromX:174,fromY:52,d:'1.2s',avatar:RA.gavinMurrey},
                      {cx:218,cy:142,fromX:174,fromY:128,d:'1.4s',avatar:'/faces/face12.jpg'},
                      {cx:42,cy:142,fromX:86,fromY:128,d:'1.6s',avatar:'/faces/face9.jpg'},
                      {cx:130,cy:12,fromX:130,fromY:90,d:'1.8s',avatar:'/faces/face5.jpg'},
                      {cx:130,cy:168,fromX:130,fromY:90,d:'2.0s',avatar:'/faces/face3.jpg'},
                    ].map((n,i) => (
                      <g key={i}>
                        <line x1={n.fromX} y1={n.fromY} x2={n.cx} y2={n.cy} stroke="#F3F4F6" strokeWidth="1"
                          strokeDasharray="200" strokeDashoffset="200"
                          style={{ animation: `lineGrow 0.4s ease ${n.d} both` }} />
                        <image href={n.avatar} x={n.cx-7} y={n.cy-7} width={14} height={14}
                          clipPath={`url(#ls5o-clip-${i})`} preserveAspectRatio="xMidYMid slice"
                          style={{ animation: `orbitIn 0.4s ease ${n.d} both` }} />
                        <circle cx={n.cx} cy={n.cy} r={7} fill="none" stroke="#E5E7EB" strokeWidth="1.5"
                          style={{ animation: `orbitIn 0.4s ease ${n.d} both` }} />
                      </g>
                    ))}
                  </svg>
                </div>
                <div style={{ order: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
                    <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Globe size={20} color="#0F172A" />
                    </div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#10B981', textTransform: 'uppercase' as const, letterSpacing: '0.09em' }}>Step 6</span>
                  </div>
                  <h3 style={{ fontSize: 'clamp(1.25rem, 3vw, 1.5rem)', fontWeight: 700, color: '#111827', margin: '0 0 12px', lineHeight: 1.2 }}>Your Digital Community</h3>
                  <p style={{ fontSize: '0.9375rem', color: '#6B7280', lineHeight: 1.7, margin: '0 0 10px' }}>
                    The digital space and community you&apos;ve built for your entire organization. Network effect and word of mouth take over.
                  </p>
                  <p style={{ fontSize: '0.9375rem', color: '#6B7280', lineHeight: 1.7, margin: 0 }}>
                    Trailblaize becomes the <strong style={{ color: '#111827' }}>living, breathing alumni network</strong> your organization has always needed.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Bottom nav */}
          <div style={{ maxWidth: '680px', margin: '0 auto', width: '100%', padding: '24px 16px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              onClick={() => goToStep(3)}
              style={{ fontSize: '0.8125rem', color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, minHeight: '44px' }}
            >
              Skip to agreement →
            </button>
            <button
              className="launch-next-btn"
              onClick={advanceLaunchStep}
              style={{ padding: '10px 28px', borderRadius: '8px', background: '#0F172A', color: 'white', fontWeight: 600, fontSize: '0.9375rem', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '8px', minHeight: '44px' }}
            >
              {launchSubStep === 5 ? 'Continue to Agreement' : 'Next'}
              {launchSubStep === 5 ? <ArrowRight size={16} /> : <ChevronRight size={16} />}
            </button>
          </div>

        </div>
      </div>
    );
  }

  // ─── Step 3: Agreement ────────────────────────────────────────────────────

  if (step === 3) {
    const canProceed = agreedName.trim().length > 0 && agreedAuthorized;
    return (
      <PageShell testMode={testMode}>
        <StepIndicator current={3} />
        <Card>
          <h2 style={S.h2}>Here&apos;s what you&apos;re agreeing to</h2>
          <p style={S.sub}>Plain language, no surprises.</p>

          {/* Member count + contact info — needed for pricing and checkout */}
          <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 12, padding: '20px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', display: 'block', marginBottom: 6 }}>How many active members does your chapter have?</label>
              <input
                type="number"
                min={1}
                placeholder="e.g. 120"
                value={form.memberCount}
                onChange={e => setForm(f => ({ ...f, memberCount: e.target.value }))}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: '0.9375rem', fontFamily: 'inherit', outline: 'none' }}
              />
              {form.memberCount && <p style={{ fontSize: '0.8125rem', color: '#10B981', marginTop: 6, marginBottom: 0, fontWeight: 600 }}>${getPriceTier(Number(form.memberCount))}/month</p>}
            </div>
            {!form.leaderEmail && (
              <div>
                <label style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', display: 'block', marginBottom: 6 }}>Contact email</label>
                <input
                  type="email"
                  placeholder="your@email.com"
                  value={form.leaderEmail}
                  onChange={e => setForm(f => ({ ...f, leaderEmail: e.target.value }))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: '0.9375rem', fontFamily: 'inherit', outline: 'none' }}
                />
              </div>
            )}
            {!form.leaderPhone && (
              <div>
                <label style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', display: 'block', marginBottom: 6 }}>Contact phone</label>
                <input
                  type="tel"
                  placeholder="(555) 123-4567"
                  value={form.leaderPhone}
                  onChange={e => setForm(f => ({ ...f, leaderPhone: e.target.value }))}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E5E7EB', fontSize: '0.9375rem', fontFamily: 'inherit', outline: 'none' }}
                />
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '28px' }}>
            {[
              { icon: <Zap size={18} color="#0F172A" />, title: "What you're getting", desc: "Access to the full Trailblaize platform — alumni directory, message board, engagement tools, and ongoing support." },
              { icon: <Calendar size={18} color="#0F172A" />, title: 'Your commitment', desc: promoCode === 'SAE' ? '6-month commitment starting today. After six months, cancel anytime with 30 days notice. No hidden fees.' : '12-month commitment starting today. After year one, cancel anytime with 30 days notice. No hidden fees.' },
              { icon: <DollarSign size={18} color="#0F172A" />, title: 'What it costs', desc: price ? `$${price}/month · Billed monthly · Based on ${form.memberCount} members. Pricing reviewed at renewal.` : 'Pricing based on your member count.' },
              { icon: <Shield size={18} color="#0F172A" />, title: 'Your data', desc: "Your data belongs to you. We use it only to run the platform. Never sold. Export or delete anytime." },
            ].map((card) => (
              <div key={card.title} style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '16px 20px', display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                <div style={{ flexShrink: 0, marginTop: '1px' }}>{card.icon}</div>
                <div>
                  <p style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', margin: '0 0 4px 0' }}>{card.title}</p>
                  <p style={{ fontSize: '0.8125rem', color: '#6B7280', lineHeight: 1.5, margin: 0 }}>{card.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <button type="button" onClick={() => setShowFullAgreement(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', fontWeight: 600, color: '#0F172A', background: 'none', border: 'none', cursor: 'pointer', marginBottom: '12px', fontFamily: 'inherit' }}>
            {showFullAgreement ? 'Hide full agreement ↑' : 'Read full agreement ↓'}
          </button>

          {showFullAgreement && (
            <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '16px', marginBottom: '20px', maxHeight: '240px', overflowY: 'auto' }}>
              <pre style={{ fontSize: '0.6875rem', color: '#6B7280', whiteSpace: 'pre-wrap', fontFamily: 'inherit', lineHeight: 1.6, margin: 0 }}>{promoCode === 'SAE' ? FULL_AGREEMENT.replace('twelve (12) months', 'six (6) months').replace('Initial Term', 'Initial Term (6 months)') : FULL_AGREEMENT}</pre>
              <div style={{ marginTop: '12px', borderTop: '1px solid #E5E7EB', paddingTop: '12px' }}>
                <input
                  type="text" value={promoCode} onChange={e => setPromoCode(e.target.value.toUpperCase())}
                  placeholder="Code"
                  style={{ width: '120px', padding: '6px 10px', border: '1px solid #E5E7EB', borderRadius: '6px', fontSize: '0.75rem', fontFamily: 'inherit', color: '#9CA3AF' }}
                />
                {promoCode === 'SAE' && <span style={{ fontSize: '0.7rem', color: '#10B981', marginLeft: '8px', fontWeight: 600 }}>6-month commitment applied</span>}
              </div>
            </div>
          )}

          <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '14px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '0.875rem', color: '#374151', fontWeight: 500, margin: 0 }}>
              I agree to these terms on behalf of <span style={{ color: '#111827', fontWeight: 700 }}>{form.orgName || 'my organization'}</span>
            </p>
            <div>
              <label style={S.label}>Type your full name to sign *</label>
              <input type="text" value={agreedName} onChange={e => setAgreedName(e.target.value)}
                placeholder="Your full name"
                style={{ ...S.input(false), fontFamily: 'cursive, Georgia, serif', fontSize: '1rem', color: '#111827' }} />
            </div>
            <div>
              <label style={S.label}>Date</label>
              <p style={{ ...S.input(false), display: 'block', color: '#6B7280', lineHeight: '1.5', padding: '10px 12px' }}>{agreedAt}</p>
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer' }}>
              <div onClick={() => setAgreedAuthorized(v => !v)}
                style={{ width: '20px', height: '20px', borderRadius: '4px', border: `2px solid ${agreedAuthorized ? '#0F172A' : '#D1D5DB'}`, background: agreedAuthorized ? '#0F172A' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px', cursor: 'pointer' }}>
                {agreedAuthorized && <Check size={12} color="white" />}
              </div>
              <span style={{ fontSize: '0.875rem', color: '#374151', lineHeight: 1.5 }}>I confirm I am authorized to enter into this agreement on behalf of my organization</span>
            </label>
          </div>

          <div style={S.actions}>
            <button onClick={() => goToStep(2)} style={S.backBtn}>← Back</button>
            <NavButton onClick={() => { if (canProceed) goToStep(4); }} disabled={!canProceed}>
              Continue to Payment <ChevronRight size={16} />
            </NavButton>
          </div>
        </Card>
      </PageShell>
    );
  }

  // ─── Step 4: Payment ──────────────────────────────────────────────────────

  if (step === 4) {
    return (
      <PageShell testMode={testMode}>
        <StepIndicator current={4} />
        <Card>
          <h2 style={S.h2}>Complete your payment</h2>
          <p style={S.sub}>You&apos;ll be redirected to Stripe&apos;s secure checkout.</p>
          <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '16px', padding: '24px', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <h3 style={{ fontWeight: 600, color: '#0F172A', margin: '0 0 4px' }}>Order Summary</h3>
            <Row label="Organization" value={form.orgName} />
            {form.school && <Row label="School" value={form.school} />}
            {form.orgType && <Row label="Type" value={form.orgType} />}
            {form.memberCount && <Row label="Members" value={`${form.memberCount} members`} />}
            <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: '12px', marginTop: '4px' }}>
              <Row label="Monthly Price" value={price ? `$${price}/month` : 'TBD'} />
            </div>
            <p style={{ fontSize: '0.75rem', color: '#9CA3AF', margin: 0 }}>Annual commitment, then month-to-month · Cancel after year one with 30 days notice</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem', color: '#6B7280', marginBottom: '24px' }}>
            <Shield size={16} color="#9CA3AF" />
            <span>Secured by Stripe — your payment info is never stored on our servers</span>
          </div>
          {checkoutError && (
            <div style={{ background: '#fef2f2', color: '#dc2626', borderRadius: '10px', padding: '12px 16px', fontSize: '0.875rem', marginBottom: '16px' }}>
              {checkoutError}
            </div>
          )}
          <div style={S.actions}>
            <button onClick={() => goToStep(3)} style={S.backBtn}>← Back</button>
            <NavButton onClick={handleCheckout} disabled={checkoutLoading}>
              {checkoutLoading ? (
                <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Redirecting...</>
              ) : (
                <>Complete Payment <ArrowRight size={16} /></>
              )}
            </NavButton>
          </div>
        </Card>
      </PageShell>
    );
  }

  // ─── Step 5: Confirmation ─────────────────────────────────────────────────

  return (
    <PageShell testMode={testMode}>
      <StepIndicator current={5} />
      <Card>
        {confirmLoading ? (
          <div style={{ padding: '64px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', textAlign: 'center' }}>
            <Loader2 size={36} style={{ animation: 'spin 1s linear infinite', color: '#0F172A' }} />
            <p style={{ color: '#6B7280', fontSize: '0.875rem', margin: 0 }}>Setting up your account...</p>
          </div>
        ) : confirmError ? (
          <div style={{ padding: '48px 0', textAlign: 'center' }}>
            <p style={{ color: '#dc2626', fontWeight: 600, marginBottom: '8px', fontSize: '0.9375rem' }}>Something went wrong</p>
            <p style={{ color: '#6B7280', fontSize: '0.875rem', marginBottom: '20px' }}>{confirmError}</p>
            <a href="mailto:support@trailblaize.net" style={{ color: '#0F172A', fontSize: '0.875rem', fontWeight: 600 }}>Contact support</a>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '28px' }}>
              <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px', border: '1px solid #bbf7d0' }}>
                <Check size={36} color="#16a34a" strokeWidth={2.5} />
              </div>
              <h2 style={{ fontSize: '1.75rem', fontWeight: 700, color: '#111827', margin: '0 0 6px 0' }}>You&apos;re in.</h2>
              {(form.orgName || form.school) && (
                <p style={{ color: '#6B7280', fontSize: '0.875rem', margin: 0 }}>{form.orgName}{form.school ? ` · ${form.school}` : ''}</p>
              )}
            </div>
            <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: '14px', padding: '20px', marginBottom: '24px' }}>
              <p style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase' as const, letterSpacing: '0.05em', margin: '0 0 16px 0' }}>What happens next</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  { emoji: '✅', text: 'Your account is being created' },
                  { emoji: '📱', text: "We'll reach out within 24 hours to help with your launch post" },
                  { emoji: '📅', text: 'Book your onboarding call to get set up for success' },
                  { emoji: '🔑', text: 'Log in and start activating your alumni network' },
                ].map(item => (
                  <div key={item.text} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <span style={{ fontSize: '1rem', flexShrink: 0 }}>{item.emoji}</span>
                    <span style={{ fontSize: '0.875rem', color: '#374151', lineHeight: 1.5 }}>{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <a href="https://calendly.com/owen-trailblaize/30min" target="_blank" rel="noopener noreferrer"
                style={{ display: 'block', textAlign: 'center', padding: '12px 24px', borderRadius: '10px', border: '1.5px solid #0F172A', color: '#0F172A', fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none', fontFamily: 'Inter, system-ui, sans-serif' }}>
                Book Onboarding Call
              </a>
              <a href="https://www.trailblaize.net/sign-in"
                style={{ display: 'block', textAlign: 'center', padding: '12px 24px', borderRadius: '10px', background: '#0F172A', color: 'white', fontWeight: 600, fontSize: '0.875rem', textDecoration: 'none', fontFamily: 'Inter, system-ui, sans-serif' }}>
                Log In →
              </a>
            </div>
          </>
        )}
      </Card>
    </PageShell>
  );
}

// ─── Helper Components ────────────────────────────────────────────────────────

function PageShell({ children, testMode }: { children: React.ReactNode; testMode?: boolean }) {
  return (
    <div style={{ background: '#F9FAFB', minHeight: '100vh' }}>
      {testMode && (
        <div style={{ background: '#fef3c7', borderBottom: '1px solid #f59e0b', padding: '8px 16px', textAlign: 'center', fontSize: '0.8125rem', fontWeight: 600, color: '#92400e' }}>
          🧪 TEST MODE - Use card 4242 4242 4242 4242 · No real charges will be made
        </div>
      )}
      <nav style={{ background: 'white', borderBottom: '1px solid #F3F4F6', padding: '12px 24px', display: 'flex', alignItems: 'center' }}>
        <img src="/logos/logo-wordmark-navy.png" alt="Trailblaize" style={{ height: '28px' }} />
      </nav>
      <main style={{ maxWidth: '640px', margin: '0 auto', padding: '32px 24px 64px' }}>
        {children}
      </main>
    </div>
  );
}

const S = {
  card: { background: 'white', border: '1px solid #E5E7EB', borderRadius: '16px', padding: '28px' },
  h2: { fontSize: '1.375rem', fontWeight: 700, color: '#111827', margin: '0 0 6px 0', fontFamily: 'Inter, system-ui, sans-serif' } as React.CSSProperties,
  sub: { fontSize: '0.875rem', color: '#6B7280', margin: '0 0 28px 0' } as React.CSSProperties,
  fieldWrap: { display: 'flex', flexDirection: 'column' as const, gap: '20px' },
  label: { display: 'block', fontSize: '0.8125rem', fontWeight: 600, color: '#374151', marginBottom: '6px', fontFamily: 'Inter, system-ui, sans-serif' } as React.CSSProperties,
  hint: { fontSize: '0.75rem', color: '#9ca3af', marginTop: '4px' } as React.CSSProperties,
  error: { fontSize: '0.75rem', color: '#ef4444', marginTop: '4px' } as React.CSSProperties,
  input: (hasError: boolean): React.CSSProperties => ({
    width: '100%', padding: '10px 12px', fontSize: '0.875rem',
    border: `1px solid ${hasError ? '#ef4444' : '#E5E7EB'}`,
    borderRadius: '10px', outline: 'none', fontFamily: 'Inter, system-ui, sans-serif',
    boxSizing: 'border-box' as const, color: '#111827', background: 'white',
  }),
  row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.875rem' } as React.CSSProperties,
  actions: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '28px' } as React.CSSProperties,
  backBtn: { fontSize: '0.875rem', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', alignItems: 'center', gap: '4px' } as React.CSSProperties,
  primaryBtn: (disabled?: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    padding: '10px 24px', borderRadius: '10px',
    background: disabled ? '#D1D5DB' : '#0F172A',
    color: 'white', fontWeight: 600, fontSize: '0.875rem',
    border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'Inter, system-ui, sans-serif',
  }),
};

function Card({ children }: { children: React.ReactNode }) {
  return <div style={S.card}>{children}</div>;
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={S.label}>{label}</label>
      {children}
      {hint && !error && <p style={S.hint}>{hint}</p>}
      {error && <p style={S.error}>{error}</p>}
    </div>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div style={S.row}>
      <span style={{ color: '#6B7280' }}>{label}</span>
      <span style={valueClass === 'font-bold text-emerald-600' ? { fontWeight: 700, color: '#10b981' } : { fontWeight: 600, color: '#111827' }}>{value}</span>
    </div>
  );
}

function NavButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={S.primaryBtn(disabled)}>
      {children}
    </button>
  );
}

// Wrap in Suspense so useSearchParams() works with Next.js static export
export default function SetUpPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0F172A]" /></div>}>
      <SetUpPage />
    </Suspense>
  );
}
