import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { parseImportFile } from '@/features/admin/services/importParser.service'

describe('Excel Import Parser Unit Tests (Sample Workbooks)', () => {
  const khatrisetuPath = path.resolve(process.cwd(), 'sample_data/khatrisetu-families-2026-10-01 (1).xlsx')
  const demoUserDataPath = path.resolve(process.cwd(), 'sample_data/demo user data.xlsx')

  describe('Khatrisetu Multi-Sheet Workbook', () => {
    it('successfully parses Khatrisetu families and members', async () => {
      const buffer = fs.readFileSync(khatrisetuPath)
      const result = await parseImportFile(
        'khatrisetu-families-2026-10-01 (1).xlsx',
        buffer,
        { format: 'XLSX' }
      )

      expect(result.fileHash).toBeTruthy()
      expect(result.totalRows).toBeGreaterThan(0)

      // Entity counts
      expect(result.rowCounts.families).toBe(4)
      expect(result.rowCounts.persons).toBe(24)
      expect(result.rowCounts.relationships).toBeGreaterThan(0)

      // Families verification
      const families = result.records.filter((r) => r.entity_type === 'FAMILY')
      expect(families).toHaveLength(4)
      for (const fam of families) {
        expect(fam.parsed_data.family_name).toBeTruthy()
        expect(fam.source_record_id).toBeTruthy()
      }

      // Persons verification
      const persons = result.records.filter((r) => r.entity_type === 'PERSON')
      expect(persons).toHaveLength(24)
      for (const person of persons) {
        expect(person.parsed_data.first_name).toBeTruthy()
        expect(person.source_record_id).toBeTruthy()
        expect(person.parsed_data.family_ref).toBeTruthy()
      }

      // Relationships verification
      const relationships = result.records.filter((r) => r.entity_type === 'RELATIONSHIP')
      expect(relationships.length).toBeGreaterThan(0)
      for (const rel of relationships) {
        expect(rel.parsed_data.person_a_id).toBeTruthy()
        expect(rel.parsed_data.person_b_id).toBeTruthy()
        expect(rel.parsed_data.relationship_type).toBeTruthy()
      }

      // Verify extended Tier B fields on Khatrisetu members (marital_status, blood_group, native_place)
      const personsWithMaritalStatus = persons.filter((p) => p.parsed_data.marital_status)
      expect(personsWithMaritalStatus.length).toBeGreaterThan(0)

      const personsWithBloodGroup = persons.filter((p) => p.parsed_data.blood_group)
      expect(personsWithBloodGroup.length).toBeGreaterThan(0)
    })
  })

  describe('Demo User Data Embedded Single-Sheet Workbook', () => {
    it('successfully parses embedded households and members, flagging duplicates', async () => {
      const buffer = fs.readFileSync(demoUserDataPath)
      const result = await parseImportFile(
        'demo user data.xlsx',
        buffer,
        { format: 'XLSX' }
      )

      expect(result.fileHash).toBeTruthy()
      expect(result.totalRows).toBeGreaterThan(0)

      // Households & Persons counts
      const families = result.records.filter((r) => r.entity_type === 'FAMILY')
      const persons = result.records.filter((r) => r.entity_type === 'PERSON')

      // Should have parsed households (14 household rows)
      expect(families.length).toBe(14)

      // Total persons created: 14 household heads + 43 members = 57 persons
      expect(persons.length).toBe(57)

      // Duplicate Candidate Invariant: DETECT != MERGE
      // Rows 4 & 6 ("mohanlal khatri") and rows 10 & 12 ("PARMANAND KHATRI") are duplicate households in the raw Excel.
      // They must be flagged with validation_status 'WARNING' and not merged.
      const warnings = result.records.filter(
        (r) =>
          r.validation_status === 'WARNING' &&
          r.validation_errors.some(
            (e) => e.code === 'DUPLICATE_CANDIDATE' || e.message.toLowerCase().includes('duplicate')
          )
      )
      expect(warnings.length).toBeGreaterThan(0)

      // Verify that extended fields (education, occupation) are extracted from members
      const personsWithOccupation = persons.filter((p) => p.parsed_data.occupation)
      expect(personsWithOccupation.length).toBeGreaterThan(0)

      const personsWithEducation = persons.filter((p) => p.parsed_data.education)
      expect(personsWithEducation.length).toBeGreaterThan(0)

      // Verify family community attributes (gotra, mool_shakha, family_type, mukhi_name)
      const familiesWithAttributes = families.filter(
        (f) => f.parsed_data.gotra || f.parsed_data.mool_shakha || f.parsed_data.mukhi_name
      )
      expect(familiesWithAttributes.length).toBeGreaterThan(0)
    })
  })
})
