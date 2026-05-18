const normalizeText = (value) => String(value || '')
  .trim()
  .toUpperCase()
  .replace(/[\s._/\\-]+/g, '');

const extractDigits = (value) => String(value || '').replace(/\D+/g, '');

export const normalizeDocumentSearchTerm = (input) => {
  const raw = String(input || '').trim();
  const upper = raw.toUpperCase();
  const compact = normalizeText(raw);
  const digits = extractDigits(raw);

  return { raw, upper, compact, digits };
};

export const matchesDocumentSearch = (doc, input) => {
  const term = normalizeDocumentSearchTerm(input);
  if (!term.raw) return true;

  const candidates = [
    doc?.internal_document_number,
    doc?.folio,
    doc?.document_number,
    doc?.sale?.document_number,
    doc?.sale_folio,
    doc?.pos_reference,
    doc?.reference_pos,
  ].filter((value) => value !== null && value !== undefined && String(value).trim() !== '');

  return candidates.some((candidate) => {
    const text = String(candidate);
    const normalized = normalizeText(text);
    const digits = extractDigits(text);

    return normalized.includes(term.compact)
      || text.toUpperCase().includes(term.upper)
      || (term.digits && digits.includes(term.digits));
  });
};

export const getDocumentSearchLabel = () => 'Documento interno / Referencia POS';
