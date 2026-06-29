'use client';

import React from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  CheckSquare,
  ArrowRight,
  HeartHandshake,
  Building2,
  Rocket,
  Users,
  Star,
  Radar,
  Wallet,
} from 'lucide-react';

const modules = [
  {
    title: 'Sales Pipeline',
    description: 'Track deals and manage opportunities.',
    icon: TrendingUp,
    href: '/nucleus/war-room',
  },
  {
    title: 'Customer Success',
    description: 'Track chapter onboarding and health.',
    icon: HeartHandshake,
    href: '/nucleus/customer-success',
  },
  {
    title: 'Finance',
    description: 'Track chapter payments and revenue.',
    icon: Wallet,
    href: '/nucleus/finance',
  },
  {
    title: 'Operations & Tasks',
    description: 'Coordinate activities and track progress.',
    icon: CheckSquare,
    href: '/nucleus/operations',
  },
  {
    title: 'Enterprise Contracts',
    description: 'Manage IFCs and large partnerships.',
    icon: Building2,
    href: '/nucleus/enterprise',
  },
  {
    title: 'Fundraising & Network',
    description: 'Build relationships and manage your network.',
    icon: Rocket,
    href: '/nucleus/fundraising',
  },
  {
    title: 'Employees & Onboarding',
    description: 'Manage team members and track onboarding progress.',
    icon: Users,
    href: '/nucleus/employees',
  },
  {
    title: 'Ambassador Tracker',
    description: 'Track student ambassadors per school — contact, status, and notes.',
    icon: Star,
    href: '/nucleus/ambassadors',
  },
  {
    title: 'Mission Control',
    description: 'Founder command center — agents, outreach pipelines, crons, and memory.',
    icon: Radar,
    href: '/nucleus/mission-control',
  },
];

export default function Nucleus() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#F9FAFB',
        padding: '40px 24px',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: 36 }}>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 600,
              color: '#111827',
              margin: 0,
              letterSpacing: '-0.3px',
            }}
          >
            Nucleus
          </h1>
          <p style={{ fontSize: 14, color: '#6B7280', marginTop: 4, marginBottom: 0 }}>
            Trailblaize Internal Command Center
          </p>
        </div>

        {/* Modules Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 10,
          }}
        >
          {modules.map((module, index) => (
            <Link
              key={index}
              href={module.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: '16px 18px',
                background: '#ffffff',
                border: '1px solid #E5E7EB',
                borderRadius: 12,
                textDecoration: 'none',
                cursor: 'pointer',
              }}
            >
              {/* Icon box */}
              <div
                style={{
                  width: 40,
                  height: 40,
                  background: '#F3F4F6',
                  borderRadius: 10,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <module.icon size={20} color="#0F172A" />
              </div>

              {/* Text */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: '#111827',
                    marginBottom: 2,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {module.title}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: '#6B7280',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {module.description}
                </div>
              </div>

              <ArrowRight size={15} color="#D1D5DB" style={{ flexShrink: 0 }} />
            </Link>
          ))}
        </div>

        {/* Footer */}
        <p
          style={{
            textAlign: 'center',
            fontSize: 12,
            color: '#9CA3AF',
            marginTop: 52,
            marginBottom: 0,
          }}
        >
          Trailblaize Nucleus · Internal Use Only
        </p>
      </div>
    </div>
  );
}
