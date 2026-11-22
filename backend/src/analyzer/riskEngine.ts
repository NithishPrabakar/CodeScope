import { ChangeRiskAnalysis, RiskFactor, RiskLevel } from '../types/risk.js';
import { AffectedFile } from '../types/impact.js';

interface RiskEngineInput {
  changedFile: string;
  directImpactCount: number;
  indirectImpactCount: number;
  totalAffectedFiles: number;
  maxDepth: number;
  hasCycleInPath: boolean;
  totalRepoFiles?: number;
  directImpactFiles: AffectedFile[];
}

/**
 * Calculates a transparent, explainable 0–100 Change Risk Score
 * based on impact factors, propagation depth, centrality, and circular loops.
 * 
 * Mathematical Guarantee:
 * The sum of all displayed factor points is GUARANTEED to exactly equal
 * the final risk score.
 */
export function calculateChangeRisk(input: RiskEngineInput): ChangeRiskAnalysis {
  const {
    directImpactCount,
    indirectImpactCount,
    totalAffectedFiles,
    maxDepth,
    hasCycleInPath,
    totalRepoFiles = 10,
  } = input;

  const factors: RiskFactor[] = [];

  // Factor 1: Direct Impact (Immediate consumers likely to break)
  // Max 35 points: 12 pts per direct dependent, capped at 35
  const directPoints = Math.min(35, directImpactCount * 12);
  factors.push({
    name: 'Direct Downstream Dependents',
    points: directPoints,
    maxPoints: 35,
    description: directImpactCount === 0
      ? '0 files directly consume or import this module (0 pts).'
      : `${directImpactCount} file(s) directly consume or import this module (${directPoints} pts, max 35).`,
  });

  // Factor 2: Indirect Impact (Transitive ripple effect)
  // Max 25 points: 6 pts per indirect dependent, capped at 25
  const indirectPoints = Math.min(25, indirectImpactCount * 6);
  factors.push({
    name: 'Transitive Ripple Effect',
    points: indirectPoints,
    maxPoints: 25,
    description: indirectImpactCount === 0
      ? '0 files affected through transitive dependency chains (0 pts).'
      : `${indirectImpactCount} file(s) affected through multi-step dependency chains (${indirectPoints} pts, max 25).`,
  });

  // Factor 3: Propagation Depth
  // Max 15 points
  let depthPoints = 0;
  if (maxDepth === 1) depthPoints = 4;
  else if (maxDepth === 2) depthPoints = 8;
  else if (maxDepth === 3) depthPoints = 12;
  else if (maxDepth >= 4) depthPoints = 15;

  factors.push({
    name: 'Maximum Ripple Depth',
    points: depthPoints,
    maxPoints: 15,
    description: maxDepth === 0
      ? 'No ripple propagation across architecture (0 pts).'
      : `Impact travels up to ${maxDepth} level(s) deep across the architecture (${depthPoints} pts, max 15).`,
  });

  // Factor 4: Architectural Centrality
  // Max 15 points: Proportion of repository affected
  const safeRepoTotal = Math.max(1, totalRepoFiles);
  const centralityRatio = Math.min(1, totalAffectedFiles / safeRepoTotal);
  const centralityPoints = Math.min(15, Math.round(centralityRatio * 15));
  factors.push({
    name: 'Architectural Centrality',
    points: centralityPoints,
    maxPoints: 15,
    description: totalAffectedFiles === 0
      ? 'Isolated module: 0% of repository affected (0 pts).'
      : `Affects ${Math.round(centralityRatio * 100)}% of the repository (${totalAffectedFiles}/${safeRepoTotal} files → ${centralityPoints} pts, max 15).`,
  });

  // Factor 5: Circular Dependency Penalty
  // Max 10 points
  const cyclePoints = hasCycleInPath ? 10 : 0;
  factors.push({
    name: 'Circular Dependency Penalty',
    points: cyclePoints,
    maxPoints: 10,
    description: hasCycleInPath
      ? 'File is part of a circular loop (+10 pts penalty for potential cyclic regressions).'
      : 'No circular dependencies detected in the impact path (0 pts penalty).',
  });

  // Total Score: Guaranteed to equal sum of factor points
  // 35 + 25 + 15 + 15 + 10 = 100 max points
  const score = directPoints + indirectPoints + depthPoints + centralityPoints + cyclePoints;

  let level: RiskLevel = 'low';
  let levelDesc = '';

  if (score <= 25) {
    level = 'low';
    levelDesc = 'Localized change with minimal downstream propagation.';
  } else if (score <= 50) {
    level = 'medium';
    levelDesc = 'Moderate impact affecting a small cluster of files.';
  } else if (score <= 75) {
    level = 'high';
    levelDesc = 'Significant blast radius across multiple dependent layers.';
  } else {
    level = 'critical';
    levelDesc = 'Severe architectural blast radius. Core module affecting majority of codebase.';
  }

  // Generate summary directly from the exact factor values used in the score
  const factorBreakdownStr = factors.map((f) => `${f.name}: ${f.points} pts`).join('; ');
  const summary = `${level.charAt(0).toUpperCase() + level.slice(1)} Risk (${score}/100): ${levelDesc} Contributing factors: ${factorBreakdownStr}.`;

  return {
    score,
    level,
    summary,
    factors,
  };
}
