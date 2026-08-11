import { describe, expect, it } from 'vitest';
import {
  registerSchema,
  validateStep,
  STEP_FIELDS,
  type RegisterInput,
} from '@/app/[locale]/register/schema';

const VALID: RegisterInput = {
  fullName: 'أحمد سيد',
  email: 'Coach@Example.COM',
  password: 'Test@12345',
  confirmPassword: 'Test@12345',
  phone: '+201001234567',
  country: 'EG',
  city: 'القاهرة',
  gender: 'MALE',
  trainsGenders: 'BOTH',
  yearsExperience: 6,
  specialties: ['WEIGHT_LOSS', 'GENERAL_FITNESS'],
  username: 'ahmed-coach',
  bio: '',
};

describe('registerSchema', () => {
  it('accepts a complete submission and normalises the email', () => {
    const result = registerSchema.parse(VALID);
    expect(result.email).toBe('coach@example.com');
  });

  it('rejects mismatched passwords on the confirm field', () => {
    const result = registerSchema.safeParse({ ...VALID, confirmPassword: 'Different@1' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'confirmPassword')).toBe(true);
    }
  });

  it('caps specialties at six', () => {
    const result = registerSchema.safeParse({
      ...VALID,
      specialties: ['WEIGHT_LOSS', 'GENERAL_FITNESS', 'YOGA', 'PILATES', 'KIDS', 'SENIORS', 'REHAB'],
    });
    expect(result.success).toBe(false);
  });

  it('requires at least one specialty', () => {
    expect(registerSchema.safeParse({ ...VALID, specialties: [] }).success).toBe(false);
  });
});

describe('validateStep', () => {
  it('reports only the errors belonging to the step being left', () => {
    // Nothing filled in at all: step 0 must complain, step 1 must stay quiet
    // even though its fields are also missing.
    const errors = validateStep(0, {});
    expect(Object.keys(errors).sort()).toEqual(
      ['confirmPassword', 'email', 'fullName', 'gender', 'password'].sort(),
    );
    expect(errors).not.toHaveProperty('specialties');
  });

  it('surfaces the password mismatch on the step that owns the field', () => {
    const errors = validateStep(0, { ...VALID, confirmPassword: 'nope12345' });
    expect(errors.confirmPassword).toBeTruthy();
  });

  it('passes a step whose own fields are valid, even when later steps are empty', () => {
    const partial = {
      fullName: VALID.fullName,
      gender: VALID.gender,
      email: VALID.email,
      password: VALID.password,
      confirmPassword: VALID.confirmPassword,
    };
    expect(validateStep(0, partial)).toEqual({});
  });

  it('covers every field of the schema across its steps', () => {
    const covered = new Set(STEP_FIELDS.flat());
    for (const field of Object.keys(VALID)) {
      expect(covered.has(field as keyof RegisterInput), `${field} belongs to no step`).toBe(true);
    }
  });
});
