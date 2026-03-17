-- Add org_type to deals table for fraternity / sorority / club / athletic_team / ifc / phc
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS org_type TEXT NOT NULL DEFAULT 'fraternity';

CREATE INDEX IF NOT EXISTS idx_deals_org_type ON deals(org_type);

-- Backfill known sororities
UPDATE deals SET org_type = 'sorority'
WHERE fraternity IN (
  'Alpha Phi', 'Chi Omega', 'KKG', 'Kappa Kappa Gamma',
  'Delta Gamma', 'Zeta Tau Alpha', 'Pi Beta Phi', 'Alpha Chi Omega',
  'Tri Delta', 'Delta Delta Delta', 'Alpha Delta Pi', 'Phi Mu',
  'Sigma Kappa', 'Gamma Phi Beta', 'Alpha Gamma Delta', 'DPhiE',
  'Delta Phi Epsilon', 'AOPi', 'Alpha Omicron Pi'
);

-- Backfill IFC/PHC enterprise deals (name-based)
UPDATE deals SET org_type = 'ifc'
WHERE fraternity ILIKE '%IFC%' OR name ILIKE '%IFC%';

UPDATE deals SET org_type = 'phc'
WHERE fraternity ILIKE '%PHC%' OR fraternity ILIKE '%Panhellenic%' OR name ILIKE '%PHC%';
