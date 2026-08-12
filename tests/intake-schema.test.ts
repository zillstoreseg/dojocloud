import { describe, it, expect } from 'vitest';
import {
  intakeSchema,
  validateIntakeStep,
  INTAKE_STEPS,
  EMPTY_INTAKE,
  type IntakeInput,
} from '@/app/[locale]/join/[username]/schema';

/**
 * The intake schema is the one piece of the join flow that runs on both sides
 * of the wire: the wizard uses it to gate each step, and the server uses it to
 * decide what to store. These tests pin the two behaviours that keep those in
 * agreement — a step never passes on the client and fails on the server, and
 * the whole form never accepts a value the plan maths cannot use.
 */

function valid(overrides: Partial<IntakeInput> = {}): IntakeInput {
  return {
    ...EMPTY_INTAKE,
    fullName: 'محمد عبد الله',
    phone: '+201112223334',
    birthDate: '1996-04-12',
    heightCm: 178,
    weightKg: 92,
    ...overrides,
  };
}

describe('intakeSchema', () => {
  it('accepts a complete, sane submission', () => {
    expect(intakeSchema.safeParse(valid()).success).toBe(true);
  });

  it('rejects a birth date that would make the trainee a toddler or a fossil', () => {
    expect(intakeSchema.safeParse(valid({ birthDate: '2024-01-01' })).success).toBe(false);
    expect(intakeSchema.safeParse(valid({ birthDate: '1890-01-01' })).success).toBe(false);
  });

  it('rejects a malformed birth date rather than coercing it', () => {
    expect(intakeSchema.safeParse(valid({ birthDate: 'not-a-date' })).success).toBe(false);
  });

  it.each([
    ['heightCm', 40],
    ['heightCm', 400],
    ['weightKg', 5],
    ['weightKg', 500],
  ] as const)('rejects an out-of-range %s of %i', (field, value) => {
    expect(intakeSchema.safeParse(valid({ [field]: value })).success).toBe(false);
  });

  it('treats email as optional but validates it when present', () => {
    expect(intakeSchema.safeParse(valid({ email: '' })).success).toBe(true);
    expect(intakeSchema.safeParse(valid({ email: 'coach@example.com' })).success).toBe(true);
    expect(intakeSchema.safeParse(valid({ email: 'not-an-email' })).success).toBe(false);
  });

  it('caps training days at a week', () => {
    expect(intakeSchema.safeParse(valid({ trainingDaysPerWeek: 7 })).success).toBe(true);
    expect(intakeSchema.safeParse(valid({ trainingDaysPerWeek: 8 })).success).toBe(false);
  });

  it('defaults the optional lists rather than leaving them undefined', () => {
    const parsed = intakeSchema.parse(valid());
    expect(parsed.injuries).toEqual([]);
    expect(parsed.allergies).toEqual([]);
    expect(parsed.equipment).toEqual([]);
    expect(parsed.dietPreference).toBe('NONE');
  });
});

describe('validateIntakeStep', () => {
  it('reports only the failures belonging to the step being validated', () => {
    // Step 0 is identity; the body fields are also blank but are not step 0's
    // problem, and surfacing them there would be confusing.
    const errors = validateIntakeStep(0, { ...EMPTY_INTAKE, heightCm: 40 });
    expect(Object.keys(errors)).toContain('fullName');
    expect(Object.keys(errors)).not.toContain('heightCm');
  });

  it('passes a step whose own fields are all valid', () => {
    expect(validateIntakeStep(0, valid())).toEqual({});
  });

  it('catches the body step once it is reached', () => {
    const errors = validateIntakeStep(1, valid({ weightKg: 500 }));
    expect(errors.weightKg).toBeTruthy();
  });

  it('covers every field of the schema across its steps', () => {
    // A field nobody asks for is a field that silently keeps its default, so
    // the step map has to stay exhaustive as the schema grows.
    const inSteps = new Set(INTAKE_STEPS.flat() as string[]);
    for (const key of Object.keys(EMPTY_INTAKE)) {
      expect(inSteps.has(key), `"${key}" is in no wizard step`).toBe(true);
    }
  });

  it('lets a fully valid form pass every step', () => {
    const values = valid();
    for (let step = 0; step < INTAKE_STEPS.length; step += 1) {
      expect(validateIntakeStep(step, values)).toEqual({});
    }
  });
});
