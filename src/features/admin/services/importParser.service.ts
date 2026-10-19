/**
 * Import Parser & Mapping Service (Phase 14 — Subtask 2)
 *
 * Provides pure, deterministic parsing, mapping, normalization, and lineage
 * construction for census data migration (CSV and JSON formats).
 *
 * Architectural Invariants:
 * - PERSON != USER: Maps demographic census entities only. Never touches auth.users or profiles.
 * - DETECT != MERGE: Extracts and stages raw and normalized data without automated merging.
 * - STAGING != CANONICAL: Lineage points to staging only; canonical_id remains strictly null.
 * - Zero Secrets: Redacts any credential-like fields (passwords, tokens, API keys).
 */

import * as XLSX from 'xlsx'
import type {
  ImportEntityType,
  StagingRecordDraft,
  StructuredImportError,
  ParseImportOptions,
  ParseImportResult,
  ImportBatchRowCounts,
  ImportBatchValidationSummary,
} from '../types'
import { sanitizeText, sanitizeMultilineText } from '@/lib/sanitization'

/**
 * Explicit operational limits for import files and records.
 */
export const IMPORT_LIMITS = {
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024, // 10 MB
  MAX_RECORDS_PER_BATCH: 5000,
  MAX_FIELD_LENGTH: 10000,
  CHUNK_SIZE: 500,
} as const

/**
 * Computes deterministic SHA-256 hash across web or Node environments.
 * Accepts string, ArrayBuffer, or Uint8Array.
 */
export async function computeSha256(content: string | ArrayBuffer | Uint8Array): Promise<string> {
  let data: Uint8Array
  if (typeof content === 'string') {
    data = new TextEncoder().encode(content)
  } else if (content instanceof ArrayBuffer) {
    data = new Uint8Array(content)
  } else {
    data = content
  }

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data as unknown as BufferSource)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  }

  // Fallback for Node.js test environment
  const nodeCrypto = await import('crypto')
  return nodeCrypto.createHash('sha256').update(data).digest('hex')
}

/**
 * Sanitizes input text by removing UTF-8 Byte Order Mark (BOM).
 */
export function stripBom(text: string): string {
  if (text.charCodeAt(0) === 0xfeff) {
    return text.slice(1)
  }
  return text
}

/**
 * Sensitive field regex: prevents storing credentials or tokens.
 */
const SENSITIVE_KEY_REGEX = /(password|pass|secret|token|jwt|api_key|auth_key|private_key)/i

/**
 * Null representation literals in census data.
 */
const NULL_LITERALS = new Set([
  '',
  'null',
  'none',
  'nil',
  'n/a',
  'na',
  '-',
  '--',
  'unknown',
  'undefined',
])

/**
 * RFC 4180-compliant CSV parser.
 * Handles quoted fields, commas inside quotes, escaped quotes (""), newlines in quotes, and empty lines.
 */
export function parseCsvRows(csvContent: string): {
  headers: string[]
  rows: Array<{ rowNumber: number; data: Record<string, string>; errors: StructuredImportError[] }>
  fileErrors: StructuredImportError[]
} {
  const content = stripBom(csvContent)
  const fileErrors: StructuredImportError[] = []

  const rawLines: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false

  for (let i = 0; i < content.length; i++) {
    const char = content[i]
    const nextChar = content[i + 1]

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote: ""
        currentField += '"'
        i++ // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField)
      currentField = ''
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++ // Skip \n in \r\n
      }
      currentRow.push(currentField)
      currentField = ''

      // Push non-empty line
      const hasContent = currentRow.some((val) => val.trim().length > 0)
      if (hasContent) {
        rawLines.push(currentRow)
      }
      currentRow = []
    } else {
      currentField += char
    }
  }

  // Handle trailing content
  if (inQuotes) {
    fileErrors.push({
      code: 'UNCLOSED_QUOTE',
      message: 'CSV file contains an unclosed quotation mark.',
      severity: 'ERROR',
    })
  }

  currentRow.push(currentField)
  if (currentRow.some((val) => val.trim().length > 0)) {
    rawLines.push(currentRow)
  }

  if (rawLines.length === 0) {
    fileErrors.push({
      code: 'EMPTY_FILE',
      message: 'The uploaded CSV file is empty.',
      severity: 'ERROR',
    })
    return { headers: [], rows: [], fileErrors }
  }

  // Header row (first line)
  const rawHeaders = rawLines[0]
  const headers = rawHeaders.map((h, idx) => {
    const trimmed = h.trim()
    return trimmed.length > 0 ? trimmed : `column_${idx + 1}`
  })

  const rows: Array<{
    rowNumber: number
    data: Record<string, string>
    errors: StructuredImportError[]
  }> = []

  // Data rows (1-indexed for data records)
  for (let r = 1; r < rawLines.length; r++) {
    const line = rawLines[r]
    const rowErrors: StructuredImportError[] = []
    const rowData: Record<string, string> = {}

    if (line.length !== headers.length) {
      rowErrors.push({
        code: 'COLUMN_COUNT_MISMATCH',
        message: `Row ${r} has ${line.length} columns, expected ${headers.length}.`,
        severity: 'WARNING',
      })
    }

    for (let c = 0; c < headers.length; c++) {
      const header = headers[c]
      const val = line[c] ?? ''
      rowData[header] = val
    }

    rows.push({
      rowNumber: r,
      data: rowData,
      errors: rowErrors,
    })
  }

  return { headers, rows, fileErrors }
}

/**
 * Parses and validates raw JSON input into record objects.
 * Supports top-level arrays or objects containing a `records`, `data`, or `items` array.
 */
export function parseJsonRecords(jsonContent: string): {
  records: Array<{ rowNumber: number; data: Record<string, unknown>; errors: StructuredImportError[] }>
  fileErrors: StructuredImportError[]
} {
  const content = stripBom(jsonContent).trim()
  const fileErrors: StructuredImportError[] = []

  if (!content) {
    fileErrors.push({
      code: 'EMPTY_FILE',
      message: 'The uploaded JSON file is empty.',
      severity: 'ERROR',
    })
    return { records: [], fileErrors }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch (err) {
    fileErrors.push({
      code: 'MALFORMED_JSON',
      message: `Invalid JSON syntax: ${(err as Error).message}`,
      severity: 'ERROR',
    })
    return { records: [], fileErrors }
  }

  let rawArray: unknown[]

  if (Array.isArray(parsed)) {
    rawArray = parsed
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>
    if (Array.isArray(obj.records)) {
      rawArray = obj.records
    } else if (Array.isArray(obj.data)) {
      rawArray = obj.data
    } else if (Array.isArray(obj.items)) {
      rawArray = obj.items
    } else {
      fileErrors.push({
        code: 'UNSUPPORTED_JSON_STRUCTURE',
        message:
          'JSON must be an array of records or an object containing a "records", "data", or "items" array.',
        severity: 'ERROR',
      })
      return { records: [], fileErrors }
    }
  } else {
    fileErrors.push({
      code: 'UNSUPPORTED_JSON_STRUCTURE',
      message: 'Top-level JSON value must be an array or object.',
      severity: 'ERROR',
    })
    return { records: [], fileErrors }
  }

  const records: Array<{
    rowNumber: number
    data: Record<string, unknown>
    errors: StructuredImportError[]
  }> = []

  for (let i = 0; i < rawArray.length; i++) {
    const item = rawArray[i]
    const rowNumber = i + 1
    const errors: StructuredImportError[] = []

    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push({
        code: 'INVALID_ROW_STRUCTURE',
        message: `Record at index ${i} is not a valid JSON object.`,
        severity: 'ERROR',
      })
      records.push({
        rowNumber,
        data: {},
        errors,
      })
    } else {
      records.push({
        rowNumber,
        data: item as Record<string, unknown>,
        errors,
      })
    }
  }

  return { records, fileErrors }
}

/**
 * Normalizes string values, converting null representations and trimming whitespace.
 */
export function normalizeValue(val: unknown): unknown {
  if (val === null || val === undefined) {
    return null
  }

  if (typeof val === 'string') {
    const trimmed = val.trim()
    if (NULL_LITERALS.has(trimmed.toLowerCase())) {
      return null
    }
    return trimmed
  }

  return val
}

/**
 * Normalizes single-line free text fields (names, locations, gotra, nukh, kul).
 * Preserves Unicode and standard punctuation while stripping executable tags,
 * dangerous protocols, and control characters.
 */
export function normalizeFreeText(val: unknown): string | null {
  const norm = normalizeValue(val)
  if (norm === null || typeof norm !== 'string') {
    return null
  }
  const sanitized = sanitizeText(norm)
  return sanitized.length > 0 ? sanitized : null
}

/**
 * Normalizes multiline free text fields (descriptions, histories, notes).
 * Preserves Unicode, line breaks, and standard punctuation while stripping executable tags,
 * dangerous protocols, and control characters.
 */
export function normalizeMultilineFreeText(val: unknown): string | null {
  const norm = normalizeValue(val)
  if (norm === null || typeof norm !== 'string') {
    return null
  }
  const sanitized = sanitizeMultilineText(norm)
  return sanitized.length > 0 ? sanitized : null
}

/**
 * Redacts any sensitive credential fields from raw and parsed maps.
 */
export function sanitizeSensitiveFields(
  data: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(data)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      result[key] = '[REDACTED_CREDENTIAL]'
    } else if (val && typeof val === 'object' && !Array.isArray(val)) {
      result[key] = sanitizeSensitiveFields(val as Record<string, unknown>)
    } else {
      result[key] = val
    }
  }
  return result
}

/**
 * Normalizes gender input into standard census gender strings.
 */
export function normalizeGender(val: unknown): 'male' | 'female' | 'other' | null {
  if (typeof val !== 'string') return null
  const s = val.trim().toLowerCase()
  if (s === 'male' || s === 'm' || s === 'man' || s === 'boy') return 'male'
  if (s === 'female' || s === 'f' || s === 'woman' || s === 'girl') return 'female'
  if (s === 'other' || s === 'non-binary' || s === 'nb' || s === 'transgender') return 'other'
  return null
}

/**
 * Normalizes relationship types into supported relationship categories.
 */
export function normalizeRelationshipType(val: unknown): 'parent' | 'child' | 'spouse' | 'sibling' | string | null {
  if (typeof val !== 'string') return null
  const s = val.trim().toLowerCase()
  if (['parent', 'father', 'mother', 'dad', 'mom'].includes(s)) return 'parent'
  if (['child', 'son', 'daughter', 'kid'].includes(s)) return 'child'
  if (['spouse', 'husband', 'wife', 'partner', 'married'].includes(s)) return 'spouse'
  if (['sibling', 'brother', 'sister'].includes(s)) return 'sibling'
  return s
}

/**
 * Attempts to parse date string into standard ISO YYYY-MM-DD.
 * Returns parsed date or original string with warning flag.
 */
export function normalizeDate(
  raw: unknown
): { date: string | null; warning?: StructuredImportError } {
  if (raw === null || raw === undefined) return { date: null }

  // 1. Handle JavaScript Date objects (e.g. from cellDates: true)
  if (raw instanceof Date) {
    if (!isNaN(raw.getTime())) {
      const y = raw.getFullYear()
      const m = String(raw.getMonth() + 1).padStart(2, '0')
      const d = String(raw.getDate()).padStart(2, '0')
      return { date: `${y}-${m}-${d}` }
    }
    return { date: null }
  }

  // 2. Handle numeric Excel date serials (e.g. 18724)
  if (typeof raw === 'number' && raw > 0 && raw < 100000) {
    const epoch = new Date(Date.UTC(1899, 11, 30))
    const millis = epoch.getTime() + Math.round(raw * 86400000)
    const d = new Date(millis)
    if (!isNaN(d.getTime())) {
      const y = d.getUTCFullYear()
      const m = String(d.getUTCMonth() + 1).padStart(2, '0')
      const day = String(d.getUTCDate()).padStart(2, '0')
      return { date: `${y}-${m}-${day}` }
    }
  }

  if (typeof raw !== 'string') return { date: null }
  const trimmed = raw.trim()
  if (NULL_LITERALS.has(trimmed.toLowerCase())) return { date: null }

  // 3. Match ISO YYYY-MM-DD (including optional time YYYY-MM-DD HH:MM:SS or T)
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]\d{2}:\d{2}(?::\d{2})?)?/)
  if (isoMatch) {
    const iso = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`
    const d = new Date(iso)
    if (!isNaN(d.getTime())) {
      return { date: iso }
    }
  }

  // 4. Check DD/MM/YYYY or DD-MM-YYYY (including optional time)
  const dmyMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+\d{2}:\d{2}(?::\d{2})?)?/)
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0')
    const month = dmyMatch[2].padStart(2, '0')
    const year = dmyMatch[3]
    const iso = `${year}-${month}-${day}`
    const d = new Date(iso)
    if (!isNaN(d.getTime())) {
      return { date: iso }
    }
  }

  // 5. Check MM/DD/YYYY
  const mdyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (mdyMatch) {
    const month = mdyMatch[1].padStart(2, '0')
    const day = mdyMatch[2].padStart(2, '0')
    const year = mdyMatch[3]
    const iso = `${year}-${month}-${day}`
    const d = new Date(iso)
    if (!isNaN(d.getTime())) {
      return { date: iso }
    }
  }

  // Non-fatal warning if date cannot be normalized to YYYY-MM-DD
  return {
    date: trimmed,
    warning: {
      code: 'UNRECOGNIZED_DATE_FORMAT',
      message: `Date "${trimmed}" could not be parsed to standard YYYY-MM-DD; preserved as raw string.`,
      severity: 'WARNING',
    },
  }
}

/**
 * Normalizes boolean or living status representations.
 */
export function normalizeIsLiving(val: unknown): boolean | null {
  if (typeof val === 'boolean') return val
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase()
    if (['true', 'yes', 'y', 'living', 'alive', '1'].includes(s)) return true
    if (['false', 'no', 'n', 'deceased', 'dead', '0'].includes(s)) return false
  }
  return null
}

/**
 * Normalizes person status to canonical values: 'ACTIVE' | 'DECEASED'.
 * Source 'LIVING' maps to 'ACTIVE'.
 * Unsupported status returns the trimmed raw string along with a warning.
 */
export function normalizePersonStatus(val: unknown): {
  status: 'ACTIVE' | 'DECEASED' | null
  rawStatus?: string
  warning?: StructuredImportError
} {
  if (val === null || val === undefined || val === '') {
    return { status: null }
  }

  const s = String(val).trim().toUpperCase()
  if (s === 'ACTIVE' || s === 'LIVING') {
    return { status: 'ACTIVE' }
  }
  if (s === 'DECEASED') {
    return { status: 'DECEASED' }
  }

  return {
    status: null,
    rawStatus: s,
    warning: {
      code: 'INVALID_PERSON_STATUS',
      field: 'status',
      severity: 'WARNING',
      message: `Status "${s}" is not a recognized canonical person status; expected ACTIVE or DECEASED (source LIVING maps to ACTIVE).`,
    },
  }
}

/**
 * Finds first matching key in source record based on aliases.
 */
function findSourceValue(
  record: Record<string, unknown>,
  aliases: string[]
): unknown {
  const normKeys = Object.keys(record).map((k) => ({
    orig: k,
    norm: k.toLowerCase().replace(/[^a-z0-9]/g, '_'),
  }))

  for (const alias of aliases) {
    const target = alias.toLowerCase().replace(/[^a-z0-9]/g, '_')
    const match = normKeys.find((nk) => nk.norm === target)
    if (match && record[match.orig] !== undefined) {
      return record[match.orig]
    }
  }

  return undefined
}

/**
 * Determines entity type from explicit column, options, or field inference.
 */
export function detectEntityType(
  rawRecord: Record<string, unknown>,
  defaultType?: ImportEntityType
): ImportEntityType {
  // 1. Explicit column in record
  const explicit = findSourceValue(rawRecord, [
    'entity_type',
    'type',
    'record_type',
    '_type',
  ])
  if (typeof explicit === 'string') {
    const s = explicit.trim().toUpperCase()
    if (s === 'PERSON' || s === 'FAMILY' || s === 'RELATIONSHIP') {
      return s as ImportEntityType
    }
  }

  // 2. Options override
  if (defaultType) {
    return defaultType
  }

  // 3. Field inference
  const hasRelationshipFields =
    findSourceValue(rawRecord, ['relationship_type', 'relation', 'rel_type']) !== undefined ||
    (findSourceValue(rawRecord, ['person_a_id', 'person_1', 'source_person_id']) !== undefined &&
      findSourceValue(rawRecord, ['person_b_id', 'person_2', 'target_person_id']) !== undefined)

  if (hasRelationshipFields) {
    return 'RELATIONSHIP'
  }

  const hasFamilyName =
    findSourceValue(rawRecord, ['family_name', 'family', 'house_name']) !== undefined
  const hasPersonName =
    findSourceValue(rawRecord, ['first_name', 'given_name', 'fname']) !== undefined ||
    findSourceValue(rawRecord, ['last_name', 'surname', 'lname']) !== undefined

  if (hasFamilyName && !hasPersonName) {
    return 'FAMILY'
  }

  // Default census entity
  return 'PERSON'
}

/**
 * Maps and normalizes raw record into a typed PERSON entity.
 */
export function mapPersonEntity(
  rawRecord: Record<string, unknown>
): {
  parsedData: Record<string, unknown>
  mappedKeys: Set<string>
  errors: StructuredImportError[]
} {
  const errors: StructuredImportError[] = []
  const mappedKeys = new Set<string>()

  const fullNameRaw = findSourceValue(rawRecord, ['name', 'full_name', 'person_name', 'member_name'])
  let firstNameRaw = findSourceValue(rawRecord, ['first_name', 'first', 'given_name', 'fname'])
  let middleNameRaw = findSourceValue(rawRecord, ['middle_name', 'middle', 'mname'])
  let lastNameRaw = findSourceValue(rawRecord, ['last_name', 'last', 'surname', 'lname'])

  // Derive first, middle, last name from fullNameRaw if discrete columns are missing
  if (!firstNameRaw && fullNameRaw && typeof fullNameRaw === 'string') {
    const parts = fullNameRaw.trim().split(/\s+/)
    if (parts.length === 1) {
      firstNameRaw = parts[0]
      const defaultSurname = findSourceValue(rawRecord, ['family_surname', 'default_surname', 'surname'])
      lastNameRaw = (typeof defaultSurname === 'string' && defaultSurname) ? defaultSurname : parts[0]
    } else if (parts.length === 2) {
      firstNameRaw = parts[0]
      lastNameRaw = parts[1]
    } else {
      firstNameRaw = parts[0]
      middleNameRaw = parts.slice(1, -1).join(' ')
      lastNameRaw = parts[parts.length - 1]
    }
  }

  const maidenNameRaw = findSourceValue(rawRecord, ['maiden_name', 'maiden', 'previous_name'])
  const genderRaw = findSourceValue(rawRecord, ['gender', 'sex'])
  const dobRaw = findSourceValue(rawRecord, ['date_of_birth', 'dob', 'birth_date', 'born'])
  const pobRaw = findSourceValue(rawRecord, ['birth_place', 'pob', 'place_of_birth', 'birth_city'])
  const dodRaw = findSourceValue(rawRecord, ['date_of_death', 'dod', 'death_date', 'died'])
  const podRaw = findSourceValue(rawRecord, ['death_place', 'pod', 'place_of_death', 'death_city'])
  const isLivingRaw = findSourceValue(rawRecord, ['is_living', 'living', 'alive'])
  const statusRaw = findSourceValue(rawRecord, ['status', 'person_status', 'vital_status', 'life_status'])
  const gotraRaw = findSourceValue(rawRecord, ['gotra', 'gothra'])
  const nukhRaw = findSourceValue(rawRecord, ['nukh', 'nookh'])
  const kulRaw = findSourceValue(rawRecord, ['kul', 'kula'])
  const addressRaw = findSourceValue(rawRecord, ['current_address', 'address', 'street', 'residence'])
  const areaRaw = findSourceValue(rawRecord, ['current_area', 'area', 'neighborhood', 'locality'])
  const cityRaw = findSourceValue(rawRecord, ['current_city', 'city'])
  const stateRaw = findSourceValue(rawRecord, ['current_state', 'state', 'province'])
  const countryRaw = findSourceValue(rawRecord, ['country'])
  const postalCodeRaw = findSourceValue(rawRecord, ['current_postal_code', 'postal_code', 'zip', 'pincode'])
  const emailRaw = findSourceValue(rawRecord, ['email'])
  const phoneRaw = findSourceValue(rawRecord, ['phone', 'mobile', 'telephone', 'contact_number'])

  // Extended census & demographic fields
  const maritalStatusRaw = findSourceValue(rawRecord, ['marital_status', 'marital', 'marriage_status'])
  const bloodGroupRaw = findSourceValue(rawRecord, ['blood_group', 'blood', 'blood_type'])
  const educationRaw = findSourceValue(rawRecord, ['education', 'eduction', 'qualification', 'degree'])
  const occupationRaw = findSourceValue(rawRecord, ['occupation', 'business', 'profession', 'job', 'work'])
  const birthOrderRaw = findSourceValue(rawRecord, ['birth_order', 'birthorder', 'child_order'])
  const nativePlaceRaw = findSourceValue(rawRecord, ['native_place', 'native', 'origin_place', 'sihdh_jo_gam', 'sindh_jo_gam'])
  const familyRefRaw = findSourceValue(rawRecord, ['family_ref', 'family_code', 'family_id'])
  const roleRaw = findSourceValue(rawRecord, ['relationship', 'relation', 'role', 'family_role'])
  const isHeadRaw = findSourceValue(rawRecord, ['is_head'])

  const dobNorm = normalizeDate(dobRaw)
  if (dobNorm.warning) errors.push(dobNorm.warning)

  const dodNorm = normalizeDate(dodRaw)
  if (dodNorm.warning) errors.push(dodNorm.warning)

  const firstName = normalizeFreeText(firstNameRaw)
  const lastName = normalizeFreeText(lastNameRaw)

  if (!firstName) {
    errors.push({
      code: 'MISSING_FIRST_NAME',
      field: 'first_name',
      message: 'Person record must have a first_name.',
      severity: 'ERROR',
    })
  }

  if (!lastName) {
    errors.push({
      code: 'MISSING_LAST_NAME',
      field: 'last_name',
      message: 'Person record must have a last_name.',
      severity: 'ERROR',
    })
  }

  // Handle status normalization (canonical: ACTIVE | DECEASED, source LIVING -> ACTIVE)
  const statusNorm = normalizePersonStatus(statusRaw)
  if (statusNorm.warning) errors.push(statusNorm.warning)

  let mappedRole: string | null = null
  if (typeof roleRaw === 'string') {
    const rLower = roleRaw.trim().toLowerCase()
    if (rLower === 'head') mappedRole = 'HEAD'
    else if (rLower === 'spouse' || rLower === 'wife' || rLower === 'husband') mappedRole = 'SPOUSE'
    else if (rLower === 'son' || rLower === 'daughter' || rLower === 'child') mappedRole = 'CHILD'
    else if (rLower === 'father' || rLower === 'mother' || rLower === 'parent') mappedRole = 'PARENT'
    else if (rLower === 'brother' || rLower === 'sister' || rLower === 'sibling') mappedRole = 'SIBLING'
    else if (rLower === 'grand son' || rLower === 'grandson' || rLower === 'grand daughter' || rLower === 'granddaughter' || rLower === 'grandchild') mappedRole = 'GRANDCHILD'
    else if (rLower === 'grandfather' || rLower === 'grandmother' || rLower === 'grandparent') mappedRole = 'GRANDPARENT'
    else mappedRole = 'EXTENDED'
  }

  const isHead = Boolean(
    isHeadRaw ||
    mappedRole === 'HEAD' ||
    (typeof roleRaw === 'string' && roleRaw.toLowerCase() === 'head')
  )

  const parsedData: Record<string, unknown> = {
    first_name: firstName,
    middle_name: normalizeFreeText(middleNameRaw),
    last_name: lastName,
    maiden_name: normalizeFreeText(maidenNameRaw),
    gender: normalizeGender(genderRaw),
    date_of_birth: dobNorm.date,
    birth_place: normalizeFreeText(pobRaw),
    date_of_death: dodNorm.date,
    death_place: normalizeFreeText(podRaw),
    is_living: normalizeIsLiving(isLivingRaw ?? statusRaw),
    status: statusNorm.status ?? (statusNorm.rawStatus ? statusNorm.rawStatus : undefined),
    gotra: normalizeFreeText(gotraRaw),
    nukh: normalizeFreeText(nukhRaw),
    kul: normalizeFreeText(kulRaw),
    current_address: normalizeFreeText(addressRaw),
    current_area: normalizeFreeText(areaRaw),
    current_city: normalizeFreeText(cityRaw),
    city: normalizeFreeText(cityRaw),
    current_state: normalizeFreeText(stateRaw),
    state: normalizeFreeText(stateRaw),
    country: normalizeFreeText(countryRaw),
    current_postal_code: normalizeValue(postalCodeRaw),
    postal_code: normalizeValue(postalCodeRaw),
    email: normalizeValue(emailRaw),
    phone: normalizeValue(phoneRaw),
    marital_status: normalizeFreeText(maritalStatusRaw),
    blood_group: normalizeFreeText(bloodGroupRaw),
    education: normalizeFreeText(educationRaw),
    occupation: normalizeFreeText(occupationRaw),
    birth_order: normalizeValue(birthOrderRaw),
    native_place: normalizeFreeText(nativePlaceRaw),
    family_ref: normalizeValue(familyRefRaw),
    family_role: mappedRole,
    is_head: isHead,
  }

  return { parsedData, mappedKeys, errors }
}

/**
 * Maps and normalizes raw record into a typed FAMILY entity.
 */
export function mapFamilyEntity(
  rawRecord: Record<string, unknown>
): {
  parsedData: Record<string, unknown>
  mappedKeys: Set<string>
  errors: StructuredImportError[]
} {
  const errors: StructuredImportError[] = []
  const mappedKeys = new Set<string>()

  const familyNameRaw = findSourceValue(rawRecord, ['family_name', 'name', 'family', 'house_name', 'surname'])
  const headIdRaw = findSourceValue(rawRecord, ['head_id', 'head_person_id', 'family_head_id', 'head'])
  const headNameRaw = findSourceValue(rawRecord, ['head_name', 'head_person_name', 'head_full_name', 'head_of_family'])
  const cityRaw = findSourceValue(rawRecord, ['city'])
  const stateRaw = findSourceValue(rawRecord, ['state', 'province'])
  const countryRaw = findSourceValue(rawRecord, ['country'])
  const postalCodeRaw = findSourceValue(rawRecord, ['postal_code', 'zip', 'pincode'])
  const descRaw = findSourceValue(rawRecord, ['description', 'notes', 'about', 'history'])
  const gotraRaw = findSourceValue(rawRecord, ['gotra', 'gothra'])
  const nukhRaw = findSourceValue(rawRecord, ['nukh', 'nookh'])
  const kulRaw = findSourceValue(rawRecord, ['kul', 'kula'])

  // Extended family attributes
  const moolShakhaRaw = findSourceValue(rawRecord, ['mool_shakha', 'moolshakha', 'shakha'])
  const familyTypeRaw = findSourceValue(rawRecord, ['family_type', 'type', 'household_type'])
  const mukhiRaw = findSourceValue(rawRecord, ['mukhi_name', 'mukhi', 'elder'])
  const nativePlaceRaw = findSourceValue(rawRecord, ['native_place', 'native', 'origin_place', 'sihdh_jo_gam', 'sindh_jo_gam'])
  const addressRaw = findSourceValue(rawRecord, ['address', 'street', 'residence'])
  const areaRaw = findSourceValue(rawRecord, ['area', 'locality', 'neighborhood'])
  const censusStatusRaw = findSourceValue(rawRecord, ['census_status', 'verification_status'])

  let familyName = normalizeFreeText(familyNameRaw)
  if (!familyName && headNameRaw && typeof headNameRaw === 'string') {
    const headTokens = headNameRaw.trim().split(/\s+/)
    familyName = headTokens.length > 1 ? `${headTokens[headTokens.length - 1]} Family` : `${headTokens[0]} Family`
  }

  if (!familyName) {
    errors.push({
      code: 'MISSING_REQUIRED_FIELD',
      field: 'family_name',
      message: 'Family record must have a family_name.',
      severity: 'ERROR',
    })
  }

  const parsedData: Record<string, unknown> = {
    family_name: familyName,
    head_id: normalizeValue(headIdRaw),
    head_name: normalizeFreeText(headNameRaw),
    city: normalizeFreeText(cityRaw),
    state: normalizeFreeText(stateRaw),
    country: normalizeFreeText(countryRaw),
    postal_code: normalizeValue(postalCodeRaw),
    description: normalizeMultilineFreeText(descRaw),
    gotra: normalizeFreeText(gotraRaw),
    nukh: normalizeFreeText(nukhRaw),
    kul: normalizeFreeText(kulRaw),
    mool_shakha: normalizeFreeText(moolShakhaRaw),
    family_type: normalizeFreeText(familyTypeRaw),
    mukhi_name: normalizeFreeText(mukhiRaw),
    native_place: normalizeFreeText(nativePlaceRaw),
    address: normalizeMultilineFreeText(addressRaw),
    area: normalizeFreeText(areaRaw),
    census_status: normalizeFreeText(censusStatusRaw),
  }

  return { parsedData, mappedKeys, errors }
}

/**
 * Maps and normalizes raw record into a typed RELATIONSHIP entity.
 */
export function mapRelationshipEntity(
  rawRecord: Record<string, unknown>
): {
  parsedData: Record<string, unknown>
  mappedKeys: Set<string>
  errors: StructuredImportError[]
} {
  const errors: StructuredImportError[] = []
  const mappedKeys = new Set<string>()

  const personARaw = findSourceValue(rawRecord, ['person_a_id', 'person_1', 'source_person_id', 'from_person_id', 'person_a'])
  const personBRaw = findSourceValue(rawRecord, ['person_b_id', 'person_2', 'target_person_id', 'to_person_id', 'person_b'])
  const typeRaw = findSourceValue(rawRecord, ['relationship_type', 'relation', 'type', 'rel_type'])
  const notesRaw = findSourceValue(rawRecord, ['notes', 'note', 'description', 'comment', 'relationship_notes'])

  let personA = normalizeValue(personARaw) as string | null
  let personB = normalizeValue(personBRaw) as string | null
  let relType = normalizeRelationshipType(typeRaw)

  if (relType === 'child') {
    // Canonical relationship_type is strictly: PARENT, SPOUSE, SIBLING (no CHILD enum).
    // Normalize source CHILD to canonical PARENT semantics with endpoints reversed:
    // If source says A is CHILD of B, then canonically B is PARENT of A.
    const origA = personA
    personA = personB
    personB = origA
    relType = 'parent'
  }

  if (!personA) {
    errors.push({
      code: 'MISSING_REQUIRED_FIELD',
      field: 'person_a_id',
      message: 'Relationship record must reference Person A (person_a_id).',
      severity: 'ERROR',
    })
  }

  if (!personB) {
    errors.push({
      code: 'MISSING_REQUIRED_FIELD',
      field: 'person_b_id',
      message: 'Relationship record must reference Person B (person_b_id).',
      severity: 'ERROR',
    })
  }

  if (!relType) {
    errors.push({
      code: 'MISSING_REQUIRED_FIELD',
      field: 'relationship_type',
      message: 'Relationship record must specify relationship_type (e.g. parent, spouse, sibling).',
      severity: 'ERROR',
    })
  }

  const parsedData: Record<string, unknown> = {
    person_a_id: personA,
    person_b_id: personB,
    relationship_type: relType ? (relType === 'parent' ? 'PARENT' : relType === 'spouse' ? 'SPOUSE' : relType === 'sibling' ? 'SIBLING' : relType.toUpperCase()) : null,
    notes: normalizeMultilineFreeText(notesRaw),
  }

  return { parsedData, mappedKeys, errors }
}

/**
 * Extracts unmapped fields from raw record to ensure zero data loss.
 */
export function extractUnmappedFields(
  rawRecord: Record<string, unknown>,
  parsedData: Record<string, unknown>
): Record<string, unknown> {
  const unmapped: Record<string, unknown> = {}
  const parsedKeys = new Set(Object.keys(parsedData))

  for (const [key, val] of Object.entries(rawRecord)) {
    // Exclude metadata/sensitive columns
    if (SENSITIVE_KEY_REGEX.test(key)) continue
    if (key.toLowerCase() === 'entity_type') continue

    // If key not in parsedData directly
    if (!parsedKeys.has(key)) {
      unmapped[key] = normalizeValue(val)
    }
  }

  return unmapped
}

/**
 * Determines deterministic source record ID.
 * Prefers mapped ID column, falling back to `${entity_type}_ROW_${source_row_number}`.
 */
export function resolveSourceRecordId(
  rawRecord: Record<string, unknown>,
  entityType: ImportEntityType,
  rowNumber: number
): string {
  const sourceIdVal = findSourceValue(rawRecord, [
    'source_record_id',
    'id',
    'external_id',
    'person_id',
    'family_id',
    'relationship_id',
    'source_id',
    'record_id',
    'member_id',
  ])

  if (sourceIdVal && typeof sourceIdVal === 'string' && sourceIdVal.trim().length > 0) {
    return sourceIdVal.trim()
  }

  if (sourceIdVal && typeof sourceIdVal === 'number') {
    return String(sourceIdVal)
  }

  // Deterministic fallback (Never uses random IDs)
  return `${entityType}_ROW_${rowNumber}`
}

/**
 * Advanced Excel Workbook Parser:
 * Deterministically parses Khatrisetu multi-sheet workbooks, Demo User Data embedded multi-level
 * single-sheet tables, and generic flat workbooks into typed StagingRecordDraft collections.
 */
export function parseExcelWorkbookRecords(
  content: string | ArrayBuffer | Uint8Array,
  options: ParseImportOptions = {}
): {
  drafts: StagingRecordDraft[]
  fileErrors: StructuredImportError[]
  rowCounts: ImportBatchRowCounts
  validationSummary: ImportBatchValidationSummary
} {
  const fileErrors: StructuredImportError[] = []
  const drafts: StagingRecordDraft[] = []
  const rowCounts: ImportBatchRowCounts = { persons: 0, families: 0, relationships: 0 }
  const validationSummary: ImportBatchValidationSummary = {
    errors: 0,
    warnings: 0,
    valid: 0,
    duplicates: 0,
  }

  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(content, {
      type: typeof content === 'string' ? 'binary' : 'array',
      cellDates: true,
    })
  } catch (err) {
    throw new Error(`EXCEL_PARSE_ERROR: Failed to read Excel workbook: ${(err as Error).message}`)
  }

  const normalizedSheetNames = workbook.SheetNames.map((s) => s.trim().toLowerCase())
  const hasFamiliesSheet = normalizedSheetNames.includes('families')
  const hasMembersSheet = normalizedSheetNames.includes('members')

  // =========================================================================
  // Case A: Multi-Sheet Khatrisetu Format (Families + Members sheets)
  // =========================================================================
  if (hasFamiliesSheet && hasMembersSheet) {
    const famSheetName = workbook.SheetNames.find((s) => s.trim().toLowerCase() === 'families')!
    const memSheetName = workbook.SheetNames.find((s) => s.trim().toLowerCase() === 'members')!

    const famSheet = workbook.Sheets[famSheetName]
    const memSheet = workbook.Sheets[memSheetName]

    const famRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(famSheet, { defval: null })
    const memRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(memSheet, { defval: null })

    // 1. Process Families Sheet
    for (let i = 0; i < famRows.length; i++) {
      const row = famRows[i]
      const rowNumber = i + 2
      const sanitizedRaw = sanitizeSensitiveFields(row)
      const familyCode = String(
        findSourceValue(sanitizedRaw, ['family_code', 'family code', 'code']) || `FAM_${i + 1}`
      ).trim()

      const mapped = mapFamilyEntity(sanitizedRaw)
      const errors = [...mapped.errors]

      const hasError = errors.some((e) => e.severity === 'ERROR')
      const hasWarning = errors.some((e) => e.severity === 'WARNING')

      let validationStatus: StagingRecordDraft['validation_status'] = 'VALID'
      if (hasError) {
        validationStatus = 'ERROR'
        validationSummary.errors++
      } else if (hasWarning) {
        validationStatus = 'WARNING'
        validationSummary.warnings++
        validationSummary.valid++
      } else {
        validationSummary.valid++
      }

      drafts.push({
        entity_type: 'FAMILY',
        source_row_number: rowNumber,
        source_record_id: familyCode,
        parsed_data: mapped.parsedData,
        raw_data: sanitizedRaw,
        validation_status: validationStatus,
        validation_errors: errors,
        canonical_id: null,
      })
      rowCounts.families++
    }

    // 2. Process Members Sheet
    const memberNameMap = new Map<string, string>() // `${familyCode}_${name.toLowerCase()}` -> personSourceId
    interface StagedMemberItem {
      personSourceId: string
      familyCode: string
      memberName: string
      linkedTo: string | null
      relationship: string | null
      rowNumber: number
    }
    const stagedMembers: StagedMemberItem[] = []

    for (let i = 0; i < memRows.length; i++) {
      const row = memRows[i]
      const rowNumber = i + 2
      const sanitizedRaw = sanitizeSensitiveFields(row)

      const familyCode = String(
        findSourceValue(sanitizedRaw, ['family_code', 'family code']) || ''
      ).trim()
      const memberName = String(
        findSourceValue(sanitizedRaw, ['name', 'member_name']) || `Member_${i + 1}`
      ).trim()
      const linkedTo = normalizeFreeText(findSourceValue(sanitizedRaw, ['linked_to', 'linked to']))
      const relationship = normalizeFreeText(findSourceValue(sanitizedRaw, ['relationship', 'relation']))

      const personSourceId = `${familyCode}_M${i + 1}`
      sanitizedRaw.family_ref = familyCode

      const mapped = mapPersonEntity(sanitizedRaw)
      const errors = [...mapped.errors]

      const hasError = errors.some((e) => e.severity === 'ERROR')
      const hasWarning = errors.some((e) => e.severity === 'WARNING')

      let validationStatus: StagingRecordDraft['validation_status'] = 'VALID'
      if (hasError) {
        validationStatus = 'ERROR'
        validationSummary.errors++
      } else if (hasWarning) {
        validationStatus = 'WARNING'
        validationSummary.warnings++
        validationSummary.valid++
      } else {
        validationSummary.valid++
      }

      drafts.push({
        entity_type: 'PERSON',
        source_row_number: rowNumber,
        source_record_id: personSourceId,
        parsed_data: mapped.parsedData,
        raw_data: sanitizedRaw,
        validation_status: validationStatus,
        validation_errors: errors,
        canonical_id: null,
      })
      rowCounts.persons++

      const key = `${familyCode.toLowerCase()}::${memberName.toLowerCase()}`
      memberNameMap.set(key, personSourceId)

      stagedMembers.push({
        personSourceId,
        familyCode,
        memberName,
        linkedTo,
        relationship,
        rowNumber,
      })
    }

    // 3. Generate RELATIONSHIP Drafts from `Linked To` in Members
    let relRowNumber = 10000
    for (const sm of stagedMembers) {
      if (sm.linkedTo && sm.linkedTo !== sm.memberName) {
        const targetKey = `${sm.familyCode.toLowerCase()}::${sm.linkedTo.toLowerCase()}`
        const targetSourceId = memberNameMap.get(targetKey)

        if (targetSourceId) {
          relRowNumber++
          const rawRelType = sm.relationship || 'RELATIVE'
          const normRelType = normalizeRelationshipType(rawRelType) || 'RELATIVE'

          let personA = sm.personSourceId
          let personB = targetSourceId
          let canonicalRelType = 'RELATIVE'

          if (normRelType === 'spouse') {
            canonicalRelType = 'SPOUSE'
          } else if (normRelType === 'child') {
            personA = targetSourceId
            personB = sm.personSourceId
            canonicalRelType = 'PARENT'
          } else if (normRelType === 'parent') {
            personA = sm.personSourceId
            personB = targetSourceId
            canonicalRelType = 'PARENT'
          } else if (normRelType === 'sibling') {
            canonicalRelType = 'SIBLING'
          }

          if (['PARENT', 'SPOUSE', 'SIBLING'].includes(canonicalRelType)) {
            drafts.push({
              entity_type: 'RELATIONSHIP',
              source_row_number: relRowNumber,
              source_record_id: `REL_${personA}_${personB}_${canonicalRelType}`,
              parsed_data: {
                person_a_id: personA,
                person_b_id: personB,
                relationship_type: canonicalRelType,
                notes: `Source: Khatrisetu relationship between ${sm.memberName} and ${sm.linkedTo}`,
              },
              raw_data: {
                source_member_row: sm.rowNumber,
                member: sm.memberName,
                linked_to: sm.linkedTo,
                relationship: sm.relationship,
              },
              validation_status: 'VALID',
              validation_errors: [],
              canonical_id: null,
            })
            rowCounts.relationships++
            validationSummary.valid++
          }
        }
      }
    }

    return { drafts, fileErrors, rowCounts, validationSummary }
  }

  // =========================================================================
  // Case B: Embedded Multi-Level Single Sheet (Demo User Data format)
  // =========================================================================
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
  const rawMatrix = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: null })

  const isEmbeddedFormat = rawMatrix.some((row) => {
    return Array.isArray(row) && (row[1] === 'Ghar Mukhi Name' || row[1] === 'Member Name')
  })

  if (isEmbeddedFormat) {
    let currentHousehold: {
      familyId: string
      headId: string
      headName: string
      surname: string
      members: Map<string, { id: string; role: string; father: string }>
    } | null = null

    const seenHouseholdHeads = new Map<string, number>()
    let relRowIndex = 20000

    for (let r = 0; r < rawMatrix.length; r++) {
      const row = rawMatrix[r]
      if (!row || !Array.isArray(row) || row.length === 0) continue
      if (row.every((c) => c === null || c === undefined || c === '')) continue

      const col1 = String(row[1] || '').trim()
      if (col1 === 'Ghar Mukhi Name' || col1 === 'Member Name') continue
      if (col1.toLowerCase().startsWith('test')) continue

      const isHouseholdRow =
        String(row[14] || '').includes('ADD MEMBER') ||
        (row[9] !== undefined && row[9] !== null && String(row[9]).trim() !== '' &&
         row[10] !== undefined && row[10] !== null && String(row[10]).trim() !== '')

      if (isHouseholdRow && col1.length > 0) {
        // --- HOUSEHOLD ROW ---
        const fileRowNumber = r + 1
        const headFullName = col1
        const headTokens = headFullName.split(/\s+/)
        const lastName = headTokens.length > 1 ? headTokens[headTokens.length - 1] : 'Family'
        const familyId = `HH_FAM_R${fileRowNumber}`
        const headId = `HH_HEAD_R${fileRowNumber}`

        const famRaw = {
          family_name: `${lastName} Family`,
          head_id: headId,
          head_name: headFullName,
          nukh: row[6],
          native_place: row[7],
          gotra: row[8],
          address: row[9],
          city: row[10],
          file_row_number: fileRowNumber,
        }

        const mappedFam = mapFamilyEntity(famRaw)
        const famErrors = [...mappedFam.errors]

        const dupKey = `${headFullName.toLowerCase()}::${String(row[4] || '').trim()}`
        let isDuplicate = false
        if (seenHouseholdHeads.has(dupKey)) {
          const priorRow = seenHouseholdHeads.get(dupKey)!
          isDuplicate = true
          famErrors.push({
            code: 'DUPLICATE_CANDIDATE',
            message: `Possible duplicate household record matching Row ${priorRow} (${headFullName}). Flagged for review; not auto-merged.`,
            severity: 'WARNING',
          })
          validationSummary.duplicates++
        } else {
          seenHouseholdHeads.set(dupKey, fileRowNumber)
        }

        const famStatus: StagingRecordDraft['validation_status'] = famErrors.some((e) => e.severity === 'ERROR')
          ? 'ERROR'
          : isDuplicate || famErrors.some((e) => e.severity === 'WARNING')
          ? 'WARNING'
          : 'VALID'

        if (famStatus === 'ERROR') validationSummary.errors++
        else validationSummary.valid++
        if (famStatus === 'WARNING' && !isDuplicate) validationSummary.warnings++

        drafts.push({
          entity_type: 'FAMILY',
          source_row_number: fileRowNumber,
          source_record_id: familyId,
          parsed_data: mappedFam.parsedData,
          raw_data: famRaw,
          validation_status: famStatus,
          validation_errors: famErrors,
          canonical_id: null,
        })
        rowCounts.families++

        // Create PERSON draft for Ghar Mukhi (Head)
        const headRaw = {
          name: headFullName,
          family_ref: familyId,
          family_role: 'HEAD',
          is_head: true,
          gender: 'male',
          phone: row[4],
          date_of_birth: row[11],
          occupation: row[12],
          education: row[13],
          gotra: row[8],
          nukh: row[6],
          native_place: row[7],
          current_address: row[9],
          current_city: row[10],
          file_row_number: fileRowNumber,
        }

        const mappedHead = mapPersonEntity(headRaw)
        const headErrors = [...mappedHead.errors]
        if (isDuplicate) {
          headErrors.push({
            code: 'DUPLICATE_CANDIDATE',
            message: `Head of household is identical to prior row ${seenHouseholdHeads.get(dupKey)}. Flagged for review.`,
            severity: 'WARNING',
          })
        }

        const headStatus: StagingRecordDraft['validation_status'] = headErrors.some((e) => e.severity === 'ERROR')
          ? 'ERROR'
          : isDuplicate || headErrors.some((e) => e.severity === 'WARNING')
          ? 'WARNING'
          : 'VALID'

        if (headStatus === 'ERROR') validationSummary.errors++
        else validationSummary.valid++
        if (headStatus === 'WARNING' && !isDuplicate) validationSummary.warnings++

        drafts.push({
          entity_type: 'PERSON',
          source_row_number: fileRowNumber,
          source_record_id: headId,
          parsed_data: mappedHead.parsedData,
          raw_data: headRaw,
          validation_status: headStatus,
          validation_errors: headErrors,
          canonical_id: null,
        })
        rowCounts.persons++

        currentHousehold = {
          familyId,
          headId,
          headName: headFullName,
          surname: lastName,
          members: new Map(),
        }
      } else if (currentHousehold && col1.length > 0) {
        // --- EMBEDDED MEMBER ROW ---
        const fileRowNumber = r + 1
        const memName = col1
        const memFather = String(row[2] || '').trim()
        const memRelation = String(row[3] || '').trim()
        const memberPersonId = `HH_MEM_R${fileRowNumber}`

        const memRaw = {
          name: memName,
          family_surname: currentHousehold.surname,
          family_ref: currentHousehold.familyId,
          family_role: memRelation,
          is_head: false,
          date_of_birth: row[4],
          education: row[5],
          occupation: row[6],
          phone: row[7],
          file_row_number: fileRowNumber,
        }

        const mappedMem = mapPersonEntity(memRaw)
        const memErrors = [...mappedMem.errors]

        const memStatus: StagingRecordDraft['validation_status'] = memErrors.some((e) => e.severity === 'ERROR')
          ? 'ERROR'
          : memErrors.some((e) => e.severity === 'WARNING')
          ? 'WARNING'
          : 'VALID'

        if (memStatus === 'ERROR') validationSummary.errors++
        else validationSummary.valid++
        if (memStatus === 'WARNING') validationSummary.warnings++

        drafts.push({
          entity_type: 'PERSON',
          source_row_number: fileRowNumber,
          source_record_id: memberPersonId,
          parsed_data: mappedMem.parsedData,
          raw_data: memRaw,
          validation_status: memStatus,
          validation_errors: memErrors,
          canonical_id: null,
        })
        rowCounts.persons++

        currentHousehold.members.set(memName.toLowerCase(), {
          id: memberPersonId,
          role: memRelation.toLowerCase(),
          father: memFather.toLowerCase(),
        })

        // Construct Relational Edges for this Member
        relRowIndex++
        const rLower = memRelation.toLowerCase()
        let personA = memberPersonId
        let personB = currentHousehold.headId
        let canonicalRel: 'SPOUSE' | 'PARENT' | 'SIBLING' | null = null

        if (rLower === 'wife' || rLower === 'spouse') {
          canonicalRel = 'SPOUSE'
          personA = memberPersonId
          personB = currentHousehold.headId
        } else if (rLower === 'son' || rLower === 'daughter' || rLower === 'child') {
          canonicalRel = 'PARENT'
          personA = currentHousehold.headId
          personB = memberPersonId
        } else if (rLower === 'mother') {
          canonicalRel = 'PARENT'
          personA = memberPersonId
          personB = currentHousehold.headId
        } else if (rLower === 'sister' || rLower === 'brother' || rLower === 'sibling') {
          canonicalRel = 'SIBLING'
          personA = memberPersonId
          personB = currentHousehold.headId
        } else if (rLower.includes('grand son') || rLower.includes('grand daughter') || rLower.includes('grandchild')) {
          let intermediateSonId: string | null = null
          if (memFather) {
            for (const [sName, sData] of currentHousehold.members.entries()) {
              if (sName.includes(memFather) || memFather.includes(sName)) {
                intermediateSonId = sData.id
                break
              }
            }
          }
          if (intermediateSonId) {
            canonicalRel = 'PARENT'
            personA = intermediateSonId
            personB = memberPersonId
          }
        } else if (rLower.includes('daughter in-law') || rLower.includes('daughter-in-law')) {
          let husbandId: string | null = null
          if (memFather) {
            for (const [sName, sData] of currentHousehold.members.entries()) {
              if (sName.includes(memFather) || memFather.includes(sName)) {
                husbandId = sData.id
                break
              }
            }
          }
          if (husbandId) {
            canonicalRel = 'SPOUSE'
            personA = memberPersonId
            personB = husbandId
          }
        }

        if (canonicalRel) {
          drafts.push({
            entity_type: 'RELATIONSHIP',
            source_row_number: relRowIndex,
            source_record_id: `REL_${personA}_${personB}_${canonicalRel}`,
            parsed_data: {
              person_a_id: personA,
              person_b_id: personB,
              relationship_type: canonicalRel,
              notes: `Source: Household member ${memName} (${memRelation}) in ${currentHousehold.headName} family`,
            },
            raw_data: {
              household: currentHousehold.headName,
              member: memName,
              relation: memRelation,
              father: memFather,
            },
            validation_status: 'VALID',
            validation_errors: [],
            canonical_id: null,
          })
          rowCounts.relationships++
          validationSummary.valid++
        }
      }
    }

    return { drafts, fileErrors, rowCounts, validationSummary }
  }

  // =========================================================================
  // Case C: Generic Single-Sheet Table (Fallback)
  // =========================================================================
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: null })
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const rowNumber = i + 2
    const sanitizedRaw = sanitizeSensitiveFields(row)
    const entityType = detectEntityType(sanitizedRaw, options.defaultEntityType)
    const sourceRecordId = resolveSourceRecordId(sanitizedRaw, entityType, rowNumber)

    let parsedData: Record<string, unknown> = {}
    const rowErrors: StructuredImportError[] = []

    if (entityType === 'PERSON') {
      const mapped = mapPersonEntity(sanitizedRaw)
      parsedData = mapped.parsedData
      rowErrors.push(...mapped.errors)
      rowCounts.persons++
    } else if (entityType === 'FAMILY') {
      const mapped = mapFamilyEntity(sanitizedRaw)
      parsedData = mapped.parsedData
      rowErrors.push(...mapped.errors)
      rowCounts.families++
    } else {
      const mapped = mapRelationshipEntity(sanitizedRaw)
      parsedData = mapped.parsedData
      rowErrors.push(...mapped.errors)
      rowCounts.relationships++
    }

    const hasError = rowErrors.some((e) => e.severity === 'ERROR')
    const hasWarning = rowErrors.some((e) => e.severity === 'WARNING')

    let validationStatus: StagingRecordDraft['validation_status'] = 'VALID'
    if (hasError) {
      validationStatus = 'ERROR'
      validationSummary.errors++
    } else if (hasWarning) {
      validationStatus = 'WARNING'
      validationSummary.warnings++
      validationSummary.valid++
    } else {
      validationSummary.valid++
    }

    drafts.push({
      entity_type: entityType,
      source_row_number: rowNumber,
      source_record_id: sourceRecordId,
      parsed_data: parsedData,
      raw_data: sanitizedRaw,
      validation_status: validationStatus,
      validation_errors: rowErrors,
      canonical_id: null,
    })
  }

  return { drafts, fileErrors, rowCounts, validationSummary }
}

/**
 * Core Parser & Mapper Pipeline:
 * Validates, parses, normalizes, maps, and generates staging record drafts.
 */
export async function parseImportFile(
  fileName: string,
  content: string | ArrayBuffer | Uint8Array,
  options: ParseImportOptions = {}
): Promise<ParseImportResult> {
  // 1. File Format Determination & Validation
  let format = options.format
  if (!format) {
    const ext = fileName.split('.').pop()?.toUpperCase()
    if (ext === 'CSV' || ext === 'JSON' || ext === 'XLSX' || ext === 'XLS') {
      format = ext === 'XLSX' || ext === 'XLS' ? 'XLSX' : (ext as 'CSV' | 'JSON')
    } else {
      throw new Error(`UNSUPPORTED_FORMAT: Unsupported file format ".${ext}". Only CSV, JSON, and XLSX are supported.`)
    }
  }

  if (format !== 'CSV' && format !== 'JSON' && format !== 'XLSX' && format !== 'EXCEL') {
    throw new Error(`UNSUPPORTED_FORMAT: Unsupported file format "${format}". Only CSV, JSON, and XLSX are supported.`)
  }

  // 2. Size & Resource Limit Checks
  const fileSizeBytes =
    typeof content === 'string'
      ? new TextEncoder().encode(content).length
      : content instanceof ArrayBuffer
      ? content.byteLength
      : content.length

  if (fileSizeBytes > IMPORT_LIMITS.MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `FILE_TOO_LARGE: File size of ${(fileSizeBytes / (1024 * 1024)).toFixed(2)} MB exceeds maximum allowed limit of ${IMPORT_LIMITS.MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB.`
    )
  }

  // 3. Compute Deterministic File Hash
  const fileHash = await computeSha256(content)

  // 4. Handle Excel Workbooks
  if (format === 'XLSX' || format === 'EXCEL') {
    const excelResult = parseExcelWorkbookRecords(content, options)
    if (excelResult.drafts.length === 0) {
      throw new Error('EMPTY_FILE: No data records found in the import file.')
    }
    if (excelResult.drafts.length > IMPORT_LIMITS.MAX_RECORDS_PER_BATCH) {
      throw new Error(
        `RECORD_LIMIT_EXCEEDED: Record count (${excelResult.drafts.length}) exceeds maximum allowed batch limit of ${IMPORT_LIMITS.MAX_RECORDS_PER_BATCH}.`
      )
    }

    return {
      fileName,
      fileFormat: format,
      fileHash,
      fileSizeBytes,
      totalRows: excelResult.drafts.length,
      records: excelResult.drafts,
      errors: excelResult.fileErrors,
      rowCounts: excelResult.rowCounts,
      validationSummary: excelResult.validationSummary,
    }
  }

  // 5. Handle CSV / JSON
  const stringContent = typeof content === 'string' ? content : new TextDecoder().decode(content)

  let rawRecords: Array<{
    rowNumber: number
    data: Record<string, unknown>
    errors: StructuredImportError[]
  }>
  const fileErrors: StructuredImportError[] = []

  if (format === 'CSV') {
    const csvResult = parseCsvRows(stringContent)
    rawRecords = csvResult.rows
    fileErrors.push(...csvResult.fileErrors)
  } else {
    const jsonResult = parseJsonRecords(stringContent)
    rawRecords = jsonResult.records
    fileErrors.push(...jsonResult.fileErrors)
  }

  if (fileErrors.some((e) => e.severity === 'ERROR')) {
    const firstErr = fileErrors.find((e) => e.severity === 'ERROR')!
    throw new Error(`${firstErr.code}: ${firstErr.message}`)
  }

  if (rawRecords.length === 0) {
    throw new Error('EMPTY_FILE: No data records found in the import file.')
  }

  if (rawRecords.length > IMPORT_LIMITS.MAX_RECORDS_PER_BATCH) {
    throw new Error(
      `RECORD_LIMIT_EXCEEDED: Record count (${rawRecords.length}) exceeds maximum allowed batch limit of ${IMPORT_LIMITS.MAX_RECORDS_PER_BATCH}.`
    )
  }

  // 5. Normalization, Mapping & Lineage Generation
  const stagedDrafts: StagingRecordDraft[] = []
  const rowCounts: ImportBatchRowCounts = { persons: 0, families: 0, relationships: 0 }
  const validationSummary: ImportBatchValidationSummary = {
    errors: 0,
    warnings: 0,
    valid: 0,
    duplicates: 0,
  }

  for (const rawItem of rawRecords) {
    const rowNumber = rawItem.rowNumber
    const sanitizedRaw = sanitizeSensitiveFields(rawItem.data)
    const entityType = detectEntityType(sanitizedRaw, options.defaultEntityType)
    const sourceRecordId = resolveSourceRecordId(sanitizedRaw, entityType, rowNumber)

    let parsedData: Record<string, unknown> = {}
    const rowErrors: StructuredImportError[] = [...rawItem.errors]

    if (entityType === 'PERSON') {
      const mapped = mapPersonEntity(sanitizedRaw)
      parsedData = mapped.parsedData
      rowErrors.push(...mapped.errors)
      rowCounts.persons++
    } else if (entityType === 'FAMILY') {
      const mapped = mapFamilyEntity(sanitizedRaw)
      parsedData = mapped.parsedData
      rowErrors.push(...mapped.errors)
      rowCounts.families++
    } else if (entityType === 'RELATIONSHIP') {
      const mapped = mapRelationshipEntity(sanitizedRaw)
      parsedData = mapped.parsedData
      rowErrors.push(...mapped.errors)
      rowCounts.relationships++
    }

    // Preserve unmapped attributes for zero data loss
    const unmapped = extractUnmappedFields(sanitizedRaw, parsedData)
    if (Object.keys(unmapped).length > 0) {
      parsedData.unmapped_fields = unmapped
    }

    // Determine validation status for newly staged record
    const hasError = rowErrors.some((e) => e.severity === 'ERROR')
    const hasWarning = rowErrors.some((e) => e.severity === 'WARNING')

    let validationStatus: StagingRecordDraft['validation_status'] = 'PENDING'
    if (hasError) {
      validationStatus = 'ERROR'
      validationSummary.errors++
    } else if (hasWarning) {
      validationSummary.warnings++
      validationSummary.valid++
    } else {
      validationSummary.valid++
    }

    stagedDrafts.push({
      entity_type: entityType,
      source_row_number: rowNumber,
      source_record_id: sourceRecordId,
      parsed_data: parsedData,
      raw_data: sanitizedRaw,
      validation_status: validationStatus,
      validation_errors: rowErrors,
      canonical_id: null,
    })
  }

  return {
    fileName,
    fileFormat: format,
    fileHash,
    fileSizeBytes,
    totalRows: stagedDrafts.length,
    records: stagedDrafts,
    errors: fileErrors,
    rowCounts,
    validationSummary,
  }
}

/**
 * Pure, deterministic record validator for import staging records.
 * Mirror of the server-authoritative RPC `validate_import_batch` rules for fast offline/client checks.
 *
 * Rules:
 * - PERSON: requires name (first or last), length <= 100, valid gender, DOB 1800-today, DOD <= today, DOD >= DOB.
 * - FAMILY: requires family_name (<= 200 chars), description <= 2000 chars.
 * - RELATIONSHIP: requires person_a_id, person_b_id, no self-relation, valid relationship_type.
 *
 * @param draft StagingRecordDraft to validate.
 * @returns Evaluated status ('VALID' | 'WARNING' | 'ERROR') and structured validation errors.
 */
export function validateDraftRecord(draft: StagingRecordDraft): {
  status: 'VALID' | 'WARNING' | 'ERROR'
  errors: StructuredImportError[]
} {
  const errors: StructuredImportError[] = [...draft.validation_errors]

  if (draft.entity_type === 'PERSON') {
    const firstName = draft.parsed_data.first_name as string | undefined
    const lastName = draft.parsed_data.last_name as string | undefined
    const gender = draft.parsed_data.gender as string | undefined
    const dobStr = draft.parsed_data.date_of_birth as string | undefined
    const dodStr = draft.parsed_data.date_of_death as string | undefined

    const isLivingRaw = draft.parsed_data.is_living
    let isLiving: boolean | null = null
    if (typeof isLivingRaw === 'boolean') {
      isLiving = isLivingRaw
    } else if (typeof isLivingRaw === 'string') {
      const s = isLivingRaw.trim().toLowerCase()
      if (['true', 'yes', 'y', 'living', 'alive', '1'].includes(s)) {
        isLiving = true
      } else if (['false', 'no', 'n', 'deceased', 'dead', '0'].includes(s)) {
        isLiving = false
      } else if (s.length > 0) {
        errors.push({
          code: 'INVALID_BOOLEAN_VALUE',
          field: 'is_living',
          severity: 'WARNING',
          message: `Value "${isLivingRaw}" for is_living is not a recognized boolean; expected true/false, living/deceased.`,
        })
      }
    }

    if (!firstName && !errors.some((e) => e.field === 'first_name')) {
      errors.push({
        code: 'MISSING_FIRST_NAME',
        field: 'first_name',
        severity: 'ERROR',
        message: 'Person record must have a first_name.',
      })
    }

    if (!lastName && !errors.some((e) => e.field === 'last_name')) {
      errors.push({
        code: 'MISSING_LAST_NAME',
        field: 'last_name',
        severity: 'ERROR',
        message: 'Person record must have a last_name.',
      })
    }

    if (firstName && firstName.length > 100) {
      errors.push({
        code: 'FIELD_TOO_LONG',
        field: 'first_name',
        severity: 'ERROR',
        message: 'first_name exceeds maximum length of 100 characters.',
      })
    }

    if (lastName && lastName.length > 100) {
      errors.push({
        code: 'FIELD_TOO_LONG',
        field: 'last_name',
        severity: 'ERROR',
        message: 'last_name exceeds maximum length of 100 characters.',
      })
    }

    if (gender && !['MALE', 'FEMALE', 'OTHER'].includes(gender.toUpperCase())) {
      errors.push({
        code: 'INVALID_GENDER',
        field: 'gender',
        severity: 'ERROR',
        message: 'gender must be MALE, FEMALE, or OTHER.',
      })
    }

    let dobDate: Date | null = null
    if (dobStr) {
      const d = new Date(dobStr)
      if (isNaN(d.getTime())) {
        errors.push({
          code: 'INVALID_DATE_FORMAT',
          field: 'date_of_birth',
          severity: 'ERROR',
          message: 'date_of_birth is not a valid date (expected YYYY-MM-DD).',
        })
      } else {
        dobDate = d
        const minDate = new Date('1800-01-01')
        const now = new Date()
        if (d < minDate) {
          errors.push({
            code: 'DOB_TOO_EARLY',
            field: 'date_of_birth',
            severity: 'ERROR',
            message: 'date_of_birth cannot be earlier than 1800-01-01.',
          })
        } else if (d > now) {
          errors.push({
            code: 'DOB_IN_FUTURE',
            field: 'date_of_birth',
            severity: 'ERROR',
            message: 'date_of_birth cannot be in the future.',
          })
        }
      }
    }

    let dodDate: Date | null = null
    if (dodStr) {
      const d = new Date(dodStr)
      if (isNaN(d.getTime())) {
        errors.push({
          code: 'INVALID_DATE_FORMAT',
          field: 'date_of_death',
          severity: 'ERROR',
          message: 'date_of_death is not a valid date (expected YYYY-MM-DD).',
        })
      } else {
        dodDate = d
        if (d > new Date()) {
          errors.push({
            code: 'DOD_IN_FUTURE',
            field: 'date_of_death',
            severity: 'ERROR',
            message: 'date_of_death cannot be in the future.',
          })
        }
      }
    }

    // Canonical persons status validation & normalization: ACTIVE | DECEASED
    // Source status = 'LIVING' is normalized to canonical 'ACTIVE'
    const statusRaw = draft.parsed_data.status
    let canonicalStatus: 'ACTIVE' | 'DECEASED' | null = null
    if (statusRaw !== undefined && statusRaw !== null && statusRaw !== '') {
      const s = String(statusRaw).trim().toUpperCase()
      if (s === 'ACTIVE' || s === 'LIVING') {
        canonicalStatus = 'ACTIVE'
      } else if (s === 'DECEASED') {
        canonicalStatus = 'DECEASED'
      } else {
        if (!errors.some((e) => e.code === 'INVALID_PERSON_STATUS')) {
          errors.push({
            code: 'INVALID_PERSON_STATUS',
            field: 'status',
            severity: 'WARNING',
            message: `Status "${s}" is not a recognized canonical person status; expected ACTIVE or DECEASED (source LIVING maps to ACTIVE).`,
          })
        }
      }
    }

    // Check contradiction between is_living and status
    if (isLiving !== null && canonicalStatus !== null) {
      if ((isLiving === true && canonicalStatus === 'DECEASED') || (isLiving === false && canonicalStatus === 'ACTIVE')) {
        errors.push({
          code: 'VITAL_STATUS_CONTRADICTION',
          field: 'status',
          severity: 'WARNING',
          message: `Contradiction detected: is_living=${isLiving} contradicts person status=${canonicalStatus}.`,
        })
      }
    }

    if (dobDate && dodDate && dodDate < dobDate) {
      errors.push({
        code: 'DEATH_BEFORE_BIRTH',
        field: 'date_of_death',
        severity: 'ERROR',
        message: 'date_of_death cannot precede date_of_birth.',
      })
    }

    if (dodDate && (isLiving === true || canonicalStatus === 'ACTIVE')) {
      errors.push({
        code: 'VITAL_STATUS_CONTRADICTION',
        field: 'is_living',
        severity: 'WARNING',
        message: 'Person has date_of_death but is represented as living/ACTIVE.',
      })
    }
  } else if (draft.entity_type === 'FAMILY') {
    const familyName = draft.parsed_data.family_name as string | undefined
    const description = draft.parsed_data.description as string | undefined
    const headId = draft.parsed_data.head_id as string | undefined

    if (!familyName) {
      if (!errors.some((e) => e.code === 'MISSING_REQUIRED_FIELD')) {
        errors.push({
          code: 'MISSING_REQUIRED_FIELD',
          field: 'family_name',
          severity: 'ERROR',
          message: 'Family record must have a family_name.',
        })
      }
    } else if (familyName.length > 200) {
      errors.push({
        code: 'FIELD_TOO_LONG',
        field: 'family_name',
        severity: 'ERROR',
        message: 'family_name exceeds maximum length of 200 characters.',
      })
    }

    if (description && description.length > 2000) {
      errors.push({
        code: 'FIELD_TOO_LONG',
        field: 'description',
        severity: 'ERROR',
        message: 'description exceeds maximum length of 2000 characters.',
      })
    }

    if (headId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(headId)) {
      errors.push({
        code: 'INVALID_UUID_FORMAT',
        field: 'head_id',
        severity: 'WARNING',
        message: 'head_id is not a standard UUID format; will require lineage resolution.',
      })
    }
  } else if (draft.entity_type === 'RELATIONSHIP') {
    const personA = draft.parsed_data.person_a_id as string | undefined
    const personB = draft.parsed_data.person_b_id as string | undefined
    const relType = draft.parsed_data.relationship_type as string | undefined

    if (!personA && !errors.some((e) => e.field === 'person_a_id')) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        field: 'person_a_id',
        severity: 'ERROR',
        message: 'Relationship record must reference Person A (person_a_id).',
      })
    }

    if (!personB && !errors.some((e) => e.field === 'person_b_id')) {
      errors.push({
        code: 'MISSING_REQUIRED_FIELD',
        field: 'person_b_id',
        severity: 'ERROR',
        message: 'Relationship record must reference Person B (person_b_id).',
      })
    }

    if (personA && personB && personA.toLowerCase() === personB.toLowerCase()) {
      errors.push({
        code: 'SELF_RELATIONSHIP',
        field: 'person_b_id',
        severity: 'ERROR',
        message: 'A relationship cannot connect a person to themselves.',
      })
    }

    if (relType && !['PARENT', 'SPOUSE', 'SIBLING'].includes(relType.toUpperCase())) {
      errors.push({
        code: 'INVALID_RELATIONSHIP_TYPE',
        field: 'relationship_type',
        severity: 'ERROR',
        message: 'relationship_type must be PARENT, SPOUSE, or SIBLING (canonical schema does not support CHILD; map to PARENT with reversed endpoints).',
      })
    }
  }

  const hasError = errors.some((e) => e.severity === 'ERROR')
  const hasWarning = errors.some((e) => e.severity === 'WARNING')

  let status: 'VALID' | 'WARNING' | 'ERROR' = 'VALID'
  if (hasError) status = 'ERROR'
  else if (hasWarning) status = 'WARNING'

  return { status, errors }
}

