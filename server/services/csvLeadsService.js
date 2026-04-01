const { parse } = require('csv-parse/sync');

function escapeCsvField(val) {
  if (val == null) return '';
  const s = String(val);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Expected headers (case-insensitive): name, company, email, phone, source, companySize
 * @param {string} csvText
 * @returns {Array<Record<string, string>>}
 */
function parseLeadsCsv(csvText) {
  if (!csvText || !String(csvText).trim()) return [];
  const records = parse(String(csvText), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });
  return records.map((row) => {
    const keys = Object.keys(row);
    const lower = {};
    for (const k of keys) {
      lower[String(k).toLowerCase()] = row[k];
    }
    return {
      name: lower.name || lower.full_name || '',
      company: lower.company || '',
      email: lower.email || '',
      phone: lower.phone || '',
      source: lower.source || '',
      companySize: lower.companysize || lower.company_size || '',
    };
  });
}

function leadsToCsv(leads) {
  const headers = [
    'id',
    'name',
    'company',
    'email',
    'phone',
    'status',
    'source',
    'score',
    'assignedTo',
    'updatedAt',
  ];
  const lines = [headers.join(',')];
  for (const l of leads) {
    lines.push(
      [
        escapeCsvField(l.id),
        escapeCsvField(l.name),
        escapeCsvField(l.company),
        escapeCsvField(l.email),
        escapeCsvField(l.phone),
        escapeCsvField(l.status),
        escapeCsvField(l.source),
        escapeCsvField(l.score),
        escapeCsvField(l.assignedTo?.email),
        escapeCsvField(l.updatedAt.toISOString()),
      ].join(','),
    );
  }
  return lines.join('\n');
}

module.exports = { parseLeadsCsv, leadsToCsv };
