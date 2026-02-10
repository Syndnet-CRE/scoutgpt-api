function snakeToCamel(str) {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

function normalizeRow(row) {
  if (!row) return null;
  const result = {};
  for (const [key, value] of Object.entries(row)) {
    result[snakeToCamel(key)] = value;
  }
  return result;
}

function normalizeRows(rows) {
  if (!rows || !Array.isArray(rows)) return [];
  return rows.map(normalizeRow);
}

function parseBbox(bboxStr) {
  if (!bboxStr) return null;
  const parts = bboxStr.split(',').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return null;
  return { minLng: parts[0], minLat: parts[1], maxLng: parts[2], maxLat: parts[3] };
}

module.exports = { snakeToCamel, normalizeRow, normalizeRows, parseBbox };
