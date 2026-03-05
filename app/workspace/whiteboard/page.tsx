'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Whiteboard } from '../components/Whiteboard';

export default function WhiteboardPage() {
  return (
    <div className="wb-page">
      {/* Mobile-friendly back button */}
      <div className="wb-back-bar">
        <Link href="/workspace" className="wb-back-btn">
          <ArrowLeft size={16} />
          <span>Dashboard</span>
        </Link>
      </div>
      <Whiteboard />
    </div>
  );
}
