'use strict';
// server/lib/solution-preview.js
// The preview columns (f_preview, f_files) only exist after
// supabase/migrations/20261113_solution_preview.sql is applied. Probe once
// and cache so the read endpoints keep working before the migration runs.

let cached = null;

async function hasPreviewColumns(admin) {
  if (cached === true) return true;
  const { error } = await admin.from('submissions').select('f_preview').limit(1);
  if (!error) {
    cached = true;
    return true;
  }
  const msg = String(error.message || '');
  if (/f_preview|schema cache|does not exist|column/i.test(msg)) {
    cached = false;                    // migration not applied yet
    return false;
  }
  throw new Error(msg);                // transient failure — do not cache
}

// Appends the preview columns to a select string when they exist.
async function withPreviewCols(admin, select) {
  return (await hasPreviewColumns(admin)) ? `${select}, f_preview, f_files` : select;
}

module.exports = { hasPreviewColumns, withPreviewCols };

// f_implementation may be plain text or JSON { text, files[] } (see submit.html).
function implText(value) {
  if (!value) return '';
  const t = String(value).trim();
  if (!t.startsWith('{')) return value;
  try {
    const j = JSON.parse(t);
    return typeof j.text === 'string' ? j.text : '';
  } catch {
    return value;
  }
}

function implFiles(value) {
  if (!value) return [];
  const t = String(value).trim();
  if (!t.startsWith('{')) return [];
  try {
    const j = JSON.parse(t);
    return Array.isArray(j.files) ? j.files.filter((f) => f && typeof f.name === 'string') : [];
  } catch {
    return [];
  }
}

module.exports.implText = implText;
module.exports.implFiles = implFiles;
