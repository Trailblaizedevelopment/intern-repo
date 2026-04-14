'use client';

/**
 * EmailCampaignEditorV2
 *
 * 3-mode email composer:
 *   Mode 1 — Templates:   6 pre-built, beautiful email templates with field customization
 *   Mode 2 — AI Generate: Prompt → Anthropic → gorgeous HTML email
 *   Mode 3 — HTML:        Raw HTML paste with upgraded preview, copy, download, stats
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Eye, Copy, Download, Check, Loader2, Sparkles, ChevronLeft, FileText } from 'lucide-react';

/* ─────────────────────────── Types ─── */

interface EmailCampaignEditorV2Props {
  value: string;
  onChange: (html: string) => void;
  chapterName?: string;
  chapterType?: string;
  placeholder?: string;
}

type ComposerMode = 'templates' | 'ai' | 'html';

interface TemplateField {
  key: string;        // e.g. ALUMNI_NAME
  label: string;
  placeholder: string;
  multiline?: boolean;
}

interface EmailTemplate {
  id: string;
  name: string;
  description: string;
  emoji: string;
  fields: TemplateField[];
  buildHtml: (values: Record<string, string>) => string;
}

/* ─────────────────────────── Brand helpers ─── */

const NAVY   = '#1B2A4A';
const AMBER  = '#C4874A';
const BG     = '#F8F6F2';
const LOGO   = 'https://trailblaize.space/logos/logo-wordmark-color.png';

function emailShell(headerContent: string, bodyContent: string, footerExtra = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Email</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style>
    @media only screen and (max-width: 620px) {
      .email-container { width: 100% !important; }
      .email-body-cell { padding: 24px 16px !important; }
      .hero-padding { padding: 32px 16px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:${BG};font-family:system-ui,-apple-system,Georgia,serif;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color:${BG};">
    <tr>
      <td style="padding:24px 16px;">
        <!-- Email Container -->
        <table class="email-container" role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(27,42,74,0.10);">
          <!-- Header -->
          <tr>
            <td style="background-color:${NAVY};padding:24px 32px;text-align:center;">
              <a href="https://trailblaize.net" style="display:inline-block;text-decoration:none;">
                <img src="${LOGO}" alt="Trailblaize" width="180" height="auto" style="display:block;border:0;max-width:180px;" />
              </a>
              ${headerContent}
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td class="email-body-cell" style="padding:36px 40px;background-color:#ffffff;">
              ${bodyContent}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:${BG};padding:20px 32px;text-align:center;border-top:1px solid #E8E3DC;">
              ${footerExtra}
              <p style="margin:0;font-size:12px;color:#9B8E7F;line-height:1.6;font-family:system-ui,-apple-system,Georgia,serif;">
                Powered by <a href="https://trailblaize.net" style="color:${AMBER};text-decoration:none;font-weight:600;">Trailblaize</a> · <a href="https://trailblaize.net" style="color:#9B8E7F;text-decoration:none;">trailblaize.net</a>
              </p>
              <p style="margin:8px 0 0;font-size:11px;color:#B8AFA5;font-family:system-ui,-apple-system,Georgia,serif;">
                You received this email because you're connected to your chapter.<br/>
                <a href="#" style="color:#B8AFA5;">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaButton(href: string, label: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px auto;">
    <tr>
      <td style="border-radius:8px;background-color:${AMBER};">
        <a href="${href}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;font-family:system-ui,-apple-system,Georgia,serif;letter-spacing:0.01em;">${label}</a>
      </td>
    </tr>
  </table>`;
}

function divider(): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:24px 0;">
    <tr><td style="height:1px;background-color:#E8E3DC;font-size:0;line-height:0;">&nbsp;</td></tr>
  </table>`;
}

function sectionLabel(text: string): string {
  return `<p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${AMBER};font-family:system-ui,-apple-system,Georgia,serif;">${text}</p>`;
}

/* ─────────────────────────── Templates ─── */

const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'job-opportunity',
    name: 'Job/Internship Opportunity',
    description: 'Alumni posting a career opportunity for chapter members',
    emoji: '💼',
    fields: [
      { key: 'ALUMNI_NAME', label: 'Alumni Name', placeholder: 'Jane Smith' },
      { key: 'COMPANY', label: 'Company', placeholder: 'Acme Corp' },
      { key: 'ROLE_TITLE', label: 'Role Title', placeholder: 'Software Engineer Intern' },
      { key: 'ROLE_TYPE', label: 'Type', placeholder: 'Full-time / Internship / Part-time' },
      { key: 'DESCRIPTION', label: 'Role Description', placeholder: 'Describe the role, responsibilities, and what makes it great...', multiline: true },
      { key: 'HOW_TO_APPLY', label: 'How to Apply / Contact', placeholder: 'Send resume to jane@acme.com or apply at acme.com/careers', multiline: true },
      { key: 'DEADLINE', label: 'Application Deadline', placeholder: 'March 15, 2025 (or "Rolling basis")' },
    ],
    buildHtml: (v) => emailShell(
      `<p style="margin:12px 0 0;font-size:13px;color:rgba(255,255,255,0.7);font-family:system-ui,-apple-system,Georgia,serif;">Career Opportunity</p>`,
      `<h1 style="margin:0 0 6px;font-size:26px;font-weight:800;color:${NAVY};line-height:1.2;font-family:system-ui,-apple-system,Georgia,serif;">
        ${v.ROLE_TITLE || 'Role Title'}
      </h1>
      <p style="margin:0 0 24px;font-size:16px;color:${AMBER};font-weight:600;font-family:system-ui,-apple-system,Georgia,serif;">
        ${v.COMPANY || 'Company'} · ${v.ROLE_TYPE || 'Opportunity'}
      </p>
      ${divider()}
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 20px;">
        <tr>
          <td style="padding:16px;background-color:${BG};border-radius:10px;border-left:4px solid ${AMBER};">
            <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:${NAVY};font-family:system-ui,-apple-system,Georgia,serif;">Posted by</p>
            <p style="margin:0;font-size:15px;color:#374151;font-family:system-ui,-apple-system,Georgia,serif;">${v.ALUMNI_NAME || 'Alumni Name'}, ${v.COMPANY || 'Company'}</p>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:${NAVY};font-family:system-ui,-apple-system,Georgia,serif;">About the Role</p>
      <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;font-family:system-ui,-apple-system,Georgia,serif;">
        ${(v.DESCRIPTION || 'Role description goes here.').replace(/\n/g, '<br/>')}
      </p>
      ${divider()}
      ${sectionLabel('How to Apply')}
      <p style="margin:0 0 4px;font-size:15px;color:#374151;line-height:1.7;font-family:system-ui,-apple-system,Georgia,serif;">
        ${(v.HOW_TO_APPLY || 'Contact information goes here.').replace(/\n/g, '<br/>')}
      </p>
      ${v.DEADLINE ? `<p style="margin:16px 0 0;font-size:13px;color:#9B8E7F;font-family:system-ui,-apple-system,Georgia,serif;">⏰ Deadline: <strong style="color:${NAVY};">${v.DEADLINE}</strong></p>` : ''}`,
    ),
  },
  {
    id: 'alumni-spotlight',
    name: 'Alumni Spotlight',
    description: 'Highlight a successful chapter alumni',
    emoji: '⭐',
    fields: [
      { key: 'ALUMNI_NAME', label: 'Alumni Name', placeholder: 'John Doe' },
      { key: 'CLASS_YEAR', label: 'Class Year', placeholder: "'18 / Class of 2018" },
      { key: 'COMPANY', label: 'Company', placeholder: 'Google' },
      { key: 'ROLE', label: 'Current Role', placeholder: 'Senior Product Manager' },
      { key: 'QUOTE', label: 'Quote from Alumni', placeholder: 'The chapter taught me leadership and how to build lasting relationships.', multiline: true },
      { key: 'ADVICE', label: 'Advice to Actives', placeholder: 'Network early, stay curious, and never underestimate the power of your brotherhood.', multiline: true },
      { key: 'PHOTO_URL', label: 'Photo URL (optional)', placeholder: 'https://example.com/photo.jpg' },
    ],
    buildHtml: (v) => emailShell(
      `<p style="margin:12px 0 0;font-size:13px;color:rgba(255,255,255,0.7);font-family:system-ui,-apple-system,Georgia,serif;">Alumni Spotlight ✨</p>`,
      `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:24px;">
        <tr>
          ${v.PHOTO_URL ? `<td width="80" style="vertical-align:top;padding-right:20px;">
            <img src="${v.PHOTO_URL}" alt="${v.ALUMNI_NAME || 'Alumni'}" width="80" height="80" style="border-radius:50%;display:block;border:3px solid ${AMBER};object-fit:cover;" />
          </td>` : ''}
          <td style="vertical-align:middle;">
            ${sectionLabel('This Month\'s Spotlight')}
            <h1 style="margin:0 0 4px;font-size:24px;font-weight:800;color:${NAVY};font-family:system-ui,-apple-system,Georgia,serif;">${v.ALUMNI_NAME || 'Alumni Name'}</h1>
            <p style="margin:0;font-size:14px;color:${AMBER};font-weight:600;font-family:system-ui,-apple-system,Georgia,serif;">${v.ROLE || 'Role'} at ${v.COMPANY || 'Company'}</p>
            <p style="margin:4px 0 0;font-size:13px;color:#9B8E7F;font-family:system-ui,-apple-system,Georgia,serif;">Chapter ${v.CLASS_YEAR || ''}</p>
          </td>
        </tr>
      </table>
      ${divider()}
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 24px;">
        <tr>
          <td style="padding:20px 24px;background-color:${BG};border-radius:12px;border-left:4px solid ${AMBER};">
            <p style="margin:0 0 10px;font-size:22px;color:${AMBER};">"</p>
            <p style="margin:0;font-size:16px;color:${NAVY};line-height:1.7;font-style:italic;font-family:Georgia,serif;">
              ${(v.QUOTE || 'Quote goes here.').replace(/\n/g, '<br/>')}
            </p>
            <p style="margin:12px 0 0;font-size:13px;color:#9B8E7F;font-family:system-ui,-apple-system,Georgia,serif;">— ${v.ALUMNI_NAME || 'Alumni Name'}</p>
          </td>
        </tr>
      </table>
      <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:${NAVY};font-family:system-ui,-apple-system,Georgia,serif;">💡 Advice to Actives</p>
      <p style="margin:0;font-size:15px;color:#374151;line-height:1.7;font-family:system-ui,-apple-system,Georgia,serif;">
        ${(v.ADVICE || 'Advice goes here.').replace(/\n/g, '<br/>')}
      </p>`,
    ),
  },
  {
    id: 'chapter-announcement',
    name: 'Chapter Announcement',
    description: 'Share chapter news, updates, or important information',
    emoji: '📢',
    fields: [
      { key: 'ANNOUNCEMENT_TITLE', label: 'Announcement Title', placeholder: 'Big News from the Chapter' },
      { key: 'INTRO', label: 'Opening Line', placeholder: "We have exciting news to share with the brotherhood..." },
      { key: 'BODY', label: 'Body Text', placeholder: 'Full announcement details go here...', multiline: true },
      { key: 'CTA_LABEL', label: 'Button Label (optional)', placeholder: 'Learn More' },
      { key: 'CTA_LINK', label: 'Button Link (optional)', placeholder: 'https://example.com' },
      { key: 'SIGN_OFF', label: 'Sign-off Name', placeholder: 'The Chapter Leadership' },
    ],
    buildHtml: (v) => emailShell(
      `<p style="margin:12px 0 0;font-size:13px;color:rgba(255,255,255,0.7);font-family:system-ui,-apple-system,Georgia,serif;">Chapter Update</p>`,
      `<h1 style="margin:0 0 20px;font-size:26px;font-weight:800;color:${NAVY};line-height:1.3;font-family:system-ui,-apple-system,Georgia,serif;">
        ${v.ANNOUNCEMENT_TITLE || 'Announcement Title'}
      </h1>
      <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.7;font-family:system-ui,-apple-system,Georgia,serif;">
        ${v.INTRO || ''}
      </p>
      ${divider()}
      <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;font-family:system-ui,-apple-system,Georgia,serif;">
        ${(v.BODY || 'Body text goes here.').replace(/\n/g, '<br/>')}
      </p>
      ${v.CTA_LABEL && v.CTA_LINK ? ctaButton(v.CTA_LINK, v.CTA_LABEL) : ''}
      ${divider()}
      <p style="margin:0;font-size:15px;color:#374151;font-family:system-ui,-apple-system,Georgia,serif;">
        With pride,<br/>
        <strong style="color:${NAVY};">${v.SIGN_OFF || 'Chapter Leadership'}</strong>
      </p>`,
    ),
  },
  {
    id: 'event-invite',
    name: 'Event Invite',
    description: 'Invite alumni to a networking event or chapter gathering',
    emoji: '🎉',
    fields: [
      { key: 'EVENT_NAME', label: 'Event Name', placeholder: 'Annual Alumni Networking Night' },
      { key: 'DATE_TIME', label: 'Date & Time', placeholder: 'Friday, March 21, 2025 · 6:30 PM – 9:00 PM' },
      { key: 'LOCATION', label: 'Location', placeholder: '123 Main Street, Chicago, IL 60601' },
      { key: 'DESCRIPTION', label: 'Event Description', placeholder: 'Join fellow alumni for an evening of networking, reconnecting, and celebrating our shared bonds.', multiline: true },
      { key: 'RSVP_LINK', label: 'RSVP Link', placeholder: 'https://rsvp.example.com' },
      { key: 'RSVP_DEADLINE', label: 'RSVP Deadline', placeholder: 'March 14, 2025' },
      { key: 'DRESS_CODE', label: 'Dress Code (optional)', placeholder: 'Business casual' },
    ],
    buildHtml: (v) => emailShell(
      `<p style="margin:12px 0 0;font-size:13px;color:rgba(255,255,255,0.7);font-family:system-ui,-apple-system,Georgia,serif;">You\'re Invited 🎉</p>`,
      `<h1 style="margin:0 0 8px;font-size:28px;font-weight:800;color:${NAVY};line-height:1.2;font-family:system-ui,-apple-system,Georgia,serif;">
        ${v.EVENT_NAME || 'Event Name'}
      </h1>
      <p style="margin:0 0 24px;font-size:15px;color:${AMBER};font-weight:600;font-family:system-ui,-apple-system,Georgia,serif;">We\'d love to see you there.</p>
      
      <!-- Event details card -->
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 24px;background-color:${BG};border-radius:12px;overflow:hidden;">
        <tr>
          <td style="padding:0;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                <td style="padding:16px 20px;border-bottom:1px solid #E8E3DC;">
                  <p style="margin:0 0 2px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${AMBER};font-family:system-ui,-apple-system,Georgia,serif;">📅 Date & Time</p>
                  <p style="margin:0;font-size:15px;font-weight:600;color:${NAVY};font-family:system-ui,-apple-system,Georgia,serif;">${v.DATE_TIME || 'Date & Time TBD'}</p>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 20px;${v.DRESS_CODE ? 'border-bottom:1px solid #E8E3DC;' : ''}">
                  <p style="margin:0 0 2px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${AMBER};font-family:system-ui,-apple-system,Georgia,serif;">📍 Location</p>
                  <p style="margin:0;font-size:15px;font-weight:600;color:${NAVY};font-family:system-ui,-apple-system,Georgia,serif;">${v.LOCATION || 'Location TBD'}</p>
                </td>
              </tr>
              ${v.DRESS_CODE ? `<tr>
                <td style="padding:16px 20px;">
                  <p style="margin:0 0 2px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${AMBER};font-family:system-ui,-apple-system,Georgia,serif;">👔 Dress Code</p>
                  <p style="margin:0;font-size:15px;font-weight:600;color:${NAVY};font-family:system-ui,-apple-system,Georgia,serif;">${v.DRESS_CODE}</p>
                </td>
              </tr>` : ''}
            </table>
          </td>
        </tr>
      </table>
      
      <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;font-family:system-ui,-apple-system,Georgia,serif;">
        ${(v.DESCRIPTION || 'Event description goes here.').replace(/\n/g, '<br/>')}
      </p>
      
      ${ctaButton(v.RSVP_LINK || '#', '🎟 RSVP Now')}
      
      ${v.RSVP_DEADLINE ? `<p style="margin:-12px 0 16px;text-align:center;font-size:13px;color:#9B8E7F;font-family:system-ui,-apple-system,Georgia,serif;">Please RSVP by ${v.RSVP_DEADLINE}</p>` : ''}`,
    ),
  },
  {
    id: 'career-advice',
    name: 'Career Advice Column',
    description: 'Alumni sharing career wisdom with chapter members',
    emoji: '🧭',
    fields: [
      { key: 'ALUMNI_NAME', label: 'Alumni Name', placeholder: 'Sarah Johnson' },
      { key: 'ALUMNI_ROLE', label: 'Alumni Title & Company', placeholder: 'VP of Engineering at Stripe' },
      { key: 'CLASS_YEAR', label: 'Class Year', placeholder: "'15" },
      { key: 'TOPIC', label: 'Advice Topic', placeholder: 'Breaking into Big Tech' },
      { key: 'INTRO', label: 'Opening Hook', placeholder: "When I graduated, I had no idea what I was doing. Here's what I wish someone had told me..." },
      { key: 'ADVICE', label: 'Main Advice Content', placeholder: '1. Build your network before you need it...\n2. ...\n3. ...', multiline: true },
      { key: 'CLOSING', label: 'Closing Message', placeholder: "Feel free to reach out on LinkedIn — I'm always happy to connect with brothers." },
    ],
    buildHtml: (v) => emailShell(
      `<p style="margin:12px 0 0;font-size:13px;color:rgba(255,255,255,0.7);font-family:system-ui,-apple-system,Georgia,serif;">Career Advice Column 🧭</p>`,
      `${sectionLabel('From the Alumni Network')}
      <h1 style="margin:0 0 6px;font-size:26px;font-weight:800;color:${NAVY};line-height:1.3;font-family:system-ui,-apple-system,Georgia,serif;">
        ${v.TOPIC || 'Career Advice Topic'}
      </h1>
      <p style="margin:0 0 24px;font-size:14px;color:#9B8E7F;font-family:system-ui,-apple-system,Georgia,serif;">
        by <strong style="color:${NAVY};">${v.ALUMNI_NAME || 'Alumni Name'}</strong> · ${v.ALUMNI_ROLE || 'Role'} · Chapter ${v.CLASS_YEAR || ''}
      </p>
      ${divider()}
      <p style="margin:0 0 20px;font-size:16px;color:#374151;line-height:1.8;font-style:italic;font-family:Georgia,serif;">
        ${v.INTRO || ''}
      </p>
      <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.8;font-family:system-ui,-apple-system,Georgia,serif;">
        ${(v.ADVICE || 'Career advice goes here.').replace(/\n/g, '<br/>')}
      </p>
      ${v.CLOSING ? `${divider()}<p style="margin:0;font-size:15px;color:#374151;line-height:1.7;font-family:system-ui,-apple-system,Georgia,serif;">
        ${v.CLOSING}
      </p>
      <p style="margin:16px 0 0;font-size:14px;color:${NAVY};font-weight:600;font-family:system-ui,-apple-system,Georgia,serif;">— ${v.ALUMNI_NAME || 'Alumni Name'}</p>` : ''}`,
    ),
  },
  {
    id: 'platform-welcome',
    name: 'Platform Welcome',
    description: 'Welcome new alumni who just joined Trailblaize',
    emoji: '🎊',
    fields: [
      { key: 'ALUMNI_NAME', label: 'Alumni First Name', placeholder: 'Alex' },
      { key: 'CHAPTER', label: 'Chapter Name', placeholder: 'Beta Theta Pi at Northwestern' },
      { key: 'PERSONAL_MESSAGE', label: 'Personalized Welcome Message', placeholder: "We're so excited to have you on the platform! Your chapter has been waiting for you.", multiline: true },
      { key: 'FEATURES', label: 'Key Features to Highlight', placeholder: 'Connect with 150+ alumni · Browse job opportunities · Attend exclusive events', multiline: true },
      { key: 'CTA_LINK', label: 'Profile Setup Link', placeholder: 'https://trailblaize.net/setup' },
    ],
    buildHtml: (v) => emailShell(
      ``,
      `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:28px;">
        <tr>
          <td style="text-align:center;padding:8px 0 24px;">
            <div style="font-size:52px;line-height:1;">🎊</div>
            <h1 style="margin:16px 0 8px;font-size:28px;font-weight:800;color:${NAVY};font-family:system-ui,-apple-system,Georgia,serif;">
              Welcome to Trailblaize, ${v.ALUMNI_NAME || 'Alumni'}!
            </h1>
            <p style="margin:0;font-size:16px;color:${AMBER};font-weight:600;font-family:system-ui,-apple-system,Georgia,serif;">
              ${v.CHAPTER || 'Your Chapter'} Alumni Network
            </p>
          </td>
        </tr>
      </table>
      
      <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.7;text-align:center;font-family:system-ui,-apple-system,Georgia,serif;">
        ${(v.PERSONAL_MESSAGE || 'Welcome to the platform!').replace(/\n/g, '<br/>')}
      </p>
      
      ${divider()}
      ${sectionLabel('What you can do')}
      <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.9;font-family:system-ui,-apple-system,Georgia,serif;">
        ${v.FEATURES 
          ? v.FEATURES.split('\n').filter(Boolean).map(f => `✅ ${f.trim()}`).join('<br/>') 
          : '✅ Connect with fellow alumni<br/>✅ Discover job opportunities<br/>✅ Stay connected to your chapter'}
      </p>
      
      ${ctaButton(v.CTA_LINK || 'https://trailblaize.net', '🚀 Complete Your Profile')}
      
      <p style="margin:0;font-size:14px;color:#9B8E7F;line-height:1.6;text-align:center;font-family:system-ui,-apple-system,Georgia,serif;">
        Need help? Reply to this email — we're here.
      </p>`,
    ),
  },
];

/* ─────────────────────────── Preview shell ─── */

function wrapForPreview(html: string): string {
  if (html.trim().toLowerCase().startsWith('<!doctype') || html.trim().toLowerCase().startsWith('<html')) {
    return html;
  }
  return emailShell('', html);
}

/* ─────────────────────────── Shared tiny helpers ─── */

function estimateReadTime(html: string): string {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const words = text.split(' ').filter(Boolean).length;
  const mins = Math.max(1, Math.round(words / 200));
  return `~${mins} min read`;
}

/* ─────────────────────────── Mode-tab bar ─── */

function ModeTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '9px 16px',
        border: 'none',
        borderBottom: active ? `2px solid ${NAVY}` : '2px solid transparent',
        background: 'none',
        cursor: 'pointer',
        fontSize: '0.8125rem',
        fontWeight: active ? 700 : 500,
        color: active ? NAVY : '#6b7280',
        marginBottom: -1,
        transition: 'all 0.15s ease-out',
        letterSpacing: '-0.01em',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  );
}

/* ─────────────────────────── Templates mode ─── */

function TemplatesMode({ onApply }: { onApply: (html: string) => void }) {
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<string>('');

  const updatePreview = useCallback((template: EmailTemplate, values: Record<string, string>) => {
    setPreview(template.buildHtml(values));
  }, []);

  const handleSelectTemplate = useCallback((tpl: EmailTemplate) => {
    const defaults: Record<string, string> = {};
    tpl.fields.forEach(f => { defaults[f.key] = ''; });
    setFieldValues(defaults);
    setSelectedTemplate(tpl);
    updatePreview(tpl, defaults);
  }, [updatePreview]);

  const handleFieldChange = useCallback((key: string, val: string) => {
    if (!selectedTemplate) return;
    setFieldValues(prev => {
      const next = { ...prev, [key]: val };
      updatePreview(selectedTemplate, next);
      return next;
    });
  }, [selectedTemplate, updatePreview]);

  const handleApply = useCallback(() => {
    if (!selectedTemplate) return;
    onApply(selectedTemplate.buildHtml(fieldValues));
  }, [selectedTemplate, fieldValues, onApply]);

  if (selectedTemplate) {
    return (
      <div style={{ display: 'flex', gap: 0, minHeight: 480 }}>
        {/* Left: fields */}
        <div style={{ flex: '0 0 42%', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0ede8', background: '#fdfcfb', display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => { setSelectedTemplate(null); setFieldValues({}); }}
              style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: '0.75rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4 }}
            >
              <ChevronLeft size={12} /> Back
            </button>
            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: NAVY }}>
              {selectedTemplate.emoji} {selectedTemplate.name}
            </span>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
            <p style={{ margin: '0 0 16px', fontSize: '0.75rem', color: '#9ca3af' }}>
              Fill in the fields below — the preview updates live.
            </p>
            {selectedTemplate.fields.map(field => (
              <div key={field.key} style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#374151', marginBottom: 4 }}>
                  {field.label}
                </label>
                {field.multiline ? (
                  <textarea
                    value={fieldValues[field.key] || ''}
                    onChange={e => handleFieldChange(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    rows={3}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: '0.8rem', boxSizing: 'border-box', outline: 'none', resize: 'vertical', fontFamily: 'inherit', color: '#374151' }}
                  />
                ) : (
                  <input
                    type="text"
                    value={fieldValues[field.key] || ''}
                    onChange={e => handleFieldChange(field.key, e.target.value)}
                    placeholder={field.placeholder}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid #e5e7eb', borderRadius: 6, fontSize: '0.8rem', boxSizing: 'border-box', outline: 'none', color: '#374151' }}
                  />
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={handleApply}
              style={{ width: '100%', padding: '10px', borderRadius: 8, border: 'none', background: NAVY, color: '#fff', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 700, marginTop: 8 }}
            >
              Use This Template ✓
            </button>
          </div>
        </div>
        {/* Right: live preview */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '6px 12px', background: '#f9fafb', borderBottom: '1px solid #f0ede8', fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Eye size={11} /> Live Preview
          </div>
          <iframe
            srcDoc={preview}
            sandbox="allow-same-origin"
            style={{ flex: 1, width: '100%', border: 'none', background: BG, display: 'block', minHeight: 440 }}
            title="Template Preview"
          />
        </div>
      </div>
    );
  }

  // Template grid picker
  return (
    <div style={{ padding: 20 }}>
      <p style={{ margin: '0 0 16px', fontSize: '0.8125rem', color: '#6b7280' }}>
        Choose a template to get started. You can customize all the fields.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
        {EMAIL_TEMPLATES.map(tpl => (
          <button
            key={tpl.id}
            type="button"
            onClick={() => handleSelectTemplate(tpl)}
            style={{
              padding: '16px',
              borderRadius: 10,
              border: '1px solid #e5e7eb',
              background: '#fff',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s ease',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = AMBER;
              (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 2px 10px rgba(196,135,74,0.15)`;
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
            }}
          >
            <span style={{ fontSize: '1.5rem' }}>{tpl.emoji}</span>
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: NAVY }}>{tpl.name}</span>
            <span style={{ fontSize: '0.75rem', color: '#9ca3af', lineHeight: 1.4 }}>{tpl.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── AI Generate mode ─── */

function AIGenerateMode({ onApply, chapterName, chapterType }: {
  onApply: (html: string) => void;
  chapterName?: string;
  chapterType?: string;
}) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedHtml, setGeneratedHtml] = useState<string | null>(null);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    setGeneratedHtml(null);
    try {
      const res = await fetch('/api/email-outreach/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          chapter_name: chapterName,
          chapter_type: chapterType,
          purpose: 'alumni engagement email',
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        if (json.error?.includes('ANTHROPIC_API_KEY not configured')) {
          setError('AI generation requires an API key. Ask your admin to add ANTHROPIC_API_KEY to the environment variables.');
        } else {
          setError(json.error || 'Failed to generate email. Please try again.');
        }
        return;
      }
      setGeneratedHtml(json.html);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (generatedHtml) {
    return (
      <div style={{ display: 'flex', gap: 0, minHeight: 480 }}>
        {/* Left panel */}
        <div style={{ flex: '0 0 42%', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', padding: 20, gap: 14 }}>
          <div>
            <p style={{ margin: '0 0 4px', fontSize: '0.875rem', fontWeight: 700, color: NAVY }}>✨ Email Generated!</p>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#9ca3af' }}>Review the preview, then use it or regenerate.</p>
          </div>
          <div style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 12px' }}>
            <p style={{ margin: '0 0 4px', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#9ca3af' }}>Your prompt</p>
            <p style={{ margin: 0, fontSize: '0.8rem', color: '#374151', lineHeight: 1.5 }}>{prompt}</p>
          </div>
          <button
            type="button"
            onClick={() => onApply(generatedHtml)}
            style={{ padding: '10px', borderRadius: 8, border: 'none', background: NAVY, color: '#fff', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 700 }}
          >
            Use This Email ✓
          </button>
          <button
            type="button"
            onClick={() => { setGeneratedHtml(null); }}
            style={{ padding: '10px', borderRadius: 8, border: `1px solid ${NAVY}`, background: '#fff', color: NAVY, cursor: 'pointer', fontSize: '0.875rem', fontWeight: 600 }}
          >
            ↩ Try Again
          </button>
        </div>
        {/* Right: preview */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '6px 12px', background: '#f9fafb', borderBottom: '1px solid #f0ede8', fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 5 }}>
            <Eye size={11} /> Preview
          </div>
          <iframe
            srcDoc={generatedHtml}
            sandbox="allow-same-origin"
            style={{ flex: 1, width: '100%', border: 'none', background: BG, display: 'block', minHeight: 440 }}
            title="AI Generated Preview"
          />
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
      <div>
        <p style={{ margin: '0 0 6px', fontSize: '0.9375rem', fontWeight: 700, color: NAVY }}>✨ AI Email Generator</p>
        <p style={{ margin: 0, fontSize: '0.8125rem', color: '#6b7280', lineHeight: 1.5 }}>
          Describe the email you want to send — Claude will generate a beautiful, on-brand HTML email for you.
        </p>
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#374151', marginBottom: 8 }}>
          Describe your email
        </label>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="e.g. Write a job opportunity email from Sarah Johnson, a 2018 alum, who is now a Product Manager at Google and wants to refer chapter members for a PM intern role this summer. Deadline is March 1."
          rows={5}
          style={{ width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: '0.875rem', boxSizing: 'border-box', outline: 'none', resize: 'vertical', fontFamily: 'inherit', color: '#374151', lineHeight: 1.6 }}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate(); }}
        />
        <p style={{ margin: '4px 0 0', fontSize: '0.7rem', color: '#9ca3af' }}>Tip: Be specific — name, role, purpose, and any key details. ⌘Enter to generate.</p>
      </div>
      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fef2f2', border: '1px solid #fecaca', fontSize: '0.8125rem', color: '#dc2626', lineHeight: 1.5 }}>
          ⚠️ {error}
        </div>
      )}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={loading || !prompt.trim()}
        style={{
          padding: '11px 24px',
          borderRadius: 8,
          border: 'none',
          background: loading || !prompt.trim() ? '#9ca3af' : `linear-gradient(135deg, ${NAVY}, #2d4a7a)`,
          color: '#fff',
          cursor: loading || !prompt.trim() ? 'not-allowed' : 'pointer',
          fontSize: '0.875rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          alignSelf: 'flex-start',
        }}
      >
        {loading ? <><Loader2 size={15} className="animate-spin" /> Generating…</> : <><Sparkles size={15} /> Generate Email</>}
      </button>
    </div>
  );
}

/* ─────────────────────────── HTML mode ─── */

function HTMLMode({ value, onChange }: { value: string; onChange: (html: string) => void }) {
  const [debouncedPreview, setDebouncedPreview] = useState(value);
  const [copied, setCopied] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedPreview(value), 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [value]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }, [value]);

  const handleDownload = useCallback(() => {
    const blob = new Blob([value], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'email.html';
    a.click();
    URL.revokeObjectURL(url);
  }, [value]);

  const charCount = value.length;
  const readTime = value ? estimateReadTime(value) : null;

  return (
    <div style={{ display: 'flex', gap: 0, minHeight: 420 }}>
      {/* Left: textarea */}
      <div style={{ flex: '0 0 50%', display: 'flex', flexDirection: 'column', borderRight: '1px solid #e5e7eb' }}>
        <div style={{ padding: '6px 12px', background: '#f9fafb', borderBottom: '1px solid #f0ede8', fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
          <span>HTML Source</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {charCount > 0 && (
              <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: '#d1d5db', fontSize: '0.65rem' }}>
                {charCount.toLocaleString()} chars{readTime ? ` · ${readTime}` : ''}
              </span>
            )}
            <button
              type="button"
              onClick={handleCopy}
              disabled={!value}
              style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 4, border: '1px solid #e5e7eb', background: '#fff', cursor: value ? 'pointer' : 'not-allowed', fontSize: '0.65rem', fontWeight: 700, color: copied ? '#059669' : '#6b7280', textTransform: 'none', letterSpacing: 0 }}
            >
              {copied ? <><Check size={9} /> Copied!</> : <><Copy size={9} /> Copy</>}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={!value}
              style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 4, border: '1px solid #e5e7eb', background: '#fff', cursor: value ? 'pointer' : 'not-allowed', fontSize: '0.65rem', fontWeight: 700, color: '#6b7280', textTransform: 'none', letterSpacing: 0 }}
            >
              <Download size={9} /> .html
            </button>
          </div>
        </div>
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={`Paste your compiled HTML here, or write raw HTML:\n\n<!DOCTYPE html>\n<html>...</html>\n\nOr simpler:\n<h2>Hey {{first_name}}!</h2>\n<p>Join the {{chapter}} alumni network...</p>`}
          spellCheck={false}
          style={{ flex: 1, width: '100%', minHeight: 360, padding: '12px 14px', border: 'none', outline: 'none', resize: 'none', fontSize: '0.8rem', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: 1.6, color: '#374151', background: '#fafafa', boxSizing: 'border-box' }}
        />
      </div>
      {/* Right: preview */}
      <div style={{ flex: '0 0 50%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '6px 12px', background: '#f9fafb', borderBottom: '1px solid #f0ede8', fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: 5 }}>
          <Eye size={11} /> Live Preview
          <span style={{ fontWeight: 400, color: '#d1d5db', textTransform: 'none', letterSpacing: 0 }}>· email-safe wrap</span>
        </div>
        {debouncedPreview ? (
          <iframe
            srcDoc={wrapForPreview(debouncedPreview)}
            sandbox="allow-same-origin"
            style={{ flex: 1, width: '100%', minHeight: 360, border: 'none', background: BG, display: 'block' }}
            title="Email Preview"
          />
        ) : (
          <div style={{ flex: 1, minHeight: 360, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#d1d5db', background: '#f9fafb' }}>
            <Eye size={28} style={{ opacity: 0.4 }} />
            <span style={{ fontSize: '0.8125rem', color: '#9ca3af' }}>Preview appears here as you type</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── Main component ─── */

export function EmailCampaignEditorV2({
  value,
  onChange,
  chapterName,
  chapterType,
}: EmailCampaignEditorV2Props) {
  const [mode, setMode] = useState<ComposerMode>('templates');

  const handleApplyTemplate = useCallback((html: string) => {
    onChange(html);
    setMode('html');
  }, [onChange]);

  const containerStyle: React.CSSProperties = {
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    background: '#fff',
    overflow: 'hidden',
  };

  const tabRowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    borderBottom: '1px solid #e5e7eb',
    background: '#f9fafb',
    padding: '0 12px',
    gap: 0,
    overflowX: 'auto',
  };

  return (
    <div style={containerStyle}>
      {/* Tab row */}
      <div style={tabRowStyle}>
        <ModeTab active={mode === 'templates'} onClick={() => setMode('templates')}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <FileText size={13} /> Templates
          </span>
        </ModeTab>
        <ModeTab active={mode === 'ai'} onClick={() => setMode('ai')}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Sparkles size={13} /> AI Generate
          </span>
        </ModeTab>
        <ModeTab active={mode === 'html'} onClick={() => setMode('html')}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {'</>'}  HTML
          </span>
        </ModeTab>

        {/* Active indicator badge */}
        {value && mode !== 'html' && (
          <span
            onClick={() => setMode('html')}
            style={{
              marginLeft: 'auto',
              padding: '3px 9px',
              borderRadius: 20,
              background: '#f0fdf4',
              color: '#059669',
              fontSize: '0.7rem',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            ✓ Email ready · Edit HTML
          </span>
        )}
      </div>

      {/* Mode panels */}
      {mode === 'templates' && (
        <TemplatesMode onApply={handleApplyTemplate} />
      )}
      {mode === 'ai' && (
        <AIGenerateMode
          onApply={handleApplyTemplate}
          chapterName={chapterName}
          chapterType={chapterType}
        />
      )}
      {mode === 'html' && (
        <HTMLMode value={value} onChange={onChange} />
      )}
    </div>
  );
}
