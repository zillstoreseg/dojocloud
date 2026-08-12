import type { BlockType } from '@prisma/client';

/**
 * Everything a block renderer may need that does not live in its own props.
 *
 * Blocks like PACKAGES and CERTIFICATES render the trainer's real rows rather
 * than copies, so the data is fetched once by the page and handed down. The
 * same object is built from live data on the public page and from the coach's
 * own data in the builder preview, which is what keeps "what you see" and
 * "what visitors get" the same component and not two that drift.
 */
export interface LandingCoach {
  id: string;
  /** The trainer's User id — feature flags resolve per user, not per profile. */
  userId: string;
  username: string;
  fullName: string;
  bio: string | null;
  avatarUrl: string | null;
  country: string;
  city: string | null;
  yearsExperience: number;
  specialties: string[];
  trainsGenders: string;
  phone: string;
  socialLinks: Record<string, string>;
  traineesCount: number;
}

export interface LandingPackage {
  id: string;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  durationDays: number;
  sessionsCount: number | null;
  features: string[];
}

export interface LandingCertificate {
  id: string;
  title: string;
  issuer: string | null;
  year: number | null;
}

export interface LandingTestimonial {
  id: string;
  authorName: string;
  authorRole: string | null;
  rating: number;
  body: string;
}

export interface LandingTransformation {
  id: string;
  title: string | null;
  beforeUrl: string;
  afterUrl: string;
  story: string | null;
  durationWeeks: number | null;
}

export interface LandingContext {
  locale: string;
  isAr: boolean;
  coach: LandingCoach;
  packages: LandingPackage[];
  certificates: LandingCertificate[];
  testimonials: LandingTestimonial[];
  transformations: LandingTransformation[];
  /** Null in the builder preview: submitting a lead from a draft is not a lead. */
  pageId: string | null;
  /** True inside the builder, so forms and links do not actually fire. */
  preview: boolean;
  /** Set on the lowest plans; hiding it is a reason to upgrade. */
  showPoweredBy: boolean;
  brandName: string;
}

export interface BlockNode {
  id: string;
  type: BlockType;
  props: unknown;
  isVisible: boolean;
}
