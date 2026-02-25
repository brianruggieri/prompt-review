const VALID_ROLES = [
  'domain_sme', 'security', 'clarity', 'testing', 'frontend_ux', 'documentation'
];

const VALID_SEVERITIES = ['blocker', 'major', 'minor', 'nit'];

const VALID_OPS = [
  'AddConstraint', 'RemoveConstraint', 'RefactorStructure',
  'ReplaceVague', 'AddContext', 'AddGuardrail', 'AddAcceptanceCriteria'
];

const VALID_TARGETS = ['constraints', 'context', 'output', 'structure', 'examples'];

function validateCritique(critique) {
  const errors = [];

  if (!critique || typeof critique !== 'object') {
    return { valid: false, errors: ['Critique must be an object'] };
  }

  // Required fields
  if (!VALID_ROLES.includes(critique.reviewer_role)) {
    errors.push(`Invalid reviewer_role: ${critique.reviewer_role}`);
  }
  if (!VALID_SEVERITIES.includes(critique.severity_max)) {
    errors.push(`Invalid severity_max: ${critique.severity_max}`);
  }
  if (typeof critique.confidence !== 'number' || critique.confidence < 0 || critique.confidence > 1) {
    errors.push(`confidence must be a number between 0 and 1, got: ${critique.confidence}`);
  }
  if (!Array.isArray(critique.findings)) {
    errors.push('findings must be an array');
  }
  if (typeof critique.no_issues !== 'boolean') {
    errors.push('no_issues must be a boolean');
  }

  // Optional score field (0-10)
  if (critique.score !== undefined) {
    if (typeof critique.score !== 'number' || critique.score < 0 || critique.score > 10) {
      errors.push(`score must be a number between 0 and 10, got: ${critique.score}`);
    }
  }

  // Validate each finding
  if (Array.isArray(critique.findings)) {
    for (const finding of critique.findings) {
      if (!finding.id || typeof finding.id !== 'string') {
        errors.push('Each finding must have a string id');
      }
      if (!VALID_SEVERITIES.includes(finding.severity)) {
        errors.push(`Invalid finding severity: ${finding.severity}`);
      }
      if (Array.isArray(finding.suggested_ops)) {
        for (const op of finding.suggested_ops) {
          if (!VALID_OPS.includes(op.op)) {
            errors.push(`Invalid op: ${op.op}`);
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateCritique, VALID_OPS, VALID_SEVERITIES, VALID_ROLES, VALID_TARGETS };
